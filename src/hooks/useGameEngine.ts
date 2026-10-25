/**
 * The single React entry point for game state: boots from storage (or a
 * supplied initial state, used by tests), dispatches reducer actions, saves
 * after every change, plays move sounds, and serializes rapid input through
 * a short animation lock so overlapping moves never corrupt the board.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Direction, EngineState, GameState, LastMoveInfo, PowerId } from '../game/types';
import { gameReducer } from '../game/reducer';
import { createNewGame } from '../game/initializeGame';
import { loadGame, saveGame } from '../persistence/saveGame';
import type { SafeStorage } from '../persistence/storage';
import { getSafeLocalStorage } from '../persistence/storage';
import { soundEngine } from '../audio/soundEngine';
import { buzz } from '../native/haptics';
import { useReducedMotion } from './useReducedMotion';

/** How long a move locks input while the slide animation plays. */
const MOVE_LOCK_MS = 130;

/** Saves are debounced off the interaction frame; localStorage writes are
    synchronous disk I/O and can stall a low-end phone mid-animation. */
const SAVE_DEBOUNCE_MS = 250;

export interface GameEngineApi {
  state: EngineState;
  move: (direction: Direction) => void;
  undo: () => void;
  firePower: (power: PowerId, cell?: number) => void;
  /** Start a fresh game; `seed` fixes the board (daily), `bonus` adds a starting charge. */
  restart: (options?: { seed?: number; bonus?: PowerId }) => void;
  /** Answer a last-chance revive offer. */
  revive: () => void;
  declineRevive: () => void;
  toggleSound: () => void;
}

/**
 * Boots engine state. A saved, unfinished game is restored (including
 * game-over states that still allow undo); otherwise a fresh game starts and
 * gamesPlayed increments.
 */
function bootState(storage: SafeStorage | null): EngineState {
  const loaded = loadGame(storage);
  const saved = loaded.game;
  const restorable = saved !== null && !(saved.gameOver && !saved.canUndo);
  return {
    game: restorable && saved !== null ? saved : createNewGame(),
    stats: restorable
      ? loaded.stats
      : { ...loaded.stats, gamesPlayed: loaded.stats.gamesPlayed + 1 },
    prefs: loaded.prefs,
  };
}

export function useGameEngine(initialState?: EngineState): GameEngineApi {
  const storageRef = useRef<SafeStorage | null | undefined>(undefined);
  if (storageRef.current === undefined) {
    storageRef.current = initialState === undefined ? getSafeLocalStorage() : null;
  }
  const storage = storageRef.current ?? null;

  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => (initialState !== undefined ? initialState : bootState(storage)),
  );

  const reducedMotion = useReducedMotion();
  const lockRef = useRef(false);
  const pendingRef = useRef<Direction | null>(null);
  const moveRef = useRef<(direction: Direction) => void>(() => undefined);

  const move = useCallback(
    (direction: Direction) => {
      if (lockRef.current) {
        // Keep only the most recent input during the lock; never drop the
        // latest intent, never apply two moves at once.
        pendingRef.current = direction;
        return;
      }
      dispatch({ type: 'move', direction });
      const lockMs = reducedMotion ? 0 : MOVE_LOCK_MS;
      if (lockMs > 0) {
        lockRef.current = true;
        window.setTimeout(() => {
          lockRef.current = false;
          const pending = pendingRef.current;
          pendingRef.current = null;
          if (pending !== null) moveRef.current(pending);
        }, lockMs);
      }
    },
    [reducedMotion],
  );
  moveRef.current = move;

  const undo = useCallback(() => {
    dispatch({ type: 'undo' });
    soundEngine.play('undo');
  }, []);

  const firePower = useCallback((power: PowerId, cell?: number) => {
    dispatch({ type: 'power', power, cell });
  }, []);

  const restart = useCallback((options?: { seed?: number; bonus?: PowerId }) => {
    dispatch({ type: 'restart', seed: options?.seed, bonus: options?.bonus });
  }, []);

  const revive = useCallback(() => {
    dispatch({ type: 'revive' });
    soundEngine.play('revive');
  }, []);

  const declineRevive = useCallback(() => {
    dispatch({ type: 'declineRevive' });
  }, []);

  const toggleSound = useCallback(() => {
    dispatch({ type: 'toggleSound' });
  }, []);

  // Persist after every change, debounced so the disk write never lands in
  // the same frame as a move (skipped for test-supplied initial states).
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (initialState !== undefined || storage === null) return;
    const timer = window.setTimeout(() => saveGame(storage, stateRef.current), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state, initialState, storage]);

  // The app can be killed at any moment on mobile: flush the latest state
  // synchronously when the page is hidden or unloaded so the debounce can
  // never lose progress.
  useEffect(() => {
    if (initialState !== undefined || storage === null) return;
    const flush = () => saveGame(storage, stateRef.current);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [initialState, storage]);

  // Sound enablement follows the preference.
  useEffect(() => {
    soundEngine.configure(state.prefs.soundOn);
  }, [state.prefs.soundOn]);

  // Move sounds keyed off the transient lastMove payload. Invalid moves do
  // not change state, so they stay silent.
  const lastSoundRef = useRef<LastMoveInfo | null>(null);
  const prevStreakRef = useRef<number>(state.game.streak);
  useEffect(() => {
    const lastMove = state.game.lastMove;
    const streak = state.game.streak;
    const streakGrew = streak > prevStreakRef.current;
    prevStreakRef.current = streak;
    if (lastMove === null || lastMove === lastSoundRef.current) return;
    lastSoundRef.current = lastMove;

    if (lastMove.power !== null) {
      soundEngine.play(lastMove.power.id);
      buzz(lastMove.power.id === 'bomb' ? 'heavy' : 'medium');
      return;
    }

    soundEngine.play('move');
    if (lastMove.powerEarned !== null) soundEngine.play('powerEarned');
    if (lastMove.mergeCells.length > 0) {
      const best = lastMove.mergeCells.reduce((max, cell) => Math.max(max, cell.value), 0);
      soundEngine.play('merge', { value: best });
      buzz(best >= 128 ? 'medium' : 'light');
    }
    if (streakGrew && streak >= 2) {
      soundEngine.play('combo', { streak });
    }
    if (lastMove.rushActivated) {
      soundEngine.play('rushStart');
      buzz('heavy');
    }
    if (lastMove.rushExpired) soundEngine.play('rushEnd');
    if (lastMove.newRecord) soundEngine.play('record');
  }, [state.game.lastMove, state.game.streak]);

  // Game-over sting, once.
  const gameOverSoundRef = useRef(false);
  useEffect(() => {
    if (state.game.gameOver && !gameOverSoundRef.current) {
      gameOverSoundRef.current = true;
      soundEngine.play('gameOver');
    }
    if (!state.game.gameOver) {
      gameOverSoundRef.current = false;
    }
  }, [state.game.gameOver]);

  // Clear the input lock if the component goes away mid-animation.
  useEffect(() => {
    return () => {
      lockRef.current = false;
      pendingRef.current = null;
    };
  }, []);

  return { state, move, undo, firePower, restart, revive, declineRevive, toggleSound };
}

/** Narrow re-export so components can type against GameState without cycles. */
export type { GameState };
