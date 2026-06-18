import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3000;

// 开发测试阶段：直接允许所有跨域来源。
// Unity WebGL 本地 Build And Run 的地址通常是 http://localhost:xxxxx，
// 如果 CORS 不放行，浏览器会拦截请求。
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
}));

// 处理浏览器预检请求
app.options("/api/npc-chat", cors());

app.use(express.json({ limit: "32kb" }));

// 请求日志，方便在 Render Logs 里观察 Unity 是否真的请求到了后端
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log("Origin:", req.headers.origin || "no origin");
  next();
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "NPC AI server is running.",
    health: "/health",
    chat: "/api/npc-chat"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

function getNpcSystemPrompt(npcId) {
    return `
你是一个大学生心理健康小游戏里的NPC。
玩家可能会询问一些自己的困惑，请你用温柔而循循善诱的语言回答。
不要说自己是AI，不要提到DeepSeek，不要跳出游戏世界观。
每次回答控制在80字以内。
`;
}

app.post("/api/npc-chat", limiter, async (req, res) => {
  console.log("收到 NPC 请求：", req.body);

  try {
    const { npcId, userMessage, history } = req.body || {};

    if (!process.env.DEEPSEEK_API_KEY) {
      console.error("缺少 DEEPSEEK_API_KEY");
      return res.status(500).json({
        error: "Server missing DEEPSEEK_API_KEY"
      });
    }

    if (typeof userMessage !== "string" || userMessage.trim().length === 0) {
      return res.status(400).json({
        error: "userMessage is required"
      });
    }

    if (userMessage.length > 300) {
      return res.status(400).json({
        error: "Message too long"
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .slice(-8)
          .filter(item =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string"
          )
          .map(item => ({
            role: item.role,
            content: item.content.slice(0, 500)
          }))
      : [];

    const payload = {
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content: getNpcSystemPrompt(npcId)
        },
        ...safeHistory,
        {
          role: "user",
          content: userMessage
        }
      ],
      thinking: {
        type: "disabled"
      },
      temperature: 0.8,
      max_tokens: 180,
      stream: false
    };

    const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const rawText = await deepseekResponse.text();

    if (!deepseekResponse.ok) {
      console.error("DeepSeek API error:", deepseekResponse.status, rawText);

      return res.status(502).json({
        error: "DeepSeek API request failed",
        status: deepseekResponse.status,
        detail: rawText
      });
    }

    const data = JSON.parse(rawText);
    const reply = data?.choices?.[0]?.message?.content || "……";

    res.json({
      reply,
      usage: data.usage || null
    });
  } catch (err) {
    console.error("Internal server error:", err);

    res.status(500).json({
      error: "Internal server error",
      detail: String(err?.message || err)
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NPC AI server running on port ${PORT}`);
});
