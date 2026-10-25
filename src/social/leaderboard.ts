/**
 * Global leaderboards through Google Play Games Services (Android only).
 * The web build and any build without Play Games configured are silent
 * no-ops: `isAvailable()` is false and the UI hides the leaderboard entry
 * points. Failures (offline, signed out, declined) never reach gameplay.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export type BoardKind = 'allTime' | 'daily';

interface PlayGamesPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  signIn(): Promise<{ signedIn: boolean }>;
  submitScore(options: { leaderboardId: string; score: number }): Promise<{ submitted: boolean }>;
  showLeaderboard(options: { leaderboardId: string }): Promise<{ shown: boolean }>;
}

const plugin = registerPlugin<PlayGamesPlugin>('PlayGames');

function envId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Leaderboard IDs from the Play Console, supplied at build time (.env.production). */
export const BOARD_IDS: Record<BoardKind, string | null> = {
  allTime: envId(import.meta.env.VITE_PGS_ALL_TIME_ID),
  daily: envId(import.meta.env.VITE_PGS_DAILY_ID),
};

class Leaderboards {
  private ready: Promise<boolean> | null = null;
  private signedIn = false;

  /** True only on Android with a configured Play Games project and board IDs. */
  isAvailable(): Promise<boolean> {
    if (this.ready === null) {
      this.ready = this.init();
    }
    return this.ready;
  }

  private async init(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    if (BOARD_IDS.allTime === null && BOARD_IDS.daily === null) return false;
    try {
      const { available } = await plugin.isAvailable();
      if (!available) return false;
      this.signedIn = (await plugin.signIn()).signedIn;
      return true;
    } catch {
      return false;
    }
  }

  async submit(kind: BoardKind, score: number): Promise<void> {
    const id = BOARD_IDS[kind];
    if (id === null || score <= 0 || !(await this.isAvailable()) || !this.signedIn) return;
    try {
      await plugin.submitScore({ leaderboardId: id, score: Math.floor(score) });
    } catch {
      // Offline or signed out: the score simply is not posted.
    }
  }

  /** Opens Google's leaderboard screen; returns false if it could not open. */
  async show(kind: BoardKind): Promise<boolean> {
    const id = BOARD_IDS[kind];
    if (id === null || !(await this.isAvailable())) return false;
    try {
      if (!this.signedIn) this.signedIn = (await plugin.signIn()).signedIn;
      if (!this.signedIn) return false;
      return (await plugin.showLeaderboard({ leaderboardId: id })).shown;
    } catch {
      return false;
    }
  }
}

export const leaderboards = new Leaderboards();
