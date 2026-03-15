# Mi-Voice-Agent（小爱音箱 AI 语音网关）

[![English](https://img.shields.io/badge/Language-English-blue)](README.md) [![中文](https://img.shields.io/badge/Language-中文-red)](README.zh-CN.md)

> 将小爱音箱接入外部 AI Agent（如 OpenClaw）的语音网关与 MCP 服务器。

Mi-Voice-Agent 是小米智能家居环境的中间件。它捕获小爱音箱的语音输入，将其路由给外部 Agent 处理，并通过 MCP (Model Context Protocol) 协议让 Agent 能够控制米家设备。

## 典型应用场景

在传统 AI Agent 架构中，Agent 往往只能存在于命令行、网页或桌面应用中，缺乏与现实世界直接交互的能力。

本项目为 AI Agent 提供一个**真实的客厅语音入口与物理执行终端**：家中的小爱音箱变成"带麦克风和喇叭的物理终端"，让你可以直接通过语音呼叫任何 Agent，并让它实时控制家中的智能设备。

## 架构

```text
                    ┌─────────────────────────────────────┐
                    │         AI Agent（如 OpenClaw）      │
                    └──────┬─────────────────┬────────────┘
                           │                 │
     POST /v1/chat/        │                 │  MCP（Streamable HTTP）
     completions           │                 │  POST /mcp
                           │                 │
                    ┌──────▼─────────────────▼────────────┐
                    │       语音网关（单进程）               │
                    │                                     │
  🗣️ 用户 ──► 🔊 小爱音箱 │  语音通道 + MCP 服务器            │
        ◄──── TTS  │  （共享 MIoT 会话）                  │
                    └────────────────┬────────────────────┘
                                    │ MIoT API
                              ┌─────▼─────┐
                              │  小米云    │
                              └───────────┘
```

**单进程，共享 MIoT 会话**，避免双重登录冲突。语音网关同时承担：
- **语音通道** — 捕获小爱语音，转发给 Agent，逐句播放 TTS 回复（流式）或整段播放
- **MCP 服务器** — 通过 Streamable HTTP 在 3001 端口暴露设备控制工具

## 项目结构

本项目为 pnpm Monorepo，包含两个包：

- `packages/voice-gateway/` — **语音网关**。提供：
  - 语音通道：小爱音箱 ↔ OpenClaw（或任何 OpenAI 兼容 Agent）
  - 内嵌 MCP 服务器：通过 Streamable HTTP 暴露设备控制工具
  - 共享 MIoT 会话（避免双重登录）
- `packages/mcp-server/` — **独立 MCP 服务器**。适用于只需要文本指令的客户端（如 Claude Desktop），使用 stdio 传输。**不可与 voice-gateway 同时使用同一小米账号运行**。

## 快速开始

### 前置要求
- 一个小米账号
- 一台绑定该账号的[兼容小爱音箱](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md)
- 一个支持 OpenAI 兼容 API 的 AI Agent（如 [OpenClaw](https://github.com/obra/openclaw)）

### 环境变量

**必填**

| 变量名 | 说明 |
|---|---|
| `MI_USER` | 小米账号 ID（数字） |
| `MI_PASS` | 小米账号密码 |
| `MI_DID` | 小爱音箱设备 ID（米家 App 中显示的名称） |
| `OPENCLAW_URL` | Agent 网关地址（如 `http://localhost:18789`） |

**可选**

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `MI_PASS_TOKEN` | — | passToken，可替代 `MI_PASS` |
| `OPENCLAW_TOKEN` | — | Agent 认证 token |
| `OPENCLAW_MODEL` | `openclaw` | 请求中使用的模型名称 |
| `OPENCLAW_AGENT_ID` | `main` | 处理语音请求的 OpenClaw Agent ID（通过 `x-openclaw-agent-id` 请求头路由） |
| `STREAM_RESPONSE` | `true` | 启用流式 TTS。[不支持流式的音箱型号](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md)请设为 `false` |
| `MCP_PORT` | `3001` | 内嵌 MCP 服务器端口 |
| `TTS_SIID` / `TTS_AIID` | — | MIoT TTS 动作 ID，适用于 MiNA TTS 不可用的型号（如 L05C：`5`/`3`） |
| `THINKING_TEXT` | `请稍候` | Agent 处理请求时播放的占位提示语 |
| `SYSTEM_PROMPT` | — | 发送给 Agent 的全局系统提示词 |
| `CALL_AI_KEYWORDS` | `请,你` | 触发 Agent 转发的唤醒词（逗号分隔） |
| `MI_DEBUG` | `false` | 启用调试日志 |
| `MI_TIMEOUT` | `5000` | 请求超时时间（毫秒） |
| `MI_HEARTBEAT` | `1000` | 消息轮询间隔（毫秒） |

### 方式一：Docker Compose（推荐）

```bash
git clone <your-repo-url>
cd mi-voice-agent/docker
cp .env.example .env

# 配置小米账号信息和 Agent 地址
vi .env

docker compose up -d
```

### 方式二：Node.js (npx)

```bash
export MI_USER="你的小米ID"
export MI_PASS="你的密码"
export MI_DID="你的小爱音箱设备ID"
export OPENCLAW_URL="http://localhost:18789"

npx @mi-voice-agent/voice-gateway
```

## OpenClaw 集成指南

### 1. 连接 MCP 服务器

启动 `voice-gateway` 后，在 OpenClaw Agent 配置中添加 MCP 连接：

- **类型**：`sse`（Streamable HTTP）
- **URL**：`http://<网关IP>:3001/mcp`

### 2. 安装 mihome Skill

将 [`.openclaw/skills/mihome/`](.openclaw/skills/mihome/) 复制到 OpenClaw skills 目录，让 Agent 了解如何使用 MCP 工具：

```bash
cp -r .openclaw/skills/mihome ~/.openclaw/skills/
```

完整工具说明见 [`.openclaw/skills/mihome/SKILL.md`](.openclaw/skills/mihome/SKILL.md)。

### 3. 绑定指定 Agent 处理语音请求

默认情况下，语音请求路由到 `main` agent。如需使用其他 Agent（如专门的 `public` agent），在 `.env` 中设置：

```env
OPENCLAW_AGENT_ID=public
```

网关会在每次请求中携带 `x-openclaw-agent-id` 请求头，OpenClaw 据此路由到指定 Agent。

### MCP 工具列表

| 工具 | 说明 |
|---|---|
| `list_devices` | 列出所有米家设备 |
| `get_conversations` | 获取小爱近期对话记录 |
| `get_property` | 读取 MIoT 设备属性 |
| `set_property` | 设置 MIoT 设备属性 |
| `do_action` | 执行 MIoT 设备动作 |
| `run_scene` | 按顺序执行多个设备操作（场景） |
| `speaker_tts` | 通过音箱播放 TTS 文本 |
| `speaker_play_url` | 播放指定 URL 的音频 |
| `speaker_get_status` | 获取音箱播放状态和音量 |
| `speaker_set_volume` | 设置音箱音量 |

## 已知限制

- **音箱兼容性**：部分小爱型号不支持流式 TTS，需设置 `STREAM_RESPONSE=false`。详见[兼容列表](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md)。
- **独立 MCP 服务器**：`packages/mcp-server` 与 voice-gateway 使用同一小米账号时不可同时运行，否则会造成双重登录冲突。

## 依赖

底层 MIoT/MiNA 协议交互基于 [MiGPT-Next](https://github.com/idootop/migpt-next)。

## 开源协议

Apache 2.0 License © 2026
