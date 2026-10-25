/**
 * Daily Challenge rules: a date-derived seed (everyone gets the same board
 * on the same day) and the day-streak bookkeeping. Pure and clock-free: the
 * caller passes the date key, so tests can walk through midnight.
 */

import { POWER_IDS } from '../game/constants';
import type { PowerId } from '../game/types';

/** Daily score needed before the day counts toward the streak (about 30 moves). */
export const DAILY_QUALIFY_SCORE = 300;
/** Streak lengths that award a starting power charge for the next game. */
export const REWARD_STREAKS = [3, 7, 14, 21, 28];
/** A streak freeze is earned every this many days (at most MAX_FREEZES held). */
export const FREEZE_EVERY = 7;
export const MAX_FREEZES = 2;

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FNV-1a hash of the date: a stable uint32 seed for that day's board. */
export function dailySeed(key: string): number {
  let hash = 0x811c9dc5;
  const text = `merge-rush:${key}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Whole days from key a to key b (b later is positive). */
export function daysBetween(a: string, b: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

export interface StreakState {
  streak: number;
  bestStreak: number;
  lastPlayed: string | null;
  freezes: number;
}

export interface StreakResult extends StreakState {
  /** Power charge earned by reaching a reward streak today, if any. */
  reward: PowerId | null;
  /** A streak freeze was spent to bridge a missed day. */
  freezeUsed: boolean;
}

/** Counts `today` toward the streak. Calling twice on one day changes nothing. */
export function applyDailyCompletion(state: StreakState, today: string): StreakResult {
  if (state.lastPlayed === today) return { ...state, reward: null, freezeUsed: false };

  let streak = 1;
  let freezes = state.freezes;
  let freezeUsed = false;
  if (state.lastPlayed !== null) {
    const gap = daysBetween(state.lastPlayed, today);
    if (gap === 1) {
      streak = state.streak + 1;
    } else if (gap === 2 && freezes > 0) {
      // One missed day, bridged by a freeze.
      streak = state.streak + 1;
      freezes -= 1;
      freezeUsed = true;
    }
  }
  if (streak % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);

  const rewarded = REWARD_STREAKS.includes(streak);
  return {
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    lastPlayed: today,
    freezes,
    reward: rewarded ? POWER_IDS[streak % POWER_IDS.length] : null,
    freezeUsed,
  };
}

/** The streak as shown to the player: it lapses once a day has been missed. */
export function visibleStreak(state: StreakState, today: string): number {
  if (state.lastPlayed === null) return 0;
  const gap = daysBetween(state.lastPlayed, today);
  if (gap <= 1) return state.streak;
  if (gap === 2 && state.freezes > 0) return state.streak;
  return 0;
}
