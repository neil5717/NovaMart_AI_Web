const express = require("express");
const cors = require("cors");
require("dotenv").config();

const {
  AIProjectClient,
} = require("@azure/ai-projects");

const {
  DefaultAzureCredential,
} = require("@azure/identity");

const app = express();

app.use(cors());

app.use(express.json());

/*
============================================================
MICROSOFT FOUNDRY CONNECTION
============================================================
*/

const credential =
  new DefaultAzureCredential();

const project =
  new AIProjectClient(
    process.env.FOUNDRY_PROJECT_ENDPOINT,
    credential
  );

const openai =
  project.getOpenAIClient({
    azureConfig: {
      allowPreview: true,
      agentName:
        process.env.FOUNDRY_AGENT_NAME,
    },
  });

/*
============================================================
AZURE IDENTITY DIAGNOSTIC
============================================================
*/

async function logAzureIdentity() {
  try {
    const token =
      await credential.getToken(
        "https://ai.azure.com/.default"
      );

    if (
      !token ||
      !token.token
    ) {
      console.log(
        "Azure identity diagnostic: No token received."
      );

      return;
    }

    const parts =
      token.token.split(".");

    if (parts.length !== 3) {
      console.log(
        "Azure identity diagnostic: Token format could not be decoded."
      );

      return;
    }

    const payload =
      JSON.parse(
        Buffer.from(
          parts[1],
          "base64url"
        ).toString("utf8")
      );

    console.log(
      "========== AZURE IDENTITY DIAGNOSTIC =========="
    );

    console.log(
      "Token audience:",
      payload.aud
    );

    console.log(
      "Application ID:",
      payload.appid ||
        payload.azp
    );

    console.log(
      "Object ID:",
      payload.oid
    );

    console.log(
      "Tenant ID:",
      payload.tid
    );

    console.log(
      "Token expires:",
      new Date(
        payload.exp * 1000
      ).toISOString()
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

let previousResponseId =
  null;

/*
============================================================
EXTRACT CHART DATA
============================================================

Supports:

1. Explicit Chart metadata
2. Markdown tables
============================================================
*/

function extractChartData(
  text,
  question
) {
  let chartType = "bar";

  let chartTitle =
    "Sales Analysis";

  let chartData = [];

  /*
  ----------------------------------------------------------
  EXPLICIT CHART TYPE
  ----------------------------------------------------------
  */

  const chartTypeMatch =
    text.match(
      /Chart type:\s*(bar|line|pie|scatter)/i
    );

  if (chartTypeMatch) {
    chartType =
      chartTypeMatch[1].toLowerCase();
  }

  /*
  ----------------------------------------------------------
  EXPLICIT CHART TITLE
  ----------------------------------------------------------
  */

  const chartTitleMatch =
    text.match(
      /Chart title:\s*(.+)/i
    );

  if (chartTitleMatch) {
    chartTitle =
      chartTitleMatch[1].trim();
  }

  /*
  ----------------------------------------------------------
  EXPLICIT CHART DATA
  ----------------------------------------------------------
  */

  const chartDataMatch =
    text.match(
      /Chart data:\s*\[([\s\S]*?)\]/i
    );

  if (chartDataMatch) {
    const chartDataText =
      chartDataMatch[1];

    const matches = [
      ...chartDataText.matchAll(
        /\{\s*category:\s*['"]([^'"]+)['"]\s*,\s*value:\s*([\d.-]+)\s*\}/g
      ),
    ];

    chartData =
      matches.map(
        (match) => ({
          category:
            match[1],

          value:
            Number(match[2]),
        })
      );
  }

  /*
  ----------------------------------------------------------
  MARKDOWN TABLE FALLBACK
  ----------------------------------------------------------
  */

  if (
    chartData.length === 0
  ) {
    const lines =
      text.split("\n");

    for (
      let i = 0;
      i < lines.length - 2;
      i++
    ) {
      const headerLine =
        lines[i].trim();

      const separatorLine =
        lines[i + 1].trim();

      if (
        !headerLine.startsWith("|") ||
        !headerLine.endsWith("|") ||
        !separatorLine.startsWith("|") ||
        !separatorLine.endsWith("|") ||
        !separatorLine.includes(
          "---"
        )
      ) {
        continue;
      }

      const rows = [];

      for (
        let j = i + 2;
        j < lines.length;
        j++
      ) {
        const rowLine =
          lines[j].trim();

        if (
          !rowLine.startsWith("|") ||
          !rowLine.endsWith("|")
        ) {
          break;
        }

        const cells =
          rowLine
            .split("|")
            .map(
              (cell) =>
                cell.trim()
            )
            .filter(Boolean);

        if (
          cells.length < 2
        ) {
          continue;
        }

        const category =
          cells[0];

        const numericText =
          cells[
            cells.length - 1
          ]
            .replace(/,/g, "")
            .replace(
              /[₹$£€%]/g,
              ""
            )
            .trim();

        const value =
          Number(
            numericText
          );

        if (
          category &&
          Number.isFinite(
            value
          )
        ) {
          rows.push({
            category,
            value,
          });
        }
      }

      if (
        rows.length > 0
      ) {
        chartData =
          rows;

        break;
      }
    }
  }

  /*
  ----------------------------------------------------------
  AUTOMATIC CHART TYPE
  ----------------------------------------------------------
  */

  if (
    !chartTypeMatch
  ) {
    const lowerQuestion =
      question.toLowerCase();

    if (
      lowerQuestion.includes(
        "fiscal year"
      ) ||
      lowerQuestion.includes(
        "by year"
      ) ||
      lowerQuestion.includes(
        "year over"
      ) ||
      lowerQuestion.includes(
        "by month"
      ) ||
      lowerQuestion.includes(
        "by quarter"
      ) ||
      lowerQuestion.includes(
        "by week"
      ) ||
      lowerQuestion.includes(
        "over time"
      ) ||
      lowerQuestion.includes(
        "trend"
      )
    ) {
      chartType =
        "line";
    } else {
      chartType =
        "bar";
    }
  }

  /*
  ----------------------------------------------------------
  AUTOMATIC CHART TITLE
  ----------------------------------------------------------
  */

  if (
    !chartTitleMatch
  ) {
    const lowerQuestion =
      question.toLowerCase();

    if (
      lowerQuestion.includes(
        "territory"
      )
    ) {
      chartTitle =
        "Sales by Territory";
    } else if (
      lowerQuestion.includes(
        "product"
      )
    ) {
      chartTitle =
        "Sales by Product";
    } else if (
      lowerQuestion.includes(
        "customer"
      )
    ) {
      chartTitle =
        "Sales by Customer";
    } else if (
      lowerQuestion.includes(
        "reseller"
      )
    ) {
      chartTitle =
        "Sales by Reseller";
    } else if (
      lowerQuestion.includes(
        "fiscal year"
      )
    ) {
      chartTitle =
        "Total Sales by Fiscal Year";
    } else if (
      lowerQuestion.includes(
        "by year"
      )
    ) {
      chartTitle =
        "Total Sales by Year";
    }
  }

  /*
  ----------------------------------------------------------
  SINGLE KPI HANDLING
  ----------------------------------------------------------

  Do not show a chart for questions that are simply
  asking for one number.
  ----------------------------------------------------------
  */

  const lowerQuestion =
    question.toLowerCase();

  const isGroupedQuestion =
    lowerQuestion.includes(
      "by territory"
    ) ||
    lowerQuestion.includes(
      "by product"
    ) ||
    lowerQuestion.includes(
      "by customer"
    ) ||
    lowerQuestion.includes(
      "by reseller"
    ) ||
    lowerQuestion.includes(
      "by fiscal year"
    ) ||
    lowerQuestion.includes(
      "by year"
    ) ||
    lowerQuestion.includes(
      "by month"
    ) ||
    lowerQuestion.includes(
      "by quarter"
    ) ||
    lowerQuestion.includes(
      "by week"
    ) ||
    lowerQuestion.includes(
      "over time"
    ) ||
    lowerQuestion.includes(
      "trend"
    );

  if (
    chartData.length <= 1 &&
    !isGroupedQuestion
  ) {
    chartData = [];
  }

  return {
    chartType,
    chartTitle,
    chartData,
  };
}

/*
============================================================
REMOVE CHART METADATA
============================================================
*/

function cleanAnswer(
  text
) {
  let cleaned =
    text;

  cleaned =
    cleaned.replace(
      /^\s*Chart type:\s*(bar|line|pie|scatter)\s*$/gim,
      ""
    );

  cleaned =
    cleaned.replace(
      /^\s*Chart title:\s*.+$/gim,
      ""
    );

  cleaned =
    cleaned.replace(
      /Chart data:\s*\[[\s\S]*?\]/gi,
      ""
    );

  cleaned =
    cleaned.replace(
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

app.post(
  "/api/chat",
  async (req, res) => {
    try {
      const {
        message,
      } = req.body;

      if (
        !message ||
        !message.trim()
      ) {
        return res
          .status(400)
          .json({
            error:
              "Message is required",
          });
      }

      console.log(
        `User question: ${message}`
      );

      /*
      --------------------------------------------------------
      BUILD REQUEST
      --------------------------------------------------------
      */

      const requestBody = {
        input: message,
      };

      /*
      --------------------------------------------------------
      CONVERSATION MEMORY
      --------------------------------------------------------
      */

      if (
        previousResponseId
      ) {
        requestBody.previous_response_id =
          previousResponseId;
      }

      /*
      --------------------------------------------------------
      CALL FOUNDRY AGENT
      --------------------------------------------------------
      */

      const response =
        await openai.responses.create(
          requestBody
        );

      /*
      --------------------------------------------------------
      SAVE RESPONSE ID
      --------------------------------------------------------
      */

      previousResponseId =
        response.id;

      /*
      --------------------------------------------------------
      GET RESPONSE TEXT
      --------------------------------------------------------
      */

      const rawAnswer =
        response.output_text ||
        "";

      console.log(
        `Response ID: ${response.id}`
      );

      console.log(
        `Agent raw response:\n${rawAnswer}`
      );

      /*
      --------------------------------------------------------
      EXTRACT CHART
      --------------------------------------------------------
      */

      const {
        chartType,
        chartTitle,
        chartData,
      } =
        extractChartData(
          rawAnswer,
          message
        );

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
      CLEAN ANSWER
      --------------------------------------------------------
      */

      const answer =
        cleanAnswer(
          rawAnswer
        );

      console.log(
        `Clean user-facing answer:\n${answer}`
      );

      /*
      --------------------------------------------------------
      RETURN TO REACT
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

      res
        .status(500)
        .json({
          error:
            "Failed to get response from NovaMart AI Agent.",
        });
    }
  }
);

/*
============================================================
HEALTH CHECK
============================================================
*/

app.get(
  "/",
  (req, res) => {
    res.json({
      message:
        "NovaMart AI Backend is running",
    });
  }
);

/*
============================================================
START SERVER
============================================================
*/

const server =
  app.listen(
    3001,
    () => {
      console.log(
        "NovaMart AI Backend running on http://localhost:3001"
      );

      logAzureIdentity();
    }
  );

server.on(
  "error",
  (error) => {
    console.error(
      "SERVER ERROR:",
      error
    );
  }
);