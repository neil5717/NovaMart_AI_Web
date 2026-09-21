import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import "./App.css";

/*
============================================================
NUMBER FORMATTING
============================================================
*/

function formatCompactNumber(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return value;
  }

  const absolute = Math.abs(number);

  if (absolute >= 1000000000) {
    return `${(number / 1000000000)
      .toFixed(2)
      .replace(/\.00$/, "")}B`;
  }

  if (absolute >= 1000000) {
    return `${(number / 1000000)
      .toFixed(2)
      .replace(/\.00$/, "")}M`;
  }

  if (absolute >= 1000) {
    return `${(number / 1000)
      .toFixed(1)
      .replace(/\.0$/, "")}K`;
  }

  return number.toLocaleString();
}

/*
============================================================
TOOLTIP VALUE FORMAT
============================================================
*/

function formatTooltipValue(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return value;
  }

  return number.toLocaleString();
}

/*
============================================================
MARKDOWN TABLE -> CHART DATA
============================================================

The Foundry Agent can sometimes return:

| Territory | Total Sales |
|---|---:|
| Australia | 10,655,336 |

This function converts that table into:

[
  {
    category: "Australia",
    value: 10655336
  }
]
============================================================
*/

function parseMarkdownTable(text) {
  if (!text) {
    return [];
  }

  const lines = text.split("\n");

  for (let i = 0; i < lines.length - 2; i++) {
    const headerLine = lines[i].trim();
    const separatorLine = lines[i + 1].trim();

    if (
      !headerLine.startsWith("|") ||
      !headerLine.endsWith("|") ||
      !separatorLine.startsWith("|") ||
      !separatorLine.endsWith("|") ||
      !separatorLine.includes("---")
    ) {
      continue;
    }

    const rows = [];

    for (let j = i + 2; j < lines.length; j++) {
      const rowLine = lines[j].trim();

      if (
        !rowLine.startsWith("|") ||
        !rowLine.endsWith("|")
      ) {
        break;
      }

      const cells = rowLine
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);

      if (cells.length < 2) {
        continue;
      }

      const category = cells[0];

      const valueText = cells[cells.length - 1]
        .replace(/,/g, "")
        .replace(/[₹$£€%]/g, "")
        .trim();

      const value = Number(valueText);

      if (
        category &&
        Number.isFinite(value)
      ) {
        rows.push({
          category,
          value,
        });
      }
    }

    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

/*
============================================================
DETERMINE CHART TYPE
============================================================
*/

function determineChartType(
  question,
  backendChartType
) {
  const lowerQuestion =
    question.toLowerCase();

  /*
  Explicit backend chart type wins
  */

  if (
    backendChartType &&
    backendChartType !== "bar"
  ) {
    return backendChartType.toLowerCase();
  }

  /*
  Time-based questions -> Line chart
  */

  if (
    lowerQuestion.includes("fiscal year") ||
    lowerQuestion.includes("by year") ||
    lowerQuestion.includes("year over") ||
    lowerQuestion.includes("by month") ||
    lowerQuestion.includes("by quarter") ||
    lowerQuestion.includes("by week") ||
    lowerQuestion.includes("over time") ||
    lowerQuestion.includes("trend")
  ) {
    return "line";
  }

  /*
  Categorical analysis -> Bar chart
  */

  return "bar";
}

/*
============================================================
DETERMINE CHART TITLE
============================================================
*/

function determineChartTitle(
  question,
  backendChartTitle
) {
  const lowerQuestion =
    question.toLowerCase();

  /*
  Use meaningful backend title if available
  */

  if (
    backendChartTitle &&
    backendChartTitle !== "Sales Analysis"
  ) {
    return backendChartTitle;
  }

  if (
    lowerQuestion.includes("territory")
  ) {
    return "Sales by Territory";
  }

  if (
    lowerQuestion.includes("product")
  ) {
    return "Sales by Product";
  }

  if (
    lowerQuestion.includes("customer")
  ) {
    return "Sales by Customer";
  }

  if (
    lowerQuestion.includes("reseller")
  ) {
    return "Sales by Reseller";
  }

  if (
    lowerQuestion.includes("fiscal year")
  ) {
    return "Total Sales by Fiscal Year";
  }

  if (
    lowerQuestion.includes("by year")
  ) {
    return "Total Sales by Year";
  }

  if (
    lowerQuestion.includes("month")
  ) {
    return "Sales by Month";
  }

  if (
    lowerQuestion.includes("quarter")
  ) {
    return "Sales by Quarter";
  }

  if (
    lowerQuestion.includes("week")
  ) {
    return "Sales by Week";
  }

  return "Sales Analysis";
}

/*
============================================================
MAIN APP
============================================================
*/

function App() {
  const [question, setQuestion] =
    useState("");

  const [messages, setMessages] =
    useState([
      {
        role: "assistant",

        text:
          "Hello! I'm NovaMart AI. Ask me anything about your sales data.",

        chartData: [],

        chartType: "bar",

        chartTitle: "",
      },
    ]);

  const [loading, setLoading] =
    useState(false);

  /*
  ==========================================================
  ASK QUESTION
  ==========================================================
  */

  const askQuestion = async () => {
    if (
      !question.trim() ||
      loading
    ) {
      return;
    }

    const userQuestion =
      question.trim();

    /*
    ----------------------------------------------------------
    ADD USER MESSAGE
    ----------------------------------------------------------
    */

    setMessages((prev) => [
      ...prev,

      {
        role: "user",

        text: userQuestion,

        chartData: [],

        chartType: "bar",

        chartTitle: "",
      },
    ]);

    setQuestion("");

    setLoading(true);

    try {
      /*
      --------------------------------------------------------
      LOCAL BACKEND
      --------------------------------------------------------
      */

      const response =
        await fetch(
          "http://localhost:3001/api/chat",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              message:
                userQuestion,
            }),
          }
        );

      if (!response.ok) {
        throw new Error(
          "Backend request failed"
        );
      }

      const data =
        await response.json();

      /*
      --------------------------------------------------------
      GET CHART DATA FROM BACKEND
      --------------------------------------------------------
      */

      let chartData =
        Array.isArray(
          data.chartData
        )
          ? data.chartData
          : [];

      /*
      --------------------------------------------------------
      FALLBACK:
      PARSE MARKDOWN TABLE
      --------------------------------------------------------

      This is the important fix.

      If Agent returns a Markdown table instead of
      explicit Chart data, we create chart data here.
      --------------------------------------------------------
      */

      if (
        chartData.length === 0
      ) {
        chartData =
          parseMarkdownTable(
            data.answer
          );
      }

      /*
      --------------------------------------------------------
      DETERMINE CHART TYPE
      --------------------------------------------------------
      */

      const chartType =
        determineChartType(
          userQuestion,
          data.chartType
        );

      /*
      --------------------------------------------------------
      DETERMINE CHART TITLE
      --------------------------------------------------------
      */

      const chartTitle =
        determineChartTitle(
          userQuestion,
          data.chartTitle
        );

      /*
      --------------------------------------------------------
      LOG FOR DEBUGGING
      --------------------------------------------------------
      */

      console.log(
        "Backend response:",
        data
      );

      console.log(
        "Final chart data:",
        chartData
      );

      console.log(
        "Final chart type:",
        chartType
      );

      console.log(
        "Final chart title:",
        chartTitle
      );

      /*
      --------------------------------------------------------
      ADD ASSISTANT MESSAGE
      --------------------------------------------------------
      */

      setMessages((prev) => [
        ...prev,

        {
          role: "assistant",

          text:
            data.answer ||
            "No response received.",

          chartData,

          chartType,

          chartTitle,
        },
      ]);
    } catch (error) {
      console.error(
        "Chat error:",
        error
      );

      setMessages((prev) => [
        ...prev,

        {
          role: "assistant",

          text:
            "Sorry, I couldn't connect to the NovaMart AI Agent.",

          chartData: [],

          chartType: "bar",

          chartTitle: "",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /*
  ==========================================================
  ENTER KEY
  ==========================================================
  */

  const handleKeyDown = (e) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {
      e.preventDefault();

      askQuestion();
    }
  };

  /*
  ==========================================================
  CHART RENDERER
  ==========================================================
  */

  const renderChart = (message) => {
    if (
      !message.chartData ||
      message.chartData.length === 0
    ) {
      return null;
    }

    const chartType = (
      message.chartType ||
      "bar"
    ).toLowerCase();

    const chartTitle =
      message.chartTitle ||
      "Sales Analysis";

    /*
    ----------------------------------------------------------
    LINE CHART
    ----------------------------------------------------------
    */

    if (
      chartType === "line"
    ) {
      return (
        <div className="chart-container">
          <h3>
            {chartTitle}
          </h3>

          <ResponsiveContainer
            width="100%"
            height={350}
          >
            <LineChart
              data={
                message.chartData
              }
              margin={{
                top: 10,
                right: 20,
                left: 10,
                bottom: 60,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="category"
                angle={-35}
                textAnchor="end"
                interval={0}
                height={80}
              />

              <YAxis
                tickFormatter={
                  formatCompactNumber
                }
              />

              <Tooltip
                formatter={(value) =>
                  formatTooltipValue(
                    value
                  )
                }
              />

              <Line
                type="monotone"
                dataKey="value"
                name={chartTitle}
                strokeWidth={3}
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    /*
    ----------------------------------------------------------
    DEFAULT BAR CHART
    ----------------------------------------------------------
    */

    return (
      <div className="chart-container">
        <h3>
          {chartTitle}
        </h3>

        <ResponsiveContainer
          width="100%"
          height={350}
        >
          <BarChart
            data={
              message.chartData
            }
            margin={{
              top: 10,
              right: 20,
              left: 10,
              bottom: 60,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
            />

            <XAxis
              dataKey="category"
              angle={-35}
              textAnchor="end"
              interval={0}
              height={80}
            />

            <YAxis
              tickFormatter={
                formatCompactNumber
              }
            />

            <Tooltip
              formatter={(value) =>
                formatTooltipValue(
                  value
                )
              }
            />

            <Bar
              dataKey="value"
              name={chartTitle}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  /*
  ==========================================================
  UI
  ==========================================================
  */

  return (
    <div className="app">

      <header className="header">

        <div className="brand">

          <div className="logo">
            N
          </div>

          <div>
            <h1>
              NovaMart AI
            </h1>

            <span>
              Sales Intelligence Assistant
            </span>
          </div>

        </div>

        <div className="status">

          <span className="status-dot"></span>

          Agent Online

        </div>

      </header>

      <main className="main">

        <section className="hero">

          <div className="hero-badge">
            AI POWERED SALES ANALYTICS
          </div>

          <h2>
            Ask your sales data anything.
          </h2>

          <p>
            Get answers from the NovaMart semantic model
            using natural language.
          </p>

          <div className="suggestions">

            <button
              onClick={() =>
                setQuestion(
                  "What is the total sales amount?"
                )
              }
            >
              Total sales
            </button>

            <button
              onClick={() =>
                setQuestion(
                  "What is our gross profit?"
                )
              }
            >
              Gross profit
            </button>

            <button
              onClick={() =>
                setQuestion(
                  "Which products have the highest sales?"
                )
              }
            >
              Top products
            </button>

            <button
              onClick={() =>
                setQuestion(
                  "Show sales by territory."
                )
              }
            >
              Sales by territory
            </button>

          </div>

        </section>

        <section className="chat-card">

          <div className="chat-header">

            <div>

              <strong>
                NovaMart AI Agent
              </strong>

              <span>
                Connected to Sales Semantic Model
              </span>

            </div>

            <div className="model">
              AI
            </div>

          </div>

          <div className="messages">

            {messages.map(
              (message, index) => (

                <div
                  key={index}
                  className={`message-row ${message.role}`}
                >

                  <div className="avatar">

                    {message.role ===
                    "assistant"
                      ? "N"
                      : "You"}

                  </div>

                  <div className="message">

                    <ReactMarkdown
                      remarkPlugins={[
                        remarkGfm,
                      ]}
                    >
                      {message.text}
                    </ReactMarkdown>

                    {message.role ===
                      "assistant" &&
                      renderChart(
                        message
                      )}

                  </div>

                </div>

              )
            )}

            {loading && (

              <div className="message-row assistant">

                <div className="avatar">
                  N
                </div>

                <div className="message">
                  Thinking...
                </div>

              </div>

            )}

          </div>

          <div className="input-area">

            <textarea
              value={question}
              onChange={(e) =>
                setQuestion(
                  e.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              placeholder="Ask a question about your sales data..."
              rows="2"
              disabled={loading}
            />

            <button
              className="send"
              onClick={
                askQuestion
              }
              disabled={loading}
            >
              {loading
                ? "Asking..."
                : "Ask AI"}
            </button>

          </div>

          <div className="input-footer">
            Answers are generated using the configured NovaMart AI Agent.
          </div>

        </section>

      </main>

      <footer>
        NovaMart AI • Sales Intelligence
      </footer>

    </div>
  );
}

export default App;