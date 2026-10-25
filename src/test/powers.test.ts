import { describe, expect, it } from 'vitest';
import type { Board, EngineState, GameState, PowerState, Tile } from '../game/types';
import { gameReducer } from '../game/reducer';
import { hasAnyMoves } from '../game/gameOver';
import {
  addEnergy,
  canUsePower,
  emptyPowers,
  energyCost,
  startingPowers,
  totalCharges,
} from '../game/powers';
import {
  BOARD_SIZE,
  ENERGY_COST_MAX,
  LEFTOVER_CHARGE_BONUS,
  MAX_RESCUES,
  POWER_MAX_CHARGES,
  POWER_START_CHARGES,
} from '../game/constants';
import { createNewGame } from '../game/initializeGame';
import { loadGame, saveGame } from '../persistence/saveGame';
import type { SafeStorage } from '../persistence/storage';

function tilesFromBoard(board: Board): Tile[] {
  const tiles: Tile[] = [];
  let id = 1;
  board.forEach((value, i) => {
    if (value !== 0) {
      tiles.push({ id: id++, value, row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE });
    }
  });
  return tiles;
}

/** One charge of everything, so each power can be exercised directly. */
const oneOfEach: PowerState = { charges: { bomb: 1, upgrade: 1, shuffle: 1, sweep: 1 }, energy: 0, earned: 0 };

function engine(board: Board, powers: PowerState = oneOfEach, overrides: Partial<GameState> = {}): EngineState {
  const tiles = tilesFromBoard(board);
  return {
    game: {
      board,
      tiles,
      score: 0,
      streak: 0,
      rush: { active: false, remaining: 0 },
      rngState: 99,
      pendingValue: 2,
      nextTileId: tiles.length + 1,
      gameOver: false,
      canUndo: true,
      undoSnapshot: null,
      celebratedRecord: false,
      lastMove: null,
      powers,
      rescuesUsed: 0,
      powerBonus: 0,
      ...overrides,
    },
    stats: { best: 0, highestTile: 0, gamesPlayed: 1 },
    prefs: { soundOn: false },
  };
}

// A full board with no adjacent equal pair: stuck.
const stuckBoard: Board = [
  2, 4, 2, 4,
  4, 2, 4, 2,
  2, 4, 2, 4,
  4, 2, 4, 8,
];

describe('powers', () => {
  it('a new game starts with the configured starting charges', () => {
    expect(createNewGame(1).powers).toEqual({ charges: POWER_START_CHARGES, energy: 0, earned: 0 });
  });

  it('each earned charge makes the next one cost more, up to a cap', () => {
    expect(energyCost(1)).toBeGreaterThan(energyCost(0));
    expect(energyCost(1000)).toBe(ENERGY_COST_MAX);
    const first = addEnergy(emptyPowers(), energyCost(0));
    expect(first.earned).not.toBeNull();
    expect(first.powers.earned).toBe(1);
    const second = addEnergy(first.powers, energyCost(0));
    expect(second.earned).toBeNull();
  });

  it('bomb removes the targeted tile, spends a charge, and spawns nothing', () => {
    const board: Board = [2, 4, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const next = gameReducer(engine(board), { type: 'power', power: 'bomb', cell: 5 });
    expect(next.game.board[5]).toBe(0);
    expect(next.game.tiles).toHaveLength(2);
    expect(next.game.powers.charges.bomb).toBe(0);
    expect(next.game.score).toBe(0);
    expect(next.game.lastMove?.power?.id).toBe('bomb');
  });

  it('bomb on an empty cell or without charges does nothing', () => {
    const board: Board = [2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const state = engine(board);
    expect(gameReducer(state, { type: 'power', power: 'bomb', cell: 9 })).toBe(state);
    const empty = engine(board, emptyPowers());
    expect(gameReducer(empty, { type: 'power', power: 'bomb', cell: 0 })).toBe(empty);
  });

  it('upgrade doubles the targeted tile and keeps its identity', () => {
    const board: Board = [2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const next = gameReducer(engine(board), { type: 'power', power: 'upgrade', cell: 1 });
    expect(next.game.board[1]).toBe(8);
    expect(next.game.tiles.find((t) => t.id === 2)?.value).toBe(8);
  });

  it('shuffle keeps the same multiset of values and advances the PRNG', () => {
    const board: Board = [2, 4, 8, 16, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const state = engine(board);
    const next = gameReducer(state, { type: 'power', power: 'shuffle' });
    expect([...next.game.board].sort((a, b) => a - b)).toEqual([...board].sort((a, b) => a - b));
    expect(next.game.rngState).not.toBe(state.game.rngState);
    for (const tile of next.game.tiles) {
      expect(next.game.board[tile.row * BOARD_SIZE + tile.col]).toBe(tile.value);
    }
  });

  it('sweep clears every smallest tile but needs a bigger tile left', () => {
    const board: Board = [2, 2, 4, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const next = gameReducer(engine(board), { type: 'power', power: 'sweep' });
    expect(next.game.board.filter((v) => v !== 0)).toEqual([4]);
    const flat = engine([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(canUsePower(flat.game, 'sweep')).toBe(false);
  });

  it('a stuck board is not game over while charges remain', () => {
    const stuck = engine(stuckBoard, { charges: { bomb: 1, upgrade: 0, shuffle: 0, sweep: 0 }, energy: 0, earned: 0 });
    const freed = gameReducer(stuck, { type: 'power', power: 'bomb', cell: 0 });
    expect(freed.game.gameOver).toBe(false);
    expect(freed.game.board[0]).toBe(0);
  });

  it('energy pays out a charge to the emptiest power', () => {
    const powers: PowerState = { charges: { bomb: 2, upgrade: 1, shuffle: 0, sweep: 1 }, energy: energyCost(0) - 1, earned: 0 };
    const result = addEnergy(powers, 2);
    expect(result.earned).toBe('shuffle');
    expect(result.powers.charges.shuffle).toBe(1);
    expect(result.powers.energy).toBe(1);
  });

  it('energy stops paying out when every power is full', () => {
    const full: PowerState = {
      charges: { bomb: POWER_MAX_CHARGES, upgrade: POWER_MAX_CHARGES, shuffle: POWER_MAX_CHARGES, sweep: POWER_MAX_CHARGES },
      energy: energyCost(0) - 1,
      earned: 0,
    };
    expect(addEnergy(full, 3).earned).toBeNull();
  });

  it('merges fill the energy meter', () => {
    const board: Board = [2, 2, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const next = gameReducer(engine(board), { type: 'move', direction: 'left' });
    expect(next.game.powers.energy).toBe(2);
  });

  it('undo restores spent charges', () => {
    const board: Board = [2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const used = gameReducer(engine(board), { type: 'power', power: 'bomb', cell: 0 });
    const undone = gameReducer(used, { type: 'undo' });
    expect(undone.game.powers.charges.bomb).toBe(1);
    expect(undone.game.board).toEqual(board);
  });

  it('powers survive a save/load round trip, and old saves get starting charges', () => {
    const data = new Map<string, string>();
    const storage: SafeStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    } as SafeStorage;
    const state = engine([2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {
      charges: { bomb: 3, upgrade: 0, shuffle: 2, sweep: 1 },
      energy: 4,
      earned: 2,
    });
    saveGame(storage, state);
    expect(loadGame(storage).game?.powers).toEqual(state.game.powers);

    const [key, raw] = [...data.entries()][0];
    const legacy = JSON.parse(raw);
    delete legacy.game.powers.earned;
    data.set(key, JSON.stringify(legacy));
    expect(loadGame(storage).game?.powers.earned).toBe(0);

    delete legacy.game.powers;
    data.set(key, JSON.stringify(legacy));
    expect(loadGame(storage).game?.powers).toEqual(startingPowers());
  });
});

describe('rescue limit and leftover bonus', () => {
  const manyCharges = (): PowerState => ({
    charges: { bomb: 3, upgrade: 3, shuffle: 3, sweep: 3 },
    energy: 0,
    earned: 0,
  });

  it('a power fired on a stuck board counts as a rescue', () => {
    const next = gameReducer(engine(stuckBoard, manyCharges()), { type: 'power', power: 'bomb', cell: 0 });
    expect(next.game.rescuesUsed).toBe(1);
    expect(next.game.lastMove?.rescue).toBe(true);
  });

  it('a power fired while moves remain is free', () => {
    const board: Board = [2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const next = gameReducer(engine(board, manyCharges()), { type: 'power', power: 'bomb', cell: 0 });
    expect(next.game.rescuesUsed).toBe(0);
    expect(next.game.lastMove?.rescue).toBe(false);
  });

  it('a stuck board with every rescue spent is game over and cashes in charges', () => {
    // Upgrading the corner 8 to 16 keeps the board full with no pairs; with the
    // last rescue spent that ends the game although 11 charges remain.
    const state = engine(stuckBoard, manyCharges(), { rescuesUsed: MAX_RESCUES - 1, score: 1000 });
    const next = gameReducer(state, { type: 'power', power: 'upgrade', cell: 15 });
    expect(next.game.gameOver).toBe(true);
    expect(next.game.rescuesUsed).toBe(MAX_RESCUES);
    expect(next.game.powerBonus).toBe(11 * LEFTOVER_CHARGE_BONUS);
    expect(next.game.score).toBe(1000 + 11 * LEFTOVER_CHARGE_BONUS);
    expect(totalCharges(next.game.powers)).toBe(0);
    expect(next.stats.best).toBe(next.game.score);
  });

  it('no power can fire on a stuck board once rescues are used up', () => {
    const game = engine(stuckBoard, manyCharges(), { rescuesUsed: MAX_RESCUES }).game;
    for (const id of ['bomb', 'upgrade', 'shuffle', 'sweep'] as const) {
      expect(canUsePower(game, id, 0)).toBe(false);
    }
  });

  it('a move that ends the game cashes in leftover charges', () => {
    // Sliding the last row right leaves one hole at (3,0); the spawned 4 fills
    // it with no equal neighbour, so the board is stuck and rescues are gone.
    const board: Board = [
      2, 4, 2, 4,
      4, 2, 4, 2,
      2, 4, 2, 4,
      2, 4, 0, 8,
    ];
    const state = engine(board, manyCharges(), { rescuesUsed: MAX_RESCUES, pendingValue: 4 });
    const next = gameReducer(state, { type: 'move', direction: 'right' });
    expect(next.game.board.slice(12)).toEqual([4, 2, 4, 8]);
    expect(next.game.gameOver).toBe(true);
    expect(next.game.powerBonus).toBe(12 * LEFTOVER_CHARGE_BONUS);
  });

  it('a stuck board with rescues left is not game over', () => {
    const board: Board = [
      2, 4, 2, 4,
      4, 2, 4, 2,
      2, 4, 2, 4,
      2, 4, 0, 8,
    ];
    const state = engine(board, manyCharges(), { pendingValue: 4 });
    const next = gameReducer(state, { type: 'move', direction: 'right' });
    expect(hasAnyMoves(next.game.board)).toBe(false);
    expect(next.game.gameOver).toBe(false);
    expect(next.game.powerBonus).toBe(0);
  });

  it('undo after a rescue restores the rescue', () => {
    const used = gameReducer(engine(stuckBoard, manyCharges()), { type: 'power', power: 'bomb', cell: 0 });
    const undone = gameReducer(used, { type: 'undo' });
    expect(undone.game.rescuesUsed).toBe(0);
  });

  it('old saves without rescue fields load with none used', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as SafeStorage;
    saveGame(storage, engine([2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], manyCharges(), { rescuesUsed: 2 }));
    expect(loadGame(storage).game?.rescuesUsed).toBe(2);
    const [key, raw] = [...data.entries()][0];
    const legacy = JSON.parse(raw);
    delete legacy.game.rescuesUsed;
    delete legacy.game.powerBonus;
    data.set(key, JSON.stringify(legacy));
    expect(loadGame(storage).game?.rescuesUsed).toBe(0);
    expect(loadGame(storage).game?.powerBonus).toBe(0);
  });
});
