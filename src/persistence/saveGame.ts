/**
 * Versioned save format with strict validation and a safe reset strategy.
 *
 * Format: { version, game, stats, prefs } under SAVE_KEY.
 * - Malformed JSON, wrong shapes, or inconsistent boards are discarded; the
 *   player simply starts a fresh game while valid stats/prefs are kept.
 * - A save with an unknown (future) version drops the game state but keeps
 *   stats/prefs when they still validate - best score survives upgrades.
 * - Writes are best-effort; storage failures never bubble into gameplay.
 */

import type { EngineState, GameState, GamePrefs, GameStats, PowerState, RushState, Tile } from '../game/types';
import {
  BOARD_SIZE,
  ENERGY_COST_MAX,
  MAX_RESCUES,
  REVIVE_RESCUES,
  POWER_IDS,
  POWER_MAX_CHARGES,
  SAVE_KEY,
  SAVE_VERSION,
} from '../game/constants';
import { startingPowers } from '../game/powers';
import type { SafeStorage } from './storage';

export interface SerializedGame {
  board: number[];
  tiles: Tile[];
  score: number;
  streak: number;
  rush: RushState;
  rngState: number;
  pendingValue: 2 | 4;
  nextTileId: number;
  gameOver: boolean;
  canUndo: boolean;
  undoSnapshot: SerializedGame | null;
  celebratedRecord: boolean;
  /** Added after v1 shipped; older saves without it get starting charges. */
  powers?: PowerState;
  /** Added with the rescue limit; older saves default to 0. */
  rescuesUsed?: number;
  powerBonus?: number;
  /** Added with the ad revive; older saves default to false. */
  lastChance?: boolean;
  reviveUsed?: boolean;
}

export interface SaveData {
  version: number;
  game: SerializedGame | null;
  stats: GameStats;
  prefs: GamePrefs;
}

export interface LoadResult {
  /** Valid restored game, or null when none could be recovered. */
  game: GameState | null;
  stats: GameStats;
  prefs: GamePrefs;
}

const DEFAULT_STATS: GameStats = { best: 0, highestTile: 0, gamesPlayed: 0 };
const DEFAULT_PREFS: GamePrefs = { soundOn: true };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

function isTileValue(value: unknown): boolean {
  return (
    isIntegerInRange(value, 2, 1_048_576) && (value & (value - 1)) === 0
  );
}

function isSpawnValue(value: unknown): value is 2 | 4 {
  return value === 2 || value === 4;
}

function validateBoard(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE * BOARD_SIZE) return false;
  return value.every((cell) => cell === 0 || isTileValue(cell));
}

function validateTiles(value: unknown, board: number[]): value is Tile[] {
  if (!Array.isArray(value)) return false;
  const seenIds = new Set<number>();
  const seenCells = new Set<number>();
  for (const tile of value) {
    if (!isObject(tile)) return false;
    if (!isIntegerInRange(tile.id, 1, Number.MAX_SAFE_INTEGER) || seenIds.has(tile.id)) {
      return false;
    }
    if (!isTileValue(tile.value)) return false;
    if (!isIntegerInRange(tile.row, 0, BOARD_SIZE - 1)) return false;
    if (!isIntegerInRange(tile.col, 0, BOARD_SIZE - 1)) return false;
    const cell = tile.row * BOARD_SIZE + tile.col;
    if (seenCells.has(cell) || board[cell] !== tile.value) return false;
    seenIds.add(tile.id);
    seenCells.add(cell);
  }
  // Every non-empty board cell must have exactly one tile.
  const nonEmpty = board.filter((cell) => cell !== 0).length;
  if (nonEmpty !== value.length) return false;
  return true;
}

function validateRush(value: unknown): value is RushState {
  if (!isObject(value)) return false;
  if (typeof value.active !== 'boolean') return false;
  if (!isIntegerInRange(value.remaining, 0, 10)) return false;
  if (value.active !== (value.remaining > 0)) return false;
  return true;
}

function validatePowers(value: unknown): value is PowerState {
  if (!isObject(value) || !isObject(value.charges)) return false;
  const charges = value.charges;
  if (!POWER_IDS.every((id) => isIntegerInRange(charges[id], 0, POWER_MAX_CHARGES))) return false;
  // `earned` arrived after powers did; treat a missing one as 0.
  if (value.earned !== undefined && !isIntegerInRange(value.earned, 0, Number.MAX_SAFE_INTEGER)) {
    return false;
  }
  return isIntegerInRange(value.energy, 0, ENERGY_COST_MAX - 1);
}

function validateGameState(value: unknown): SerializedGame | null {
  if (!isObject(value)) return null;
  if (!validateBoard(value.board)) return null;
  const board = value.board as number[];
  if (!validateTiles(value.tiles, board)) return null;
  if (!isIntegerInRange(value.score, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!isIntegerInRange(value.streak, 0, 10)) return null;
  if (!validateRush(value.rush)) return null;
  if (!isFiniteNumber(value.rngState)) return null;
  if (!isSpawnValue(value.pendingValue)) return null;
  if (!isIntegerInRange(value.nextTileId, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (typeof value.gameOver !== 'boolean') return null;
  if (typeof value.canUndo !== 'boolean') return null;
  if (typeof value.celebratedRecord !== 'boolean') return null;
  if (value.powers !== undefined && !validatePowers(value.powers)) return null;
  if (value.rescuesUsed !== undefined && !isIntegerInRange(value.rescuesUsed, 0, MAX_RESCUES + REVIVE_RESCUES)) return null;
  if (value.lastChance !== undefined && typeof value.lastChance !== 'boolean') return null;
  if (value.reviveUsed !== undefined && typeof value.reviveUsed !== 'boolean') return null;
  if (value.lastChance === true && value.gameOver === true) return null;
  if (value.powerBonus !== undefined && !isIntegerInRange(value.powerBonus, 0, Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  const maxTileId = (value.tiles as Tile[]).reduce((max, tile) => Math.max(max, tile.id), 0);
  if (value.nextTileId <= maxTileId) return null;

  // A snapshot may only exist while undo is still available; a fresh game
  // legitimately has canUndo true with no snapshot yet. JSON round-trips drop
  // absent fields, so treat undefined and null identically here.
  if (value.undoSnapshot != null) {
    const snapshot = validateGameState(value.undoSnapshot);
    if (snapshot === null) return null;
    if (!value.canUndo) return null;
  }

  return value as unknown as SerializedGame;
}

function validateStats(value: unknown): GameStats | null {
  if (!isObject(value)) return null;
  if (!isIntegerInRange(value.best, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!isIntegerInRange(value.highestTile, 0, 1_048_576)) return null;
  if (!isIntegerInRange(value.gamesPlayed, 0, Number.MAX_SAFE_INTEGER)) return null;
  return { best: value.best, highestTile: value.highestTile, gamesPlayed: value.gamesPlayed };
}

function validatePrefs(value: unknown): GamePrefs | null {
  if (!isObject(value)) return null;
  if (typeof value.soundOn !== 'boolean') return null;
  return { soundOn: value.soundOn };
}

function withEarned(powers: PowerState): PowerState {
  // Drop charges of powers that no longer exist (the retired Upgrade).
  const charges = Object.fromEntries(
    POWER_IDS.map((id) => [id, powers.charges[id]]),
  ) as PowerState['charges'];
  return { ...powers, charges, earned: powers.earned ?? 0 };
}

function toGameState(saved: SerializedGame): GameState {
  const snapshot = saved.undoSnapshot;
  return {
    board: saved.board,
    tiles: saved.tiles,
    score: saved.score,
    streak: saved.streak,
    rush: saved.rush,
    rngState: saved.rngState,
    pendingValue: saved.pendingValue,
    nextTileId: saved.nextTileId,
    gameOver: saved.gameOver,
    canUndo: saved.canUndo,
    undoSnapshot: snapshot
      ? {
          board: snapshot.board,
          tiles: snapshot.tiles,
          score: snapshot.score,
          streak: snapshot.streak,
          rush: snapshot.rush,
          rngState: snapshot.rngState,
          pendingValue: snapshot.pendingValue,
          nextTileId: snapshot.nextTileId,
          gameOver: snapshot.gameOver,
          celebratedRecord: snapshot.celebratedRecord,
          powers: snapshot.powers ? withEarned(snapshot.powers) : startingPowers(),
          rescuesUsed: snapshot.rescuesUsed ?? 0,
          powerBonus: snapshot.powerBonus ?? 0,
          lastChance: snapshot.lastChance ?? false,
          reviveUsed: snapshot.reviveUsed ?? false,
        }
      : null,
    powers: saved.powers ? withEarned(saved.powers) : startingPowers(),
    rescuesUsed: saved.rescuesUsed ?? 0,
    powerBonus: saved.powerBonus ?? 0,
    lastChance: saved.lastChance ?? false,
    reviveUsed: saved.reviveUsed ?? false,
    celebratedRecord: saved.celebratedRecord,
    lastMove: null,
  };
}

/** Serializes an engine state for saving. Strips transient render hints. */
export function serializeEngineState(state: EngineState): SaveData {
  const serializeGame = (game: GameState): SerializedGame => ({
    board: game.board,
    tiles: game.tiles,
    score: game.score,
    streak: game.streak,
    rush: game.rush,
    rngState: game.rngState,
    pendingValue: game.pendingValue,
    nextTileId: game.nextTileId,
    gameOver: game.gameOver,
    canUndo: game.canUndo,
    undoSnapshot: game.undoSnapshot
      ? ({
          board: game.undoSnapshot.board,
          tiles: game.undoSnapshot.tiles,
          score: game.undoSnapshot.score,
          streak: game.undoSnapshot.streak,
          rush: game.undoSnapshot.rush,
          rngState: game.undoSnapshot.rngState,
          pendingValue: game.undoSnapshot.pendingValue,
          nextTileId: game.undoSnapshot.nextTileId,
          gameOver: game.undoSnapshot.gameOver,
          celebratedRecord: game.undoSnapshot.celebratedRecord,
          powers: game.undoSnapshot.powers,
          rescuesUsed: game.undoSnapshot.rescuesUsed,
          powerBonus: game.undoSnapshot.powerBonus,
          lastChance: game.undoSnapshot.lastChance,
          reviveUsed: game.undoSnapshot.reviveUsed,
          // Snapshots only exist while undo is still available; the field is
          // required by the save validator but unused when restoring.
          canUndo: true,
        } as SerializedGame)
      : null,
    celebratedRecord: game.celebratedRecord,
    powers: game.powers,
    rescuesUsed: game.rescuesUsed,
    powerBonus: game.powerBonus,
    lastChance: game.lastChance,
    reviveUsed: game.reviveUsed,
  });

  return {
    version: SAVE_VERSION,
    game: serializeGame(state.game),
    stats: state.stats,
    prefs: state.prefs,
  };
}

/** Best-effort save. Never throws, even when storage is unavailable. */
export function saveGame(storage: SafeStorage | null, state: EngineState): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serializeEngineState(state)));
  } catch {
    // JSON.stringify of plain state cannot throw here; swallow anyway.
  }
}

/** Clears the save (used by tests). */
export function clearSave(storage: SafeStorage | null): void {
  if (!storage) return;
  storage.removeItem(SAVE_KEY);
}

/**
 * Loads and validates the save. Always returns usable stats/prefs; returns
 * game === null whenever the saved game cannot be trusted.
 */
export function loadGame(storage: SafeStorage | null): LoadResult {
  if (!storage) return { game: null, stats: DEFAULT_STATS, prefs: DEFAULT_PREFS };

  const raw = storage.getItem(SAVE_KEY);
  if (raw === null) return { game: null, stats: DEFAULT_STATS, prefs: DEFAULT_PREFS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { game: null, stats: DEFAULT_STATS, prefs: DEFAULT_PREFS };
  }
  if (!isObject(parsed)) {
    return { game: null, stats: DEFAULT_STATS, prefs: DEFAULT_PREFS };
  }

  const stats = validateStats(parsed.stats) ?? DEFAULT_STATS;
  const prefs = validatePrefs(parsed.prefs) ?? DEFAULT_PREFS;

  // Unsupported save version: drop the game, keep stats/prefs when valid.
  if (!isFiniteNumber(parsed.version) || parsed.version !== SAVE_VERSION) {
    return { game: null, stats, prefs };
  }

  if (parsed.game === null) {
    return { game: null, stats, prefs };
  }

  const game = validateGameState(parsed.game);
  if (game === null) {
    return { game: null, stats, prefs };
  }
  return { game: toGameState(game), stats, prefs };
}
