/**
 * Glue between the game and the ad service:
 * - the last-chance revive offer (rewarded ad, player's choice);
 * - the between-games interstitial when starting the next game;
 * - the consent "Privacy settings" entry point.
 *
 * Game rules stay in the reducer; this hook only decides when an ad is offered
 * and dispatches the engine's revive/decline actions with the outcome.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { soundEngine } from '../audio/soundEngine';
import { getSafeLocalStorage } from '../persistence/storage';
import { adService } from './adService';
import { loadAdHistory, recordGameEnd, saveAdHistory, shouldShowInterstitial } from './adPolicy';

/** How long to wait for a rewarded ad to load before skipping the offer. */
const REVIVE_LOAD_TIMEOUT_MS = 2000;

interface AdFlowOptions {
  game: GameState;
  revive: () => void;
  declineRevive: () => void;
  restart: () => void;
}

export interface AdFlows {
  /** Show the "Continue?" panel (a rewarded ad is ready to offer). */
  reviveOffered: boolean;
  /** An ad is on screen; ignore game input. */
  adPlaying: boolean;
  watchReviveAd: () => void;
  declineRevive: () => void;
  /** Play Again / New game: maybe an interstitial, then a fresh board. */
  startNextGame: () => void;
  /** Present when the consent form must stay reachable (EEA/UK players). */
  openPrivacyOptions: (() => void) | undefined;
}

export function useAdFlows({ game, revive, declineRevive, restart }: AdFlowOptions): AdFlows {
  const [reviveOffered, setReviveOffered] = useState(false);
  const [adPlaying, setAdPlaying] = useState(false);
  const [privacyRequired, setPrivacyRequired] = useState(false);
  const gameStartedAt = useRef(Date.now());
  const storage = useRef(getSafeLocalStorage());

  useEffect(() => {
    let cancelled = false;
    void adService.init().then(() => {
      if (!cancelled) setPrivacyRequired(adService.privacyOptionsRequired());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A game paused on its last chance: offer the revive only if an ad can
  // actually play; otherwise end the game straight away.
  useEffect(() => {
    if (!game.lastChance) {
      setReviveOffered(false);
      return;
    }
    if (adService.kind === 'none') {
      declineRevive();
      return;
    }
    let cancelled = false;
    void adService.waitForRewarded(REVIVE_LOAD_TIMEOUT_MS).then((ready) => {
      if (cancelled) return;
      if (ready) setReviveOffered(true);
      else declineRevive();
    });
    return () => {
      cancelled = true;
    };
  }, [game.lastChance, declineRevive]);

  /** Mute the game while an ad plays; ads bring their own audio. */
  const duringAd = useCallback(
    async <T,>(play: () => Promise<T>): Promise<T> => {
      setAdPlaying(true);
      soundEngine.hold(true);
      try {
        return await play();
      } finally {
        soundEngine.hold(false);
        setAdPlaying(false);
      }
    },
    [],
  );

  const watchReviveAd = useCallback(() => {
    if (adPlaying) return;
    void duringAd(() => adService.showRewarded()).then((result) => {
      // 'skipped' (closed early) leaves the offer open. If the ad failed to
      // play at all, revive anyway: a player is never punished for our ad.
      if (result !== 'skipped') revive();
    });
  }, [adPlaying, duringAd, revive]);

  const startNextGame = useCallback(() => {
    if (adPlaying) return;
    const now = Date.now();
    const begin = () => {
      gameStartedAt.current = Date.now();
      restart();
    };
    // An untouched board is not a finished game.
    if (game.score === 0) {
      begin();
      return;
    }
    const history = loadAdHistory(storage.current);
    const show =
      adService.isInterstitialReady() &&
      shouldShowInterstitial(history, {
        now,
        gameDurationMs: now - gameStartedAt.current,
        watchedRewarded: game.reviveUsed,
      });
    saveAdHistory(storage.current, recordGameEnd(history, show, now));
    if (!show) {
      begin();
      return;
    }
    void duringAd(() => adService.showInterstitial()).then(begin);
  }, [adPlaying, duringAd, game.score, game.reviveUsed, restart]);

  const openPrivacyOptions = useCallback(() => {
    void adService.showPrivacyOptions();
  }, []);

  return {
    reviveOffered: game.lastChance && reviveOffered,
    adPlaying,
    watchReviveAd,
    declineRevive,
    startNextGame,
    openPrivacyOptions: privacyRequired ? openPrivacyOptions : undefined,
  };
}
