/**
 * Power-ups. Pure and deterministic like the rest of the engine.
 *
 * - Bomb:    destroy one chosen tile.
 * - Shuffle: scatter every tile to random cells (seeded PRNG).
 * - Sweep:   clear every tile holding the board's smallest value, as long as
 *            at least one bigger tile remains.
 *
 * A power never spawns a tile, never scores, and leaves the combo streak and
 * Rush Mode untouched. Charges are earned by an energy meter that fills with
 * merges (doubled during Rush); each charge earned makes the next one cost
 * more, so powers rescue a run without carrying it.
 *
 * A power fired on a stuck board is a rescue; MAX_RESCUES are allowed per
 * game. When a stuck board runs out of charges or rescues, the game pauses on
 * a one-time revive offer; once that is declined or spent, the game ends and
 * any unspent charges are cashed in for bonus points.
 */

import type { Board, GameState, PowerId, PowerState, Tile } from './types';
import {
  BOARD_SIZE,
  CELL_COUNT,
  ENERGY_COST_BASE,
  ENERGY_COST_MAX,
  ENERGY_COST_STEP,
  LEFTOVER_CHARGE_BONUS,
  MAX_RESCUES,
  REVIVE_RESCUES,
  POWER_IDS,
  POWER_MAX_CHARGES,
  POWER_START_CHARGES,
  SWEEP_MAX_RATIO,
} from './constants';
import { hasAnyMoves } from './gameOver';
import { nextFloat } from './random';

/** Powers that need the player to pick a tile. */
export const TARGETED_POWERS: ReadonlySet<PowerId> = new Set<PowerId>(['bomb']);

export function startingPowers(): PowerState {
  return {
    charges: { ...POWER_START_CHARGES },
    energy: 0,
    earned: 0,
  };
}

export function emptyPowers(): PowerState {
  return { charges: { bomb: 0, shuffle: 0, sweep: 0 }, energy: 0, earned: 0 };
}

/** Energy needed for the next charge, given how many were already earned. */
export function energyCost(earned: number): number {
  return Math.min(ENERGY_COST_BASE + ENERGY_COST_STEP * earned, ENERGY_COST_MAX);
}

export function totalCharges(powers: PowerState): number {
  return POWER_IDS.reduce((sum, id) => sum + powers.charges[id], 0);
}

/** Rescues allowed this game: MAX_RESCUES, plus the revive's extra one. */
export function rescueLimit(reviveUsed: boolean): number {
  return MAX_RESCUES + (reviveUsed ? REVIVE_RESCUES : 0);
}

export function rescuesLeft(rescuesUsed: number, reviveUsed = false): number {
  return Math.max(0, rescueLimit(reviveUsed) - rescuesUsed);
}

/**
 * Where a board leaves the game. A stuck board the player can still rescue
 * keeps playing; otherwise it offers the one revive, and ends once that is
 * gone.
 */
export type GameStatus = 'playing' | 'lastChance' | 'over';

export function gameStatus(
  board: Board,
  powers: PowerState,
  rescuesUsed: number,
  reviveUsed: boolean,
): GameStatus {
  if (hasAnyMoves(board)) return 'playing';
  if (totalCharges(powers) > 0 && rescuesUsed < rescueLimit(reviveUsed)) return 'playing';
  return reviveUsed ? 'over' : 'lastChance';
}

/**
 * Cashes unspent charges in for points when the game ends, so saving powers
 * is never wasted and nobody has to burn charges on a dead board.
 */
export function cashOutCharges(powers: PowerState): { powers: PowerState; bonus: number } {
  const bonus = totalCharges(powers) * LEFTOVER_CHARGE_BONUS;
  return {
    powers: { ...powers, charges: { bomb: 0, shuffle: 0, sweep: 0 } },
    bonus,
  };
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
  if (game.gameOver || game.lastChance || game.powers.charges[id] <= 0) return false;
  if (game.rescuesUsed >= rescueLimit(game.reviveUsed) && !hasAnyMoves(game.board)) return false;
  const tileCount = game.board.filter((value) => value !== 0).length;
  switch (id) {
    case 'bomb':
      if (cell === undefined) return tileCount > 1;
      return tileCount > 1 && game.board[cell] > 0;
    case 'shuffle':
      return tileCount > 1;
    case 'sweep': {
      const { min, max } = smallestAndLargest(game.board);
      // Only ever clears the small stuff: the smallest value must be at most a
      // quarter of the biggest tile, so a late-game board never loses real progress.
      return tileCount > 1 && min * SWEEP_MAX_RATIO <= max;
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
