# Mi-Voice-Agent (小爱音箱大模型网关)

[![English](https://img.shields.io/badge/Language-English-blue)](README.md) [![中文](https://img.shields.io/badge/Language-中文-red)](README.zh-CN.md)

> 将小爱音箱连接至外部大模型 (LLM) Agent 的语音网关与 MCP 服务器。

Mi-Voice-Agent 是小米智能家居环境的中间件。它负责捕获小爱音箱的语音输入，将其路由给外部 Agent（如 OpenClaw 或 Claude）进行处理，并根据解析后的函数调用，利用 MCP (Model Context Protocol) 协议执行实际的设备控制。

## 典型应用场景：Agent 的现实世界语音通道

在传统的 AI Agent 架构中，Agent 往往只能生存在命令行、网页聊天框或桌面应用中，缺乏与现实物理世界直接交互的手段。

本项目提供了一个最典型的能力补充：**为你的 AI Agent 赋予一个真实的客厅语音入口与物理执行终端。**
当你部署了这个网关后，你家中的小爱音箱就不再是一个独立的智能助手，而是变成了一个“带麦克风和喇叭的物理终端”。这意味着无论你在哪里部署了多么复杂的 LLM Agent（比如用来总结新闻、查日程、甚至写代码的 Agent），你都可以直接在客厅里通过语音呼叫它，并让它立刻控制家里的物理设备作为反馈。

## 核心功能

1. **大模型代理的语音网关**
   识别并拦截小爱音箱收听到的特定指令词，将语音文本转发给指定的外部 Agent，取代小爱同学默认的回复机制。
2. **设备状态管理与控制 (MCP Server)**
   将局域网内的小米设备能力标准化为 MCP Tools (例如 `set_property`, `do_action`)，使得兼容 MCP 的 Agent 能够解析用户意图并转化为实际的 API 物理调用。
3. **跨平台兼容性**
   支持任何实现了 MCP 规范的客户端或框架，提供统一的智能家居接口，无需为不同的 Agent 平台开发定制化插件。

## 架构

```text
[用户语音] --> 🔊 [小爱音箱 (物理语音通道)]
                         │
                    (语音拦截)
                         │
                  🎙️ [语音网关 (核心应用)]
                         │
               (通过 HTTP API 转发文本流)
                         │
                 🧠 [外部 LLM Agent (如 OpenClaw)]
                         │
             (Agent 发起 MCP Tool 调用请求执行动作)
                         │
                  ⚙️ [MCP Server (协议绑定层)]
                         │
              [MIoT / MiNA 云端接口]
                         │
                   🏠 [物理米家设备 (现实执行终端)]
```

## 项目结构

本项目采用 Monorepo 结构，包含两个主要包：

*   `packages/voice-gateway/`: **网关层**。负责监听小爱输入流，映射关键词到 LLM 请求，并处理 TTS 语音反馈。
*   `packages/mcp-server/`: **协议层**。一个独立的 MCP 服务器，负责标准化底层 MIoT/MiNA API。适用于只需要文本指令而不需要语音网关的场景（如仅通过 Claude Desktop 桌面端控制）。

## 快速开始

### 前置要求
- 一个小米账号。
- 一台绑定该账号的小爱音箱。

### 环境变量说明

运行该服务需要以下环境变量进行小米账号和设备的认证：

| 变量名 | 说明 | 获取方式 |
|---|---|---|
| `MI_USER` | 小米账号 | 你的小米云服务账号（通常是手机号或邮箱，建议使用小米 ID 数字）。 |
| `MI_PASS` | 小米密码 | 对应账号的管理密码。 |
| `MI_DID` | 小爱音箱名称 | 你在米家 App 中为这台音箱设置的名称（例如："客厅的小爱音箱" 或 "小爱同学"）。网关会根据这个名称模糊匹配关联的设备。 |

### 方式一：Docker Compose（推荐）

使用容器化环境同时部署语音网关和底层的 MCP Server。

```bash
git clone <your-repo-url>
cd mi-voice-agent/docker
cp .env.example .env

# 配置你的小米账号信息与小爱音箱设备名 (MI_DID)
vi .env

docker compose up -d
```

### 方式二：Node.js (npx)

直接在 Node 环境下运行完整网关服务。

```bash
# 设置环境变量
export MI_USER="你的小米ID"
export MI_PASS="你的密码"
export MI_DID="你的小爱音箱名称"

# 启动服务
npx @mi-voice-agent/voice-gateway
```

## Agent 集成指南

### 对接 OpenClaw
1. 确保 `voice-gateway` 正在运行。
2. 在 OpenClaw 中配置一条通过 HTTP/SSE 指向本服务内置 MCP 的连接（例如：`http://<网关IP>:3001/mcp`）。
3. 导入专用的 skill prompt 来帮助大模型精确识别设备参数：详情参考 [\`.openclaw/skills/mihome/SKILL.md\`](.openclaw/skills/mihome/SKILL.md)。

## 依赖安装

本项目底层的 MIoT/MiNA 协议交互依赖于 [MiGPT-Next](https://github.com/idootop/migpt-next)。请在运行前确保已安装该依赖：

```bash
npm install -g migpt-next
# 或如果你在使用 pnpm
pnpm add -w migpt-next
```

## 开源协议

MIT License © 2026
