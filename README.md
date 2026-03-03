# Mi-Voice-Agent

[![English](https://img.shields.io/badge/Language-English-blue)](README.md) [![中文](https://img.shields.io/badge/Language-中文-red)](README.zh-CN.md)

> A voice channel and MCP server that connects XiaoAI speakers to AI agents like OpenClaw.

Mi-Voice-Agent turns your Xiaomi XiaoAI speaker into a voice channel for any AI agent that exposes an OpenAI-compatible API. It also includes a standalone MCP server that gives agents the ability to control Xiaomi smart home devices.

## Architecture

```text
                    ┌─────────────────────────────────────┐
                    │          AI Agent (OpenClaw)        │
                    └──────┬─────────────────┬────────────┘
                           │                 │
      POST /v1/chat/       │                 │  MCP (Streamable HTTP)
      completions          │                 │  POST /mcp
                           │                 │
                    ┌──────▼─────────────────▼────────────┐
                    │     Voice Gateway (single process)  │
                    │                                     │
  🗣️ User ──► 🔊 XiaoAi  │  Voice Channel + MCP Server     │
         ◄──── TTS │  (shared MIoT session)              │
                    └────────────────┬────────────────────┘
                                    │ MIoT API
                              ┌─────▼─────┐
                              │  Xiaomi   │
                              │  Cloud    │
                              └───────────┘
```

**Single process, single MIoT session.** The voice gateway acts as both:
- **Voice Channel** — captures speech from XiaoAi, forwards to OpenClaw, plays TTS response
- **MCP Server** — exposes device control tools via Streamable HTTP transport on port 3001

## Project Structure

*   `packages/voice-gateway/` — **Voice Gateway**. Single process that provides:
    - Voice channel: XiaoAi ↔ OpenClaw
    - Embedded MCP server: device control tools via Streamable HTTP
    - Shared MIoT session (no dual-login conflicts)
*   `packages/mcp-server/` — **Standalone MCP Server**. For text-only agents (e.g., Claude Desktop) that don't need voice. Uses stdio transport.

## Quick Start

### Prerequisites
- A Xiaomi account
- A compatible [XiaoAI speaker](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md) connected to the same account
- An AI agent with an OpenAI-compatible API (e.g., [OpenClaw](https://github.com/obra/openclaw))

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `MI_USER` | Xiaomi account ID (numeric) | ✅ |
| `MI_PASS` | Xiaomi account password | ✅ |
| `MI_DID` | XiaoAi speaker name (as shown in MiHome app) | ✅ |
| `OPENCLAW_URL` | Agent gateway URL (e.g., `http://localhost:3000`) | ✅ |
| `OPENCLAW_TOKEN` | Agent auth token | — |
| `OPENCLAW_MODEL` | Model name for requests (default: `openclaw`) | — |
| `STREAM_RESPONSE` | Enable streaming TTS (default: `true`, set `false` for [unsupported speakers](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md)) | — |
| `MCP_PORT` | Embedded MCP server port (default: `3001`) | — |
| `MI_DEBUG` | Enable debug logging (default: `false`) | — |
| `MI_TIMEOUT` | Request timeout in ms (default: `5000`) | — |
| `MI_HEARTBEAT` | Message polling interval in ms (default: `1000`) | — |
| `CALL_AI_KEYWORDS` | Comma-separated wake words (default: `请,你`) | — |

### Method 1: Docker Compose (Recommended)

```bash
git clone <your-repo-url>
cd mi-voice-agent/docker
cp .env.example .env

# Configure your credentials and agent URL
vi .env

docker compose up -d
```

### Method 2: Node.js (npx)

```bash
export MI_USER="Your Xiaomi ID"
export MI_PASS="Your Password"
export MI_DID="Your XiaoAi Speaker Name"
export OPENCLAW_URL="http://localhost:3000"

npx @mi-voice-agent/voice-gateway
```

## Agent Integration

To connect OpenClaw (or any other HTTP-based MCP Client) to `voice-gateway`'s embedded MCP server:

1. Start `voice-gateway` (e.g., via Docker Compose).
2. Configure your agent with an HTTP/SSE MCP connection pointing to `http://<your-ip>:3001/mcp`.

For clients requiring `stdio` transport (like Claude Desktop), you can still run the standalone MCP server via `npx @mi-voice-agent/mcp-server`, but ensure the voice-gateway is not running simultaneously to avoid duplicate Xiaomi cloud logins.


See [`.openclaw/skills/mihome/SKILL.md`](.openclaw/skills/mihome/SKILL.md) for the full tool reference and usage guide.

## Known Limitations

- **Speaker compatibility**: Some XiaoAi models don't support streaming TTS. Set `STREAM_RESPONSE=false` for those models. See [compatibility list](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md).
- **Standalone MCP server**: If using `packages/mcp-server` separately (without voice-gateway), it maintains its own MIoT session. Avoid running both simultaneously with the same Xiaomi account.

## Dependencies

Built on [MiGPT-Next](https://github.com/idootop/migpt-next) for MIoT/MiNA protocol interactions.

## License

MIT License © 2026
