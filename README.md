# UnityLLMGIT

一个用于 **Unity / Unity WebGL NPC 对话** 的轻量级 LLM 后端服务。

当前仓库主要包含 Node.js 服务端代码。Unity 客户端可以通过 HTTP 请求把 NPC ID、玩家消息以及最近的对话历史发送到本服务，再由服务端调用 DeepSeek Chat Completions API，并将 NPC 回复返回给 Unity。

> 当前仓库不包含 Unity 工程或 C# 客户端脚本。

## 工作流程

```text
Unity / Unity WebGL
        │
        │ POST /api/npc-chat
        ▼
Node.js + Express
        │
        │ DeepSeek API
        ▼
       LLM
        │
        ▼
    NPC Reply
        │
        ▼
      Unity
```

这种架构可以避免把 `DEEPSEEK_API_KEY` 直接放进 Unity 或 WebGL 客户端中。

## 功能

- 为 Unity / Unity WebGL 提供 NPC 对话 HTTP API
- 调用 DeepSeek Chat Completions API
- 支持携带最近的聊天历史
- 在服务端统一管理 NPC System Prompt
- 基础输入长度限制
- 基础请求频率限制
- 支持 CORS
- 支持浏览器 OPTIONS 预检请求
- 提供健康检查接口
- API Key 通过服务器环境变量读取

## 项目结构

```text
UnityLLMGIT/
├── package.json
├── package-lock.json
├── server.js
└── README.md
```

其中：

- `server.js`：Express 服务、NPC Prompt、DeepSeek API 调用以及接口逻辑
- `package.json`：项目依赖以及启动脚本
- `package-lock.json`：npm 依赖锁定文件

## 环境要求

建议使用：

- Node.js 18 或更高版本
- npm
- DeepSeek API Key

项目使用 Node.js 内置的 `fetch`，因此不建议使用过旧版本的 Node.js。

## 安装

克隆仓库：

```bash
git clone https://github.com/wenzhengw-cloud/UnityLLMGIT.git
cd UnityLLMGIT
```

安装依赖：

```bash
npm install
```

## 配置环境变量

在项目根目录创建 `.env`：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
PORT=3000
```

环境变量说明：

| 变量 | 是否必须 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | DeepSeek API Key |
| `DEEPSEEK_MODEL` | 否 | 使用的模型，未设置时采用代码中的默认值 |
| `PORT` | 否 | HTTP 服务端口，默认 `3000` |

**不要把真实 `.env`、API Key、Token、密码或其他凭据提交到公开仓库。**

建议同时创建 `.gitignore`：

```gitignore
node_modules/
.env
.env.*
!.env.example
```

## 启动

```bash
npm start
```

也可以使用：

```bash
npm run dev
```

当前两个命令都会执行：

```bash
node server.js
```

默认监听：

```text
http://localhost:3000
```

## API

### GET `/`

确认服务器是否正常运行。

示例：

```json
{
  "ok": true,
  "message": "NPC AI server is running.",
  "health": "/health",
  "chat": "/api/npc-chat"
}
```

---

### GET `/health`

健康检查接口。

示例：

```json
{
  "ok": true,
  "time": "2026-01-01T00:00:00.000Z"
}
```

---

### POST `/api/npc-chat`

发送玩家消息并获取 NPC 回复。

请求示例：

```json
{
  "npcId": "npc001",
  "userMessage": "你好，今天过得怎么样？",
  "history": [
    {
      "role": "user",
      "content": "你好"
    },
    {
      "role": "assistant",
      "content": "你好。"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `npcId` | string | NPC 标识 |
| `userMessage` | string | 当前玩家输入 |
| `history` | array | 可选的历史聊天记录 |

目前：

- `userMessage` 最多 300 个字符
- 最多采用最近 8 条历史消息
- 历史消息只允许 `user` 和 `assistant` 两种角色
- 单条历史消息最多采用前 500 个字符

成功响应：

```json
{
  "reply": "NPC 的回复内容",
  "usage": {}
}
```

如果 DeepSeek 未返回 usage 信息：

```json
{
  "reply": "NPC 的回复内容",
  "usage": null
}
```

## cURL 测试

启动服务器后可以直接执行：

```bash
curl -X POST http://localhost:3000/api/npc-chat \
  -H "Content-Type: application/json" \
  -d '{
    "npcId": "npc001",
    "userMessage": "你好",
    "history": []
  }'
```

## 当前请求限制

目前服务端包含一些基础保护：

```text
JSON 请求体       最大约 32 KB
userMessage       最大 300 字符
history           最近 8 条
历史单条 content  最大 500 字符
接口限流          每分钟约 20 次
max_tokens        180
```

可以根据实际游戏需求在 `server.js` 中调整。

## Unity WebGL 与 CORS

Unity WebGL 最终运行于浏览器环境，因此调用远程服务器时需要正确配置 CORS。

当前开发配置允许任意来源：

```js
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
```

这样可以方便 Unity WebGL 本地 `Build And Run`。

但生产环境建议改为明确的域名白名单，例如：

```js
app.use(cors({
  origin: [
    "https://game.example.com"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
```

## NPC Prompt

NPC 的 System Prompt 当前由：

```js
getNpcSystemPrompt(npcId)
```

负责生成。

虽然函数已经接收 `npcId`，但当前实现并没有根据不同 NPC 返回不同 Prompt。

因此目前：

```text
npc001
npc002
npc003
```

实际上都会使用同一套角色设定。

如果需要多 NPC，可以改成：

```js
const NPC_PROMPTS = {
  npc001: `
你是 NPC 1。
这里填写 NPC 1 的人物设定。
`,
  npc002: `
你是 NPC 2。
这里填写 NPC 2 的人物设定。
`,
  default: `
你是游戏中的普通 NPC。
`
};

function getNpcSystemPrompt(npcId) {
  return NPC_PROMPTS[npcId] ?? NPC_PROMPTS.default;
}
```

这样 Unity 只需要传递不同的：

```json
{
  "npcId": "npc001"
}
```

即可切换角色。

## 对话记忆

当前项目没有数据库，也没有服务端长期记忆系统。

聊天历史实际上来自 Unity 客户端提交的：

```json
"history": []
```

流程为：

```text
Unity 保存对话
     │
     ▼
发送最近的 history
     │
     ▼
Node.js Server
     │
     ▼
DeepSeek
```

因此服务器本身不会永久保存玩家聊天历史。

如果以后需要长期记忆，可以考虑：

- SQLite
- PostgreSQL
- Redis
- 玩家本地存档
- 云端玩家存档
- 向量数据库
- RAG

## 安全与隐私

### API Key

当前代码使用：

```js
process.env.DEEPSEEK_API_KEY
```

读取 DeepSeek API Key。

这意味着密钥保存在服务器环境变量中，而不是硬编码进 GitHub 仓库或 Unity WebGL 客户端。

这是推荐的实现方式。

### `.env`

不要提交：

```text
.env
```

建议将其加入 `.gitignore`：

```gitignore
.env
.env.*
!.env.example
```

可以提交一个不包含真实密钥的 `.env.example`：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
PORT=3000
```

### 玩家对话日志

当前 `server.js` 中存在：

```js
console.log("收到 NPC 请求：", req.body);
```

这会把完整请求内容写入服务器日志。

如果玩家可能输入：

- 个人经历
- 心理状态
- 姓名
- 联系方式
- 学校信息
- 健康信息
- 其他私人内容

则这些信息也可能进入服务器日志。

生产环境建议改为：

```js
console.log(
  `[${new Date().toISOString()}] NPC request`,
  {
    npcId: req.body?.npcId,
    hasMessage: Boolean(req.body?.userMessage),
    historyLength: Array.isArray(req.body?.history)
      ? req.body.history.length
      : 0
  }
);
```

避免保存实际聊天文本。

## API 保护

目前 API 使用了基础限流，但是没有玩家认证机制。

如果服务器地址公开，理论上其他人也可以直接访问：

```text
POST /api/npc-chat
```

从而消耗 DeepSeek API 额度。

正式项目可以进一步加入：

- 玩家 Session
- JWT
- 用户身份认证
- 游戏服务器签名
- 每用户调用额度
- IP + 用户联合限流

需要注意：

**不能仅仅把一个固定“秘密字符串”写进 Unity WebGL。**

因为 WebGL 客户端代码和网络请求都可以被用户查看，所以真正需要保护的 Secret 应始终保存在服务器端。

## 部署

这是一个普通 Node.js HTTP 服务，可以部署在：

- Render
- Railway
- Fly.io
- VPS
- Docker
- 其他支持 Node.js 的云服务器

部署时至少设置：

```text
DEEPSEEK_API_KEY
```

多数云平台会自动设置：

```text
PORT
```

项目已经支持：

```js
const PORT = process.env.PORT || 3000;
```

## 后续改进方向

可以进一步加入：

- 多 NPC 独立 Prompt
- NPC 人格配置文件
- NPC 世界观与背景资料
- 玩家身份系统
- Session 管理
- 长期记忆
- 数据库存档
- RAG
- 流式输出
- Unity 打字机效果
- API 请求超时
- 自动重试
- 日志脱敏
- 正式环境 CORS 白名单
- 玩家级调用额度
- Docker
- 自动化测试
- CI/CD

## License

当前仓库暂未提供单独的 `LICENSE` 文件。

如果计划公开发布或允许其他开发者复用代码，建议添加明确的开源许可证，例如 MIT License。
