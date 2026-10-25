import { emptyPowers } from '../game/powers';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Board, EngineState, GameState, GameStats, Tile } from '../game/types';
import App from '../App';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { saveGame } from '../persistence/saveGame';
import { getSafeLocalStorage } from '../persistence/storage';
import { BOARD_SIZE, SAVE_KEY } from '../game/constants';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs with the project root as cwd; import.meta.url is a dev-server
// URL here, so resolve the stylesheet sources from cwd instead.
const stylesDir = resolve(process.cwd(), 'src/styles');
const globalCss = readFileSync(`${stylesDir}/global.css`, 'utf8');
const tokensCss = readFileSync(`${stylesDir}/tokens.css`, 'utf8');

function fromRows(rows: number[][]): Board {
  return rows.flat();
}

function tilesFromBoard(board: Board): Tile[] {
  const tiles: Tile[] = [];
  let id = 1;
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) {
      tiles.push({
        id: id++,
        value: board[i],
        row: Math.floor(i / BOARD_SIZE),
        col: i % BOARD_SIZE,
      });
    }
  }
  return tiles;
}

function stagedEngine(
  board: Board,
  gameOverrides: Partial<GameState> = {},
  statsOverrides: Partial<GameStats> = {},
): EngineState {
  const tiles = tilesFromBoard(board);
  return {
    game: {
      board,
      tiles,
      score: 0,
      streak: 0,
      rush: { active: false, remaining: 0 },
      rngState: 424242,
      pendingValue: 2,
      nextTileId: tiles.length + 1,
      gameOver: false,
      canUndo: true,
      undoSnapshot: null,
      celebratedRecord: false,
      lastMove: null,
      powers: emptyPowers(),
      rescuesUsed: 0,
      powerBonus: 0,
      ...gameOverrides,
    },
    stats: { best: 0, highestTile: 0, gamesPlayed: 1, ...statsOverrides },
    prefs: { soundOn: true },
  };
}

function tilePositions(): string[] {
  return screen
    .getAllByTestId('tile')
    .map((tile) => tile.getAttribute('data-pos') ?? '');
}

function tileValues(): string[] {
  return screen.getAllByTestId('tile').map((tile) => tile.textContent ?? '');
}

describe('UI: main screen renders', () => {
  it('shows branding, scores, board, next preview, controls, and hint', () => {
    render(<App initialState={stagedEngine(fromRows([
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]))} />);

    expect(screen.getByRole('heading', { name: /merge\s*rush/i })).toBeInTheDocument();
    expect(screen.getByTestId('score')).toHaveTextContent('0');
    expect(screen.getByTestId('best')).toHaveTextContent('0');
    expect(screen.getAllByTestId('tile')).toHaveLength(1);
    expect(screen.getByText('Next')).toBeInTheDocument();
    // Nothing to undo yet in a fresh game.
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /new game/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /mute game sounds/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/swipe the board/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('previews the next tile value', () => {
    render(<App initialState={stagedEngine(fromRows([
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), { pendingValue: 4 })} />);
    expect(screen.getByLabelText('Next tile: 4')).toBeInTheDocument();
  });
});

describe('UI: keyboard controls', () => {
  const staged = () =>
    stagedEngine(fromRows([
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]));

  it('ArrowLeft moves the tile left and spawns the pending tile', () => {
    render(<App initialState={staged()} />);
    expect(tilePositions()).toEqual(['0,3']);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    const positions = tilePositions();
    expect(positions).toContain('0,0');
    expect(positions).toHaveLength(2); // moved tile + spawn
  });

  it('WASD keys move tiles too', () => {
    render(<App initialState={staged()} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(tilePositions()).toContain('0,0');
  });

  it('ignores gameplay keys while the user is typing in a text field', () => {
    function Harness() {
      const [direction, setDirection] = useState('<none>');
      useKeyboardInput((d) => setDirection(d));
      return (
        <div>
          <input aria-label="note" />
          <span data-testid="dir">{direction}</span>
        </div>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('note');
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    fireEvent.keyDown(input, { key: 'w' });
    expect(screen.getByTestId('dir')).toHaveTextContent('<none>');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('dir')).toHaveTextContent('left');
  });
});

describe('UI: undo and restart', () => {
  it('undo restores the board immediately before the last move and is then spent', () => {
    render(
      <App
        initialState={stagedEngine(
          fromRows([
            [0, 0, 0, 2],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ]),
          { score: 12, streak: 1 },
        )}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(tilePositions()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    expect(tilePositions()).toEqual(['0,3']);
    expect(screen.getByTestId('score')).toHaveTextContent('12');
    const undoButton = screen.getByRole('button', { name: /undo/i });
    expect(undoButton).toBeDisabled();
  });

  it('restart begins a fresh game while keeping the best score', () => {
    render(
      <App
        initialState={stagedEngine(
          fromRows([
            [0, 0, 0, 2],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ]),
          { score: 400 },
          { best: 400, highestTile: 64, gamesPlayed: 5 },
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /new game/i }));

    expect(screen.getByTestId('score')).toHaveTextContent('0');
    expect(screen.getByTestId('best')).toHaveTextContent('400');
    const values = tileValues();
    expect(values).toHaveLength(2);
    expect(values.every((value) => value === '2')).toBe(true);
    // Fresh game: undo is available again but disabled until the first move.
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
  });
});

describe('UI: Rush Mode indicator', () => {
  it('shows the multiplier and remaining moves while Rush is active', () => {
    render(
      <App
        initialState={stagedEngine(
          fromRows([
            [0, 0, 0, 2],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ]),
          { rush: { active: true, remaining: 2 } },
        )}
      />,
    );
    expect(screen.getByText('RUSH ×2')).toBeInTheDocument();
    expect(screen.getByText('2 left')).toBeInTheDocument();
    expect(screen.getByLabelText(/Rush Mode active.*2 moves left/i)).toBeInTheDocument();
  });
});

describe('UI: game over', () => {
  const nearEndBoard = () =>
    fromRows([
      [2, 4, 8, 16],
      [16, 8, 4, 2],
      [2, 4, 8, 32],
      [16, 8, 4, 32],
    ]);

  it('shows the overlay after the final merge leaves no legal moves', () => {
    render(
      <App
        initialState={stagedEngine(nearEndBoard(), { pendingValue: 4, canUndo: false })}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowDown' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('final-score')).toHaveTextContent('64');
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
  });

  it('Play Again clears the overlay and starts a new game', () => {
    render(
      <App
        initialState={stagedEngine(nearEndBoard(), { pendingValue: 4, canUndo: false })}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('button', { name: /play again/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tileValues()).toHaveLength(2);
    expect(screen.getByTestId('score')).toHaveTextContent('0');
  });

  it('does not show the overlay while the full board can still merge', () => {
    render(
      <App
        initialState={stagedEngine(
          fromRows([
            [2, 4, 8, 16],
            [16, 8, 4, 2],
            [2, 4, 8, 16],
            [16, 16, 4, 2],
          ]),
        )}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('UI: sound toggle and persistence', () => {
  it('flips the sound state and persists the preference', async () => {
    render(<App />); // no initialState: storage-backed

    const muteButton = screen.getByRole('button', { name: /mute game sounds/i });
    fireEvent.click(muteButton);

    expect(screen.getByRole('button', { name: /unmute game sounds/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await waitFor(() => {
      const raw = window.localStorage.getItem(SAVE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).prefs.soundOn).toBe(false);
    });
  });
});

describe('UI: refresh recovery', () => {
  it('restores an in-progress game from localStorage on boot', () => {
    const storage = getSafeLocalStorage();
    expect(storage).not.toBeNull();
    const staged = stagedEngine(
      fromRows([
        [4, 0, 0, 2],
        [0, 128, 0, 0],
        [0, 0, 32, 0],
        [0, 0, 0, 8],
      ]),
      { score: 777, streak: 2 },
      { best: 900 },
    );
    saveGame(storage, staged);

    render(<App />);

    expect(screen.getByTestId('score')).toHaveTextContent('777');
    expect(screen.getByTestId('best')).toHaveTextContent('900');
    expect(tilePositions().sort()).toEqual(['0,0', '0,3', '1,1', '2,2', '3,3'].sort());
    expect(screen.getByText('Combo')).toBeInTheDocument();
  });
});

describe('UI: mobile layout guard', () => {
  it('guards the page against horizontal overflow and sizes the board responsively', () => {
    // jsdom cannot perform real layout; these assertions pin the guards that
    // prevent horizontal scrolling and keep the board within the viewport.
    expect(globalCss).toMatch(/overflow-x:\s*hidden/);
    expect(globalCss).toContain('safe-area-inset');
    expect(tokensCss).toMatch(/--board-size:\s*min\(/);

    render(<App initialState={stagedEngine(fromRows([
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]))} />);
    const board = screen.getByRole('application', { name: /board/i });
    expect(board).toBeInTheDocument();
  });
});
