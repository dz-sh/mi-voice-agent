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
- **Voice Channel** — captures speech from XiaoAi, forwards to the agent, plays TTS response sentence by sentence (streaming) or all at once
- **MCP Server** — exposes device control tools via Streamable HTTP transport on port 3001

## Project Structure

*   `packages/voice-gateway/` — **Voice Gateway**. Single process that provides:
    - Voice channel: XiaoAi ↔ OpenClaw (or any OpenAI-compatible agent)
    - Embedded MCP server: device control tools via Streamable HTTP
    - Shared MIoT session (no dual-login conflicts)
*   `packages/mcp-server/` — **Standalone MCP Server**. For text-only clients (e.g., Claude Desktop) that don't need voice. Uses stdio transport. Do not run simultaneously with voice-gateway on the same Xiaomi account.

## Quick Start

### Prerequisites
- A Xiaomi account
- A compatible [XiaoAI speaker](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md) connected to the same account
- An AI agent with an OpenAI-compatible API (e.g., [OpenClaw](https://github.com/obra/openclaw))

### Environment Variables

**Required**

| Variable | Description |
|---|---|
| `MI_USER` | Xiaomi account ID (numeric) |
| `MI_PASS` | Xiaomi account password |
| `MI_DID` | XiaoAi speaker device ID (as shown in MiHome app) |
| `OPENCLAW_URL` | Agent gateway URL (e.g., `http://localhost:18789`) |

**Optional**

| Variable | Default | Description |
|---|---|---|
| `MI_PASS_TOKEN` | — | passToken alternative to `MI_PASS` |
| `OPENCLAW_TOKEN` | — | Agent auth token |
| `OPENCLAW_MODEL` | `openclaw` | Model name sent in requests |
| `OPENCLAW_AGENT_ID` | `main` | OpenClaw agent ID to route voice requests to (sent as `x-openclaw-agent-id` header) |
| `STREAM_RESPONSE` | `true` | Enable streaming TTS. Set `false` for [unsupported speakers](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md) |
| `MCP_PORT` | `3001` | Embedded MCP server port |
| `TTS_SIID` / `TTS_AIID` | — | MIoT TTS action IDs for speakers where MiNA TTS doesn't work (e.g., L05C: `5`/`3`) |
| `THINKING_TEXT` | `请稍候` | Placeholder spoken while the agent is processing |
| `SYSTEM_PROMPT` | — | Override the system prompt sent to the LLM |
| `CALL_AI_KEYWORDS` | `请,你` | Comma-separated wake words that trigger agent forwarding |
| `MI_DEBUG` | `false` | Enable debug logging |
| `MI_TIMEOUT` | `5000` | Request timeout in ms |
| `MI_HEARTBEAT` | `1000` | Message polling interval in ms |

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
export MI_DID="Your XiaoAi Speaker DID"
export OPENCLAW_URL="http://localhost:18789"

npx @mi-voice-agent/voice-gateway
```

## OpenClaw Integration

### 1. Connect the MCP Server

Start `voice-gateway`, then add the embedded MCP server to your OpenClaw agent configuration:

- **Type**: `sse` (Streamable HTTP)
- **URL**: `http://<your-gateway-ip>:3001/mcp`

### 2. Install the mihome Skill

Copy [`.openclaw/skills/mihome/`](.openclaw/skills/mihome/) into your OpenClaw skills directory so the agent knows how to use the MCP tools:

```bash
cp -r .openclaw/skills/mihome ~/.openclaw/skills/
```

See [`.openclaw/skills/mihome/SKILL.md`](.openclaw/skills/mihome/SKILL.md) for the full tool reference.

### 3. Route Voice Requests to a Specific Agent

By default, voice requests are routed to the `main` agent. To use a different agent (e.g., a dedicated `public` agent), set `OPENCLAW_AGENT_ID` in your `.env`:

```env
OPENCLAW_AGENT_ID=public
```

This sends the `x-openclaw-agent-id` header on every request, which OpenClaw uses to route to the specified agent.

### MCP Tools

| Tool | Description |
|---|---|
| `list_devices` | List all MiHome devices |
| `get_conversations` | Fetch recent XiaoAi conversation history |
| `get_property` | Read a MIoT device property |
| `set_property` | Set a MIoT device property |
| `do_action` | Execute a MIoT device action |
| `run_scene` | Execute multiple device operations in sequence |
| `speaker_tts` | Play TTS text through the speaker |
| `speaker_play_url` | Play audio from a URL |
| `speaker_get_status` | Get speaker play status and volume |
| `speaker_set_volume` | Set speaker volume |

## Known Limitations

- **Speaker compatibility**: Some XiaoAi models don't support streaming TTS. Set `STREAM_RESPONSE=false` for those models. See [compatibility list](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md).
- **Standalone MCP server**: If using `packages/mcp-server` separately (without voice-gateway), avoid running both simultaneously with the same Xiaomi account to prevent dual-login conflicts.

## Dependencies

Built on [MiGPT-Next](https://github.com/idootop/migpt-next) for MIoT/MiNA protocol interactions.

## License

Apache 2.0 License © 2026
