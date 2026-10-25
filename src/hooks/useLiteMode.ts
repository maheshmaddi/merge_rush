import { useEffect, useState } from 'react';
import { detectLiteMode } from '../perf/liteMode';

/** How long to watch real frame times before deciding the device is struggling. */
const MEASURE_MS = 5000;
/** A frame interval above this (ms) counts as a dropped frame. */
const SLOW_FRAME_MS = 34;
/** Downgrade when more than this share of frames are dropped. */
const SLOW_RATIO = 0.2;

/**
 * Lite render mode for low-end devices. Starts from static device hints and
 * auto-downgrades if the first seconds of real rendering miss the frame
 * budget. Toggles the `mr-lite` class on <html>, which swaps glass blur and
 * ambient animations for solid, static surfaces (see styles/lite.css).
 */
export function useLiteMode(): boolean {
  const [lite, setLite] = useState(detectLiteMode);

  useEffect(() => {
    document.documentElement.classList.toggle('mr-lite', lite);
  }, [lite]);

  useEffect(() => {
    if (lite || typeof requestAnimationFrame !== 'function') return;
    let cancelled = false;
    let handle = 0;
    let frames = 0;
    let slow = 0;
    let last = performance.now();
    const start = last;

    const tick = (now: number) => {
      if (cancelled) return;
      if (now - last > SLOW_FRAME_MS) slow += 1;
      frames += 1;
      last = now;
      if (now - start >= MEASURE_MS) {
        if (frames > 60 && slow / frames > SLOW_RATIO) setLite(true);
        return;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [lite]);

  return lite;
}
