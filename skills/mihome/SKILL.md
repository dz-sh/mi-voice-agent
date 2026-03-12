---
name: mihome
description: Control Xiaomi smart home devices via MIoT protocol using MCP
---

# Xiaomi MiHome Smart Home Control

## Overview

The MiHome skill enables natural language control of Xiaomi/MiJia smart home devices. It connects to the `mihome-mcp` MCP Server, which exposes device control capabilities via the Model Context Protocol.

## Prerequisites

1. Ensure the `voice-gateway` is running (e.g., via `docker-compose.yml`).
2. The `voice-gateway` automatically starts an embedded MCP server on port `3001` (by default).
3. Configure the MCP connection in OpenClaw to point to this server using the HTTP/SSE transport type:
   - **Type**: `sse` (or HTTP)
   - **URL**: `http://<your-voice-agent-ip>:3001/mcp`
## Available Tools

### Device Management
- `list_devices` — List all MiJia devices (name, DID, model)
- `get_conversations` — Fetch recent XiaoAi speaker conversation history

### Device Control
- `get_property(did, siid, piid)` — Read device property value
- `set_property(did, siid, piid, value)` — Set device property value
- `do_action(did, siid, aiid, args?)` — Execute device action

### Scene Automation
- `run_scene(name, steps)` — Execute multiple device operations in sequence

## Usage Examples

- "Turn on the living room light" → `list_devices` to find the DID, then `do_action` to turn on
- "Set AC temperature to 26°C" → `set_property` to set the temperature property
- "Run sleep mode" → `run_scene`: turn off lights + lower volume + turn off AC

## Device siid/piid/aiid Reference

Look up your device model at https://home.miot-spec.com/ for available services, properties, and actions.

Common references:
| Operation | siid | piid/aiid | Description |
|-----------|------|-----------|-------------|
| Power     | 2    | piid=1    | On/off switch for most devices |
| Brightness| 2    | piid=2    | Light brightness (0-100) |
| Color Temp| 2    | piid=3    | Light color temperature |
