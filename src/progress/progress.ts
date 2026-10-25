/**
 * Long-term player progress (streaks, missions, XP, achievements, theme).
 * Stored under its own key, separate from the game save, so the save format
 * is untouched and a corrupt value only resets progress, never the game.
 */

import type { PowerId } from '../game/types';
import { POWER_IDS } from '../game/constants';
import type { SafeStorage } from '../persistence/storage';
import { DAILY_QUALIFY_SCORE, applyDailyCompletion } from '../daily/daily';
import type { StreakState } from '../daily/daily';
import { MISSIONS, THEMES } from './rules';
import type { MissionId, MissionProgress, MoveEvent, ThemeId } from './rules';
import {
  ACHIEVEMENTS,
  XP_PER_DAILY,
  XP_PER_MISSION,
  advanceMissions,
  levelForXp,
  missionDef,
  missionsForDay,
  newAchievements,
  xpForGame,
} from './rules';

export const PROGRESS_KEY = 'merge-rush.progress.v1';

export interface Progress extends StreakState {
  /** Date key the daily score below belongs to. */
  dailyDate: string | null;
  dailyBest: number;
  /** Date key of the daily game currently being played, if any. */
  activeDaily: string | null;
  /** Starting charge earned from a streak reward, used by the next normal game. */
  bonusCharge: PowerId | null;
  xp: number;
  achievements: string[];
  missionsDate: string | null;
  missions: MissionProgress[];
  theme: ThemeId;
  rateAsked: boolean;
  gamesFinished: number;
  powersUsed: number;
  rescues: number;
}

export const DEFAULT_PROGRESS: Progress = {
  streak: 0,
  bestStreak: 0,
  lastPlayed: null,
  freezes: 0,
  dailyDate: null,
  dailyBest: 0,
  activeDaily: null,
  bonusCharge: null,
  xp: 0,
  achievements: [],
  missionsDate: null,
  missions: [],
  theme: 'neon',
  rateAsked: false,
  gamesFinished: 0,
  powersUsed: 0,
  rescues: 0,
};

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isDateKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Field-by-field validation: anything missing or malformed falls back to its default. */
export function sanitizeProgress(value: unknown): Progress {
  if (typeof value !== 'object' || value === null) return DEFAULT_PROGRESS;
  const v = value as Record<string, unknown>;
  const d = DEFAULT_PROGRESS;
  const missionIds = new Set<string>(MISSIONS.map((m) => m.id));
  const missions: MissionProgress[] = Array.isArray(v.missions)
    ? v.missions.flatMap((m: unknown) => {
        if (typeof m !== 'object' || m === null) return [];
        const r = m as Record<string, unknown>;
        if (typeof r.id !== 'string' || !missionIds.has(r.id) || !isInt(r.value)) return [];
        return [{ id: r.id as MissionId, value: r.value, done: r.done === true }];
      })
    : [];
  return {
    streak: isInt(v.streak) ? v.streak : d.streak,
    bestStreak: isInt(v.bestStreak) ? v.bestStreak : d.bestStreak,
    lastPlayed: isDateKey(v.lastPlayed) ? v.lastPlayed : null,
    freezes: isInt(v.freezes) ? Math.min(v.freezes, 2) : d.freezes,
    dailyDate: isDateKey(v.dailyDate) ? v.dailyDate : null,
    dailyBest: isInt(v.dailyBest) ? v.dailyBest : d.dailyBest,
    activeDaily: isDateKey(v.activeDaily) ? v.activeDaily : null,
    bonusCharge:
      typeof v.bonusCharge === 'string' && (POWER_IDS as readonly string[]).includes(v.bonusCharge)
        ? (v.bonusCharge as PowerId)
        : null,
    xp: isInt(v.xp) ? v.xp : d.xp,
    achievements: Array.isArray(v.achievements)
      ? v.achievements.filter((a): a is string => typeof a === 'string')
      : [],
    missionsDate: isDateKey(v.missionsDate) ? v.missionsDate : null,
    missions,
    theme:
      typeof v.theme === 'string' && THEMES.some((t) => t.id === v.theme)
        ? (v.theme as ThemeId)
        : d.theme,
    rateAsked: v.rateAsked === true,
    gamesFinished: isInt(v.gamesFinished) ? v.gamesFinished : d.gamesFinished,
    powersUsed: isInt(v.powersUsed) ? v.powersUsed : d.powersUsed,
    rescues: isInt(v.rescues) ? v.rescues : d.rescues,
  };
}

export function loadProgress(storage: SafeStorage | null): Progress {
  if (storage === null) return DEFAULT_PROGRESS;
  try {
    const raw = storage.getItem(PROGRESS_KEY);
    return raw === null ? DEFAULT_PROGRESS : sanitizeProgress(JSON.parse(raw));
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveProgress(storage: SafeStorage | null, progress: Progress): void {
  try {
    storage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Progress is a nicety; keep playing without persistence.
  }
}

/** Today's missions, rolled over when the date changes. */
export function ensureToday(progress: Progress, today: string): Progress {
  if (progress.missionsDate === today && progress.missions.length > 0) return progress;
  return { ...progress, missionsDate: today, missions: missionsForDay(today) };
}

export interface TrackInput {
  today: string;
  /** Present for a move or a power use. */
  move?: MoveEvent;
  /** Rescue used on a stuck board with this event. */
  rescued?: boolean;
  /** The game just ended. */
  gameOver?: boolean;
  /** Current score, for the daily. */
  score: number;
  highestTile: number;
  bestScore: number;
  gamesPlayed: number;
  chain: number;
}

export interface TrackResult {
  progress: Progress;
  toasts: string[];
}

/** Folds one game event into progress and reports what to celebrate. */
export function track(previous: Progress, input: TrackInput): TrackResult {
  const toasts: string[] = [];
  let p = ensureToday(previous, input.today);
  const levelBefore = levelForXp(p.xp);
  let xp = p.xp;

  if (input.move !== undefined) {
    const update = advanceMissions(p.missions, input.move);
    p = { ...p, missions: update.missions };
    for (const id of update.completed) {
      xp += XP_PER_MISSION;
      toasts.push(`Mission complete: ${missionDef(id)?.text ?? ''} (+${XP_PER_MISSION} XP)`);
    }
    if (input.move.powerUsed) p = { ...p, powersUsed: p.powersUsed + 1 };
  }
  if (input.rescued === true) p = { ...p, rescues: p.rescues + 1 };

  // Daily challenge: the best score of the day counts; reaching the qualifying
  // score keeps the streak alive.
  if (p.activeDaily === input.today) {
    const best = p.dailyDate === input.today ? Math.max(p.dailyBest, input.score) : input.score;
    p = { ...p, dailyDate: input.today, dailyBest: best };
    if (best >= DAILY_QUALIFY_SCORE && p.lastPlayed !== input.today) {
      const result = applyDailyCompletion(p, input.today);
      p = {
        ...p,
        streak: result.streak,
        bestStreak: result.bestStreak,
        lastPlayed: result.lastPlayed,
        freezes: result.freezes,
        bonusCharge: result.reward ?? p.bonusCharge,
      };
      xp += XP_PER_DAILY;
      toasts.push(`Daily complete! ${result.streak}-day streak (+${XP_PER_DAILY} XP)`);
      if (result.freezeUsed) toasts.push('Streak freeze saved your streak');
      if (result.reward !== null) toasts.push(`Reward: a free ${result.reward} next game`);
    }
  }

  if (input.gameOver === true) {
    p = { ...p, gamesFinished: p.gamesFinished + 1 };
    xp += xpForGame(input.score);
  }

  p = { ...p, xp };
  const level = levelForXp(xp);
  if (level > levelBefore) toasts.push(`Level ${level}!`);

  const unlocked = newAchievements(p.achievements, {
    highestTile: input.highestTile,
    bestScore: input.bestScore,
    gamesPlayed: input.gamesPlayed,
    bestStreak: p.bestStreak,
    level,
    chain: input.chain,
    rescues: p.rescues,
    powersUsed: p.powersUsed,
  });
  if (unlocked.length > 0) {
    p = { ...p, achievements: [...p.achievements, ...unlocked] };
    for (const id of unlocked) {
      const title = ACHIEVEMENTS.find((a) => a.id === id)?.title;
      if (title !== undefined) toasts.push(`Achievement: ${title}`);
    }
  }
  return { progress: p, toasts };
}
