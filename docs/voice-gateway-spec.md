# Voice Gateway Behavioral Specification

**Version:** 1.0
**Date:** 2026-03-12
**Status:** Approved

---

## 1. Overview

The voice gateway intercepts XiaoAi speaker conversations and routes qualifying queries to an OpenClaw agent. A critical correctness requirement is that the gateway must **never interrupt XiaoAi's own response unless it has a reason to take over**. Violating this causes the gateway to interfere with native XiaoAi skills (weather, news, music) even when it has nothing to say.

---

## 2. Definitions

| Term | Meaning |
|------|---------|
| **Active session** | An OpenClaw HTTP request is currently in-flight, or TTS from a prior OpenClaw response is still playing. Represented by `currentAbortController !== null`. |
| **Trigger keyword** | A string prefix configured via `CALL_AI_KEYWORDS` (default: `['请', '你']`). A query "matches" a keyword if `query.startsWith(keyword)` for any keyword in the list. |
| **All-intercept mode** | When `CALL_AI_KEYWORDS=[]` (empty list). Every query matches unconditionally. |
| **Cancel XiaoAi** | Calling `cancel_tts`, `stop()`, and `pause()` via MiNA to silence XiaoAi's current playback. |

---

## 3. Trigger & Interrupt Logic

This is the **core behavioral contract** of the gateway. It governs two independent decisions per incoming query:

### 3.1 Decision Table

| # | Active session? | Matches keyword? | Cancel XiaoAi? | Call OpenClaw? |
|---|-----------------|-----------------|----------------|---------------|
| TC-I-01 | No | No | **No** | No |
| TC-I-02 | Yes | No | **Yes** | No |
| TC-I-03 | No | Yes | **Yes** | Yes |
| TC-I-04 | Yes | Yes | **Yes** | Yes |
| TC-I-05 | Any | (all-intercept mode) | **Yes** | Yes |

**Rationale for TC-I-02:** The user saying anything (e.g., "今日天气") while OpenClaw is mid-response means they want to interrupt. The gateway must respect this. XiaoAi's weather query then proceeds normally because `shouldCallOpenClaw` returns false.

**Rationale for TC-I-01:** The regression case. "今日天气" with no active session must not touch XiaoAi's playback. The gateway has no role in this interaction.

### 3.2 Formal Rules

```
matchesKeyword(query, keywords) :=
  keywords.length == 0  OR  any(k in keywords: query.startsWith(k))

shouldCancelXiaoAi(hasActiveSession, query, keywords) :=
  hasActiveSession  OR  matchesKeyword(query, keywords)

shouldCallOpenClaw(query, keywords) :=
  matchesKeyword(query, keywords)
```

### 3.3 Cleanup vs. Cancel Distinction

Regardless of the above decisions, when a new query arrives the gateway **always**:
- Clears its own cancel-retry timer
- Aborts the in-flight OpenClaw AbortController
- Increments the generation counter (invalidates old coroutines)

These are internal state cleanup operations, not interrupts of XiaoAi.

---

## 4. TTS Text Processing

### 4.1 normalizeTTS

Input: raw LLM output text
Output: text ready for the TTS engine

Steps (in order):
1. Strip all markdown formatting (headers `#`, bold `**`, italic `_`, code `` ` ``, links `[]()`, etc.) using `remove-markdown`
2. Remove spaces inserted between CJK characters and digit characters: `凌晨 2 点 09 分` → `凌晨2点09分`

### 4.2 Sentence Splitting (Streaming Mode)

The streaming TTS loop accumulates text and plays complete sentences. Rules:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `MIN_SENTENCE_LENGTH` | 30 chars | Minimum normalized length before a fragment is played. Short fragments (headers, short confirmations) are held until they combine with subsequent text. |
| `MAX_BUFFER_LENGTH` | 80 chars | Total buffer length (sentenceBuffer + fullText) that triggers forced playback even with no sentence ending. Prevents long silences on unpunctuated LLM output. |

**Sentence endings:** `[。？！；?!;\n]` plus English period after letter and before whitespace (avoids splitting `3.14` or abbreviations).

**State across SSE chunks:** The splitter maintains `sentenceBuffer` (accumulated-but-not-yet-played) and `fullText` (unprocessed incoming text) across multiple calls.

---

## 5. TTS Duration Estimation

MIoT `doAction` TTS returns immediately without a completion callback. The gateway estimates playback duration to avoid back-to-back TTS calls overlapping.

| Character class | Rate | Rationale |
|-----------------|------|-----------|
| CJK characters (`\u4e00-\u9fff` etc.) | 260 ms/char | ~3.8 chars/sec with safety margin |
| Digits and `%` | 400 ms/char | Chinese TTS expands: "31%" → "百分之三十一" |
| Other ASCII | 80 ms/char | English TTS is significantly faster |
| **Minimum** | **1500 ms** | TTS engine startup latency |

Formula: `max(1500, cjkCount×260 + numericCount×400 + asciiCount×80)`

---

## 6. Abort & Concurrency

### 6.1 Generation Counter

Each query increments a `generation` counter. Every OpenClaw coroutine captures `myGen = generation` at creation. The `isActive()` predicate is `() => myGen === generation`. When a new query arrives, the counter increments immediately, making all prior coroutines inactive.

### 6.2 Abortable Sleep

`abortableSleep(ms)` resolves immediately when the AbortController fires. This ensures that a long `estimateTTSDuration` sleep does not delay the `isActive()` exit check after interruption.

### 6.3 Cancel-Retry Timing

The cancel-retry loop (`setInterval` calling cancel_tts+stop+pause every 1s) is used to suppress XiaoAi after "请稍候" plays. Timing constraints:

- Retry starts only after `estimateTTSDuration(thinkingText)` elapses (so pause() doesn't cut "请稍候")
- Retry stops as soon as the first OpenClaw TTS sentence begins (`stopRetrying()` callback)
- Retry auto-expires after 15 seconds (`retryDeadline`)

---

## 7. Keyword Matching

- Match rule: `query.startsWith(keyword)` (prefix match, case-sensitive)
- Configured via `CALL_AI_KEYWORDS` environment variable (comma-separated)
- Default: `['请', '你']`
- Empty list activates all-intercept mode (every query routes to OpenClaw)

---

## 8. Regression Test Identifiers

The following test IDs directly trace to spec sections:

| Test ID | Section | Description |
|---------|---------|-------------|
| TC-I-01 | §3.1 | Non-keyword query, no active session → no cancel |
| TC-I-02 | §3.1 | Non-keyword query, active session → cancel only |
| TC-I-03 | §3.1 | Keyword query, no active session → cancel + OpenClaw |
| TC-I-04 | §3.1 | Keyword query, active session → cancel + OpenClaw |
| TC-I-05 | §3.1 | All-intercept mode → cancel + OpenClaw always |
| TC-TTS-01..N | §4 | normalizeTTS correctness |
| TC-DUR-01..N | §5 | estimateTTSDuration correctness |
| TC-SPLIT-01..N | §4.2 | Sentence splitter correctness |
