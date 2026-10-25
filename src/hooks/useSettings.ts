import { useCallback, useEffect, useState } from 'react';
import { createSafeStorage, getLocalStorage } from '../persistence/storage';
import type { SafeStorage } from '../persistence/storage';
import { setHapticsEnabled } from '../native/haptics';
import { soundEngine } from '../audio/soundEngine';

export interface Settings {
  music: boolean;
  haptics: boolean;
  /** The how-to-play cards have been shown once. */
  tutorialSeen: boolean;
}

export const SETTINGS_KEY = 'merge-rush.settings.v1';
export const DEFAULT_SETTINGS: Settings = {
  music: true,
  haptics: true,
  tutorialSeen: false,
};

export function loadSettings(storage: SafeStorage | null): Settings {
  if (storage === null) return DEFAULT_SETTINGS;
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return DEFAULT_SETTINGS;
    const v = value as Record<string, unknown>;
    return {
      music: typeof v.music === 'boolean' ? v.music : DEFAULT_SETTINGS.music,
      haptics: typeof v.haptics === 'boolean' ? v.haptics : DEFAULT_SETTINGS.haptics,
      tutorialSeen:
        typeof v.tutorialSeen === 'boolean' ? v.tutorialSeen : DEFAULT_SETTINGS.tutorialSeen,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Device-level options that live outside the game save (music, haptics, tutorial). */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [storage] = useState(() => createSafeStorage(getLocalStorage()));
  const [settings, setSettings] = useState(() => loadSettings(storage));

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        try {
          storage?.setItem(SETTINGS_KEY, JSON.stringify(next));
        } catch {
          // Settings are a nicety; keep running without persistence.
        }
        return next;
      });
    },
    [storage],
  );

  useEffect(() => {
    setHapticsEnabled(settings.haptics);
  }, [settings.haptics]);
  useEffect(() => {
    soundEngine.setMusicEnabled(settings.music);
  }, [settings.music]);

  return [settings, update];
}
