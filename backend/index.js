const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { AIProjectClient } = require("@azure/ai-projects");
const { DefaultAzureCredential } = require("@azure/identity");

const app = express();

app.use(cors());
app.use(express.json());

/*
  ============================================================
  MICROSOFT FOUNDRY CONNECTION
  ============================================================
*/

const project = new AIProjectClient(
  process.env.FOUNDRY_PROJECT_ENDPOINT,
  new DefaultAzureCredential()
);

const openai = project.getOpenAIClient();

/*
  ============================================================
  CONVERSATION MEMORY
  ============================================================
*/

let previousResponseId = null;

/*
  ============================================================
  EXTRACT CHART INFORMATION
  ============================================================

  The Agent should provide chart metadata only when a chart
  has been requested.

  Expected format:

  Chart type: bar
  Chart title: Total Sales by Territory
  Chart data: [
    { category: 'Southwest', value: 24184610 },
    { category: 'Canada', value: 16355771 }
  ]

  IMPORTANT:
  We do NOT create charts from ordinary Markdown tables.

  This prevents tables such as:

  | Metric | Value |
  | Gross Profit | 12,551,286 |
  | Gross Margin % | 11.43% |

  from incorrectly becoming charts.
*/

function extractChartData(text) {
  let chartType = "bar";
  let chartTitle = "Sales Analysis";
  let chartData = [];

  /*
    ----------------------------------------------------------
    Extract chart type
    ----------------------------------------------------------
  */

  const chartTypeMatch = text.match(
    /Chart type:\s*(bar|line|pie|scatter)/i
  );

  if (chartTypeMatch) {
    chartType = chartTypeMatch[1].toLowerCase();
  }

  /*
    ----------------------------------------------------------
    Extract chart title
    ----------------------------------------------------------
  */

  const chartTitleMatch = text.match(
    /Chart title:\s*(.+)/i
  );

  if (chartTitleMatch) {
    chartTitle = chartTitleMatch[1].trim();
  }

  /*
    ----------------------------------------------------------
    Extract structured chart data
    ----------------------------------------------------------
  */

  const chartDataMatch = text.match(
    /Chart data:\s*\[([\s\S]*?)\]/i
  );

  if (chartDataMatch) {
    const chartDataText = chartDataMatch[1];

    const matches = [
      ...chartDataText.matchAll(
        /\{\s*category:\s*['"]([^'"]+)['"]\s*,\s*value:\s*([\d.-]+)\s*\}/g
      ),
    ];

    chartData = matches.map((match) => ({
      category: match[1],
      value: Number(match[2]),
    }));
  }

  /*
    ----------------------------------------------------------
    Return extracted chart information
    ----------------------------------------------------------
  */

  return {
    chartType,
    chartTitle,
    chartData,
  };
}

/*
  ============================================================
  REMOVE CHART METADATA FROM USER-FACING ANSWER
  ============================================================

  The chart metadata is useful to our backend but should not
  be displayed in the chat.

  Removes:

  Chart type: bar
  Chart title: Total Sales by Territory
  Chart data: [...]
*/

function cleanAnswer(text) {
  let cleaned = text;

  /*
    Remove Chart type line
  */

  cleaned = cleaned.replace(
    /^\s*Chart type:\s*(bar|line|pie|scatter)\s*$/gim,
    ""
  );

  /*
    Remove Chart title line
  */

  cleaned = cleaned.replace(
    /^\s*Chart title:\s*.+$/gim,
    ""
  );

  /*
    Remove Chart data block
  */

  cleaned = cleaned.replace(
    /Chart data:\s*\[[\s\S]*?\]/gi,
    ""
  );

  /*
    Remove excessive blank lines
  */

  cleaned = cleaned.replace(
    /\n{3,}/g,
    "\n\n"
  );

  return cleaned.trim();
}

/*
  ============================================================
  CHAT API
  ============================================================
*/

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required",
      });
    }

    console.log(`User question: ${message}`);

    /*
      --------------------------------------------------------
      Build Foundry request
      --------------------------------------------------------
    */

    const requestBody = {
      input: message,
    };

    /*
      Continue previous conversation
    */

    if (previousResponseId) {
      requestBody.previous_response_id = previousResponseId;
    }

    /*
      --------------------------------------------------------
      Call Microsoft Foundry Agent
      --------------------------------------------------------
    */

    const response = await openai.responses.create(
      requestBody,
      {
        body: {
          agent_reference: {
            name: process.env.FOUNDRY_AGENT_NAME,
            type: "agent_reference",
          },
        },
      }
    );

    /*
      --------------------------------------------------------
      Save response ID
      --------------------------------------------------------
    */

    previousResponseId = response.id;

    /*
      --------------------------------------------------------
      Get raw AI response
      --------------------------------------------------------
    */

    const rawAnswer = response.output_text;

    console.log(`Response ID: ${response.id}`);

    console.log(
      `Agent raw response:\n${rawAnswer}`
    );

    /*
      --------------------------------------------------------
      Extract chart metadata
      --------------------------------------------------------
    */

    const {
      chartType,
      chartTitle,
      chartData,
    } = extractChartData(rawAnswer);

    console.log(
      "Chart type:",
      chartType
    );

    console.log(
      "Chart title:",
      chartTitle
    );

    console.log(
      "Extracted chart data:",
      chartData
    );

    /*
      --------------------------------------------------------
      Clean user-facing answer
      --------------------------------------------------------
    */

    const answer = cleanAnswer(rawAnswer);

    console.log(
      `Clean user-facing answer:\n${answer}`
    );

    /*
      --------------------------------------------------------
      Return response to React
      --------------------------------------------------------
    */

    res.json({
      answer,
      chartType,
      chartTitle,
      chartData,
    });

  } catch (error) {
    console.error(
      "Foundry error:",
      error
    );

    res.status(500).json({
      error:
        "Failed to get response from NovaMart AI Agent.",
    });
  }
});

/*
  ============================================================
  HEALTH CHECK
  ============================================================
*/

app.get("/", (req, res) => {
  res.json({
    message:
      "NovaMart AI Backend is running",
  });
});

/*
  ============================================================
  START SERVER
  ============================================================
*/

const server = app.listen(3001, () => {
  console.log(
    "NovaMart AI Backend running on http://localhost:3001"
  );
});

server.on("error", (error) => {
  console.error(
    "SERVER ERROR:",
    error
  );
});