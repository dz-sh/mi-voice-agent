import { MiGPT } from '@mi-gpt/next';
import type { MiGPTConfig } from '@mi-gpt/next';
import { startEmbeddedMcpServer } from './mcp-server.js';

export interface MiHomeMCPConfig extends MiGPTConfig {
  /**
   * OpenClaw gateway URL for agent communication.
   *
   * Example: "http://localhost:3000"
   */
  openclawUrl?: string;

  /**
   * Auth token for OpenClaw gateway.
   */
  openclawToken?: string;

  /**
   * Model name to send in OpenAI-compatible requests.
   *
   * Default: "openclaw"
   */
  openclawModel?: string;

  /**
   * Whether to use streaming mode for TTS responses.
   *
   * Some XiaoAi speakers don't support streaming TTS.
   * Set to false for those models.
   *
   * Default: true
   */
  streamResponse?: boolean;

  /**
   * Port for the embedded MCP HTTP server.
   *
   * Default: 3001
   */
  mcpPort?: number;

  /**
   * MIoT TTS action command [siid, aiid] for the speaker model.
   *
   * Required for models where MiNA ubus text_to_speech doesn't work.
   * See https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md
   *
   * Example for L05C: [5, 3]
   */
  ttsCommand?: [number, number];

  /**
   * Inactivity timeout in minutes before conversation history is reset.
   *
   * Default: 10
   */
  conversationTimeout?: number;

  /**
   * Maximum number of turns (user+assistant pairs) to keep in history.
   *
   * Default: 20
   */
  maxHistoryTurns?: number;
}

/**
 * Start MiHome-MCP Voice Gateway
 *
 * Single process that provides:
 * 1. Voice channel — XiaoAi speaker ↔ OpenClaw agent
 * 2. MCP server — device control tools via Streamable HTTP transport
 *
 * Both share a single MIoT session, eliminating dual-login conflicts.
 */
export async function startVoiceGateway(config: MiHomeMCPConfig) {
  const openclawUrl = config.openclawUrl;
  const openclawToken = config.openclawToken;
  const openclawModel = config.openclawModel ?? 'openclaw';
  const useStreaming = config.streamResponse ?? true;
  const mcpPort = config.mcpPort ?? 3001;
  const ttsCommand = config.ttsCommand;
  const conversationTimeoutMs = (config.conversationTimeout ?? 10) * 60 * 1000;
  const maxHistoryTurns = config.maxHistoryTurns ?? 20;

  if (!openclawUrl) {
    console.warn('⚠️ OPENCLAW_URL not set — voice gateway will use default MiGPT-Next AI reply logic.');
  }

  // Conversation history shared across voice turns
  type Message = { role: 'user' | 'assistant'; content: string };
  const history: Message[] = [];
  let lastMessageAt = 0;

  const originalOnMessage = (config as any).onMessage;

  const enhancedConfig: MiGPTConfig = {
    ...config,
    async onMessage(engine: any, msg: any) {
      // If OpenClaw is configured, forward to agent
      if (openclawUrl) {
        // Reset history after inactivity
        if (Date.now() - lastMessageAt > conversationTimeoutMs) {
          history.length = 0;
          console.log('🔄 Conversation history reset (timeout)');
        }
        lastMessageAt = Date.now();

        // Append current user turn
        history.push({ role: 'user', content: msg.text });

        // Trim to max turns (each turn = 2 messages)
        while (history.length > maxHistoryTurns * 2) history.splice(0, 2);

        try {
          const reply = useStreaming
            ? await callOpenClawStreaming(openclawUrl, openclawToken, openclawModel, history, ttsCommand)
            : await callOpenClaw(openclawUrl, openclawToken, openclawModel, history);

          if (reply) {
            console.log(`🤖 Agent reply: ${reply}`);
            history.push({ role: 'assistant', content: reply });
            if (!useStreaming) {
              await speakText(reply, ttsCommand);
            }
          } else {
            // Remove the user turn we added if no reply came back
            history.pop();
          }

          return { handled: true };
        } catch (err) {
          history.pop(); // Remove the user turn on error
          console.error('❌ OpenClaw request failed:', err);
          await speakText('服务出错，请稍后再试', ttsCommand);
          return { handled: true };
        }
      }

      // Fallback to user's custom onMessage or default AI
      if (originalOnMessage) {
        return originalOnMessage(engine, msg);
      }
    },
  };

  // Start MiGPT (voice channel) — runs forever in a polling loop, do not await
  MiGPT.start(enhancedConfig).catch((err) => {
    console.error('❌ MiGPT crashed:', err);
    process.exit(1);
  });

  // Wait for MiService.init() to complete inside MiGPT.start()
  const SESSION_TIMEOUT = 30_000;
  const POLL_INTERVAL = 200;
  const startTime = Date.now();
  while (!MiGPT.MiOT || !MiGPT.MiNA) {
    if (Date.now() - startTime > SESSION_TIMEOUT) {
      throw new Error('MiGPT session init timeout after 30s');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  // Start embedded MCP server using the same MIoT/MiNA session
  try {
    await startEmbeddedMcpServer(mcpPort, MiGPT.MiOT, MiGPT.MiNA, ttsCommand);
    console.log('✅ Voice Gateway + MCP Server running (single MIoT session)');
  } catch (err) {
    console.error('⚠️ Failed to start embedded MCP server:', err);
    console.log('   Voice channel is still active. MCP tools unavailable.');
  }
}

/**
 * Speak text via MIoT doAction (if ttsCommand set) or MiNA play fallback.
 */
async function speakText(text: string, ttsCommand?: [number, number]): Promise<boolean> {
  if (ttsCommand) {
    return MiGPT.MiOT!.doAction(ttsCommand[0], ttsCommand[1], text);
  }
  return MiGPT.MiNA!.play({ text }) ?? false;
}

/**
 * Call OpenClaw with non-streaming mode.
 */
async function callOpenClaw(
  url: string,
  token: string | undefined,
  model: string,
  messages: { role: string; content: string }[],
): Promise<string | undefined> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, stream: false, messages }),
  });

  if (!res.ok) {
    throw new Error(`OpenClaw returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content;
}

/**
 * Call OpenClaw with streaming mode.
 *
 * Reads SSE chunks and plays each complete sentence via TTS as it arrives.
 * Returns the full assistant reply for history tracking.
 */
async function callOpenClawStreaming(
  url: string,
  token: string | undefined,
  model: string,
  messages: { role: string; content: string }[],
  ttsCommand?: [number, number],
): Promise<string | undefined> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, stream: true, messages }),
  });

  if (!res.ok) {
    throw new Error(`OpenClaw returned ${res.status}: ${await res.text()}`);
  }

  const body = res.body;
  if (!body) {
    throw new Error('No response body for streaming request');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let fullReply = '';

  const sentenceEndings = /[。？！；?!;\n]/;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }

      const match = fullText.match(sentenceEndings);
      if (match && match.index !== undefined) {
        const sentenceEnd = match.index + 1;
        const sentence = fullText.slice(0, sentenceEnd).trim();
        fullText = fullText.slice(sentenceEnd);

        if (sentence) {
          console.log(`🔊 TTS: ${sentence}`);
          const ok = await speakText(sentence, ttsCommand);
          console.log(`🔊 TTS result: ${ok}`);
          fullReply += sentence;
        }
      }
    }

    const remaining = fullText.trim();
    if (remaining) {
      await speakText(remaining, ttsCommand);
      fullReply += remaining;
    }

    return fullReply || undefined;
  } finally {
    reader.releaseLock();
  }
}
