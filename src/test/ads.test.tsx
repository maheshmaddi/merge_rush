import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  AD_POLICY,
  FRESH_HISTORY,
  loadAdHistory,
  recordGameEnd,
  saveAdHistory,
  shouldShowInterstitial,
} from '../ads/adPolicy';
import type { AdHistory, GameEndContext } from '../ads/adPolicy';
import type { SafeStorage } from '../persistence/storage';
import { ContinueOverlay } from '../components/ContinueOverlay';

const LONG_GAME = AD_POLICY.MIN_GAME_MS + 1;
const T0 = 10_000_000;

function context(overrides: Partial<GameEndContext> = {}): GameEndContext {
  return { now: T0, gameDurationMs: LONG_GAME, watchedRewarded: false, ...overrides };
}

/** Plays `games` long games, `minutesApart` apart; returns which got an ad. */
function simulate(games: number, minutesApart: number, start: AdHistory = FRESH_HISTORY): boolean[] {
  let history = start;
  const shown: boolean[] = [];
  for (let i = 0; i < games; i++) {
    const now = T0 + i * minutesApart * 60_000;
    const show = shouldShowInterstitial(history, context({ now }));
    history = recordGameEnd(history, show, now);
    shown.push(show);
  }
  return shown;
}

describe('interstitial policy', () => {
  it('never shows during the first games after install', () => {
    expect(simulate(AD_POLICY.FREE_GAMES, 10)).toEqual(new Array(AD_POLICY.FREE_GAMES).fill(false));
  });

  it('shows at most once every third game when games are long and spaced out', () => {
    expect(simulate(9, 10)).toEqual([false, false, true, false, false, true, false, false, true]);
  });

  it('waits out the minimum interval when games are short', () => {
    // Two-minute games: the game count allows an ad every 3rd game, but the
    // 4-minute gap pushes the second ad later.
    const shown = simulate(10, 2);
    const adGames = shown.flatMap((s, i) => (s ? [i] : []));
    for (let i = 1; i < adGames.length; i++) {
      expect((adGames[i] - adGames[i - 1]) * 2).toBeGreaterThanOrEqual(AD_POLICY.MIN_INTERVAL_MS / 60_000);
    }
    expect(adGames.length).toBeGreaterThan(0);
  });

  it('skips a quick game and a game where a rewarded ad was watched', () => {
    const due: AdHistory = { gamesFinished: 10, gamesSinceInterstitial: 5, lastInterstitialAt: 0 };
    expect(shouldShowInterstitial(due, context())).toBe(true);
    expect(shouldShowInterstitial(due, context({ gameDurationMs: 5_000 }))).toBe(false);
    expect(shouldShowInterstitial(due, context({ watchedRewarded: true }))).toBe(false);
  });

  it('history round-trips through storage and survives corruption', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as SafeStorage;
    expect(loadAdHistory(storage)).toEqual(FRESH_HISTORY);
    const history: AdHistory = { gamesFinished: 7, gamesSinceInterstitial: 1, lastInterstitialAt: 123 };
    saveAdHistory(storage, history);
    expect(loadAdHistory(storage)).toEqual(history);
    data.set([...data.keys()][0], '{not json');
    expect(loadAdHistory(storage)).toEqual(FRESH_HISTORY);
  });
});

describe('Continue overlay', () => {
  it('offers the revive with its reward and both choices', () => {
    const onWatch = vi.fn();
    const onDecline = vi.fn();
    render(<ContinueOverlay score={4321} busy={false} onWatch={onWatch} onDecline={onDecline} />);
    expect(screen.getByRole('dialog', { name: 'Out of moves!' })).toBeInTheDocument();
    expect(screen.getByText('4321')).toBeInTheDocument();
    expect(screen.getByText(/\+1 rescue/)).toBeInTheDocument();
    expect(screen.getByText(/\+1 Bomb/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /watch ad to continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /no thanks/i }));
    expect(onWatch).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while an ad is playing', () => {
    render(<ContinueOverlay score={1} busy onWatch={() => undefined} onDecline={() => undefined} />);
    expect(screen.getByRole('button', { name: /watch ad to continue/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /no thanks/i })).toBeDisabled();
  });
});

describe('privacy policy link', () => {
  it('is reachable from the game screen', async () => {
    const { SwipeHint, PRIVACY_POLICY_URL } = await import('../components/SwipeHint');
    render(<SwipeHint />);
    const link = screen.getByRole('link', { name: 'Privacy policy' });
    expect(link).toHaveAttribute('href', PRIVACY_POLICY_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });
});
