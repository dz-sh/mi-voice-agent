import type { MiHomeMCPConfig } from './index.js';

/**
 * Build MiHomeMCPConfig from environment variables.
 *
 * This is the primary configuration method. All settings are read
 * from process.env (typically loaded via dotenv from .env).
 */
export function buildConfigFromEnv(): MiHomeMCPConfig {
    const {
        MI_USER,
        MI_PASS,
        MI_PASS_TOKEN,
        MI_DID,
        MI_DEBUG,
        MI_TIMEOUT,
        MI_HEARTBEAT,
        CALL_AI_KEYWORDS,
        OPENCLAW_URL,
        OPENCLAW_TOKEN,
        OPENCLAW_MODEL,
        OPENCLAW_AGENT_ID,
        STREAM_RESPONSE,
        MCP_PORT,
        TTS_SIID,
        TTS_AIID,
        THINKING_TEXT,
        USER_PROMPT,
    } = process.env;

    // Validate required fields
    if (!MI_USER || (!MI_PASS && !MI_PASS_TOKEN) || !MI_DID) {
        console.error('❌ Error: Missing required environment variables.');
        console.error('   Please set MI_USER, MI_DID, and either MI_PASS or MI_PASS_TOKEN in your .env file.');
        console.error('   See .env.example for details.');
        process.exit(1);
    }

    const debug = MI_DEBUG === 'true';

    const config: MiHomeMCPConfig = {
        debug,
        speaker: {
            userId: MI_USER,
            password: MI_PASS,
            passToken: MI_PASS_TOKEN,
            did: MI_DID,
            debug,
            timeout: parseInt(MI_TIMEOUT || '5000', 10),
            heartbeat: MI_HEARTBEAT ? parseInt(MI_HEARTBEAT, 10) : undefined,
        },
        callAIKeywords: parseCommaSeparated(CALL_AI_KEYWORDS, ['请', '你']),
    };

    // OpenClaw agent connection
    if (OPENCLAW_URL) {
        config.openclawUrl = OPENCLAW_URL;
        config.openclawToken = OPENCLAW_TOKEN;
        config.openclawModel = OPENCLAW_MODEL || 'openclaw';
        config.openclawAgentId = OPENCLAW_AGENT_ID || 'main';
    }

    // Streaming TTS mode (default: true)
    config.streamResponse = STREAM_RESPONSE !== 'false';

    // MCP server port (default: 3001)
    config.mcpPort = parseInt(MCP_PORT || '3001', 10);

    // MIoT TTS command for models where MiNA ubus TTS doesn't work
    if (TTS_SIID && TTS_AIID) {
        config.ttsCommand = [parseInt(TTS_SIID, 10), parseInt(TTS_AIID, 10)];
    }

    // Placeholder text while OpenClaw is processing
    if (THINKING_TEXT) config.thinkingText = THINKING_TEXT;

    // Additional system prompt appended to the built-in TTS prompt
    if (USER_PROMPT) config.userPrompt = USER_PROMPT;

    return config;
}

/**
 * Parse a comma-separated env var into a string array, with a fallback default.
 */
function parseCommaSeparated(value: string | undefined, fallback: string[]): string[] {
    if (!value) return fallback;
    return value.split(',').map((s) => s.trim()).filter(Boolean);
}
