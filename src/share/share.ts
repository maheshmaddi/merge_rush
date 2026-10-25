/**
 * Score sharing. Native builds use the Android share sheet; the web build
 * falls back to the Web Share API and then to the clipboard. Always user
 * initiated, and nothing is sent anywhere by the game itself.
 */

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.mergerush.app';

export interface ShareDetails {
  score: number;
  highestTile: number;
  streak?: number;
  daily?: boolean;
}

export function shareMessage({ score, highestTile, streak, daily }: ShareDetails): string {
  const what = daily ? 'today’s Daily Challenge' : 'a game';
  const parts = [`I scored ${score.toLocaleString()} in ${what} of Merge Rush 🔥`];
  if (highestTile >= 128) parts.push(`Best tile: ${highestTile}`);
  if (streak !== undefined && streak > 1) parts.push(`${streak}-day streak`);
  parts.push('Can you beat me?');
  return parts.join(' · ');
}

export type ShareOutcome = 'shared' | 'copied' | 'failed';

export async function shareScore(details: ShareDetails): Promise<ShareOutcome> {
  const text = shareMessage(details);
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: 'Merge Rush',
        text,
        url: PLAY_STORE_URL,
        dialogTitle: 'Share your score',
      });
      return 'shared';
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'Merge Rush', text, url: PLAY_STORE_URL });
      return 'shared';
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} ${PLAY_STORE_URL}`);
      return 'copied';
    }
  } catch {
    // The player closing the share sheet rejects too; treat both as "no share".
  }
  return 'failed';
}
