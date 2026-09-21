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

const credential = new DefaultAzureCredential();

const project = new AIProjectClient(
  process.env.FOUNDRY_PROJECT_ENDPOINT,
  credential
);

/*
============================================================
CONNECT DIRECTLY TO NOVAMART AI AGENT
============================================================

The OpenAI client is bound directly to the Foundry Agent.

This uses the current agent endpoint instead of the older
agent_reference request pattern.
*/

const openai = project.getOpenAIClient({
  azureConfig: {
    allowPreview: true,
    agentName: process.env.FOUNDRY_AGENT_NAME,
  },
});

/*
============================================================
SAFE AZURE IDENTITY DIAGNOSTIC
============================================================

This confirms which Entra application Render is actually
using WITHOUT logging the access token or client secret.
*/

async function logAzureIdentity() {
  try {
    const token = await credential.getToken(
      "https://ai.azure.com/.default"
    );

    if (!token || !token.token) {
      console.log(
        "Azure identity diagnostic: No token received."
      );
      return;
    }

    const parts = token.token.split(".");

    if (parts.length !== 3) {
      console.log(
        "Azure identity diagnostic: Token format could not be decoded."
      );
      return;
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );

    console.log(
      "========== AZURE IDENTITY DIAGNOSTIC =========="
    );

    console.log("Token audience:", payload.aud);
    console.log(
      "Application ID:",
      payload.appid || payload.azp
    );
    console.log("Object ID:", payload.oid);
    console.log("Tenant ID:", payload.tid);
    console.log(
      "Token expires:",
      new Date(payload.exp * 1000).toISOString()
    );

    console.log(
      "==============================================="
    );
  } catch (error) {
    console.error(
      "Azure identity diagnostic failed:",
      error.message
    );
  }
}

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
*/

function cleanAnswer(text) {
  let cleaned = text;

  cleaned = cleaned.replace(
    /^\s*Chart type:\s*(bar|line|pie|scatter)\s*$/gim,
    ""
  );

  cleaned = cleaned.replace(
    /^\s*Chart title:\s*.+$/gim,
    ""
  );

  cleaned = cleaned.replace(
    /Chart data:\s*\[[\s\S]*?\]/gi,
    ""
  );

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
    --------------------------------------------------------
    Continue previous conversation
    --------------------------------------------------------
    */

    if (previousResponseId) {
      requestBody.previous_response_id =
        previousResponseId;
    }

    /*
    --------------------------------------------------------
    Call Microsoft Foundry Agent
    --------------------------------------------------------
    */

    const response = await openai.responses.create(
      requestBody
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

    console.log(
      `Response ID: ${response.id}`
    );

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

  /*
  Run identity diagnostic once when the server starts.
  */

  logAzureIdentity();
});

server.on("error", (error) => {
  console.error(
    "SERVER ERROR:",
    error
  );
});