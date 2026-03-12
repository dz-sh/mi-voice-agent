import removeMarkdown from 'remove-markdown';

const CJK = '\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef';

/**
 * Normalize text for TTS:
 * 1. Strip markdown formatting (headers, bold/italic, code, links, etc.)
 * 2. Remove spaces between CJK characters and digits.
 *    e.g. "凌晨 2 点 09 分" → "凌晨2点09分", "3 月 8 日" → "3月8日"
 */
export function normalizeTTS(text: string): string {
  return removeMarkdown(text)
    .replace(new RegExp(`([${CJK}]) +(\\d)`, 'g'), '$1$2')
    .replace(new RegExp(`(\\d) +([${CJK}])`, 'g'), '$1$2');
}

/**
 * Estimate TTS playback duration in ms.
 *
 * MIoT doAction returns immediately; this estimate prevents back-to-back
 * TTS calls from overlapping.
 *
 * CJK: 260ms/char, digits+%: 400ms/char (expand in Chinese TTS),
 * ASCII: 80ms/char, minimum 1500ms for TTS engine startup.
 */
export function estimateTTSDuration(text: string): number {
  const stripped = removeMarkdown(text).trim();
  const cjkCount = (stripped.match(/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/g) ?? []).length;
  const numericCount = (stripped.match(/[\d%]/g) ?? []).length;
  const asciiCount = stripped.length - cjkCount - numericCount;
  return Math.max(1500, cjkCount * 260 + numericCount * 400 + asciiCount * 80);
}

/** Minimum normalized character length before a sentence fragment is played. */
export const MIN_SENTENCE_LENGTH = 30;

/** Maximum total buffer length before forcing playback without a sentence ending. */
export const MAX_BUFFER_LENGTH = 80;

/**
 * Sentence-ending punctuation.
 * English period matched only after a letter and before whitespace to avoid
 * splitting decimals (3.14) or abbreviations.
 */
export const SENTENCE_ENDINGS = /[。？！；?!;\n]|(?<=[a-zA-Z])\.(?=\s)/;

export interface SentenceFlushResult {
  /** Normalized sentences ready to be played via TTS. */
  sentences: string[];
  /** Accumulated fragments not yet long enough to play. */
  remainingBuffer: string;
  /** Text after the last processed sentence ending, not yet buffered. */
  remainingText: string;
}

/**
 * Process accumulated text and sentence fragments, yielding complete sentences.
 *
 * Called each time new SSE text arrives. Maintains state across calls via
 * the returned remainingBuffer and remainingText values.
 *
 * Rules:
 * - Extract text up to each sentence ending into sentenceBuffer.
 * - Emit sentence if normalized length >= MIN_SENTENCE_LENGTH; else keep accumulating.
 * - Force-emit if sentenceBuffer.length + fullText.length >= MAX_BUFFER_LENGTH.
 */
export function flushSentenceBuffer(
  sentenceBuffer: string,
  fullText: string,
): SentenceFlushResult {
  const sentences: string[] = [];
  let buffer = sentenceBuffer;
  let text = fullText;

  let match: RegExpMatchArray | null;
  while ((match = text.match(SENTENCE_ENDINGS)) !== null && match.index !== undefined) {
    const sentenceEnd = match.index + match[0].length;
    buffer += text.slice(0, sentenceEnd);
    text = text.slice(sentenceEnd);

    const sentence = normalizeTTS(buffer.trim());
    if (sentence.length >= MIN_SENTENCE_LENGTH) {
      sentences.push(sentence);
      buffer = '';
    }
    // else: keep accumulating in buffer until next ending makes it long enough
  }

  // Force flush if total accumulated content exceeds max length
  if (buffer.length + text.length >= MAX_BUFFER_LENGTH) {
    const sentence = normalizeTTS((buffer + text).trim());
    if (sentence) sentences.push(sentence);
    buffer = '';
    text = '';
  }

  return { sentences, remainingBuffer: buffer, remainingText: text };
}
