/**
 * Game-over detection. The game ends only when the board is completely full
 * AND no two horizontally or vertically adjacent tiles are equal - a full
 * board with any adjacent equal pair still has legal moves.
 */

import type { Board } from './types';
import { BOARD_SIZE } from './constants';

/** True when at least one legal move exists in any direction. */
export function hasAnyMoves(board: Board): boolean {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const value = board[row * BOARD_SIZE + col];
      if (value === 0) return true;
      const right = col + 1 < BOARD_SIZE ? board[row * BOARD_SIZE + col + 1] : 0;
      const down = row + 1 < BOARD_SIZE ? board[(row + 1) * BOARD_SIZE + col] : 0;
      if (value === right || value === down) return true;
    }
  }
  return false;
}

/** True when the game is over: no empty cells and no possible merges. */
export function isGameOver(board: Board): boolean {
  return !hasAnyMoves(board);
}
