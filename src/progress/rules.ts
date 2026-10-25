/**
 * Pure rules for missions, XP/levels, achievements and unlockable themes.
 * Nothing here touches storage or React; `useProgress` feeds it events.
 */

import { dailySeed } from '../daily/daily';
import { nextFloat } from '../game/random';

// ---------- XP and levels ----------

export const XP_PER_MISSION = 50;
export const XP_PER_DAILY = 40;

/** Total XP needed to reach `level` (level 1 starts at 0). */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * (level - 1);
}

export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

/** XP for a finished game: a little for playing, more for a big score. */
export function xpForGame(score: number): number {
  return 10 + Math.min(90, Math.floor(score / 150));
}

// ---------- Missions ----------

export type MissionId =
  'reach256' | 'reach512' | 'rush2' | 'merge100' | 'chain5' | 'power3' | 'score5k' | 'perfectRush';

interface MissionDef {
  id: MissionId;
  text: string;
  target: number;
}

export const MISSIONS: readonly MissionDef[] = [
  { id: 'reach256', text: 'Reach a 256 tile', target: 1 },
  { id: 'reach512', text: 'Reach a 512 tile', target: 1 },
  { id: 'rush2', text: 'Trigger Rush Mode 2 times', target: 2 },
  { id: 'merge100', text: 'Merge 100 tiles', target: 100 },
  { id: 'chain5', text: 'Chain 5 merges in a row', target: 1 },
  { id: 'power3', text: 'Use 3 powers', target: 3 },
  { id: 'score5k', text: 'Score 5,000 in one game', target: 1 },
  { id: 'perfectRush', text: 'Merge 8 tiles during Rush Mode', target: 8 },
];

export interface MissionProgress {
  id: MissionId;
  value: number;
  done: boolean;
}

export function missionDef(id: MissionId): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}

/** Three distinct missions for the day, the same on every device. */
export function missionsForDay(key: string): MissionProgress[] {
  let state = dailySeed(`missions:${key}`);
  const pool = [...MISSIONS];
  const picked: MissionProgress[] = [];
  while (picked.length < 3 && pool.length > 0) {
    const draw = nextFloat(state);
    state = draw.state;
    const [mission] = pool.splice(Math.floor(draw.value * pool.length), 1);
    picked.push({ id: mission.id, value: 0, done: false });
  }
  return picked;
}

/** What happened on one move (or power use), as far as missions care. */
export interface MoveEvent {
  merges: number;
  maxTile: number;
  streak: number;
  rushActivated: boolean;
  rushActive: boolean;
  powerUsed: boolean;
  score: number;
}

export interface MissionUpdate {
  missions: MissionProgress[];
  /** Missions completed by this event. */
  completed: MissionId[];
}

export function advanceMissions(
  missions: readonly MissionProgress[],
  event: MoveEvent,
): MissionUpdate {
  const completed: MissionId[] = [];
  const next = missions.map((mission) => {
    if (mission.done) return mission;
    const def = missionDef(mission.id);
    if (def === undefined) return mission;
    let value = mission.value;
    switch (mission.id) {
      case 'reach256':
        if (event.maxTile >= 256) value = 1;
        break;
      case 'reach512':
        if (event.maxTile >= 512) value = 1;
        break;
      case 'rush2':
        if (event.rushActivated) value += 1;
        break;
      case 'merge100':
        value += event.merges;
        break;
      case 'chain5':
        if (event.streak >= 5) value = 1;
        break;
      case 'power3':
        if (event.powerUsed) value += 1;
        break;
      case 'score5k':
        if (event.score >= 5000) value = 1;
        break;
      case 'perfectRush':
        if (event.rushActive) value += event.merges;
        break;
    }
    value = Math.min(def.target, value);
    const done = value >= def.target;
    if (done) completed.push(mission.id);
    return { ...mission, value, done };
  });
  return { missions: next, completed };
}

// ---------- Achievements ----------

export interface AchievementContext {
  highestTile: number;
  bestScore: number;
  gamesPlayed: number;
  bestStreak: number;
  level: number;
  chain: number;
  rescues: number;
  powersUsed: number;
}

interface AchievementDef {
  id: string;
  title: string;
  hint: string;
  earned: (c: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'tile256',
    title: 'Warming Up',
    hint: 'Reach a 256 tile',
    earned: (c) => c.highestTile >= 256,
  },
  {
    id: 'tile512',
    title: 'Half Way There',
    hint: 'Reach a 512 tile',
    earned: (c) => c.highestTile >= 512,
  },
  {
    id: 'tile1024',
    title: 'Four Digits',
    hint: 'Reach a 1024 tile',
    earned: (c) => c.highestTile >= 1024,
  },
  {
    id: 'tile2048',
    title: 'The Big One',
    hint: 'Reach a 2048 tile',
    earned: (c) => c.highestTile >= 2048,
  },
  {
    id: 'tile4096',
    title: 'Beyond',
    hint: 'Reach a 4096 tile',
    earned: (c) => c.highestTile >= 4096,
  },
  {
    id: 'score10k',
    title: 'Ten Grand',
    hint: 'Score 10,000 in a game',
    earned: (c) => c.bestScore >= 10_000,
  },
  {
    id: 'score50k',
    title: 'High Roller',
    hint: 'Score 50,000 in a game',
    earned: (c) => c.bestScore >= 50_000,
  },
  { id: 'chain5', title: 'On Fire', hint: 'Chain 5 merges in a row', earned: (c) => c.chain >= 5 },
  {
    id: 'rescue',
    title: 'Close Call',
    hint: 'Use a rescue on a stuck board',
    earned: (c) => c.rescues >= 1,
  },
  {
    id: 'powers20',
    title: 'Power User',
    hint: 'Use 20 powers in total',
    earned: (c) => c.powersUsed >= 20,
  },
  { id: 'games25', title: 'Regular', hint: 'Play 25 games', earned: (c) => c.gamesPlayed >= 25 },
  {
    id: 'streak7',
    title: 'Week Warrior',
    hint: 'Reach a 7-day streak',
    earned: (c) => c.bestStreak >= 7,
  },
  { id: 'level5', title: 'Rising Star', hint: 'Reach level 5', earned: (c) => c.level >= 5 },
];

/** Ids newly earned by this context that are not already unlocked. */
export function newAchievements(
  unlocked: readonly string[],
  context: AchievementContext,
): string[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.earned(context)).map((a) => a.id);
}

// ---------- Themes ----------

export type ThemeId = 'neon' | 'candy' | 'ocean' | 'gold';

interface ThemeDef {
  id: ThemeId;
  name: string;
  level: number;
}

export const THEMES: readonly ThemeDef[] = [
  { id: 'neon', name: 'Neon', level: 1 },
  { id: 'candy', name: 'Candy', level: 3 },
  { id: 'ocean', name: 'Ocean', level: 5 },
  { id: 'gold', name: 'Gold', level: 8 },
];

export function themeUnlocked(id: ThemeId, level: number): boolean {
  const theme = THEMES.find((t) => t.id === id);
  return theme !== undefined && level >= theme.level;
}
