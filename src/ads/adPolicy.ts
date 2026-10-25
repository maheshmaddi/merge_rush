/**
 * When the between-games interstitial may show. Pure, so the rules are easy
 * to test and tune; the history is stored separately from the game save.
 *
 * Rules (all must hold):
 * - never during a player's first FREE_GAMES games after install;
 * - never after a game where they already watched a rewarded ad;
 * - never after a short game (quick restarts are not a natural break);
 * - at least MIN_GAMES_BETWEEN ad-free games and MIN_INTERVAL_MS between ads.
 */

import type { SafeStorage } from '../persistence/storage';

export const AD_POLICY = {
  FREE_GAMES: 2,
  MIN_GAMES_BETWEEN: 2,
  MIN_INTERVAL_MS: 4 * 60_000,
  MIN_GAME_MS: 60_000,
} as const;

export interface AdHistory {
  /** Games finished since install (counted when the next one starts). */
  gamesFinished: number;
  /** Games finished since the last interstitial. */
  gamesSinceInterstitial: number;
  /** Epoch ms of the last interstitial, 0 if never. */
  lastInterstitialAt: number;
}

export interface GameEndContext {
  now: number;
  /** How long the game that just ended was played. */
  gameDurationMs: number;
  /** A rewarded ad was watched during that game. */
  watchedRewarded: boolean;
}

export const FRESH_HISTORY: AdHistory = {
  gamesFinished: 0,
  gamesSinceInterstitial: 0,
  lastInterstitialAt: 0,
};

export function shouldShowInterstitial(history: AdHistory, context: GameEndContext): boolean {
  if (history.gamesFinished < AD_POLICY.FREE_GAMES) return false;
  if (context.watchedRewarded) return false;
  if (context.gameDurationMs < AD_POLICY.MIN_GAME_MS) return false;
  if (history.gamesSinceInterstitial < AD_POLICY.MIN_GAMES_BETWEEN) return false;
  if (context.now - history.lastInterstitialAt < AD_POLICY.MIN_INTERVAL_MS) return false;
  return true;
}

/** History after a game ends, given whether an interstitial was shown. */
export function recordGameEnd(history: AdHistory, shown: boolean, now: number): AdHistory {
  return {
    gamesFinished: history.gamesFinished + 1,
    gamesSinceInterstitial: shown ? 0 : history.gamesSinceInterstitial + 1,
    lastInterstitialAt: shown ? now : history.lastInterstitialAt,
  };
}

const HISTORY_KEY = 'merge-rush.ads.v1';

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function loadAdHistory(storage: SafeStorage | null): AdHistory {
  const raw = storage?.getItem(HISTORY_KEY);
  if (!raw) return FRESH_HISTORY;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      isCount(parsed.gamesFinished) &&
      isCount(parsed.gamesSinceInterstitial) &&
      isCount(parsed.lastInterstitialAt)
    ) {
      return {
        gamesFinished: parsed.gamesFinished,
        gamesSinceInterstitial: parsed.gamesSinceInterstitial,
        lastInterstitialAt: parsed.lastInterstitialAt,
      };
    }
  } catch {
    // Corrupt history: start over, which only ever means fewer ads.
  }
  return FRESH_HISTORY;
}

export function saveAdHistory(storage: SafeStorage | null, history: AdHistory): void {
  storage?.setItem(HISTORY_KEY, JSON.stringify(history));
}
