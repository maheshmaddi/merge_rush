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
  PowerState,
  Tile,
  UndoSnapshot,
} from './types';
import {
  BOARD_SIZE,
  POWER_MAX_CHARGES,
  REVIVE_BOMBS,
  SPAWN_TWO_PROBABILITY,
  UNDOS_PER_GAME,
} from './constants';
import { createNewGame } from './initializeGame';
import { moveBoard } from './moveBoard';
import { scoreForMerges } from './calculateScore';
import { applyMoveToCombo } from './rushMode';
import { hasAnyMoves } from './gameOver';
import {
  addEnergy,
  applyPowerToBoard,
  canUsePower,
  cashOutCharges,
  gameStatus,
} from './powers';
import { drawSpawnValue, pickEmptyCell } from './random';

export type GameAction =
  | { type: 'move'; direction: Direction }
  | { type: 'power'; power: PowerId; cell?: number }
  | { type: 'revive' }
  | { type: 'declineRevive' }
  | { type: 'undo' }
  | { type: 'restart'; seed?: number; bonus?: PowerId }
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
    rescuesUsed: game.rescuesUsed,
    powerBonus: game.powerBonus,
    lastChance: game.lastChance,
    reviveUsed: game.reviveUsed,
  };
}

/** On the move that ends the game, unspent charges become bonus points. */
function settleGameOver(gameOver: boolean, powers: PowerState): { powers: PowerState; bonus: number } {
  return gameOver ? cashOutCharges(powers) : { powers, bonus: 0 };
}

function applyMove(state: EngineState, direction: Direction): EngineState {
  const game = state.game;
  if (game.gameOver || game.lastChance) return state;

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

  const status = gameStatus(boardWithSpawn, energy.powers, game.rescuesUsed, game.reviveUsed);
  const gameOver = status === 'over';
  const settled = settleGameOver(gameOver, energy.powers);
  const newScore = game.score + moveScore.total + settled.bonus;

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
    rescue: false,
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
      powers: settled.powers,
      rescuesUsed: game.rescuesUsed,
      powerBonus: settled.bonus,
      lastChance: status === 'lastChance',
      reviveUsed: game.reviveUsed,
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
      rescuesUsed: snapshot.rescuesUsed,
      powerBonus: snapshot.powerBonus,
      lastChance: snapshot.lastChance,
      // A revive stays spent through undo: one per game, however you got there.
      reviveUsed: game.reviveUsed,
      celebratedRecord: snapshot.celebratedRecord,
      lastMove: null,
    },
  };
}

function applyPower(state: EngineState, power: PowerId, cell?: number): EngineState {
  const game = state.game;
  if (!canUsePower(game, power, cell)) return state;

  const rescue = !hasAnyMoves(game.board);
  const rescuesUsed = game.rescuesUsed + (rescue ? 1 : 0);
  const result = applyPowerToBoard(game, power, cell);
  const spent = {
    ...game.powers,
    charges: { ...game.powers.charges, [power]: game.powers.charges[power] - 1 },
  };
  const status = gameStatus(result.board, spent, rescuesUsed, game.reviveUsed);
  const gameOver = status === 'over';
  const settled = settleGameOver(gameOver, spent);
  const score = game.score + settled.bonus;
  const newRecord = state.stats.best > 0 && score > state.stats.best && !game.celebratedRecord;
  const maxTileValue = result.tiles.reduce((max, tile) => Math.max(max, tile.value), 0);

  const lastMove: LastMoveInfo = {
    mergedTileIds: power === 'upgrade' ? result.tiles.filter((tile) => tile.row * BOARD_SIZE + tile.col === cell).map((tile) => tile.id) : [],
    ghosts: result.removed,
    spawnedTileId: -1,
    score: { base: 0, chainBonus: 0, multiplier: 1, total: 0 },
    mergeCells: [],
    newRecord,
    rushActivated: false,
    rushExpired: false,
    powerEarned: null,
    power: { id: power, cells: result.cells },
    rescue,
  };

  return {
    ...state,
    game: {
      ...game,
      board: result.board,
      tiles: result.tiles,
      rngState: result.rngState,
      score,
      powers: settled.powers,
      rescuesUsed,
      powerBonus: settled.bonus,
      lastChance: status === 'lastChance',
      gameOver,
      celebratedRecord: game.celebratedRecord || newRecord,
      canUndo: game.canUndo && UNDOS_PER_GAME > 0,
      undoSnapshot: game.canUndo ? snapshotForUndo(game) : null,
      lastMove,
    },
    stats: {
      ...state.stats,
      best: Math.max(state.stats.best, score),
      highestTile: Math.max(state.stats.highestTile, maxTileValue),
    },
  };
}

/** Revive a game paused on its last chance: +1 rescue and a Bomb charge. */
function applyRevive(state: EngineState): EngineState {
  const game = state.game;
  if (!game.lastChance) return state;
  return {
    ...state,
    game: {
      ...game,
      lastChance: false,
      reviveUsed: true,
      powers: {
        ...game.powers,
        charges: {
          ...game.powers.charges,
          bomb: Math.min(POWER_MAX_CHARGES, game.powers.charges.bomb + REVIVE_BOMBS),
        },
      },
      lastMove: null,
    },
  };
}

/** Turn the revive down: the game ends and unspent charges are cashed in. */
function applyDeclineRevive(state: EngineState): EngineState {
  const game = state.game;
  if (!game.lastChance) return state;
  const settled = settleGameOver(true, game.powers);
  const score = game.score + settled.bonus;
  const newRecord = state.stats.best > 0 && score > state.stats.best && !game.celebratedRecord;
  return {
    ...state,
    game: {
      ...game,
      lastChance: false,
      gameOver: true,
      celebratedRecord: game.celebratedRecord || newRecord,
      score,
      powers: settled.powers,
      powerBonus: settled.bonus,
      lastMove: null,
    },
    stats: { ...state.stats, best: Math.max(state.stats.best, score) },
  };
}

function applyRestart(state: EngineState, seed?: number, bonus?: PowerId): EngineState {
  const game = createNewGame(seed);
  return {
    game:
      bonus === undefined
        ? game
        : {
            ...game,
            powers: {
              ...game.powers,
              charges: {
                ...game.powers.charges,
                [bonus]: Math.min(POWER_MAX_CHARGES, game.powers.charges[bonus] + 1),
              },
            },
          },
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
    case 'revive':
      return applyRevive(state);
    case 'declineRevive':
      return applyDeclineRevive(state);
    case 'undo':
      return applyUndo(state);
    case 'restart':
      return applyRestart(state, action.seed, action.bonus);
    case 'toggleSound':
      return { ...state, prefs: { ...state.prefs, soundOn: !state.prefs.soundOn } };
    case 'hydrate':
      return action.state;
    default:
      return state;
  }
}
