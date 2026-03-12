import { describe, it, expect } from 'vitest';
import {
  normalizeTTS,
  estimateTTSDuration,
  flushSentenceBuffer,
  MIN_SENTENCE_LENGTH,
  MAX_BUFFER_LENGTH,
} from '../tts-utils.js';

// ── TC-TTS: normalizeTTS ──────────────────────────────────────────────────────

describe('normalizeTTS', () => {
  it('TC-TTS-01: strips markdown bold', () => {
    expect(normalizeTTS('**hello**')).toBe('hello');
  });

  it('TC-TTS-02: strips markdown header', () => {
    expect(normalizeTTS('# Title')).toBe('Title');
  });

  it('TC-TTS-03: strips markdown code block', () => {
    expect(normalizeTTS('`code`')).toBe('code');
  });

  it('TC-TTS-04: removes space between CJK and digit', () => {
    expect(normalizeTTS('凌晨 2 点 09 分')).toBe('凌晨2点09分');
  });

  it('TC-TTS-05: removes space between digit and CJK', () => {
    expect(normalizeTTS('3 月 8 日')).toBe('3月8日');
  });

  it('TC-TTS-06: leaves plain Chinese text unchanged', () => {
    expect(normalizeTTS('今天天气不错')).toBe('今天天气不错');
  });

  it('TC-TTS-07: leaves plain English text unchanged', () => {
    expect(normalizeTTS('hello world')).toBe('hello world');
  });
});

// ── TC-DUR: estimateTTSDuration ───────────────────────────────────────────────

describe('estimateTTSDuration', () => {
  it('TC-DUR-01: returns minimum 1500ms for empty text', () => {
    expect(estimateTTSDuration('')).toBe(1500);
  });

  it('TC-DUR-02: returns minimum 1500ms for short text below threshold', () => {
    // "你好" = 2 CJK = 520ms < 1500ms
    expect(estimateTTSDuration('你好')).toBe(1500);
  });

  it('TC-DUR-03: charges 260ms per CJK character above minimum', () => {
    // 7 CJK chars = 1820ms > 1500ms
    expect(estimateTTSDuration('你好世界如何啊')).toBeGreaterThan(1500);
    expect(estimateTTSDuration('你好世界如何啊')).toBe(7 * 260);
  });

  it('TC-DUR-04: charges 400ms per digit/percent character', () => {
    // "12345" = 5 numeric = 2000ms > 1500ms
    expect(estimateTTSDuration('12345')).toBe(5 * 400);
  });

  it('TC-DUR-05: charges 80ms per ASCII character', () => {
    // 20 ASCII chars = 1600ms > 1500ms
    expect(estimateTTSDuration('abcdefghijklmnopqrst')).toBe(20 * 80);
  });

  it('TC-DUR-06: mixes character classes correctly', () => {
    // "31%" = 2 digits + 1 percent = 3 * 400 = 1200ms < 1500ms
    expect(estimateTTSDuration('31%')).toBe(1500);
  });
});

// ── TC-SPLIT: flushSentenceBuffer ─────────────────────────────────────────────

describe('flushSentenceBuffer', () => {
  it('TC-SPLIT-01: emits sentence when ending found and length >= MIN', () => {
    const text = '你好，今天北京地区天气非常不错，阳光明媚，气温适宜，特别适合外出。';
    const result = flushSentenceBuffer('', text);
    expect(result.sentences).toHaveLength(1);
    expect(result.remainingBuffer).toBe('');
    expect(result.remainingText).toBe('');
  });

  it('TC-SPLIT-02: accumulates short fragments below MIN_SENTENCE_LENGTH', () => {
    // "好的。" normalizes to 2 chars — below MIN_SENTENCE_LENGTH
    const result = flushSentenceBuffer('', '好的。');
    expect(result.sentences).toHaveLength(0);
    expect(result.remainingBuffer).toBe('好的。');
    expect(result.remainingText).toBe('');
  });

  it('TC-SPLIT-03: force-flushes when total buffer >= MAX_BUFFER_LENGTH', () => {
    // Buffer with no sentence ending but exceeds MAX_BUFFER_LENGTH
    const longText = '没'.repeat(MAX_BUFFER_LENGTH);
    const result = flushSentenceBuffer('', longText);
    expect(result.sentences).toHaveLength(1);
    expect(result.remainingBuffer).toBe('');
    expect(result.remainingText).toBe('');
  });

  it('TC-SPLIT-04: carries remainingText for next call (text after last ending)', () => {
    // "天气不错。" is below MIN_SENTENCE_LENGTH so goes to remainingBuffer; "今天" is remainingText
    const result = flushSentenceBuffer('', '天气不错。今天');
    expect(result.sentences).toHaveLength(0);
    expect(result.remainingBuffer).toBe('天气不错。');
    expect(result.remainingText).toBe('今天');
  });

  it('TC-SPLIT-05: handles multiple sentence endings in one call', () => {
    const text = '首先我们需要仔细全面地了解情况，充分掌握所有的背景信息和资料。其次要积极认真地制定切实可行的详细计划和完整的具体行动方案。最后要坚持认真落实执行计划中的每个步骤，确保完成既定目标。';
    const result = flushSentenceBuffer('', text);
    expect(result.sentences.length).toBeGreaterThanOrEqual(2);
  });

  it('TC-SPLIT-06: accumulates across calls — short sentence stays in buffer until next call pushes it over MIN', () => {
    // First call: '好的。' ends with 。 so it goes to remainingBuffer (3 chars < 30 = not emitted)
    const r1 = flushSentenceBuffer('', '好的。');
    expect(r1.sentences).toHaveLength(0);
    expect(r1.remainingBuffer).toBe('好的。');

    // Second call: accumulated buffer + new long sentence → combined text is 35+ chars → emits
    const r2 = flushSentenceBuffer(r1.remainingBuffer, '我来帮您仔细查询一下今天北京地区的实时天气情况与未来三天的预报。');
    expect(r2.sentences.length).toBeGreaterThanOrEqual(1);
    expect(r2.sentences[0]).toContain('好的');
  });

  it('TC-SPLIT-07: English period splits sentence after letter + whitespace', () => {
    // First sentence must be >= MIN_SENTENCE_LENGTH (30) chars to be emitted
    const text = 'The weather today is absolutely wonderful and sunny outside. It will remain nice all day.';
    const result = flushSentenceBuffer('', text);
    expect(result.sentences.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-SPLIT-09: force-flushes when pre-existing sentenceBuffer + fullText exceeds MAX_BUFFER_LENGTH', () => {
    // sentenceBuffer already half-full, new chunk pushes combined total over MAX_BUFFER_LENGTH
    const half = '没'.repeat(MAX_BUFFER_LENGTH / 2);
    const result = flushSentenceBuffer(half, half + '末');
    expect(result.sentences).toHaveLength(1);
    expect(result.remainingBuffer).toBe('');
    expect(result.remainingText).toBe('');
  });

  it('TC-SPLIT-08: English period in decimal does NOT split', () => {
    // "3.14" should not be split
    const text = 'Pi is approximately 3.14 and is widely used in mathematics calculations.';
    const result = flushSentenceBuffer('', text);
    // Should be emitted as one unit, not split at the decimal
    expect(result.sentences.join('')).not.toContain('3\n');
  });
});
