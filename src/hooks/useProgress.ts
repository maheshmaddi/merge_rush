import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, GameStats, PowerId } from '../game/types';
import { createSafeStorage, getLocalStorage } from '../persistence/storage';
import { dateKey } from '../daily/daily';
import { loadProgress, saveProgress, track } from '../progress/progress';
import type { Progress, TrackInput } from '../progress/progress';
import { levelForXp } from '../progress/rules';
import type { ThemeId } from '../progress/rules';

export interface ProgressApi {
  progress: Progress;
  level: number;
  toasts: string[];
  dismissToast: () => void;
  /** Mark that a daily game is being played (or clear it for a normal game). */
  setActiveDaily: (active: boolean) => void;
  /** Take the streak-reward charge for the next normal game, if one is waiting. */
  consumeBonus: () => PowerId | null;
  setTheme: (theme: ThemeId) => void;
  markRateAsked: () => void;
}

/**
 * Owns the progress record and feeds it game events: every move or power
 * use (missions, XP, daily score) and every game ending (XP, achievements).
 * Skipped entirely for test-staged games so they never touch real progress.
 */
export function useProgress(game: GameState, stats: GameStats, enabled: boolean): ProgressApi {
  const [storage] = useState(() => (enabled ? createSafeStorage(getLocalStorage()) : null));
  const [progress, setProgressState] = useState(() => loadProgress(storage));
  const progressRef = useRef(progress);
  const [toasts, setToasts] = useState<string[]>([]);

  const commit = useCallback(
    (next: Progress) => {
      progressRef.current = next;
      setProgressState(next);
      saveProgress(storage, next);
    },
    [storage],
  );

  const fold = useCallback(
    (input: TrackInput) => {
      const result = track(progressRef.current, input);
      commit(result.progress);
      if (result.toasts.length > 0) setToasts((current) => [...current, ...result.toasts]);
    },
    [commit],
  );

  // A move or power use.
  const seenMove = useRef(game.lastMove);
  useEffect(() => {
    const lastMove = game.lastMove;
    if (lastMove === null || lastMove === seenMove.current) {
      seenMove.current = lastMove;
      return;
    }
    seenMove.current = lastMove;
    if (!enabled) return;
    const maxTile = game.tiles.reduce((max, tile) => Math.max(max, tile.value), 0);
    fold({
      today: dateKey(new Date()),
      move: {
        merges: lastMove.mergeCells.length,
        maxTile,
        streak: game.streak,
        rushActivated: lastMove.rushActivated,
        rushActive: game.rush.active,
        powerUsed: lastMove.power !== null,
        score: game.score,
      },
      rescued: lastMove.rescue,
      score: game.score,
      highestTile: Math.max(stats.highestTile, maxTile),
      bestScore: stats.best,
      gamesPlayed: stats.gamesPlayed,
      chain: game.streak,
    });
  }, [game, stats, enabled, fold]);

  // A game ending (including declining a revive, which has no lastMove).
  const wasOver = useRef(game.gameOver);
  useEffect(() => {
    const over = game.gameOver;
    const justEnded = over && !wasOver.current;
    wasOver.current = over;
    if (!justEnded || !enabled) return;
    fold({
      today: dateKey(new Date()),
      gameOver: true,
      score: game.score,
      highestTile: stats.highestTile,
      bestScore: stats.best,
      gamesPlayed: stats.gamesPlayed,
      chain: game.streak,
    });
  }, [game.gameOver, game.score, game.streak, stats, enabled, fold]);

  const setActiveDaily = useCallback(
    (active: boolean) => {
      const today = dateKey(new Date());
      commit({ ...progressRef.current, activeDaily: active ? today : null });
    },
    [commit],
  );

  const consumeBonus = useCallback((): PowerId | null => {
    const bonus = progressRef.current.bonusCharge;
    if (bonus !== null) commit({ ...progressRef.current, bonusCharge: null });
    return bonus;
  }, [commit]);

  const setTheme = useCallback(
    (theme: ThemeId) => commit({ ...progressRef.current, theme }),
    [commit],
  );
  const markRateAsked = useCallback(
    () => commit({ ...progressRef.current, rateAsked: true }),
    [commit],
  );
  const dismissToast = useCallback(() => setToasts((current) => current.slice(1)), []);

  return {
    progress,
    level: levelForXp(progress.xp),
    toasts,
    dismissToast,
    setActiveDaily,
    consumeBonus,
    setTheme,
    markRateAsked,
  };
}
