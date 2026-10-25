/**
 * Power-ups. Pure and deterministic like the rest of the engine.
 *
 * - Bomb:    destroy one chosen tile.
 * - Upgrade: double one chosen tile.
 * - Shuffle: scatter every tile to random cells (seeded PRNG).
 * - Sweep:   clear every tile holding the board's smallest value, as long as
 *            at least one bigger tile remains.
 *
 * A power never spawns a tile, never scores, and leaves the combo streak and
 * Rush Mode untouched. Charges are earned by an energy meter that fills with
 * merges (doubled during Rush); each charge earned makes the next one cost
 * more, so powers rescue a run without carrying it. The game only ends when the board is stuck
 * AND no charges remain, so powers can rescue a dead board.
 */

import type { Board, GameState, PowerId, PowerState, Tile } from './types';
import {
  BOARD_SIZE,
  CELL_COUNT,
  ENERGY_COST_BASE,
  ENERGY_COST_MAX,
  ENERGY_COST_STEP,
  MAX_TILE_VALUE,
  POWER_IDS,
  POWER_MAX_CHARGES,
  POWER_START_CHARGES,
} from './constants';
import { hasAnyMoves } from './gameOver';
import { nextFloat } from './random';

/** Powers that need the player to pick a tile. */
export const TARGETED_POWERS: ReadonlySet<PowerId> = new Set<PowerId>(['bomb', 'upgrade']);

export function startingPowers(): PowerState {
  return {
    charges: { ...POWER_START_CHARGES },
    energy: 0,
    earned: 0,
  };
}

export function emptyPowers(): PowerState {
  return { charges: { bomb: 0, upgrade: 0, shuffle: 0, sweep: 0 }, energy: 0, earned: 0 };
}

/** Energy needed for the next charge, given how many were already earned. */
export function energyCost(earned: number): number {
  return Math.min(ENERGY_COST_BASE + ENERGY_COST_STEP * earned, ENERGY_COST_MAX);
}

export function totalCharges(powers: PowerState): number {
  return POWER_IDS.reduce((sum, id) => sum + powers.charges[id], 0);
}

/** Game over = stuck board with nothing left to fire. */
export function isGameOverWithPowers(board: Board, powers: PowerState): boolean {
  return !hasAnyMoves(board) && totalCharges(powers) === 0;
}

/**
 * Adds energy from a move. When the meter fills, one charge goes to the power
 * the player holds fewest of (ties broken by display order) - no PRNG draw,
 * so spawn sequences stay identical with or without powers.
 */
export function addEnergy(
  powers: PowerState,
  gained: number,
): { powers: PowerState; earned: PowerId | null } {
  if (gained <= 0) return { powers, earned: null };
  const cost = energyCost(powers.earned);
  let energy = powers.energy + gained;
  if (energy < cost) return { powers: { ...powers, energy }, earned: null };

  energy -= cost;
  let pick: PowerId | null = null;
  for (const id of POWER_IDS) {
    if (powers.charges[id] >= POWER_MAX_CHARGES) continue;
    if (pick === null || powers.charges[id] < powers.charges[pick]) pick = id;
  }
  if (pick === null) {
    // Every power is full: keep the meter topped up instead.
    return { powers: { ...powers, energy: cost - 1 }, earned: null };
  }
  return {
    powers: {
      charges: { ...powers.charges, [pick]: powers.charges[pick] + 1 },
      energy: Math.min(energy, energyCost(powers.earned + 1) - 1),
      earned: powers.earned + 1,
    },
    earned: pick,
  };
}

function smallestAndLargest(board: Board): { min: number; max: number } {
  let min = Infinity;
  let max = 0;
  for (const value of board) {
    if (value === 0) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/** Whether a power may be fired right now (and on the given cell, if targeted). */
export function canUsePower(game: GameState, id: PowerId, cell?: number): boolean {
  if (game.gameOver || game.powers.charges[id] <= 0) return false;
  const tileCount = game.board.filter((value) => value !== 0).length;
  switch (id) {
    case 'bomb':
      if (cell === undefined) return tileCount > 1;
      return tileCount > 1 && game.board[cell] > 0;
    case 'upgrade':
      if (cell === undefined) return tileCount > 0;
      return game.board[cell] > 0 && game.board[cell] * 2 <= MAX_TILE_VALUE;
    case 'shuffle':
      return tileCount > 1;
    case 'sweep': {
      const { min, max } = smallestAndLargest(game.board);
      return tileCount > 1 && min < max;
    }
  }
}

export interface PowerResult {
  board: Board;
  tiles: Tile[];
  rngState: number;
  /** Tiles removed by the power, kept briefly for exit animations. */
  removed: Tile[];
  /** Cells the power touched, for effects. */
  cells: Array<{ row: number; col: number; value: number }>;
}

/** Applies the board change of a power. Assumes canUsePower() was true. */
export function applyPowerToBoard(game: GameState, id: PowerId, cell?: number): PowerResult {
  const board = [...game.board];
  let tiles = game.tiles;
  let rngState = game.rngState;
  const removed: Tile[] = [];
  const cells: PowerResult['cells'] = [];
  const at = (tile: Tile) => tile.row * BOARD_SIZE + tile.col;

  switch (id) {
    case 'bomb': {
      const target = cell as number;
      board[target] = 0;
      tiles = tiles.filter((tile) => {
        if (at(tile) !== target) return true;
        removed.push(tile);
        return false;
      });
      cells.push({ row: Math.floor(target / BOARD_SIZE), col: target % BOARD_SIZE, value: game.board[target] });
      break;
    }
    case 'upgrade': {
      const target = cell as number;
      board[target] = game.board[target] * 2;
      tiles = tiles.map((tile) => (at(tile) === target ? { ...tile, value: board[target] } : tile));
      cells.push({ row: Math.floor(target / BOARD_SIZE), col: target % BOARD_SIZE, value: board[target] });
      break;
    }
    case 'shuffle': {
      // Fisher-Yates over all 16 cells; tiles take the first N slots. Stable
      // tile ids mean every tile visibly flies to its new cell.
      const order = Array.from({ length: CELL_COUNT }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const draw = nextFloat(rngState);
        rngState = draw.state;
        const j = Math.floor(draw.value * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      board.fill(0);
      tiles = tiles.map((tile, index) => {
        const destination = order[index];
        board[destination] = tile.value;
        return {
          ...tile,
          row: Math.floor(destination / BOARD_SIZE),
          col: destination % BOARD_SIZE,
        };
      });
      break;
    }
    case 'sweep': {
      const { min } = smallestAndLargest(game.board);
      tiles = tiles.filter((tile) => {
        if (tile.value !== min) return true;
        board[at(tile)] = 0;
        removed.push(tile);
        cells.push({ row: tile.row, col: tile.col, value: tile.value });
        return false;
      });
      break;
    }
  }

  return { board, tiles, rngState, removed, cells };
}
