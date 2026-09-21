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
    return `${(number / 1000000000).toFixed(2).replace(/\.00$/, "")}B`;
  }

  if (absolute >= 1000000) {
    return `${(number / 1000000).toFixed(2).replace(/\.00$/, "")}M`;
  }

  if (absolute >= 1000) {
    return `${(number / 1000).toFixed(1).replace(/\.0$/, "")}K`;
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
  MAIN APP
  ============================================================
*/

function App() {
  const [question, setQuestion] = useState("");

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text:
        "Hello! I'm NovaMart AI. Ask me anything about your sales data.",
      chartData: [],
      chartType: "bar",
      chartTitle: "",
    },
  ]);

  const [loading, setLoading] = useState(false);

  /*
    ==========================================================
    ASK QUESTION
    ==========================================================
  */

  const askQuestion = async () => {
    if (!question.trim() || loading) return;

    const userQuestion = question.trim();

    /*
      Add user message immediately
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
      const response = await fetch(
        "http://localhost:3001/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: userQuestion,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      const data = await response.json();

      /*
        Add AI response
      */

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          chartData: data.chartData || [],
          chartType: data.chartType || "bar",
          chartTitle: data.chartTitle || "Sales Analysis",
        },
      ]);
    } catch (error) {
      console.error("Chat error:", error);

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
    if (e.key === "Enter" && !e.shiftKey) {
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
      message.chartType || "bar"
    ).toLowerCase();

    const chartTitle =
      message.chartTitle || "Sales Analysis";

    /*
      --------------------------------------------------------
      LINE CHART
      --------------------------------------------------------
    */

    if (chartType === "line") {
      return (
        <div className="chart-container">
          <h3>{chartTitle}</h3>

          <ResponsiveContainer
            width="100%"
            height={350}
          >
            <LineChart
              data={message.chartData}
              margin={{
                top: 10,
                right: 20,
                left: 10,
                bottom: 60,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis
                dataKey="category"
                angle={-35}
                textAnchor="end"
                interval={0}
                height={80}
              />

              <YAxis
                tickFormatter={formatCompactNumber}
              />

              <Tooltip
                formatter={(value) =>
                  formatTooltipValue(value)
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
      --------------------------------------------------------
      DEFAULT: BAR CHART
      --------------------------------------------------------
    */

    return (
      <div className="chart-container">
        <h3>{chartTitle}</h3>

        <ResponsiveContainer
          width="100%"
          height={350}
        >
          <BarChart
            data={message.chartData}
            margin={{
              top: 10,
              right: 20,
              left: 10,
              bottom: 60,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              dataKey="category"
              angle={-35}
              textAnchor="end"
              interval={0}
              height={80}
            />

            <YAxis
              tickFormatter={formatCompactNumber}
            />

            <Tooltip
              formatter={(value) =>
                formatTooltipValue(value)
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

      {/* ====================================================
          HEADER
          ==================================================== */}

      <header className="header">
        <div className="brand">

          <div className="logo">
            N
          </div>

          <div>
            <h1>NovaMart AI</h1>

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

      {/* ====================================================
          MAIN
          ==================================================== */}

      <main className="main">

        {/* ==================================================
            HERO
            ================================================== */}

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

          {/* ==================================================
              SUGGESTIONS
              ================================================== */}

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

        {/* ==================================================
            CHAT CARD
            ================================================== */}

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

          {/* ==================================================
              MESSAGES
              ================================================== */}

          <div className="messages">

            {messages.map((message, index) => (

              <div
                key={index}
                className={`message-row ${message.role}`}
              >

                <div className="avatar">
                  {message.role === "assistant"
                    ? "N"
                    : "You"}
                </div>

                <div className="message">

                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                  >
                    {message.text}
                  </ReactMarkdown>

                  {/* ==================================================
                      DYNAMIC CHART
                      ================================================== */}

                  {message.role === "assistant" &&
                    renderChart(message)}

                </div>

              </div>

            ))}

            {/* ==================================================
                LOADING
                ================================================== */}

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

          {/* ==================================================
              INPUT
              ================================================== */}

          <div className="input-area">

            <textarea
              value={question}
              onChange={(e) =>
                setQuestion(e.target.value)
              }
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your sales data..."
              rows="2"
              disabled={loading}
            />

            <button
              className="send"
              onClick={askQuestion}
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

      {/* ====================================================
          FOOTER
          ==================================================== */}

      <footer>
        NovaMart AI • Sales Intelligence
      </footer>

    </div>
  );
}

export default App;