import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  // curl、PowerShell、部分服务器请求没有 origin，允许
  if (!origin) return true;

  // 开发阶段允许所有来源
  if (allowedOrigins.includes("*")) return true;

  // 允许 Unity WebGL Build And Run 的本地地址
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return true;

  return allowedOrigins.includes(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.log("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS: " + origin));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// 重要：专门处理 /api/npc-chat 的 OPTIONS 预检请求
app.options("/api/npc-chat", cors(corsOptions));

app.use(express.json({ limit: "32kb" }));

function isAllowedOrigin(origin) {
  // Postman / curl / Unity Editor 某些情况下可能没有 origin
  if (!origin) return true;

  // 开发环境允许 localhost 任意端口
  if (process.env.NODE_ENV !== "production") {
    if (/^https?:\/\/localhost:\d+$/.test(origin)) return true;
    if (/^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)) return true;
  }

  return allowedOrigins.includes(origin);
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

function getNpcSystemPrompt(npcId) {
  
  return `
你是一个大学生心理健康小游戏里的NPC。
玩家可能会询问一些自己的困惑，请你用温柔而循循善诱的语言回答。
不要说自己是AI，不要提到API或大语言模型。
回答要简洁，每次控制在80字以内。
`;
}

app.post("/api/npc-chat", limiter, async (req, res) => {
  try {
    const { npcId, userMessage, history } = req.body || {};

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: "Server missing DEEPSEEK_API_KEY" });
    }

    if (typeof userMessage !== "string" || userMessage.trim().length === 0) {
      return res.status(400).json({ error: "userMessage is required" });
    }

    if (userMessage.length > 300) {
      return res.status(400).json({ error: "Message too long" });
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
      console.error("DeepSeek API error:", rawText);
      return res.status(502).json({
        error: "DeepSeek API request failed"
      });
    }

    const data = JSON.parse(rawText);
    const reply = data?.choices?.[0]?.message?.content || "……";

    res.json({
      reply,
      usage: data.usage || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`NPC AI server running on http://localhost:${PORT}`);
});
