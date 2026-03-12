import { describe, it, expect } from 'vitest';
import { matchesKeyword, shouldCancelXiaoAi, shouldCallOpenClaw } from '../interrupt-logic.js';

const KEYWORDS = ['请', '你'];

// ── matchesKeyword ─────────────────────────────────────────────────────────

describe('matchesKeyword', () => {
  it('returns true when query starts with a keyword', () => {
    expect(matchesKeyword('请帮我关灯', KEYWORDS)).toBe(true);
    expect(matchesKeyword('你好', KEYWORDS)).toBe(true);
  });

  it('returns false when query does not start with any keyword', () => {
    expect(matchesKeyword('今日天气', KEYWORDS)).toBe(false);
    expect(matchesKeyword('播放音乐', KEYWORDS)).toBe(false);
  });

  it('returns false for empty query with non-empty keywords', () => {
    expect(matchesKeyword('', KEYWORDS)).toBe(false);
  });

  it('returns true for all queries when keywords is empty (all-intercept mode)', () => {
    expect(matchesKeyword('今日天气', [])).toBe(true);
    expect(matchesKeyword('播放音乐', [])).toBe(true);
    expect(matchesKeyword('', [])).toBe(true);
  });
});

// ── shouldCancelXiaoAi ─────────────────────────────────────────────────────

describe('shouldCancelXiaoAi', () => {
  it('TC-I-01 (REGRESSION): non-keyword query, no active session → does NOT cancel XiaoAi', () => {
    // This is the bug: "今日天气" must not cancel XiaoAi when no agent is running
    expect(shouldCancelXiaoAi(false, '今日天气', KEYWORDS)).toBe(false);
    expect(shouldCancelXiaoAi(false, '播放今日新闻', KEYWORDS)).toBe(false);
    expect(shouldCancelXiaoAi(false, '设置闹钟', KEYWORDS)).toBe(false);
  });

  it('TC-I-02: non-keyword query, active session → DOES cancel (user interrupts agent)', () => {
    expect(shouldCancelXiaoAi(true, '今日天气', KEYWORDS)).toBe(true);
  });

  it('TC-I-03: keyword query, no active session → DOES cancel (agent taking over)', () => {
    expect(shouldCancelXiaoAi(false, '请关灯', KEYWORDS)).toBe(true);
    expect(shouldCancelXiaoAi(false, '你好', KEYWORDS)).toBe(true);
  });

  it('TC-I-04: keyword query, active session → DOES cancel', () => {
    expect(shouldCancelXiaoAi(true, '请关灯', KEYWORDS)).toBe(true);
  });

  it('TC-I-05: all-intercept mode (empty keywords) → always cancels', () => {
    expect(shouldCancelXiaoAi(false, '今日天气', [])).toBe(true);
    expect(shouldCancelXiaoAi(false, '播放音乐', [])).toBe(true);
  });
});

// ── shouldCallOpenClaw ─────────────────────────────────────────────────────

describe('shouldCallOpenClaw', () => {
  it('returns true when query matches keyword', () => {
    expect(shouldCallOpenClaw('请帮我关灯', KEYWORDS)).toBe(true);
    expect(shouldCallOpenClaw('你好啊', KEYWORDS)).toBe(true);
  });

  it('returns false when query does not match keyword', () => {
    expect(shouldCallOpenClaw('今日天气', KEYWORDS)).toBe(false);
    expect(shouldCallOpenClaw('播放音乐', KEYWORDS)).toBe(false);
  });

  it('returns true for all queries in all-intercept mode', () => {
    expect(shouldCallOpenClaw('今日天气', [])).toBe(true);
    expect(shouldCallOpenClaw('', [])).toBe(true);
  });
});
