/** Tunable constants for game rules, scoring, and persistence. */

export const BOARD_SIZE = 4;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

/** Probability that a spawned tile is a 2 (otherwise a 4). */
export const SPAWN_TWO_PROBABILITY = 0.9;

/** Consecutive merge moves needed to trigger Rush Mode. */
export const RUSH_TRIGGER_STREAK = 3;

/** Number of valid moves Rush Mode lasts. */
export const RUSH_MOVES = 3;

/** Score multiplier applied while Rush Mode is active. */
export const RUSH_MULTIPLIER = 2;

/** Chain bonus formula: floor(CHAIN_BASE * (level-1) * highestValue / CHAIN_DIVISOR). */
export const CHAIN_BONUS_BASE = 10;
export const CHAIN_BONUS_DIVISOR = 4;

export const UNDOS_PER_GAME = 1;

/** Power-ups: display order, starting/maximum charges, and energy cost. */
export const POWER_IDS = ['bomb', 'upgrade', 'shuffle', 'sweep'] as const;
export const POWER_START_CHARGES = { bomb: 1, upgrade: 1, shuffle: 0, sweep: 0 } as const;
export const POWER_MAX_CHARGES = 3;
/**
 * Energy cost of the next charge escalates with every charge earned this
 * game: min(BASE + STEP * earned, MAX). Each merge gives 1 energy (2 during
 * Rush). Tuned with scripts/simulate-balance.ts.
 */
export const ENERGY_COST_BASE = 10;
export const ENERGY_COST_STEP = 20;
export const ENERGY_COST_MAX = 100;
/** Upgrade never pushes a tile past this value (save-format ceiling). */
export const MAX_TILE_VALUE = 1_048_576;

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'merge-rush.save.v1';

/** Small starting value set for a brand-new game. */
export const STARTING_TILE_COUNT = 2;
export const STARTING_TILE_VALUE = 2;
