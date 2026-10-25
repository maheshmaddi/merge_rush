/**
 * The one place the game talks to an ad network.
 *
 * - Android/iOS app: Google AdMob via @capacitor-community/admob, behind
 *   Google's UMP consent form.
 * - Browser dev server: a fake "TEST AD" overlay so the flows can be played
 *   without a device.
 * - Web production build and tests: no ads at all.
 *
 * Every call is failure-tolerant: a missing fill, a network error, or a
 * plugin exception means "no ad", never a broken game.
 */

import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { AD_UNITS, USING_TEST_ADS } from './adConfig';

/** How a rewarded ad ended. Only 'rewarded' earns the reward. */
export type RewardedResult = 'rewarded' | 'skipped' | 'failed';

export interface AdService {
  readonly kind: 'admob' | 'mock' | 'none';
  init(): Promise<void>;
  isRewardedReady(): boolean;
  /** Resolves true once a rewarded ad is loaded, false after the timeout. */
  waitForRewarded(timeoutMs: number): Promise<boolean>;
  showRewarded(): Promise<RewardedResult>;
  isInterstitialReady(): boolean;
  /** Resolves when the interstitial closed (true) or could not show (false). */
  showInterstitial(): Promise<boolean>;
  /** Whether a "Privacy settings" entry point is needed (consent applies). */
  privacyOptionsRequired(): boolean;
  showPrivacyOptions(): Promise<void>;
}

const RETRY_DELAYS_MS = [5_000, 15_000, 60_000];

/** Loads one ad slot, retrying with backoff, and tracks whether it is ready. */
class AdSlot {
  private ready = false;
  private loading = false;
  private attempt = 0;
  private waiters: Array<(ready: boolean) => void> = [];

  constructor(private readonly loadOnce: () => Promise<unknown>) {}

  isReady(): boolean {
    return this.ready;
  }

  load(): void {
    if (this.ready || this.loading) return;
    this.loading = true;
    this.loadOnce()
      .then(() => {
        this.ready = true;
        this.attempt = 0;
        this.waiters.splice(0).forEach((resolve) => resolve(true));
      })
      .catch(() => {
        const delay = RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)];
        this.attempt += 1;
        window.setTimeout(() => this.load(), delay);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  /** The loaded ad was used (or failed to show); fetch the next one. */
  consume(): void {
    this.ready = false;
    this.load();
  }

  waitUntilReady(timeoutMs: number): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    this.load();
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter !== done);
        resolve(false);
      }, timeoutMs);
      const done = (ready: boolean) => {
        window.clearTimeout(timer);
        resolve(ready);
      };
      this.waiters.push(done);
    });
  }
}

class AdMobService implements AdService {
  readonly kind = 'admob' as const;
  private consentApplies = false;
  private canRequestAds = false;
  private rewarded = new AdSlot(() =>
    AdMob.prepareRewardVideoAd({ adId: AD_UNITS.rewarded, isTesting: USING_TEST_ADS }),
  );
  private interstitial = new AdSlot(() =>
    AdMob.prepareInterstitial({ adId: AD_UNITS.interstitial, isTesting: USING_TEST_ADS }),
  );

  async init(): Promise<void> {
    try {
      await AdMob.initialize({ initializeForTesting: USING_TEST_ADS });
      // Google UMP: ask where consent is required (EEA/UK/Switzerland) before
      // any ad request. The SDK applies the player's choices to every request.
      let consent = await AdMob.requestConsentInfo();
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
        consent = await AdMob.showConsentForm();
      }
      this.consentApplies = consent.status !== AdmobConsentStatus.NOT_REQUIRED;
      this.canRequestAds =
        consent.status === AdmobConsentStatus.OBTAINED ||
        consent.status === AdmobConsentStatus.NOT_REQUIRED;
    } catch {
      this.canRequestAds = false;
    }
    if (this.canRequestAds) {
      this.rewarded.load();
      this.interstitial.load();
    }
  }

  isRewardedReady(): boolean {
    return this.canRequestAds && this.rewarded.isReady();
  }

  waitForRewarded(timeoutMs: number): Promise<boolean> {
    if (!this.canRequestAds) return Promise.resolve(false);
    return this.rewarded.waitUntilReady(timeoutMs);
  }

  async showRewarded(): Promise<RewardedResult> {
    if (!this.isRewardedReady()) return 'failed';
    const handles: PluginListenerHandle[] = [];
    try {
      const result = await new Promise<RewardedResult>((resolve) => {
        let earned = false;
        const listen = async () => {
          handles.push(
            await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
              earned = true;
            }),
            await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
              // The reward callback can land just after dismissal on some
              // devices; give it a moment before deciding.
              window.setTimeout(() => resolve(earned ? 'rewarded' : 'skipped'), 300);
            }),
            await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => resolve('failed')),
          );
        };
        listen()
          .then(() => AdMob.showRewardVideoAd())
          .catch(() => resolve('failed'));
      });
      return result;
    } finally {
      handles.forEach((handle) => void handle.remove());
      this.rewarded.consume();
    }
  }

  isInterstitialReady(): boolean {
    return this.canRequestAds && this.interstitial.isReady();
  }

  async showInterstitial(): Promise<boolean> {
    if (!this.isInterstitialReady()) return false;
    const handles: PluginListenerHandle[] = [];
    try {
      return await new Promise<boolean>((resolve) => {
        const listen = async () => {
          handles.push(
            await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => resolve(true)),
            await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => resolve(false)),
          );
        };
        listen()
          .then(() => AdMob.showInterstitial())
          .catch(() => resolve(false));
      });
    } finally {
      handles.forEach((handle) => void handle.remove());
      this.interstitial.consume();
    }
  }

  privacyOptionsRequired(): boolean {
    return this.consentApplies;
  }

  async showPrivacyOptions(): Promise<void> {
    try {
      await AdMob.showConsentForm();
    } catch {
      // Nothing to do: the form is unavailable right now.
    }
  }
}

/** Dev-only stand-in: a labelled overlay that "plays" for a moment. */
class MockAdService implements AdService {
  readonly kind = 'mock' as const;

  async init(): Promise<void> {}

  isRewardedReady(): boolean {
    return true;
  }

  async waitForRewarded(): Promise<boolean> {
    return true;
  }

  async showRewarded(): Promise<RewardedResult> {
    await this.fakeAd('Rewarded');
    return 'rewarded';
  }

  isInterstitialReady(): boolean {
    return true;
  }

  async showInterstitial(): Promise<boolean> {
    await this.fakeAd('Interstitial');
    return true;
  }

  privacyOptionsRequired(): boolean {
    return false;
  }

  async showPrivacyOptions(): Promise<void> {}

  private fakeAd(label: string): Promise<void> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'mock-ad';
      overlay.textContent = `TEST AD · ${label} (dev server only)`;
      document.body.appendChild(overlay);
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, 1200);
    });
  }
}

class NoAdService implements AdService {
  readonly kind = 'none' as const;
  async init(): Promise<void> {}
  isRewardedReady(): boolean {
    return false;
  }
  async waitForRewarded(): Promise<boolean> {
    return false;
  }
  async showRewarded(): Promise<RewardedResult> {
    return 'failed';
  }
  isInterstitialReady(): boolean {
    return false;
  }
  async showInterstitial(): Promise<boolean> {
    return false;
  }
  privacyOptionsRequired(): boolean {
    return false;
  }
  async showPrivacyOptions(): Promise<void> {}
}

function createAdService(): AdService {
  if (Capacitor.isNativePlatform()) return new AdMobService();
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') return new MockAdService();
  return new NoAdService();
}

export const adService: AdService = createAdService();
