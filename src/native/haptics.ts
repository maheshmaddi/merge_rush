/**
 * Haptic feedback on the Android/iOS app builds. A no-op on the web, and any
 * plugin failure is swallowed - like audio, haptics are never a crash vector.
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export type HapticKind = 'light' | 'medium' | 'heavy';

const STYLES: Record<HapticKind, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

export function buzz(kind: HapticKind): void {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.impact({ style: STYLES[kind] }).catch(() => undefined);
}
