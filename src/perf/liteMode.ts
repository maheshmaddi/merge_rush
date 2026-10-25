/**
 * Static detection for low-end devices. Conservative on its own - the
 * frame-time monitor in useLiteMode catches devices that slip through.
 */

export function detectLiteMode(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  // Chrome-only, rounded to a power of two (0.25..8 GB); missing elsewhere.
  const memoryGb = nav.deviceMemory ?? 8;
  return cores <= 4 || memoryGb <= 3;
}
