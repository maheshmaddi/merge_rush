import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { resolveBackAction } from './backAction';

/**
 * Android hardware/gesture back button. Without this listener Capacitor
 * finishes the activity (the app closes) the moment the player swipes back
 * in-game; with it, back dismisses sheets, disarms targeting, returns to the
 * title screen, and only exits after a press-back-again confirmation.
 *
 * Web/PWA builds never register the listener (Escape already closes sheets)
 * and jsdom tests are unaffected.
 */

export interface UseBackButtonParams {
  adPlaying: boolean;
  sheetOpen: boolean;
  targetingArmed: boolean;
  onTitle: boolean;
  onCloseSheet: () => void;
  onDisarm: () => void;
  onHome: () => void;
  /** Shows the "press back again to exit" hint. */
  onExitHint: () => void;
}

export function useBackButton(params: UseBackButtonParams): void {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const lastExitPressRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let handle: PluginListenerHandle | null = null;

    const run = (action: ReturnType<typeof resolveBackAction>): void => {
      const p = paramsRef.current;
      switch (action) {
        case 'none':
          break;
        case 'closeSheet':
          p.onCloseSheet();
          break;
        case 'disarm':
          p.onDisarm();
          break;
        case 'home':
          lastExitPressRef.current = null;
          p.onHome();
          break;
        case 'exitHint':
          lastExitPressRef.current = Date.now();
          p.onExitHint();
          break;
        case 'exit':
          lastExitPressRef.current = null;
          void App.exitApp();
          break;
      }
    };

    // Capacitor 6 returns the listener handle asynchronously.
    void App.addListener('backButton', () => {
      run(
        resolveBackAction(
          {
            adPlaying: paramsRef.current.adPlaying,
            sheetOpen: paramsRef.current.sheetOpen,
            targetingArmed: paramsRef.current.targetingArmed,
            onTitle: paramsRef.current.onTitle,
            lastExitPress: lastExitPressRef.current,
          },
          Date.now(),
        ),
      );
    }).then((registered) => {
      if (disposed) {
        void registered.remove();
      } else {
        handle = registered;
      }
    });

    return () => {
      disposed = true;
      if (handle !== null) void handle.remove();
    };
  }, []);
}
