import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings } from '../hooks/useSettings';
import { createSafeStorage } from '../persistence/storage';

beforeEach(() => {
  window.localStorage.clear();
});

describe('title screen and menus', () => {
  it('opens on the title screen with Play and the help/settings buttons', () => {
    render(<App />);
    expect(screen.getByRole('main', { name: /main menu/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /how to play/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });

  it('shows the how-to-play cards on the first Play only', () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    expect(screen.getByRole('dialog', { name: /how to play/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /let.s play/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(loadSettings(createSafeStorage(window.localStorage)).tutorialSeen).toBe(true);
    unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('pauses, opens settings, toggles music and returns to the main menu', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, tutorialSeen: true }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));

    fireEvent.click(screen.getByRole('button', { name: /pause menu/i }));
    expect(screen.getByRole('dialog', { name: /paused/i })).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: /paused/i })).getByRole('button', {
        name: /settings/i,
      }),
    );

    const music = screen.getByRole('switch', { name: /music/i });
    expect(music).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(music);
    expect(screen.getByRole('switch', { name: /music/i })).toHaveAttribute('aria-checked', 'false');
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) as string).music).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /pause menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /main menu/i }));
    expect(screen.getByRole('main', { name: /main menu/i })).toBeInTheDocument();
  });

  it('closes a sheet with Escape', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, tutorialSeen: true }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    fireEvent.click(screen.getByRole('button', { name: /pause menu/i }));
    expect(screen.getByRole('dialog', { name: /paused/i })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('daily challenge and progress', () => {
  beforeEach(() => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, tutorialSeen: true }),
    );
  });

  it('starts the daily from the title and marks the game as a daily', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /daily challenge/i }));
    expect(screen.getByText(/Daily Challenge ·/)).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem('merge-rush.progress.v1') as string).activeDaily,
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('shows the same daily board on every start', () => {
    const boardOf = () => document.querySelectorAll('.tile').length;
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /daily challenge/i }));
    const first = boardOf();
    unmount();
    window.localStorage.clear();
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, tutorialSeen: true }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /daily challenge/i }));
    expect(boardOf()).toBe(first);
  });

  it('opens the progress sheet with missions, themes and achievements', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^progress$/i }));
    const sheet = screen.getByRole('dialog', { name: /progress/i });
    expect(sheet).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /achievements/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neon/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /candy/i })).toBeDisabled();
  });
});

describe('settings storage', () => {
  it('falls back to defaults for missing or corrupt data', () => {
    const storage = createSafeStorage(window.localStorage);
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    window.localStorage.setItem(SETTINGS_KEY, '{nope');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ music: false, haptics: 'x' }));
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, music: false });
  });
});
