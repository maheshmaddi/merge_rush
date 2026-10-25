/**
 * Pure decision logic for the Android hardware/gesture back button.
 *
 * Back walks the UI hierarchy top-down: dismiss dialogs first, then armed
 * power targeting, then navigate up from the game to the title screen, and
 * only exit from the title - behind a press-back-again confirmation so a
 * single stray press can never kill the app.
 */

export type BackAction = 'none' | 'closeSheet' | 'disarm' | 'home' | 'exitHint' | 'exit';

export interface BackContext {
  /** True while a fullscreen ad is playing; ads own their back handling. */
  adPlaying: boolean;
  /** Any modal sheet is open (pause, settings, how-to, rating, ...). */
  sheetOpen: boolean;
  /** A targeted power is armed and waiting for a tile pick. */
  targetingArmed: boolean;
  /** True on the title screen, false while playing. */
  onTitle: boolean;
  /** Epoch ms of the previous back press on the title screen, if any. */
  lastExitPress: number | null;
}

/** How long the "press back again to exit" confirmation stays armed. */
export const EXIT_CONFIRM_MS = 2000;

export function resolveBackAction(ctx: BackContext, now: number = Date.now()): BackAction {
  if (ctx.adPlaying) return 'none';
  if (ctx.sheetOpen) return 'closeSheet';
  if (ctx.targetingArmed) return 'disarm';
  if (!ctx.onTitle) return 'home';
  if (ctx.lastExitPress !== null && now - ctx.lastExitPress <= EXIT_CONFIRM_MS) {
    return 'exit';
  }
  return 'exitHint';
}
