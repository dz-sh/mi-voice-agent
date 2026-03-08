# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Deployment

> **IMPORTANT: Do NOT run `pnpm build` or `pnpm install` directly on the host.**
> The project is built and run via Docker. Always use Docker commands to build and deploy.

```bash
# Build and run via Docker (from docker/ directory)
cd docker && docker compose up --build

# Rebuild without cache
cd docker && docker compose build --no-cache

# View logs
cd docker && docker compose logs -f
```

The pnpm commands below are for reference only (what Docker runs internally):

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Clean all dist directories
pnpm clean
```

There are no tests in this repository.

## Architecture

This is a **pnpm monorepo** managed with **Turborepo**. Packages are built with `tsup` (ESM output to `dist/`). Node >= 20 required.

### Two packages, two deployment modes

**`packages/voice-gateway/`** — The primary package. A single long-running process that:
1. Connects to Xiaomi Cloud via `@mi-gpt/next` (MiGPT) to handle XiaoAi speaker voice interaction
2. Intercepts speaker messages and forwards them to an OpenClaw agent (OpenAI-compatible `/v1/chat/completions`)
3. Plays TTS responses back via the speaker (streaming sentence-by-sentence, or full response)
4. Runs an **embedded MCP server** on port 3001 (Streamable HTTP transport at `/mcp`) that shares the same MIoT/MiNA session — critical to avoid Xiaomi dual-login conflicts

**`packages/mcp-server/`** — Standalone MCP server using stdio transport. Intended for text-only clients like Claude Desktop. Maintains its own MIoT session via `MIoTBridge` (lazy-init singleton). **Do not run simultaneously with voice-gateway on the same Xiaomi account.**

### Key data flow

```
XiaoAi speaker -> MiGPT (polling) -> onMessage hook -> OpenClaw HTTP -> SSE stream
                                                                      -> TTS sentences -> speaker
```

The `onMessage` hook in `voice-gateway/src/index.ts` intercepts MiGPT's message handling to route through OpenClaw instead of the default AI.

### MCP tools (both packages expose the same set)

- `list_devices` / `get_conversations` — device discovery
- `get_property` / `set_property` / `do_action` — MIoT protocol device control (requires `siid`/`piid`/`aiid` from https://home.miot-spec.com/)
- `run_scene` — sequential multi-device operations with optional delays
- `speaker_tts` / `speaker_play_url` / `speaker_volume` / `speaker_get_status` / `speaker_stop` — speaker control (voice-gateway only, not in standalone mcp-server)

**DID override pattern**: Control tools temporarily swap `miot.account.device.did` to target arbitrary devices, restoring it in a `finally` block. This is how a single MIoT session controls multiple devices.

### Configuration

All config comes from environment variables (loaded via dotenv in CLI). Required: `MI_USER`, `MI_PASS`, `MI_DID`, `OPENCLAW_URL`. See `docker/.env.example` for full reference.

The standalone mcp-server also accepts `MI_PASS_TOKEN` (passToken) as an alternative to `MI_PASS`.

### Docker

`docker/docker-compose.yml` runs the voice-gateway. Copy `docker/.env.example` to `docker/.env` and configure before running.

### OpenClaw skill

`.openclaw/skills/mihome/SKILL.md` is the skill definition loaded by OpenClaw agents to understand how to use the MCP tools.
