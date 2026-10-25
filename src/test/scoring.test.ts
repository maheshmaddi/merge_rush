import { describe, expect, it } from 'vitest';
import { basePoints, chainBonusForLevel, scoreForMerges } from '../game/calculateScore';
import type { MergeEvent } from '../game/types';

function merge(value: number, index: number): MergeEvent {
  return { value, index, sources: [index, index + 1] };
}

describe('scoring: base points', () => {
  it('awards the resulting tile value for a single merge', () => {
    expect(basePoints(4)).toBe(4);
    expect(basePoints(8)).toBe(8);
    expect(basePoints(16)).toBe(16);
    expect(basePoints(32)).toBe(32);
    expect(basePoints(64)).toBe(64);
    expect(basePoints(128)).toBe(128);
    expect(basePoints(2048)).toBe(2048);
  });

  it('sums base points across multiple merges in one move', () => {
    const score = scoreForMerges([merge(4, 0), merge(8, 1)], false);
    expect(score.base).toBe(12);
  });

  it('returns all zeros when the move has no merges', () => {
    const score = scoreForMerges([], false);
    expect(score).toEqual({ base: 0, chainBonus: 0, multiplier: 1, total: 0 });
  });
});

describe('scoring: chain bonus', () => {
  it('awards no chain bonus for a single merge', () => {
    const score = scoreForMerges([merge(64, 0)], false);
    expect(score.chainBonus).toBe(0);
    expect(score.total).toBe(64);
  });

  it('matches the specified example: merges into 8, 16, 32 total 296', () => {
    const score = scoreForMerges([merge(8, 0), merge(16, 1), merge(32, 2)], false);
    expect(score.base).toBe(56);
    expect(score.chainBonus).toBe(240);
    expect(score.total).toBe(296);
  });

  it('computes the bonus per chain level using the highest merged value', () => {
    // Two merges into 4 and 32: highest = 32; level 2 bonus = floor(10*1*32/4) = 80.
    const score = scoreForMerges([merge(4, 0), merge(32, 1)], false);
    expect(score.chainBonus).toBe(80);
    expect(score.total).toBe(4 + 32 + 80);
  });

  it('floors fractional chain bonuses', () => {
    // Legal tiles always yield integers, so prove the floor with a synthetic value:
    // floor(10 * 1 * 7 / 4) = floor(17.5) = 17.
    expect(chainBonusForLevel(2, 7)).toBe(17);
    expect(chainBonusForLevel(2, 6)).toBe(15);
    expect(chainBonusForLevel(3, 9)).toBe(45);
  });

  it('always produces integer, non-negative totals for legal tile values', () => {
    const values = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
    const merges = values.map((value, i) => merge(value, i * 2));
    const score = scoreForMerges(merges, false);
    expect(Number.isInteger(score.base)).toBe(true);
    expect(Number.isInteger(score.chainBonus)).toBe(true);
    expect(Number.isInteger(score.total)).toBe(true);
    expect(score.total).toBeGreaterThan(0);
  });
});

describe('scoring: Rush Mode multiplier', () => {
  it('doubles merge and chain points while Rush is active', () => {
    const merges = [merge(8, 0), merge(16, 1), merge(32, 2)];
    const normal = scoreForMerges(merges, false);
    const rushed = scoreForMerges(merges, true);
    expect(normal.total).toBe(296);
    expect(rushed.multiplier).toBe(2);
    expect(rushed.base).toBe(56);
    expect(rushed.chainBonus).toBe(240);
    expect(rushed.total).toBe(592);
  });

  it('doubles even single merges during Rush', () => {
    expect(scoreForMerges([merge(16, 0)], true).total).toBe(32);
  });

  it('never produces negative values', () => {
    const score = scoreForMerges([merge(4, 0), merge(4, 1)], true);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.base).toBeGreaterThanOrEqual(0);
    expect(score.chainBonus).toBeGreaterThanOrEqual(0);
  });
});
