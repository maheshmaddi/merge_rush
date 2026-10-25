/**
 * Ad unit IDs. Production IDs come from build-time env vars (see
 * .env.example); without them the app uses Google's public test units, which
 * always fill with clearly labelled test ads and never earn money.
 */

/** Google's documented test ad units for Android. */
const TEST_UNITS = {
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
} as const;

function envId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export const AD_UNITS = {
  rewarded: envId(import.meta.env.VITE_ADMOB_REWARDED_ID) ?? TEST_UNITS.rewarded,
  interstitial: envId(import.meta.env.VITE_ADMOB_INTERSTITIAL_ID) ?? TEST_UNITS.interstitial,
};

/** True while any unit is still a Google test unit (no revenue). */
export const USING_TEST_ADS =
  AD_UNITS.rewarded === TEST_UNITS.rewarded || AD_UNITS.interstitial === TEST_UNITS.interstitial;
