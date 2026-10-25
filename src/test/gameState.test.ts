import { emptyPowers } from '../game/powers';
import { describe, expect, it } from 'vitest';
import type { Board, ComboState, Direction, EngineState, GameState, GameStats, RushState, Tile } from '../game/types';
import { gameReducer, createInitialEngineState } from '../game/reducer';
import { createNewGame } from '../game/initializeGame';
import { applyMoveToCombo } from '../game/rushMode';
import { isGameOver, hasAnyMoves } from '../game/gameOver';
import { BOARD_SIZE } from '../game/constants';

function fromRows(rows: number[][]): Board {
  return rows.flat();
}

function tilesFromBoard(board: Board, startId = 1): Tile[] {
  const tiles: Tile[] = [];
  let id = startId;
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) {
      tiles.push({ id: id++, value: board[i], row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE });
    }
  }
  return tiles;
}

function makeEngine(
  board: Board,
  gameOverrides: Partial<GameState> = {},
  statsOverrides: Partial<GameStats> = {},
): EngineState {
  const tiles = tilesFromBoard(board);
  const game: GameState = {
    board,
    tiles,
    score: 0,
    streak: 0,
    rush: { active: false, remaining: 0 },
    rngState: 12345,
    pendingValue: 2,
    nextTileId: tiles.length + 1,
    gameOver: false,
    canUndo: false,
    undoSnapshot: null,
    celebratedRecord: false,
    lastMove: null,
    powers: emptyPowers(),
    ...gameOverrides,
  };
  return {
    game,
    stats: { best: 0, highestTile: 0, gamesPlayed: 1, ...statsOverrides },
    prefs: { soundOn: true },
  };
}

const quietBoard = fromRows([
  [8, 32, 2, 4],
  [8, 64, 16, 32],
  [32, 128, 64, 8],
  [64, 256, 128, 16],
]);

/** Packed with no equal neighbors anywhere: every direction is an invalid move. */
const stuckBoard = fromRows([
  [2, 4, 8, 16],
  [16, 8, 4, 2],
  [2, 4, 8, 16],
  [16, 8, 4, 2],
]);

describe('combo streak and Rush Mode (pure transitions)', () => {
  const idle = { streak: 0, rush: { active: false, remaining: 0 } };

  it('increments the streak on merging moves', () => {
    expect(applyMoveToCombo(idle, true, true).streak).toBe(1);
    expect(applyMoveToCombo({ streak: 1, rush: idle.rush }, true, true).streak).toBe(2);
  });

  it('resets the streak after a valid move without merges', () => {
    expect(applyMoveToCombo({ streak: 2, rush: idle.rush }, true, false).streak).toBe(0);
  });

  it('leaves the streak unchanged on invalid moves', () => {
    expect(applyMoveToCombo({ streak: 2, rush: idle.rush }, false, true).streak).toBe(2);
    expect(applyMoveToCombo({ streak: 0, rush: idle.rush }, false, false).streak).toBe(0);
  });

  it('activates Rush Mode exactly when the streak reaches 3', () => {
    const afterThird = applyMoveToCombo({ streak: 2, rush: idle.rush }, true, true);
    expect(afterThird.rush).toEqual({ active: true, remaining: 3 });
    expect(afterThird.streak).toBe(0);

    const afterSecond = applyMoveToCombo({ streak: 1, rush: idle.rush }, true, true);
    expect(afterSecond.rush.active).toBe(false);
  });

  it('consumes one Rush move per valid move, merging or not', () => {
    const rush: RushState = { active: true, remaining: 3 };
    expect(applyMoveToCombo({ streak: 0, rush }, true, true).rush.remaining).toBe(2);
    expect(applyMoveToCombo({ streak: 0, rush }, true, false).rush.remaining).toBe(2);
  });

  it('does not consume a Rush move on invalid moves', () => {
    const rush: RushState = { active: true, remaining: 2 };
    const combo = applyMoveToCombo({ streak: 0, rush }, false, true);
    expect(combo.rush).toEqual({ active: true, remaining: 2 });
  });

  it('expires after exactly three valid moves', () => {
    let combo: ComboState = { streak: 0, rush: { active: true, remaining: 3 } };
    combo = applyMoveToCombo(combo, true, true);
    expect(combo.rush).toEqual({ active: true, remaining: 2 });
    combo = applyMoveToCombo(combo, true, false);
    expect(combo.rush).toEqual({ active: true, remaining: 1 });
    combo = applyMoveToCombo(combo, true, false);
    expect(combo.rush).toEqual({ active: false, remaining: 0 });
  });

  it('freezes the streak during Rush so it cannot retrigger', () => {
    let combo: ComboState = { streak: 0, rush: { active: true, remaining: 3 } };
    combo = applyMoveToCombo(combo, true, true);
    expect(combo.streak).toBe(0);
    combo = applyMoveToCombo(combo, true, true);
    expect(combo.streak).toBe(0);
    expect(combo.rush).toEqual({ active: true, remaining: 1 });
  });
});

describe('game state reducer: streak and Rush wiring', () => {
  it('increments the streak and awards points for a merging move', () => {
    const state = makeEngine(quietBoard);
    // Column 0 has [8,8,...]: moving down merges them into 16.
    const next = gameReducer(state, { type: 'move', direction: 'down' });
    expect(next.game.streak).toBe(1);
    expect(next.game.score).toBe(16);
    expect(next.game.lastMove?.mergedTileIds).toHaveLength(1);
  });

  it('resets the streak when a valid move does not merge', () => {
    const board = fromRows([
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const state = makeEngine(board, { streak: 2 });
    const next = gameReducer(state, { type: 'move', direction: 'left' });
    expect(next.game.streak).toBe(0);
  });

  it('leaves state untouched on invalid moves (same object reference)', () => {
    const state = makeEngine(stuckBoard, { streak: 2, rush: { active: true, remaining: 2 } });
    // stuckBoard is packed with no equal neighbors: all moves invalid.
    for (const direction of ['left', 'right', 'up', 'down'] as Direction[]) {
      const next = gameReducer(state, { type: 'move', direction });
      expect(next).toBe(state);
    }
  });

  it('activates Rush Mode after three consecutive merging moves and scores the trigger normally', () => {
    let state = makeEngine(quietBoard, { streak: 2, canUndo: false });
    // Third merge in a row: scored at 1x, then Rush activates.
    const next = gameReducer(state, { type: 'move', direction: 'down' });
    expect(next.game.score).toBe(16); // not doubled
    expect(next.game.rush).toEqual({ active: true, remaining: 3 });
    expect(next.game.lastMove?.rushActivated).toBe(true);
    expect(next.game.streak).toBe(0);
  });

  it('doubles merge points during Rush and consumes one move per valid swipe', () => {
    const state = makeEngine(quietBoard, { rush: { active: true, remaining: 3 } });
    const next = gameReducer(state, { type: 'move', direction: 'down' });
    expect(next.game.score).toBe(32); // 16 base x2
    expect(next.game.rush).toEqual({ active: true, remaining: 2 });
  });

  it('expires Rush after its third valid move and returns to normal scoring', () => {
    const slideBoard = fromRows([
      [0, 0, 0, 2],
      [0, 0, 0, 4],
      [0, 0, 0, 8],
      [0, 0, 0, 16],
    ]);
    // Rush with 1 move left: one more valid non-merging slide expires it.
    const state = makeEngine(slideBoard, { rush: { active: true, remaining: 1 } });
    const next = gameReducer(state, { type: 'move', direction: 'left' });
    expect(next.game.rush).toEqual({ active: false, remaining: 0 });
    expect(next.game.lastMove?.rushExpired).toBe(true);

    // A later merge scores normally again.
    const board = fromRows([
      [8, 32, 2, 4],
      [8, 64, 16, 32],
      [32, 128, 64, 8],
      [64, 256, 128, 16],
    ]);
    const after = gameReducer(
      { ...next, game: { ...next.game, board, tiles: tilesFromBoard(board) } },
      { type: 'move', direction: 'down' },
    );
    expect(after.game.score).toBe(next.game.score + 16);
  });

  it('does not consume Rush moves on invalid moves', () => {
    const state = makeEngine(stuckBoard, { rush: { active: true, remaining: 2 } });
    const next = gameReducer(state, { type: 'move', direction: 'up' }); // invalid on stuckBoard
    expect(next).toBe(state);
  });
});

describe('game state reducer: undo', () => {
  it('restores every relevant field from before the last successful move', () => {
    const board = fromRows([
      [8, 32, 2, 4],
      [8, 64, 16, 32],
      [32, 128, 64, 8],
      [64, 256, 128, 16],
    ]);
    const before = makeEngine(board, {
      score: 111,
      streak: 2,
      rush: { active: false, remaining: 0 },
      pendingValue: 4,
      rngState: 777,
      canUndo: true,
    });

    const moved = gameReducer(before, { type: 'move', direction: 'down' });
    expect(moved.game.score).toBe(111 + 16);
    expect(moved.game.canUndo).toBe(true);

    const undone = gameReducer(moved, { type: 'undo' });
    expect(undone.game.board).toEqual(before.game.board);
    expect(undone.game.tiles).toEqual(before.game.tiles);
    expect(undone.game.score).toBe(111);
    expect(undone.game.streak).toBe(2);
    expect(undone.game.rush).toEqual(before.game.rush);
    expect(undone.game.pendingValue).toBe(4);
    expect(undone.game.rngState).toBe(777);
    expect(undone.game.gameOver).toBe(false);
    expect(undone.game.canUndo).toBe(false);
    expect(undone.game.undoSnapshot).toBeNull();
    expect(undone.game.lastMove).toBeNull();
  });

  it('allows only one undo per game', () => {
    const state = makeEngine(quietBoard, { canUndo: false });
    const moved = gameReducer(state, { type: 'move', direction: 'down' });
    const undone = gameReducer(moved, { type: 'undo' });
    const undoneTwice = gameReducer(undone, { type: 'undo' });
    expect(undoneTwice).toBe(undone);
  });

  it('undo also restores the game-over flag', () => {
    const board = fromRows([
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [2, 4, 8, 32],
      [16, 8, 4, 32],
    ]);
    const state = makeEngine(board, { canUndo: true, pendingValue: 4 });
    const moved = gameReducer(state, { type: 'move', direction: 'down' });
    expect(moved.game.gameOver).toBe(true);
    const undone = gameReducer(moved, { type: 'undo' });
    expect(undone.game.gameOver).toBe(false);
    expect(hasAnyMoves(undone.game.board)).toBe(true);
  });

  it('invalid moves do not burn the undo snapshot', () => {
    const state = makeEngine(quietBoard, { canUndo: true });
    const moved = gameReducer(state, { type: 'move', direction: 'down' });
    const stalled = gameReducer(moved, { type: 'move', direction: 'up' }); // invalid after spawn fills the gap
    const undone = gameReducer(stalled, { type: 'undo' });
    expect(undone.game.board).toEqual(state.game.board);
  });
});

describe('game-over detection', () => {
  it('is not over while empty cells remain', () => {
    expect(isGameOver(fromRows([
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [2, 4, 8, 16],
      [16, 8, 4, 0],
    ]))).toBe(false);
  });

  it('is not over on a full board with an adjacent equal pair', () => {
    expect(isGameOver(fromRows([
      [2, 4, 8, 16],
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [8, 16, 32, 4],
    ]))).toBe(false); // column 0 starts 2,2
  });

  it('is over on a full board with no adjacent equal tiles', () => {
    expect(isGameOver(fromRows([
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [2, 4, 8, 16],
      [16, 8, 4, 32],
    ]))).toBe(true);
  });

  it('declares game over through the reducer after the final merge and forced spawn', () => {
    // Down merges the 32 pair in column 3, leaving exactly one empty cell; the
    // forced spawn (4) completes a board with no legal moves.
    const board = fromRows([
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [2, 4, 8, 32],
      [16, 8, 4, 32],
    ]);
    const state = makeEngine(board, { pendingValue: 4 });
    const next = gameReducer(state, { type: 'move', direction: 'down' });
    expect(next.game.gameOver).toBe(true);
    expect(next.game.board).toEqual(fromRows([
      [2, 4, 8, 4],
      [16, 8, 4, 16],
      [2, 4, 8, 2],
      [16, 8, 4, 64],
    ]));
  });

  it('does not declare game over on a full board that can still merge', () => {
    const board = fromRows([
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [2, 4, 8, 16],
      [16, 16, 4, 2],
    ]);
    const state = makeEngine(board);
    const next = gameReducer(state, { type: 'move', direction: 'left' });
    expect(next.game.gameOver).toBe(false);
  });

  it('ignores move actions once the game is over', () => {
    const board = fromRows([
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [2, 4, 8, 16],
      [16, 8, 4, 32],
    ]);
    const state = makeEngine(board, { gameOver: true });
    const next = gameReducer(state, { type: 'move', direction: 'left' });
    expect(next).toBe(state);
  });
});

describe('restart and stats', () => {
  it('restart resets the game but keeps best score and increments games played', () => {
    const state = makeEngine(quietBoard, { score: 500 }, { best: 500, highestTile: 128, gamesPlayed: 3 });
    const next = gameReducer(state, { type: 'restart', seed: 424242 });
    expect(next.game.score).toBe(0);
    expect(next.game.streak).toBe(0);
    expect(next.game.rush).toEqual({ active: false, remaining: 0 });
    expect(next.game.gameOver).toBe(false);
    expect(next.game.canUndo).toBe(true);
    expect(next.game.undoSnapshot).toBeNull();
    expect(next.game.lastMove).toBeNull();
    expect(next.stats.best).toBe(500);
    expect(next.stats.highestTile).toBe(128);
    expect(next.stats.gamesPlayed).toBe(4);
    const nonZero = next.game.board.filter((cell) => cell !== 0);
    expect(nonZero).toHaveLength(2);
    expect(nonZero.every((value) => value === 2)).toBe(true);
  });

  it('updates best score immediately when a move sets a new record', () => {
    const state = makeEngine(quietBoard, { score: 0 }, { best: 10 });
    const next = gameReducer(state, { type: 'move', direction: 'down' });
    expect(next.game.score).toBe(16);
    expect(next.stats.best).toBe(16);
    expect(next.game.lastMove?.newRecord).toBe(true);
  });

  it('flags a new record only once per game', () => {
    const state = makeEngine(quietBoard, { celebratedRecord: true }, { best: 10 });
    const next = gameReducer(state, { type: 'move', direction: 'down' });
    expect(next.stats.best).toBe(16);
    expect(next.game.lastMove?.newRecord).toBe(false);
  });

  it('tracks the highest tile reached', () => {
    const board = fromRows([
      [512, 32, 2, 4],
      [512, 64, 16, 32],
      [32, 128, 64, 8],
      [64, 256, 128, 16],
    ]);
    const state = makeEngine(board, {}, { highestTile: 256 });
    const next = gameReducer(state, { type: 'move', direction: 'down' });
    expect(next.stats.highestTile).toBe(1024);
  });
});

describe('determinism', () => {
  it('produces identical starting games for the same seed', () => {
    expect(createNewGame(1234)).toEqual(createNewGame(1234));
    expect(createNewGame(1234).board).not.toEqual(createNewGame(1235).board);
  });

  it('replays identically for the same seed and move sequence', () => {
    const directions: Direction[] = ['left', 'up', 'right', 'down'];
    const play = () => {
      let state = createInitialEngineState(987654);
      for (let i = 0; i < 40; i++) {
        state = gameReducer(state, { type: 'move', direction: directions[i % 4] });
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});
