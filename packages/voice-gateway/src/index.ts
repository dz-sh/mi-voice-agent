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
   * OpenClaw agent ID to handle voice channel requests.
   *
   * Sent as the `x-openclaw-agent-id` header on every request.
   *
   * Default: "main"
   */
  openclawAgentId?: string;

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
   * Placeholder text spoken immediately after cancelling XiaoAi's response,
   * while OpenClaw is processing the request.
   *
   * Default: "请稍候"
   */
  thinkingText?: string;

  /**
   * Additional system prompt appended to the built-in TTS prompt.
   *
   * Use this for user-specific context, e.g. timezone, preferences, or
   * instructions that should always be included in every request.
   *
   * Example: "用户所在时区是北京时间（UTC+8）。"
   */
  userPrompt?: string;

}

/**
 * Start MiHome-MCP Voice Gateway
 *
 * Single process that provides:
 * 1. Voice channel — XiaoAi speaker ↔ OpenClaw agent
 * 2. MCP server — device control tools via Streamable HTTP transport
 *
 * Both share a single MIoT session, eliminating dual-login conflicts.
 *
 * Conversation history is managed server-side by OpenClaw using the speaker
 * device DID as the session identifier. The gateway does not maintain local
 * history.
 */
export async function startVoiceGateway(config: MiHomeMCPConfig) {
  const openclawUrl = config.openclawUrl;
  const openclawToken = config.openclawToken;
  const openclawModel = config.openclawModel ?? 'openclaw';
  const openclawAgentId = config.openclawAgentId;
  const useStreaming = config.streamResponse ?? true;
  const mcpPort = config.mcpPort ?? 3001;
  const ttsCommand = config.ttsCommand;
  const thinkingText = config.thinkingText ?? '请稍候';
  const callAIKeywords: string[] = (config as any).callAIKeywords ?? ['请', '你'];
  // Use device DID as stable session identifier — OpenClaw manages conversation history
  const sessionUser: string = (config as any).speaker?.did ?? 'mi-voice-gateway';

  // Voice gateway always prepends a TTS-friendly system prompt.
  // Markdown, tables, and bullet lists sound unnatural when spoken aloud.
  const TTS_SYSTEM_PROMPT = '请用自然口语回答，不要使用任何Markdown格式（不要用#标题、**加粗、列表符号、表格等），直接用简洁连贯的中文口语表达，适合语音播报。';
  const systemPrompt = config.userPrompt
    ? `${TTS_SYSTEM_PROMPT}\n${config.userPrompt}`
    : TTS_SYSTEM_PROMPT;

  if (!openclawUrl) {
    console.warn('⚠️ OPENCLAW_URL not set — voice gateway will use default MiGPT-Next AI reply logic.');
  }

  const originalOnMessage = (config as any).onMessage;

  const enhancedConfig: MiGPTConfig = {
    ...config,
    async onMessage(engine: any, msg: any) {
      // Safety net: if onMessage is somehow called for a keyword query, prevent
      // MiGPT's built-in AI from responding (OpenClaw is handled by fast poller).
      if (openclawUrl && callAIKeywords.some((k) => msg.text.startsWith(k))) {
        return { handled: true };
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

  // Start fast poller — detects queries, cancels XiaoAi TTS, and calls OpenClaw.
  // NOTE: We call OpenClaw here (not in onMessage) because MiMessage.fetchNextMessage()
  // filters conversation records by answer type ["TTS","LLM"]. When the fast poller
  // cancels XiaoAi's TTS at ~300ms, the answer isn't yet recorded, so the record is
  // filtered out and onMessage is never triggered. The fast poller uses the raw
  // getConversations API without that filter, so it correctly sees the query.
  startFastPoller(MiGPT.MiNA, ttsCommand, thinkingText, callAIKeywords, {
    url: openclawUrl,
    token: openclawToken,
    model: openclawModel,
    agentId: openclawAgentId,
    useStreaming,
    systemPrompt,
    sessionUser,
  }).catch((err) => {
    console.error('⚠️ Fast poller crashed:', err);
  });
}

/**
 * Normalize text for TTS by removing spaces inserted between digits and
 * Chinese characters (a common LLM typographic habit that disrupts TTS rhythm).
 * e.g. "凌晨 2 点 09 分" → "凌晨2点09分", "3 月 8 日" → "3月8日"
 */
function normalizeTTS(text: string): string {
  const CJK = '\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef';
  return text
    .replace(new RegExp(`([${CJK}]) +(\\d)`, 'g'), '$1$2')
    .replace(new RegExp(`(\\d) +([${CJK}])`, 'g'), '$1$2');
}

/**
 * Speak text via MIoT doAction (if ttsCommand set) or MiNA play fallback.
 */
async function speakText(text: string, ttsCommand?: [number, number]): Promise<boolean> {
  const normalized = normalizeTTS(text);
  if (ttsCommand) {
    return MiGPT.MiOT!.doAction(ttsCommand[0], ttsCommand[1], normalized);
  }
  return MiGPT.MiNA!.play({ text: normalized }) ?? false;
}

/**
 * Call OpenClaw with non-streaming mode.
 */
async function callOpenClaw(
  url: string,
  token: string | undefined,
  model: string,
  messages: { role: string; content: string }[],
  user: string,
  signal?: AbortSignal,
  agentId?: string,
): Promise<string | undefined> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (agentId) headers['x-openclaw-agent-id'] = agentId;

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, stream: false, messages, user }),
    signal,
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
  user: string,
  isActive: () => boolean,
  signal: AbortSignal,
  ttsCommand?: [number, number],
  agentId?: string,
): Promise<string | undefined> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (agentId) headers['x-openclaw-agent-id'] = agentId;

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, stream: true, messages, user }),
    signal,
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

  // Sentence-ending punctuation. English period matched only after a letter and before
  // whitespace to avoid splitting decimals (3.14) or abbreviations mid-word.
  // \n included: paragraph/line breaks are natural TTS pauses for structured responses.
  const sentenceEndings = /[。？！；?!;\n]|(?<=[a-zA-Z])\.(?=\s)/;
  // Minimum chars before a sentence fragment is played. Short fragments are accumulated
  // in sentenceBuffer until a later ending makes the combined text long enough.
  // 30 prevents standalone headers / short bullet points from becoming their own TTS
  // calls, which causes choppy speech.
  const MIN_SENTENCE_LENGTH = 30;
  // Maximum buffer length before forcing playback even without a sentence ending.
  // Prevents long silences when the model outputs unpunctuated content.
  const MAX_BUFFER_LENGTH = 80;
  // Accumulates short fragments until they form a long enough sentence to play.
  let sentenceBuffer = '';

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

      // Process ALL sentence endings accumulated in fullText, not just the first.
      // Multiple sentences may arrive in a single SSE chunk or across rapid chunks.
      let match: RegExpMatchArray | null;
      while ((match = fullText.match(sentenceEndings)) !== null && match.index !== undefined) {
        const sentenceEnd = match.index + match[0].length;
        sentenceBuffer += fullText.slice(0, sentenceEnd);
        fullText = fullText.slice(sentenceEnd);

        const sentence = sentenceBuffer.trim();
        if (sentence.length >= MIN_SENTENCE_LENGTH) {
          sentenceBuffer = '';
          fullReply += sentence;
          if (!isActive()) break;
          console.log(`🔊 TTS: ${sentence}`);
          await speakText(sentence, ttsCommand);
          // Wait for estimated playback duration before sending next sentence.
          // MIoT doAction returns immediately without waiting for audio to finish,
          // so a back-to-back call would interrupt the current sentence mid-play.
          await new Promise<void>((r) => setTimeout(r, estimateTTSDuration(sentence)));
        }
        // else: keep accumulating in sentenceBuffer until next sentence ending
      }

      // Force playback if total accumulated content exceeds max length.
      // Checks sentenceBuffer + fullText so long unpunctuated content doesn't
      // silently accumulate in fullText and get sent as one huge TTS call.
      if (sentenceBuffer.length + fullText.length >= MAX_BUFFER_LENGTH) {
        const sentence = (sentenceBuffer + fullText).trim();
        sentenceBuffer = '';
        fullText = '';
        fullReply += sentence;
        if (isActive()) {
          console.log(`🔊 TTS (overflow): ${sentence}`);
          await speakText(sentence, ttsCommand);
          await new Promise<void>((r) => setTimeout(r, estimateTTSDuration(sentence)));
        }
      }
    }

    // Play any accumulated fragments + remaining unfinished text as one final TTS call.
    const remaining = (sentenceBuffer + fullText).trim();
    if (remaining && isActive()) {
      fullReply += remaining;
      console.log(`🔊 TTS: ${remaining}`);
      await speakText(remaining, ttsCommand);
    }

    return fullReply || undefined;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Estimate TTS playback duration in ms based on text length.
 *
 * MIoT doAction returns immediately without waiting for audio to finish.
 * This estimate prevents back-to-back TTS calls from interrupting each other.
 *
 * CJK characters: ~260ms each (Chinese TTS ~3.8 chars/sec, with safety margin).
 * ASCII characters: ~80ms each (English TTS is significantly faster).
 * Minimum: 1500ms to account for TTS engine startup latency.
 */
function estimateTTSDuration(text: string): number {
  const stripped = text.replace(/\*+|_+|`+/g, '').trim();
  const cjkCount = (stripped.match(/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/g) ?? []).length;
  const asciiCount = stripped.length - cjkCount;
  return Math.max(1500, cjkCount * 260 + asciiCount * 80);
}

interface OpenClawConfig {
  url: string | undefined;
  token: string | undefined;
  model: string;
  agentId: string | undefined;
  useStreaming: boolean;
  systemPrompt: string;
  sessionUser: string;
}

/**
 * Fast polling loop (300ms) that detects new user queries before MiGPT's own
 * 1s loop does. On detection:
 * 1. Cancels XiaoAi's TTS immediately
 * 2. Plays a short placeholder so the user knows the request was received
 * 3. Calls OpenClaw and plays the TTS response sentence by sentence
 *
 * OpenClaw is called here (not in MiGPT's onMessage hook) because
 * MiMessage.fetchNextMessage() filters conversation records by answer type
 * ["TTS","LLM"]. When this poller cancels XiaoAi's TTS at ~300ms, the answer
 * hasn't been recorded yet, so MiMessage silently drops the message.
 */
async function startFastPoller(
  mina: any,
  ttsCommand: [number, number] | undefined,
  thinkingText: string,
  keywords: string[],
  openclaw: OpenClawConfig,
): Promise<void> {
  let lastTs = 0;
  // Concurrency control: abort in-progress OpenClaw request when a new query arrives
  let currentAbortController: AbortController | null = null;
  let generation = 0;

  // Seed lastTs from the most recent conversation entry so we don't re-fire on old messages
  const init = await mina.getConversations({ limit: 1 }).catch(() => null);
  if (init?.records?.[0]) {
    lastTs = init.records[0].time;
  }

  const POLL_INTERVAL = 300;

  while (true) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL));
    try {
      const convs = await mina.getConversations({ limit: 2 });
      const records: any[] = convs?.records ?? [];

      for (const record of records) {
        if (record.time > lastTs && record.query) {
          lastTs = record.time;
          const query: string = record.query;
          // Only intercept if the query matches a trigger keyword
          if (keywords.length === 0 || keywords.some((k) => query.startsWith(k))) {
            console.log(`⚡ Fast poller: intercepting keyword query "${query}"`);

            // Cancel any in-progress OpenClaw request
            if (currentAbortController) {
              currentAbortController.abort();
            }
            const myGen = ++generation;
            const abortController = new AbortController();
            currentAbortController = abortController;
            const isActive = () => myGen === generation;

            // Cancel XiaoAi TTS and play thinking placeholder
            await mina.callUbus('mibrain', 'cancel_tts', {}).catch(() => null);
            await speakText(thinkingText, ttsCommand);

            // When using MIoT TTS (ttsCommand), our responses go through MIoT,
            // not mibrain. Retrying cancel_tts is safe: it only cancels mibrain
            // (XiaoAi's response), not our sentences. We retry after the thinking
            // text finishes because XiaoAi's LLM response typically starts
            // 500ms–2s after the query is detected, after our cancel_tts has
            // already been ignored.
            if (ttsCommand) {
              const thinkDuration = estimateTTSDuration(thinkingText);
              const capturedIsActive = isActive;
              setTimeout(async () => {
                for (let i = 0; i < 5 && capturedIsActive(); i++) {
                  await mina.callUbus('mibrain', 'cancel_tts', {}).catch(() => null);
                  if (i < 4) await new Promise<void>((r) => setTimeout(r, 500));
                }
              }, thinkDuration);
            }

            // Fire-and-forget: call OpenClaw and play TTS response asynchronously
            // so the poller can continue detecting new messages without blocking.
            if (openclaw.url) {
              (async () => {
                try {
                  const messages = [
                    { role: 'system', content: openclaw.systemPrompt },
                    { role: 'user', content: query },
                  ];
                  const reply = openclaw.useStreaming
                    ? await callOpenClawStreaming(openclaw.url!, openclaw.token, openclaw.model, messages, openclaw.sessionUser, isActive, abortController.signal, ttsCommand, openclaw.agentId)
                    : await callOpenClaw(openclaw.url!, openclaw.token, openclaw.model, messages, openclaw.sessionUser, abortController.signal, openclaw.agentId);

                  if (reply) {
                    console.log(`🤖 Agent reply: ${reply}`);
                    if (!openclaw.useStreaming && isActive()) {
                      await speakText(reply, ttsCommand);
                    }
                  }
                } catch (err: any) {
                  if (err?.name === 'AbortError') return;
                  console.error('❌ OpenClaw request failed:', err);
                  if (isActive()) await speakText('服务出错，请稍后再试', ttsCommand);
                }
              })();
            }
          }
          break;
        }
      }
    } catch {
      // Ignore transient polling errors
    }
  }
}
