/**
 * Pure scoring. Base points come from the resulting value of every merge
 * (2+2=4 gives 4 points, 4+4=8 gives 8 points, ...). Moves with multiple
 * merges also earn a chain bonus defined by merge order:
 *
 *   chainBonus = sum over merge events at chain level L >= 2 of
 *                floor(10 * (L - 1) * highestMergedTileValue / 4)
 *
 * where chain level is the 1-based position of the merge event within the
 * swipe and highestMergedTileValue is the largest resulting tile of the move.
 * While Rush Mode is active, all merge and chain points are doubled.
 */

import type { MergeEvent, MoveScore } from './types';
import { CHAIN_BONUS_BASE, CHAIN_BONUS_DIVISOR, RUSH_MULTIPLIER } from './constants';

/** Chain bonus for a single merge event at the given chain level. */
export function chainBonusForLevel(level: number, highestMergedValue: number): number {
  if (level < 2) return 0;
  return Math.floor(
    (CHAIN_BONUS_BASE * (level - 1) * highestMergedValue) / CHAIN_BONUS_DIVISOR,
  );
}

/** Base points for a merge with the given resulting tile value. */
export function basePoints(resultValue: number): number {
  return resultValue;
}

/** Total score of a move given its ordered merge events and Rush status. */
export function scoreForMerges(merges: readonly MergeEvent[], rushActive: boolean): MoveScore {
  if (merges.length === 0) {
    return { base: 0, chainBonus: 0, multiplier: 1, total: 0 };
  }

  let base = 0;
  let highest = 0;
  for (const merge of merges) {
    base += basePoints(merge.value);
    if (merge.value > highest) highest = merge.value;
  }

  let chainBonus = 0;
  if (merges.length >= 2) {
    for (let level = 2; level <= merges.length; level++) {
      chainBonus += chainBonusForLevel(level, highest);
    }
  }

  const multiplier = rushActive ? RUSH_MULTIPLIER : 1;
  const total = (base + chainBonus) * multiplier;
  return { base, chainBonus, multiplier, total };
}
