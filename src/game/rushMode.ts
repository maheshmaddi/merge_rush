/**
 * Combo streak and Rush Mode transitions. Pure and explicit.
 *
 * Rules:
 * - A valid move with >= 1 merge increments the streak (when Rush is off).
 * - A valid move with no merges resets the streak to 0.
 * - An invalid move changes nothing at all.
 * - When the streak reaches 3, Rush Mode activates for the next 3 VALID moves
 *   (merging or not). The triggering move itself is scored normally.
 * - During Rush the streak is frozen at 0, so Rush cannot retrigger itself.
 * - Invalid moves do not consume Rush moves.
 * - When the 3rd Rush move completes, Rush expires and normal scoring returns.
 *
 * Scoring multiplier timing: a move is multiplied iff Rush was active when the
 * move was made; the remaining count is decremented after scoring.
 */

import type { ComboState } from './types';
import { RUSH_MOVES, RUSH_TRIGGER_STREAK } from './constants';

export function initialComboState(): ComboState {
  return { streak: 0, rush: { active: false, remaining: 0 } };
}

/** True when the combo state should switch into Rush Mode. */
export function shouldActivateRush(streak: number): boolean {
  return streak >= RUSH_TRIGGER_STREAK;
}

/**
 * Applies a move to the combo state.
 * @param combo state before the move
 * @param moved whether the move changed the board (false = invalid move)
 * @param hadMerge whether the move produced at least one merge
 */
export function applyMoveToCombo(
  combo: ComboState,
  moved: boolean,
  hadMerge: boolean,
): ComboState {
  if (!moved) return combo;

  if (combo.rush.active) {
    const remaining = combo.rush.remaining - 1;
    if (remaining <= 0) {
      return { streak: 0, rush: { active: false, remaining: 0 } };
    }
    // Streak is frozen while Rush runs.
    return { streak: 0, rush: { active: true, remaining } };
  }

  if (!hadMerge) {
    return { streak: 0, rush: { active: false, remaining: 0 } };
  }

  const streak = combo.streak + 1;
  if (shouldActivateRush(streak)) {
    return { streak: 0, rush: { active: true, remaining: RUSH_MOVES } };
  }
  return { streak, rush: { active: false, remaining: 0 } };
}
