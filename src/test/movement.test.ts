import { describe, expect, it } from 'vitest';
import { moveBoard } from '../game/moveBoard';
import type { Board, Direction } from '../game/types';

/** Builds a Board from four rows (top to bottom). */
function fromRows(rows: [number[], number[], number[], number[]]): Board {
  return rows.flat();
}

function emptyRows(): number[][] {
  return [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
}

/** Places a single row into the board and moves it. */
function moveRow(row: number[], direction: Direction): number[] {
  const rows = emptyRows();
  rows[0] = row;
  const outcome = moveBoard(fromRows(rows as [number[], number[], number[], number[]]), direction);
  if (direction === 'left' || direction === 'right') {
    return outcome.board.slice(0, 4);
  }
  // For up/down on row 0, extract the first column instead.
  return [0, 1, 2, 3].map((i) => outcome.board[i * 4]);
}

describe('movement: basic directions', () => {
  it('moves tiles left', () => {
    const board = fromRows([
      [0, 2, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const outcome = moveBoard(board, 'left');
    expect(outcome.board).toEqual(
      fromRows([
        [4, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
    );
    expect(outcome.moved).toBe(true);
  });

  it('moves tiles right', () => {
    const board = fromRows([
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const outcome = moveBoard(board, 'right');
    expect(outcome.board[3]).toBe(4);
    expect(outcome.board[0]).toBe(0);
  });

  it('moves tiles up', () => {
    const board = fromRows([
      [0, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
    const outcome = moveBoard(board, 'up');
    expect(outcome.board[0]).toBe(4);
    expect(outcome.board[4]).toBe(0);
    expect(outcome.board[8]).toBe(0);
    expect(outcome.board[12]).toBe(0);
  });

  it('moves tiles down', () => {
    const board = fromRows([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
    const outcome = moveBoard(board, 'down');
    expect(outcome.board[12]).toBe(4);
    expect(outcome.board[0]).toBe(0);
  });
});

describe('movement: collapsing and merging', () => {
  it('collapses empty spaces without merging unequal tiles', () => {
    expect(moveRow([2, 0, 4, 0], 'left')).toEqual([2, 4, 0, 0]);
    expect(moveRow([0, 2, 0, 4], 'right')).toEqual([0, 0, 2, 4]);
  });

  it('merges adjacent equal tiles once', () => {
    expect(moveRow([2, 2, 4, 8], 'left')).toEqual([4, 4, 8, 0]);
  });

  it('does not merge unequal neighbors', () => {
    expect(moveRow([2, 4, 0, 0], 'left')).toEqual([2, 4, 0, 0]);
    expect(moveRow([4, 2, 2, 0], 'left')).toEqual([4, 4, 0, 0]);
  });

  it('prevents a newly merged tile from merging again in the same move', () => {
    // [2,2,4] -> 4 then 4+4 must NOT merge to 8.
    expect(moveRow([2, 2, 4, 0], 'left')).toEqual([4, 4, 0, 0]);
    expect(moveRow([4, 2, 2, 0], 'left')).toEqual([4, 4, 0, 0]);
  });

  it('handles three equal tiles: the wall-side pair merges', () => {
    expect(moveRow([2, 2, 2, 0], 'left')).toEqual([4, 2, 0, 0]);
    expect(moveRow([0, 2, 2, 2], 'right')).toEqual([0, 0, 2, 4]);
  });

  it('handles four equal tiles as two merges', () => {
    expect(moveRow([2, 2, 2, 2], 'left')).toEqual([4, 4, 0, 0]);
    expect(moveRow([4, 4, 4, 4], 'right')).toEqual([0, 0, 8, 8]);
  });

  it('handles complex rows', () => {
    expect(moveRow([4, 4, 8, 8], 'left')).toEqual([8, 16, 0, 0]);
    expect(moveRow([4, 4, 8, 8], 'right')).toEqual([0, 0, 8, 16]);
    expect(moveRow([2, 4, 4, 2], 'left')).toEqual([2, 8, 2, 0]);
    expect(moveRow([0, 2, 0, 2], 'right')).toEqual([0, 0, 0, 4]);
    expect(moveRow([2, 2, 2, 4], 'left')).toEqual([4, 2, 4, 0]);
  });

  it('handles complex columns in both vertical directions', () => {
    const board = fromRows([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [4, 0, 0, 0],
    ]);
    const up = moveBoard(board, 'up');
    expect([up.board[0], up.board[4], up.board[8], up.board[12]]).toEqual([4, 2, 4, 0]);

    const down = moveBoard(board, 'down');
    expect([down.board[0], down.board[4], down.board[8], down.board[12]]).toEqual([0, 2, 4, 4]);
  });

  it('merges a full column vertically and shifts the rest', () => {
    const board = fromRows([
      [2, 0, 0, 0],
      [4, 0, 0, 0],
      [2, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
    const down = moveBoard(board, 'down');
    // From the wall (bottom): 2+2=4 at the bottom, then 4, then 2 above.
    expect([down.board[0], down.board[4], down.board[8], down.board[12]]).toEqual([0, 2, 4, 4]);
  });
});

describe('movement: merge event ordering and sources', () => {
  it('records merges in wall-outward order for chain levels', () => {
    const board = fromRows([
      [2, 2, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const outcome = moveBoard(board, 'left');
    expect(outcome.merges).toHaveLength(2);
    expect(outcome.merges[0]?.value).toBe(4);
    expect(outcome.merges[0]?.index).toBe(0);
    expect(outcome.merges[1]?.value).toBe(8);
    expect(outcome.merges[1]?.index).toBe(1);
  });

  it('orders merges line by line from the first line scanned', () => {
    const board = fromRows([
      [2, 2, 0, 0],
      [4, 4, 0, 0],
      [8, 8, 0, 0],
      [0, 0, 0, 0],
    ]);
    const outcome = moveBoard(board, 'left');
    expect(outcome.merges.map((m) => m.value)).toEqual([4, 8, 16]);
    expect(outcome.merges.map((m) => m.index)).toEqual([0, 4, 8]);
  });

  it('reports two sources for merges and one for slides', () => {
    const board = fromRows([
      [2, 2, 4, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const outcome = moveBoard(board, 'left');
    expect(outcome.sourcesByDestination[0]).toEqual([0, 1]); // merged pair
    expect(outcome.sourcesByDestination[1]).toEqual([2]); // slide
    expect(outcome.sourcesByDestination[2]).toBeNull();
    expect(outcome.sourcesByDestination[3]).toBeNull();
  });
});

describe('movement: invalid moves', () => {
  it('returns an identical board with moved=false when nothing can move', () => {
    const board = fromRows([
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [2, 4, 8, 16],
      [16, 8, 4, 2],
    ]);
    for (const direction of ['left', 'right', 'up', 'down'] as Direction[]) {
      const outcome = moveBoard(board, direction);
      expect(outcome.moved).toBe(false);
      expect(outcome.board).toEqual(board);
      expect(outcome.merges).toHaveLength(0);
    }
  });

  it('reports invalid when a single packed non-mergeable row cannot move left', () => {
    const board = fromRows([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const outcome = moveBoard(board, 'left');
    expect(outcome.moved).toBe(false);
    expect(outcome.board).toEqual(board);
  });

  it('does not mutate the input board', () => {
    const board = fromRows([
      [0, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const copy = [...board];
    moveBoard(board, 'right');
    expect(board).toEqual(copy);
  });
});
