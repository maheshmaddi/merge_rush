/**
 * The game engine reducer. All state transitions are pure and immutable:
 * board movement, tile identity for animations, scoring, combo/Rush Mode,
 * spawning, game-over detection, one-shot undo, restart, sound, and stats.
 *
 * Transient render hints (lastMove) live here but are stripped by the
 * persistence layer - animation never influences game logic.
 */

import type {
  Direction,
  EngineState,
  GameState,
  LastMoveInfo,
  MergeEvent,
  PowerId,
  Tile,
  UndoSnapshot,
} from './types';
import {
  BOARD_SIZE,
  SPAWN_TWO_PROBABILITY,
  UNDOS_PER_GAME,
} from './constants';
import { createNewGame } from './initializeGame';
import { moveBoard } from './moveBoard';
import { scoreForMerges } from './calculateScore';
import { applyMoveToCombo } from './rushMode';
import { addEnergy, applyPowerToBoard, canUsePower, isGameOverWithPowers } from './powers';
import { drawSpawnValue, pickEmptyCell } from './random';

export type GameAction =
  | { type: 'move'; direction: Direction }
  | { type: 'power'; power: PowerId; cell?: number }
  | { type: 'undo' }
  | { type: 'restart'; seed?: number }
  | { type: 'toggleSound' }
  | { type: 'hydrate'; state: EngineState };

/** A brand-new engine state; the first game counts as played. */
export function createInitialEngineState(seed?: number): EngineState {
  return {
    game: createNewGame(seed),
    stats: { best: 0, highestTile: 0, gamesPlayed: 1 },
    prefs: { soundOn: true },
  };
}

function snapshotForUndo(game: GameState): UndoSnapshot {
  return {
    board: game.board,
    tiles: game.tiles,
    score: game.score,
    streak: game.streak,
    rush: game.rush,
    rngState: game.rngState,
    pendingValue: game.pendingValue,
    nextTileId: game.nextTileId,
    gameOver: game.gameOver,
    celebratedRecord: game.celebratedRecord,
    powers: game.powers,
  };
}

function applyMove(state: EngineState, direction: Direction): EngineState {
  const game = state.game;
  if (game.gameOver) return state;

  const outcome = moveBoard(game.board, direction);
  if (!outcome.moved) return state; // invalid move: board, score, streak, rush untouched

  const moveScore = scoreForMerges(outcome.merges, game.rush.active);
  const combo = applyMoveToCombo(
    { streak: game.streak, rush: game.rush },
    true,
    outcome.merges.length > 0,
  );

  // Map board changes back onto stable tile identities.
  const tileAtCell = new Map<number, Tile>();
  for (const tile of game.tiles) {
    tileAtCell.set(tile.row * BOARD_SIZE + tile.col, tile);
  }

  const mergeByDestination = new Map<number, MergeEvent>();
  for (const merge of outcome.merges) {
    mergeByDestination.set(merge.index, merge);
  }

  const newTiles: Tile[] = [];
  const mergedTileIds: number[] = [];
  const ghosts: Tile[] = [];
  const mergeCells: Array<{ row: number; col: number; value: number }> = [];

  for (let destination = 0; destination < outcome.sourcesByDestination.length; destination++) {
    const sources = outcome.sourcesByDestination[destination];
    if (sources === null) continue;
    const row = Math.floor(destination / BOARD_SIZE);
    const col = destination % BOARD_SIZE;
    const survivor = tileAtCell.get(sources[0]);
    if (survivor === undefined) continue; // unreachable with consistent state
    if (sources.length === 2) {
      const absorbed = tileAtCell.get(sources[1]);
      newTiles.push({ id: survivor.id, value: outcome.board[destination], row, col });
      mergedTileIds.push(survivor.id);
      if (absorbed !== undefined) {
        ghosts.push({ id: absorbed.id, value: absorbed.value, row, col });
      }
      mergeCells.push({ row, col, value: outcome.board[destination] });
    } else {
      newTiles.push({ id: survivor.id, value: outcome.board[destination], row, col });
    }
  }

  // Spawn the pending tile, then draw the next pending value for the preview.
  const boardAfterMove = outcome.board;
  const spawn = pickEmptyCell(boardAfterMove, game.rngState);
  const nextPending = drawSpawnValue(spawn.state, SPAWN_TWO_PROBABILITY);
  const spawnedTile: Tile = {
    id: game.nextTileId,
    value: game.pendingValue,
    row: Math.floor(spawn.value / BOARD_SIZE),
    col: spawn.value % BOARD_SIZE,
  };
  newTiles.push(spawnedTile);

  const boardWithSpawn = [...boardAfterMove];
  boardWithSpawn[spawn.value] = spawnedTile.value;

  const energy = addEnergy(
    game.powers,
    outcome.merges.length * (game.rush.active ? 2 : 1),
  );

  const newScore = game.score + moveScore.total;
  const gameOver = isGameOverWithPowers(boardWithSpawn, energy.powers);

  const previousBest = state.stats.best;
  const newBest = Math.max(previousBest, newScore);
  const newRecord = previousBest > 0 && newScore > previousBest && !game.celebratedRecord;

  const maxTileValue = newTiles.reduce((max, tile) => Math.max(max, tile.value), 0);

  const lastMove: LastMoveInfo = {
    mergedTileIds,
    ghosts,
    spawnedTileId: spawnedTile.id,
    score: moveScore,
    mergeCells,
    newRecord,
    rushActivated: combo.rush.active && !game.rush.active,
    rushExpired: !combo.rush.active && game.rush.active,
    powerEarned: energy.earned,
    power: null,
  };

  return {
    game: {
      board: boardWithSpawn,
      tiles: newTiles,
      score: newScore,
      streak: combo.streak,
      rush: combo.rush,
      rngState: nextPending.state,
      pendingValue: nextPending.value,
      nextTileId: game.nextTileId + 1,
      gameOver,
      canUndo: game.canUndo && UNDOS_PER_GAME > 0,
      undoSnapshot: game.canUndo ? snapshotForUndo(game) : null,
      powers: energy.powers,
      celebratedRecord: game.celebratedRecord || newRecord,
      lastMove,
    },
    stats: {
      best: newBest,
      highestTile: Math.max(state.stats.highestTile, maxTileValue),
      gamesPlayed: state.stats.gamesPlayed,
    },
    prefs: state.prefs,
  };
}

function applyUndo(state: EngineState): EngineState {
  const game = state.game;
  if (!game.canUndo || game.undoSnapshot === null) return state;
  const snapshot = game.undoSnapshot;
  return {
    ...state,
    game: {
      board: snapshot.board,
      tiles: snapshot.tiles,
      score: snapshot.score,
      streak: snapshot.streak,
      rush: snapshot.rush,
      rngState: snapshot.rngState,
      pendingValue: snapshot.pendingValue,
      nextTileId: snapshot.nextTileId,
      gameOver: snapshot.gameOver,
      canUndo: false,
      undoSnapshot: null,
      powers: snapshot.powers,
      celebratedRecord: snapshot.celebratedRecord,
      lastMove: null,
    },
  };
}

function applyPower(state: EngineState, power: PowerId, cell?: number): EngineState {
  const game = state.game;
  if (!canUsePower(game, power, cell)) return state;

  const result = applyPowerToBoard(game, power, cell);
  const powers = {
    ...game.powers,
    charges: { ...game.powers.charges, [power]: game.powers.charges[power] - 1 },
  };
  const maxTileValue = result.tiles.reduce((max, tile) => Math.max(max, tile.value), 0);

  const lastMove: LastMoveInfo = {
    mergedTileIds: power === 'upgrade' ? result.tiles.filter((tile) => tile.row * BOARD_SIZE + tile.col === cell).map((tile) => tile.id) : [],
    ghosts: result.removed,
    spawnedTileId: -1,
    score: { base: 0, chainBonus: 0, multiplier: 1, total: 0 },
    mergeCells: [],
    newRecord: false,
    rushActivated: false,
    rushExpired: false,
    powerEarned: null,
    power: { id: power, cells: result.cells },
  };

  return {
    ...state,
    game: {
      ...game,
      board: result.board,
      tiles: result.tiles,
      rngState: result.rngState,
      powers,
      gameOver: isGameOverWithPowers(result.board, powers),
      canUndo: game.canUndo && UNDOS_PER_GAME > 0,
      undoSnapshot: game.canUndo ? snapshotForUndo(game) : null,
      lastMove,
    },
    stats: { ...state.stats, highestTile: Math.max(state.stats.highestTile, maxTileValue) },
  };
}

function applyRestart(state: EngineState, seed?: number): EngineState {
  return {
    game: createNewGame(seed),
    stats: {
      ...state.stats,
      gamesPlayed: state.stats.gamesPlayed + 1,
    },
    prefs: state.prefs,
  };
}

export function gameReducer(state: EngineState, action: GameAction): EngineState {
  switch (action.type) {
    case 'move':
      return applyMove(state, action.direction);
    case 'power':
      return applyPower(state, action.power, action.cell);
    case 'undo':
      return applyUndo(state);
    case 'restart':
      return applyRestart(state, action.seed);
    case 'toggleSound':
      return { ...state, prefs: { ...state.prefs, soundOn: !state.prefs.soundOn } };
    case 'hydrate':
      return action.state;
    default:
      return state;
  }
}
