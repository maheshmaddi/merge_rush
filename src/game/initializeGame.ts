/**
 * Creates a fresh game deterministically from a seed (tests) or from a
 * time-based seed (real play). Two tiles of value 2 spawn at random empty
 * cells, and the next spawn value is drawn immediately for the preview.
 */

import type { GameState, Tile } from './types';
import { BOARD_SIZE, STARTING_TILE_COUNT, STARTING_TILE_VALUE, SPAWN_TWO_PROBABILITY } from './constants';
import { startingPowers } from './powers';
import { drawSpawnValue, normalizeSeed, pickEmptyCell, randomSeed } from './random';

export function createNewGame(seed?: number): GameState {
  let rngState = normalizeSeed(seed === undefined ? randomSeed() : seed);

  const board: number[] = new Array(BOARD_SIZE * BOARD_SIZE).fill(0);
  const tiles: Tile[] = [];
  let nextTileId = 1;

  for (let i = 0; i < STARTING_TILE_COUNT; i++) {
    const cell = pickEmptyCell(board, rngState);
    rngState = cell.state;
    board[cell.value] = STARTING_TILE_VALUE;
    tiles.push({
      id: nextTileId++,
      value: STARTING_TILE_VALUE,
      row: Math.floor(cell.value / BOARD_SIZE),
      col: cell.value % BOARD_SIZE,
    });
  }

  const pending = drawSpawnValue(rngState, SPAWN_TWO_PROBABILITY);
  rngState = pending.state;

  return {
    board,
    tiles,
    score: 0,
    streak: 0,
    rush: { active: false, remaining: 0 },
    rngState,
    pendingValue: pending.value,
    nextTileId,
    gameOver: false,
    canUndo: true,
    undoSnapshot: null,
    powers: startingPowers(),
    rescuesUsed: 0,
    powerBonus: 0,
    lastChance: false,
    reviveUsed: false,
    celebratedRecord: false,
    lastMove: null,
  };
}
