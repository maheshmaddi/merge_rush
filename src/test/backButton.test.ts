import { describe, expect, it } from 'vitest';
import { EXIT_CONFIRM_MS, resolveBackAction } from '../hooks/backAction';

const base = {
  adPlaying: false,
  sheetOpen: false,
  targetingArmed: false,
  onTitle: false,
  lastExitPress: null as number | null,
};

describe('back button action resolution', () => {
  it('does nothing while an ad is playing (ads own their back handling)', () => {
    expect(resolveBackAction({ ...base, adPlaying: true, sheetOpen: true, onTitle: true })).toBe(
      'none',
    );
  });

  it('closes an open sheet before anything else', () => {
    expect(resolveBackAction({ ...base, sheetOpen: true, targetingArmed: true })).toBe(
      'closeSheet',
    );
    expect(resolveBackAction({ ...base, sheetOpen: true, onTitle: true })).toBe('closeSheet');
  });

  it('disarms an armed targeted power while playing', () => {
    expect(resolveBackAction({ ...base, targetingArmed: true })).toBe('disarm');
  });

  it('returns to the title screen from the game', () => {
    expect(resolveBackAction(base)).toBe('home');
  });

  it('asks for confirmation first on the title screen', () => {
    expect(resolveBackAction({ ...base, onTitle: true })).toBe('exitHint');
  });

  it('exits only when back is pressed again within the confirmation window', () => {
    const pressedAt = 10_000;
    const within = pressedAt + EXIT_CONFIRM_MS;
    expect(resolveBackAction({ ...base, onTitle: true, lastExitPress: pressedAt }, within)).toBe(
      'exit',
    );
    expect(
      resolveBackAction({ ...base, onTitle: true, lastExitPress: pressedAt }, within + 1),
    ).toBe('exitHint');
  });
});
