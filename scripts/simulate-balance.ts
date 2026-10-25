/**
 * Power economy simulator. Plays many seeded games with a simple greedy bot
 * through the real reducer and reports how powers change game length and
 * how often charges are earned, spent, or wasted.
 *
 *   npx vite-node scripts/simulate-balance.ts [games=300]
 *
 * The bot swipes greedily (most empty cells, corner-biased tie-break). Power
 * policy: when the board is stuck it fires a rescue; otherwise it spends a
 * charge proactively only when that power is at its cap, so charges are not
 * wasted. This approximates a careful, not perfect, human player.
 */

import type { Direction, EngineState, PowerId } from '../src/game/types';
import { BOARD_SIZE, POWER_IDS, POWER_MAX_CHARGES } from '../src/game/constants';
import { createInitialEngineState, gameReducer } from '../src/game/reducer';
import { moveBoard } from '../src/game/moveBoard';
import { hasAnyMoves } from '../src/game/gameOver';
import { canUsePower, emptyPowers } from '../src/game/powers';

const GAMES = Number(process.argv[2] ?? 300);
const MOVE_CAP = 20_000;
const PRIORITY: Direction[] = ['down', 'left', 'right', 'up'];

function bestDirection(state: EngineState): Direction | null {
  let best: Direction | null = null;
  let bestScore = -Infinity;
  PRIORITY.forEach((direction, rank) => {
    const outcome = moveBoard(state.game.board, direction);
    if (!outcome.moved) return;
    const empties = outcome.board.filter((v) => v === 0).length;
    const merged = outcome.merges.reduce((sum, m) => sum + Math.log2(m.value), 0);
    const score = empties * 10 + merged - rank * 0.5 - (direction === 'up' ? 6 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = direction;
    }
  });
  return best;
}

/** Cell of the smallest tile, preferring ones that leave a merge behind. */
function bombTarget(state: EngineState): number | null {
  const board = state.game.board;
  let best: number | null = null;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0) continue;
    if (best === null || board[i] < board[best]) best = i;
  }
  return best;
}

/** A tile whose doubled value matches a neighbour, creating a merge. */
function upgradeTarget(state: EngineState): number | null {
  const board = state.game.board;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0) continue;
    const r = Math.floor(i / BOARD_SIZE);
    const c = i % BOARD_SIZE;
    const neighbours = [
      r > 0 ? board[i - BOARD_SIZE] : 0,
      r < BOARD_SIZE - 1 ? board[i + BOARD_SIZE] : 0,
      c > 0 ? board[i - 1] : 0,
      c < BOARD_SIZE - 1 ? board[i + 1] : 0,
    ];
    if (neighbours.includes(board[i] * 2)) return i;
  }
  return null;
}

function firePower(state: EngineState, power: PowerId, rescue: boolean): EngineState | null {
  const game = state.game;
  if (!canUsePower(game, power)) return null;
  let cell: number | undefined;
  if (power === 'bomb') cell = bombTarget(state) ?? undefined;
  if (power === 'upgrade') {
    cell = upgradeTarget(state) ?? undefined;
    if (cell === undefined && !rescue) return null;
    if (cell === undefined) cell = bombTarget(state) ?? undefined;
  }
  if ((power === 'bomb' || power === 'upgrade') && cell === undefined) return null;
  const next = gameReducer(state, { type: 'power', power, cell });
  return next === state ? null : next;
}

interface GameResult {
  moves: number;
  score: number;
  maxTile: number;
  earned: number;
  used: number;
  rescues: number;
  firstEarnMove: number | null;
  earnMoves: number[];
  leftover: number;
}

function play(seed: number, powersOn: boolean): GameResult {
  let state = createInitialEngineState(seed);
  if (!powersOn) state = { ...state, game: { ...state.game, powers: emptyPowers() } };
  const result: GameResult = {
    moves: 0,
    score: 0,
    maxTile: 0,
    earned: 0,
    used: 0,
    rescues: 0,
    firstEarnMove: null,
    earnMoves: [],
    leftover: 0,
  };

  while (!state.game.gameOver && result.moves < MOVE_CAP) {
    if (!hasAnyMoves(state.game.board)) {
      if (!powersOn) break;
      // Stuck: rescue in a fixed preference order.
      let fired: EngineState | null = null;
      for (const power of ['bomb', 'sweep', 'upgrade', 'shuffle'] as PowerId[]) {
        fired = firePower(state, power, true);
        if (fired) break;
      }
      if (fired === null) break;
      state = fired;
      result.used += 1;
      result.rescues += 1;
      continue;
    }

    // Spend a capped power proactively so the next earn is not wasted.
    if (powersOn) {
      const capped = POWER_IDS.find((id) => state.game.powers.charges[id] >= POWER_MAX_CHARGES);
      // Shuffle wrecks a corner strategy, so it is never fired proactively.
      if (capped && capped !== 'shuffle') {
        const fired = firePower(state, capped, false);
        if (fired) {
          state = fired;
          result.used += 1;
          continue;
        }
      }
    }

    const direction = bestDirection(state);
    if (direction === null) break;
    state = gameReducer(state, { type: 'move', direction });
    result.moves += 1;
    if (state.game.lastMove?.powerEarned) {
      result.earned += 1;
      result.earnMoves.push(result.moves);
      if (result.firstEarnMove === null) result.firstEarnMove = result.moves;
    }
  }

  result.score = state.game.score;
  result.maxTile = Math.max(...state.game.board);
  result.leftover = POWER_IDS.reduce((s, id) => s + state.game.powers.charges[id], 0);
  return result;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function pct(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function report(label: string, results: GameResult[]) {
  const tiles = new Map<number, number>();
  for (const r of results) tiles.set(r.maxTile, (tiles.get(r.maxTile) ?? 0) + 1);
  const reached = (v: number) =>
    `${Math.round((100 * results.filter((r) => r.maxTile >= v).length) / results.length)}%`;
  const firstEarn = results.map((r) => r.firstEarnMove).filter((m): m is number => m !== null);
  // Gaps between earns in the first vs second half of each game.
  const earlyGaps: number[] = [];
  const lateGaps: number[] = [];
  for (const r of results) {
    for (let i = 1; i < r.earnMoves.length; i++) {
      const gap = r.earnMoves[i] - r.earnMoves[i - 1];
      (r.earnMoves[i] < r.moves / 2 ? earlyGaps : lateGaps).push(gap);
    }
  }
  console.log(`\n== ${label} (${results.length} games)`);
  console.log(
    `moves   median ${median(results.map((r) => r.moves))}  p10 ${pct(results.map((r) => r.moves), 0.1)}  p90 ${pct(results.map((r) => r.moves), 0.9)}  capped ${results.filter((r) => r.moves >= MOVE_CAP).length}`,
  );
  console.log(`score   median ${median(results.map((r) => r.score))}`);
  console.log(`reached 256 ${reached(256)}  512 ${reached(512)}  1024 ${reached(1024)}  2048 ${reached(2048)}`);
  console.log(
    `charges earned median ${median(results.map((r) => r.earned))}  used ${median(results.map((r) => r.used))}  rescues ${median(results.map((r) => r.rescues))}  leftover ${median(results.map((r) => r.leftover))}`,
  );
  console.log(
    `first earn at move ${median(firstEarn)}  gap early ${median(earlyGaps)}  gap late ${median(lateGaps)}`,
  );
}

const seeds = Array.from({ length: GAMES }, (_, i) => 1000 + i * 7919);
if (!process.argv.includes('--on-only')) report('powers OFF', seeds.map((s) => play(s, false)));
report('powers ON', seeds.map((s) => play(s, true)));
