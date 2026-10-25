/**
 * Deterministic, serializable PRNG (mulberry32).
 *
 * The whole generator state is a single uint32, so a game can be paused,
 * saved, restored, and replayed identically. Every consumer thread the state
 * through explicitly - there is no hidden module-level generator.
 */

export interface RngDraw<T> {
  state: number;
  value: T;
}

/** One mulberry32 step; returns the next state and a float in [0, 1). */
export function nextFloat(state: number): RngDraw<number> {
  let t = (state + 0x6d2b79f5) | 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const float = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: nextState, value: float };
}

/** Draws the value of the next spawned tile: 2 with 90% probability, else 4. */
export function drawSpawnValue(
  state: number,
  twoProbability: number,
): RngDraw<2 | 4> {
  const draw = nextFloat(state);
  return {
    state: draw.state,
    value: draw.value < twoProbability ? 2 : 4,
  };
}

/**
 * Picks an empty cell index on the board uniformly at random.
 * Assumes the board has at least one empty cell.
 */
export function pickEmptyCell(board: readonly number[], state: number): RngDraw<number> {
  const empties: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0) empties.push(i);
  }
  const draw = nextFloat(state);
  const index = empties[Math.min(empties.length - 1, Math.floor(draw.value * empties.length))];
  return { state: draw.state, value: index };
}

/** Non-deterministic seed for real play (tests always pass an explicit seed). */
export function randomSeed(): number {
  const now = Date.now() >>> 0;
  const frac = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return (now ^ frac) >>> 0;
}

/** Coerces any number into a valid uint32 seed. */
export function normalizeSeed(seed: number): number {
  return seed >>> 0;
}
