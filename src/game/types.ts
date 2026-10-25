/** Core game types. Pure data structures shared by logic, persistence, and UI. */

/** 4x4 board flattened row-major. 0 = empty cell, otherwise a power of two. */
export type Board = number[];

export type Direction = 'up' | 'down' | 'left' | 'right';

/** A rendered tile with a stable identity used for React keys and animations. */
export interface Tile {
  id: number;
  value: number;
  /** Row index 0..3. */
  row: number;
  /** Column index 0..3. */
  col: number;
}

/** One merge event, in deterministic resolution order (chain level = position + 1). */
export interface MergeEvent {
  /** Value of the resulting tile. */
  value: number;
  /** Destination cell index of the merged tile. */
  index: number;
  /** The two source cell indices; sources[0] is the surviving tile. */
  sources: [number, number];
}

/** How tiles were rearranged by a move, expressed per destination cell. */
export interface MoveOutcome {
  board: Board;
  /** Whether the board changed at all (false = invalid move). */
  moved: boolean;
  /** Merge events in resolution order; chain level is position + 1. */
  merges: MergeEvent[];
  /**
   * For each of the 16 destination cells: the source cell indices that ended
   * up there. Length 1 = slide, length 2 = merge (first source survives).
   * null = destination stays empty.
   */
  sourcesByDestination: ReadonlyArray<number[] | null>;
}

export interface MoveScore {
  /** Sum of resulting merge tile values. */
  base: number;
  /** Chain bonus, only awarded for multi-merge moves. */
  chainBonus: number;
  /** 1 normally, 2 while Rush Mode is active. */
  multiplier: number;
  total: number;
}

export interface RushState {
  active: boolean;
  /** Valid moves remaining while active. */
  remaining: number;
}

/** Streak + rush mode together; transitions are pure functions in rushMode.ts. */
export interface ComboState {
  /** Consecutive merge-producing valid moves. Frozen at 0 during Rush. */
  streak: number;
  rush: RushState;
}

/** Power-ups the player can fire instead of swiping. */
export type PowerId = 'bomb' | 'shuffle' | 'sweep';

/** Charges per power plus the energy meter that earns new charges. */
export interface PowerState {
  charges: Record<PowerId, number>;
  /** 0..cost-1; fills with merges, pays out a charge when full. */
  energy: number;
  /** Charges earned from energy this game; drives the escalating cost. */
  earned: number;
}

/** Render hint for a power that was just used. */
export interface PowerFx {
  id: PowerId;
  /** Cells the power touched (blasted / swept cells). */
  cells: Array<{ row: number; col: number; value: number }>;
}

/** Transient info about the last successful move, used only for rendering. */
export interface LastMoveInfo {
  /** Tile ids whose value doubled (merge pop animation + floating score). */
  mergedTileIds: number[];
  /** Tiles absorbed by a merge; rendered briefly while the slide plays. */
  ghosts: Array<Pick<Tile, 'id' | 'value' | 'row' | 'col'>>;
  /** Id of the freshly spawned tile (scale-in animation). */
  spawnedTileId: number;
  /** Points gained by the move, for floating labels. */
  score: MoveScore;
  /** Destination cells of merges, for floating label placement. */
  mergeCells: Array<{ row: number; col: number; value: number }>;
  /** True when this move beat the previous best score for the first time. */
  newRecord: boolean;
  /** True when this move activated Rush Mode. */
  rushActivated: boolean;
  /** True when Rush Mode expired at the end of this move. */
  rushExpired: boolean;
  /** Power charge earned by this move's energy, if any. */
  powerEarned: PowerId | null;
  /** Set when this state change was a power use rather than a swipe. */
  power: PowerFx | null;
  /** True when that power was fired on a stuck board (spends a rescue). */
  rescue: boolean;
}

/** Everything needed to undo the last successful move. */
export interface UndoSnapshot {
  board: Board;
  tiles: Tile[];
  score: number;
  streak: number;
  rush: RushState;
  rngState: number;
  pendingValue: 2 | 4;
  nextTileId: number;
  gameOver: boolean;
  celebratedRecord: boolean;
  powers: PowerState;
  rescuesUsed: number;
  powerBonus: number;
  lastChance: boolean;
  reviveUsed: boolean;
}

/** Per-game mutable state. */
export interface GameState {
  board: Board;
  tiles: Tile[];
  score: number;
  streak: number;
  rush: RushState;
  /** Serializable PRNG state (mulberry32). */
  rngState: number;
  /** Value the next spawned tile will have (preview + determinism). */
  pendingValue: 2 | 4;
  /** Next stable tile id to hand out. */
  nextTileId: number;
  gameOver: boolean;
  /** One undo per game. */
  canUndo: boolean;
  undoSnapshot: UndoSnapshot | null;
  powers: PowerState;
  /** Powers fired on a stuck board this game (capped at MAX_RESCUES). */
  rescuesUsed: number;
  /** Points awarded at game over for unspent charges; 0 while playing. */
  powerBonus: number;
  /**
   * The board is stuck and the game would end, but a revive is still on
   * offer. Play is paused until the player revives or declines; charges are
   * only cashed in once they decline.
   */
  lastChance: boolean;
  /** The one revive per game has been used (it raises the rescue limit). */
  reviveUsed: boolean;
  /** Set once the score has beaten the loaded best score in this game. */
  celebratedRecord: boolean;
  /** Transient render hints; not persisted, null when no move happened yet. */
  lastMove: LastMoveInfo | null;
}

export interface GameStats {
  best: number;
  highestTile: number;
  gamesPlayed: number;
}

export interface GamePrefs {
  soundOn: boolean;
}

/** Full engine state: the active game plus cross-game stats and preferences. */
export interface EngineState {
  game: GameState;
  stats: GameStats;
  prefs: GamePrefs;
}
