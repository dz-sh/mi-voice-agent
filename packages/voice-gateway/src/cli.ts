#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { buildConfigFromEnv } from './env-config.js';
import { startVoiceGateway } from './index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const VERSION = (() => {
    try {
        const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
        return pkg.version || 'unknown';
    } catch {
        return 'unknown';
    }
})();

const HELP_TEXT = `
mi-voice-gateway v${VERSION}

Usage: mi-voice-gateway [options]

Options:
  --help, -h       Show this help message
  --version, -v    Show version number

Environment Variables (set via .env file):
  MI_USER          Xiaomi account ID (required)
  MI_PASS          Xiaomi account password (required)
  MI_DID           XiaoAi speaker device ID (required)
  MI_DEBUG         Enable debug logging (default: false)
  MI_TIMEOUT       Speaker response timeout in ms (default: 5000)
  MI_HEARTBEAT     Message polling interval in ms (default: 1000)
  CALL_AI_KEYWORDS Comma-separated wake words (default: "请,你")
  OPENCLAW_URL     OpenClaw gateway URL, e.g. http://localhost:3000 (required)
  OPENCLAW_TOKEN   OpenClaw auth token (optional)
  OPENCLAW_MODEL   Model name for requests (default: "openclaw")
  STREAM_RESPONSE  Enable streaming TTS (default: true)
  MCP_PORT         Port for embedded MCP server (default: 3001)
  THINKING_TEXT    Placeholder spoken while OpenClaw processes (default: "请稍候")
`.trim();

// Load .env file
dotenv.config();

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(HELP_TEXT);
        process.exit(0);
    }
    if (args.includes('--version') || args.includes('-v')) {
        console.log(VERSION);
        process.exit(0);
    }

    console.log('🎙️ Starting MiHome-MCP Voice Gateway...');

    const config = buildConfigFromEnv();
    await startVoiceGateway(config);
}

main().catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
});
