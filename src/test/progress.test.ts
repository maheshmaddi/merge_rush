import { describe, expect, it } from 'vitest';
import {
  DAILY_QUALIFY_SCORE,
  applyDailyCompletion,
  dailySeed,
  dateKey,
  daysBetween,
  visibleStreak,
} from '../daily/daily';
import type { StreakState } from '../daily/daily';
import { createNewGame } from '../game/initializeGame';
import { createInitialEngineState, gameReducer } from '../game/reducer';
import {
  DEFAULT_PROGRESS,
  PROGRESS_KEY,
  loadProgress,
  sanitizeProgress,
  track,
} from '../progress/progress';
import type { Progress, TrackInput } from '../progress/progress';
import {
  advanceMissions,
  levelForXp,
  missionsForDay,
  newAchievements,
  xpForLevel,
} from '../progress/rules';
import type { MoveEvent } from '../progress/rules';
import type { SafeStorage } from '../persistence/storage';

const fresh: StreakState = { streak: 0, bestStreak: 0, lastPlayed: null, freezes: 0 };

describe('daily seed and dates', () => {
  it('is stable per date and different between dates', () => {
    expect(dailySeed('2026-10-25')).toBe(dailySeed('2026-10-25'));
    expect(dailySeed('2026-10-25')).not.toBe(dailySeed('2026-10-26'));
  });

  it('gives every player the same starting board for a day', () => {
    const a = createNewGame(dailySeed('2026-10-25'));
    const b = createNewGame(dailySeed('2026-10-25'));
    expect(a.board).toEqual(b.board);
    expect(a.pendingValue).toBe(b.pendingValue);
  });

  it('formats local dates and counts days across month ends', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-02')).toBe(2);
  });
});

describe('day streak', () => {
  it('starts at 1 and grows on consecutive days', () => {
    const day1 = applyDailyCompletion(fresh, '2026-10-25');
    expect(day1.streak).toBe(1);
    expect(applyDailyCompletion(day1, '2026-10-26').streak).toBe(2);
  });

  it('does not count the same day twice', () => {
    const day1 = applyDailyCompletion(fresh, '2026-10-25');
    expect(applyDailyCompletion(day1, '2026-10-25').streak).toBe(1);
  });

  it('resets after a missed day but remembers the best streak', () => {
    const state: StreakState = { streak: 5, bestStreak: 5, lastPlayed: '2026-10-20', freezes: 0 };
    const result = applyDailyCompletion(state, '2026-10-25');
    expect(result.streak).toBe(1);
    expect(result.bestStreak).toBe(5);
  });

  it('spends a freeze to bridge exactly one missed day', () => {
    const state: StreakState = { streak: 4, bestStreak: 4, lastPlayed: '2026-10-23', freezes: 1 };
    const result = applyDailyCompletion(state, '2026-10-25');
    expect(result.streak).toBe(5);
    expect(result.freezes).toBe(0);
    expect(result.freezeUsed).toBe(true);
    const tooLong = applyDailyCompletion({ ...state, lastPlayed: '2026-10-22' }, '2026-10-25');
    expect(tooLong.streak).toBe(1);
  });

  it('awards a reward charge at 3 days and a freeze every 7', () => {
    let state: StreakState = fresh;
    const rewards: Array<string | null> = [];
    for (let day = 1; day <= 7; day++) {
      const result = applyDailyCompletion(state, `2026-10-${String(day).padStart(2, '0')}`);
      rewards.push(result.reward);
      state = result;
    }
    expect(rewards[2]).not.toBeNull();
    expect(rewards[3]).toBeNull();
    expect(rewards[6]).not.toBeNull();
    expect(state.freezes).toBe(1);
  });

  it('shows a lapsed streak as zero', () => {
    const state: StreakState = { streak: 6, bestStreak: 6, lastPlayed: '2026-10-20', freezes: 0 };
    expect(visibleStreak(state, '2026-10-21')).toBe(6);
    expect(visibleStreak(state, '2026-10-25')).toBe(0);
  });
});

const baseInput: TrackInput = {
  today: '2026-10-25',
  score: 0,
  highestTile: 0,
  bestScore: 0,
  gamesPlayed: 1,
  chain: 0,
};

const move = (overrides: Partial<MoveEvent> = {}): MoveEvent => ({
  merges: 1,
  maxTile: 8,
  streak: 1,
  rushActivated: false,
  rushActive: false,
  powerUsed: false,
  score: 40,
  ...overrides,
});

describe('missions and XP', () => {
  it('picks the same three distinct missions for a date', () => {
    const a = missionsForDay('2026-10-25');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((m) => m.id)).size).toBe(3);
    expect(missionsForDay('2026-10-25')).toEqual(a);
  });

  it('advances and completes missions from move events', () => {
    const missions = [
      { id: 'merge100' as const, value: 95, done: false },
      { id: 'reach512' as const, value: 0, done: false },
    ];
    const update = advanceMissions(missions, move({ merges: 6, maxTile: 512 }));
    expect([...update.completed].sort()).toEqual(['merge100', 'reach512']);
    expect(advanceMissions(update.missions, move()).completed).toEqual([]);
  });

  it('turns XP into levels', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(xpForLevel(4))).toBe(4);
    expect(levelForXp(xpForLevel(4) - 1)).toBe(3);
  });
});

describe('track', () => {
  it('grants XP and a toast for a completed mission', () => {
    const start: Progress = {
      ...DEFAULT_PROGRESS,
      missionsDate: '2026-10-25',
      missions: [{ id: 'reach256', value: 0, done: false }],
    };
    const { progress, toasts } = track(start, { ...baseInput, move: move({ maxTile: 256 }) });
    expect(progress.xp).toBeGreaterThanOrEqual(50);
    expect(toasts.some((t) => t.startsWith('Mission complete'))).toBe(true);
  });

  it('counts a daily toward the streak only once the qualifying score is reached', () => {
    const start: Progress = { ...DEFAULT_PROGRESS, activeDaily: '2026-10-25' };
    const low = track(start, { ...baseInput, move: move(), score: DAILY_QUALIFY_SCORE - 1 });
    expect(low.progress.streak).toBe(0);
    const high = track(low.progress, { ...baseInput, move: move(), score: DAILY_QUALIFY_SCORE });
    expect(high.progress.streak).toBe(1);
    expect(high.progress.dailyBest).toBe(DAILY_QUALIFY_SCORE);
    const again = track(high.progress, { ...baseInput, move: move(), score: 999 });
    expect(again.progress.streak).toBe(1);
    expect(again.progress.dailyBest).toBe(999);
  });

  it('ignores the daily when playing a normal game', () => {
    const result = track(DEFAULT_PROGRESS, { ...baseInput, move: move(), score: 5000 });
    expect(result.progress.streak).toBe(0);
  });

  it('unlocks achievements once', () => {
    const context = {
      highestTile: 1024,
      bestScore: 0,
      gamesPlayed: 0,
      bestStreak: 0,
      level: 1,
      chain: 0,
      rescues: 0,
      powersUsed: 0,
    };
    expect(newAchievements([], context)).toEqual(
      expect.arrayContaining(['tile256', 'tile512', 'tile1024']),
    );
    expect(newAchievements(['tile256', 'tile512', 'tile1024'], context)).toEqual([]);
  });
});

describe('progress storage', () => {
  const store = (value: string | null): SafeStorage => ({
    getItem: () => value,
    setItem: () => undefined,
    removeItem: () => undefined,
  });

  it('falls back to defaults for missing or corrupt data', () => {
    expect(loadProgress(null)).toEqual(DEFAULT_PROGRESS);
    expect(loadProgress(store(null))).toEqual(DEFAULT_PROGRESS);
    expect(loadProgress(store('{broken'))).toEqual(DEFAULT_PROGRESS);
    expect(PROGRESS_KEY).toContain('progress');
  });

  it('keeps valid fields and drops invalid ones', () => {
    const progress = sanitizeProgress({
      streak: 4,
      xp: -5,
      theme: 'nope',
      bonusCharge: 'bomb',
      missions: [
        { id: 'bogus', value: 1 },
        { id: 'rush2', value: 1, done: false },
      ],
    });
    expect(progress.streak).toBe(4);
    expect(progress.xp).toBe(0);
    expect(progress.theme).toBe('neon');
    expect(progress.bonusCharge).toBe('bomb');
    expect(progress.missions).toEqual([{ id: 'rush2', value: 1, done: false }]);
  });
});

describe('restart options', () => {
  it('starts a seeded board and adds a bonus charge', () => {
    const state = createInitialEngineState(1);
    const seed = dailySeed('2026-10-25');
    const seeded = gameReducer(state, { type: 'restart', seed, bonus: 'shuffle' });
    expect(seeded.game.board).toEqual(createNewGame(seed).board);
    expect(seeded.game.powers.charges.shuffle).toBe(
      createNewGame(seed).powers.charges.shuffle + 1,
    );
    expect(seeded.stats.gamesPlayed).toBe(state.stats.gamesPlayed + 1);
  });
});
