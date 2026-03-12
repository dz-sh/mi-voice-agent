/**
 * Pure decision functions for voice gateway interrupt logic.
 *
 * These functions have no side effects and can be unit-tested independently
 * of MiNA, MiOT, or any hardware dependencies.
 *
 * Behavioral spec: docs/voice-gateway-spec.md §3
 */

/**
 * Determine whether a query matches any configured trigger keyword.
 *
 * When keywords=[], every query matches (all-intercept mode — all queries
 * are routed to OpenClaw, bypassing XiaoAi entirely).
 */
export function matchesKeyword(query: string, keywords: string[]): boolean {
  return keywords.length === 0 || keywords.some((k) => query.startsWith(k));
}

/**
 * Determine whether XiaoAi's current playback should be cancelled.
 *
 * Rules (see spec §3.1 decision table):
 * - hasActiveSession=true: always cancel. The user is interrupting our response.
 * - matchesKeyword=true: cancel because we are taking over this query.
 * - neither: leave XiaoAi alone (TC-I-01 regression case).
 */
export function shouldCancelXiaoAi(
  hasActiveSession: boolean,
  query: string,
  keywords: string[],
): boolean {
  return hasActiveSession || matchesKeyword(query, keywords);
}

/**
 * Determine whether this query should be routed to OpenClaw.
 *
 * Only keyword-matching queries (or all queries in all-intercept mode)
 * are sent to OpenClaw.
 */
export function shouldCallOpenClaw(query: string, keywords: string[]): boolean {
  return matchesKeyword(query, keywords);
}
