import { describe, expect, it } from 'vitest';
import type { EngineState } from '../game/types';
import { gameReducer, createInitialEngineState } from '../game/reducer';
import {
  clearSave,
  loadGame,
  saveGame,
  serializeEngineState,
} from '../persistence/saveGame';
import type { SafeStorage } from '../persistence/storage';
import { createSafeStorage, getSafeLocalStorage } from '../persistence/storage';
import { SAVE_KEY, SAVE_VERSION } from '../game/constants';

function makeMemoryStorage(initial: Record<string, string> = {}): SafeStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

/** A raw Storage-like object whose methods throw on demand. */
function makeThrowingStorage(whatThrows: 'setItem' | 'getItem'): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    key: () => null,
    getItem: (key: string) => {
      if (whatThrows === 'getItem') throw new Error('blocked');
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (whatThrows === 'setItem') throw new Error('blocked');
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function playedEngine(): EngineState {
  let state = createInitialEngineState(555);
  state = gameReducer(state, { type: 'move', direction: 'left' });
  state = gameReducer(state, { type: 'move', direction: 'up' });
  return state;
}

describe('persistence: save and restore', () => {
  it('round-trips an in-progress game including undo snapshot and rng state', () => {
    const storage = makeMemoryStorage();
    const state = playedEngine();

    saveGame(storage, state);
    const loaded = loadGame(storage);

    expect(loaded.game).not.toBeNull();
    expect(loaded.game?.board).toEqual(state.game.board);
    expect(loaded.game?.tiles).toEqual(state.game.tiles);
    expect(loaded.game?.score).toBe(state.game.score);
    expect(loaded.game?.streak).toBe(state.game.streak);
    expect(loaded.game?.rush).toEqual(state.game.rush);
    expect(loaded.game?.rngState).toBe(state.game.rngState);
    expect(loaded.game?.pendingValue).toBe(state.game.pendingValue);
    expect(loaded.game?.canUndo).toBe(state.game.canUndo);
    expect(loaded.game?.undoSnapshot).toEqual(state.game.undoSnapshot);
    expect(loaded.stats).toEqual(state.stats);
    expect(loaded.prefs).toEqual(state.prefs);
  });

  it('keeps the best score across saves', () => {
    const storage = makeMemoryStorage();
    const state = playedEngine();
    const withBest: EngineState = {
      ...state,
      stats: { ...state.stats, best: 1234 },
    };
    saveGame(storage, withBest);
    expect(loadGame(storage).stats.best).toBe(1234);
  });

  it('persists the sound preference', () => {
    const storage = makeMemoryStorage();
    const state = playedEngine();
    saveGame(storage, { ...state, prefs: { soundOn: false } });
    expect(loadGame(storage).prefs.soundOn).toBe(false);
  });

  it('round-trips through the real (jsdom) localStorage', () => {
    const storage = getSafeLocalStorage();
    expect(storage).not.toBeNull();
    const state = playedEngine();
    saveGame(storage, state);
    expect(window.localStorage.getItem(SAVE_KEY)).toContain('"version":1');
    const loaded = loadGame(storage);
    expect(loaded.game?.board).toEqual(state.game.board);
    clearSave(storage);
    expect(loadGame(storage).game).toBeNull();
  });
});

describe('persistence: recovery from bad data', () => {
  it('returns defaults when nothing is saved', () => {
    const result = loadGame(makeMemoryStorage());
    expect(result.game).toBeNull();
    expect(result.stats).toEqual({ best: 0, highestTile: 0, gamesPlayed: 0 });
    expect(result.prefs).toEqual({ soundOn: true });
  });

  it('survives malformed JSON', () => {
    const storage = makeMemoryStorage({ [SAVE_KEY]: '{not json!!' });
    const result = loadGame(storage);
    expect(result.game).toBeNull();
    expect(result.stats.best).toBe(0);
  });

  it('survives JSON that is not an object', () => {
    const storage = makeMemoryStorage({ [SAVE_KEY]: '42' });
    expect(loadGame(storage).game).toBeNull();
  });

  it('drops the game but keeps valid stats on an unsupported save version', () => {
    const state = playedEngine();
    const save = serializeEngineState(state);
    const future = { ...save, version: SAVE_VERSION + 1, stats: { best: 777, highestTile: 64, gamesPlayed: 9 } };
    const storage = makeMemoryStorage({ [SAVE_KEY]: JSON.stringify(future) });
    const result = loadGame(storage);
    expect(result.game).toBeNull();
    expect(result.stats.best).toBe(777);
    expect(result.stats.gamesPlayed).toBe(9);
  });

  it('drops the game when required fields are missing', () => {
    const state = playedEngine();
    const save = serializeEngineState(state);
    for (const field of ['board', 'tiles', 'score', 'rush', 'pendingValue'] as const) {
      const broken = { ...save, game: { ...save.game, [field]: undefined } };
      const storage = makeMemoryStorage({ [SAVE_KEY]: JSON.stringify(broken) });
      expect(loadGame(storage).game).toBeNull();
    }
  });

  it('drops the game when the board has the wrong shape or bad values', () => {
    const state = playedEngine();
    const save = serializeEngineState(state);
    const cases: unknown[] = [
      { ...save, game: { ...save.game, board: [2, 2, 0, 0] } }, // too short
      { ...save, game: { ...save.game, board: new Array(16).fill(3) } }, // 3 is not a power of two
      { ...save, game: { ...save.game, board: new Array(16).fill(-2) } },
      { ...save, game: { ...save.game, score: -5 } },
      { ...save, game: { ...save.game, pendingValue: 6 } },
      { ...save, game: { ...save.game, rush: { active: true, remaining: 0 } } },
    ];
    for (const broken of cases) {
      const storage = makeMemoryStorage({ [SAVE_KEY]: JSON.stringify(broken) });
      expect(loadGame(storage).game).toBeNull();
    }
  });

  it('drops the game when tiles disagree with the board', () => {
    const state = playedEngine();
    const save = serializeEngineState(state);
    const tiles = save.game ? [...save.game.tiles] : [];
    if (tiles.length > 0) {
      tiles[0] = { ...tiles[0], value: tiles[0].value * 2 };
    }
    const broken = { ...save, game: save.game ? { ...save.game, tiles } : null };
    const storage = makeMemoryStorage({ [SAVE_KEY]: JSON.stringify(broken) });
    expect(loadGame(storage).game).toBeNull();
  });

  it('falls back to default stats when stats are invalid', () => {
    const storage = makeMemoryStorage({
      [SAVE_KEY]: JSON.stringify({
        version: SAVE_VERSION,
        game: null,
        stats: { best: 'high', gamesPlayed: -3 },
        prefs: { soundOn: 'yes' },
      }),
    });
    const result = loadGame(storage);
    expect(result.stats).toEqual({ best: 0, highestTile: 0, gamesPlayed: 0 });
    expect(result.prefs).toEqual({ soundOn: true });
  });
});

describe('persistence: unavailable or blocked storage', () => {
  it('never throws when storage is null', () => {
    expect(() => saveGame(null, playedEngine())).not.toThrow();
    const result = loadGame(null);
    expect(result.game).toBeNull();
    expect(result.stats.best).toBe(0);
  });

  it('detects a read-only storage via the probe and disables saving', () => {
    const safe = createSafeStorage(makeThrowingStorage('setItem'));
    expect(safe).toBeNull();
  });

  it('wraps a storage whose getItem throws', () => {
    const safe = createSafeStorage(makeThrowingStorage('getItem'));
    expect(safe).not.toBeNull();
    expect(safe?.getItem(SAVE_KEY)).toBeNull();
    expect(() => loadGame(safe ?? null)).not.toThrow();
  });
});
