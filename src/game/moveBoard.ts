/**
 * Pure 2048-style movement. No React, no randomness, no side effects.
 *
 * Each line (row for left/right, column for up/down) is collapsed toward the
 * wall: empty cells drop out, the first equal adjacent pair merges into its
 * sum, and every original tile merges at most once per move (a freshly merged
 * tile never merges again in the same swipe). Merge events are recorded in
 * deterministic resolution order - lines scanned in board order, merges
 * resolving from the wall outward - which defines chain levels for scoring.
 */

import type { Board, Direction, MergeEvent, MoveOutcome } from './types';
import { CELL_COUNT, BOARD_SIZE } from './constants';

/** Cell indices of one line, ordered from the wall outward. */
function lineIndices(direction: Direction, line: number): number[] {
  switch (direction) {
    case 'left':
      return [4 * line, 4 * line + 1, 4 * line + 2, 4 * line + 3];
    case 'right':
      return [4 * line + 3, 4 * line + 2, 4 * line + 1, 4 * line];
    case 'up':
      return [line, line + 4, line + 8, line + 12];
    case 'down':
      return [line + 12, line + 8, line + 4, line];
  }
}

/** Applies one move to a board. The input board is never mutated. */
export function moveBoard(board: Board, direction: Direction): MoveOutcome {
  const nextBoard: Board = new Array<number>(CELL_COUNT).fill(0);
  const sourcesByDestination: Array<number[] | null> = new Array(CELL_COUNT).fill(null);
  const merges: MergeEvent[] = [];

  for (let line = 0; line < BOARD_SIZE; line++) {
    const indices = lineIndices(direction, line);
    const values = indices.map((index) => board[index]);
    const nonZero = indices
      .map((index, position) => ({ index, value: values[position] }))
      .filter((entry) => entry.value !== 0);

    let read = 0;
    let write = 0;
    while (read < nonZero.length) {
      const current = nonZero[read];
      const next = read + 1 < nonZero.length ? nonZero[read + 1] : undefined;
      const destination = indices[write];
      if (next !== undefined && next.value === current.value) {
        const mergedValue = current.value * 2;
        nextBoard[destination] = mergedValue;
        sourcesByDestination[destination] = [current.index, next.index];
        merges.push({
          value: mergedValue,
          index: destination,
          sources: [current.index, next.index],
        });
        read += 2;
      } else {
        nextBoard[destination] = current.value;
        sourcesByDestination[destination] = [current.index];
        read += 1;
      }
      write += 1;
    }
  }

  let moved = false;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (nextBoard[i] !== board[i]) {
      moved = true;
      break;
    }
  }

  return { board: nextBoard, moved, merges, sourcesByDestination };
}
