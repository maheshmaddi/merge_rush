import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction, EngineState, PowerId } from './game/types';
import { POWER_IDS } from './game/constants';
import { hasAnyMoves } from './game/gameOver';
import { TARGETED_POWERS, canUsePower, rescuesLeft } from './game/powers';
import { useGameEngine } from './hooks/useGameEngine';
import { useSwipeInput } from './hooks/useSwipeInput';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useLiteMode } from './hooks/useLiteMode';
import { soundEngine } from './audio/soundEngine';
import { Header } from './components/Header';
import { ScoreBoard } from './components/ScoreBoard';
import { StatusBar } from './components/StatusBar';
import { Board } from './components/Board';
import { Controls } from './components/Controls';
import { SwipeHint } from './components/SwipeHint';
import { GameOverOverlay } from './components/GameOverOverlay';
import { PowerBar, POWER_META } from './components/PowerBar';
import { Banner } from './components/Banner';
import { Backdrop } from './components/Backdrop';

interface AppProps {
  /** Test hook: stage a deterministic starting state. */
  initialState?: EngineState;
}

export default function App({ initialState }: AppProps) {
  const { state, move, undo, firePower, restart, toggleSound } = useGameEngine(initialState);
  const reducedMotion = useReducedMotion();
  const lite = useLiteMode();
  const boardRef = useRef<HTMLDivElement>(null);
  const [targeting, setTargeting] = useState<PowerId | null>(null);

  // Any swipe cancels an armed power.
  const moveAndDisarm = useCallback(
    (direction: Direction) => {
      setTargeting(null);
      move(direction);
    },
    [move],
  );

  useSwipeInput(boardRef, moveAndDisarm);
  useKeyboardInput(moveAndDisarm);

  const selectPower = useCallback(
    (power: PowerId) => {
      if (targeting === power) {
        setTargeting(null);
        return;
      }
      if (!canUsePower(state.game, power)) return;
      if (TARGETED_POWERS.has(power)) {
        setTargeting(power);
        soundEngine.play('select');
      } else {
        setTargeting(null);
        firePower(power);
      }
    },
    [targeting, state.game, firePower],
  );

  const pickTile = useCallback(
    (cell: number) => {
      if (targeting === null) return;
      firePower(targeting, cell);
      setTargeting(null);
    },
    [targeting, firePower],
  );

  // Keys 1-4 pick powers; Escape disarms.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTargeting(null);
        return;
      }
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < POWER_IDS.length) {
        selectPower(POWER_IDS[index]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectPower]);

  // Disarm when the armed power can no longer be used (undo, restart, ...).
  useEffect(() => {
    if (targeting !== null && !canUsePower(state.game, targeting)) setTargeting(null);
  }, [targeting, state.game]);

  // Web Audio contexts may only start from a user gesture.
  useEffect(() => {
    const unlock = () => soundEngine.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const { game, stats, prefs } = state;
  const canUndo = game.canUndo && game.undoSnapshot !== null;
  const beatBest = stats.best > 0 && game.score >= stats.best && game.celebratedRecord;
  const stuck = !game.gameOver && !hasAnyMoves(game.board);

  return (
    <div className={`app${reducedMotion ? ' app--reduced' : ''}`}>
      <Backdrop rush={game.rush.active} />
      <Header soundOn={prefs.soundOn} onToggleSound={toggleSound} />

      <main className="app__main">
        <ScoreBoard
          score={game.score}
          best={stats.best}
          newRecord={game.lastMove?.newRecord ?? false}
        />
        <StatusBar pendingValue={game.pendingValue} streak={game.streak} rush={game.rush} />

        <div className="board-wrap">
          <Board game={game} boardRef={boardRef} targeting={targeting} onTileClick={pickTile} lite={lite} />
          <Banner lastMove={game.lastMove} rescuesUsed={game.rescuesUsed} />
          {targeting !== null && (
            <div className="board-callout board-callout--target" role="status">
              {POWER_META[targeting].blurb} · tap the power again to cancel
            </div>
          )}
          {targeting === null && stuck && (
            <div className="board-callout board-callout--stuck" role="status">
              {rescuesLeft(game.rescuesUsed) === 1
                ? 'No moves — last rescue! Fire a power'
                : `No moves — ${rescuesLeft(game.rescuesUsed)} rescues left. Fire a power!`}
            </div>
          )}
          {game.gameOver && (
            <GameOverOverlay
              score={game.score}
              best={stats.best}
              isNewBest={beatBest}
              powerBonus={game.powerBonus}
              rescuesUsed={game.rescuesUsed}
              onPlayAgain={restart}
            />
          )}
        </div>

        <PowerBar game={game} targeting={targeting} onSelect={selectPower} />

        <Controls canUndo={canUndo} onUndo={undo} onRestart={restart} />
        <SwipeHint />
      </main>

      <p className="sr-only" aria-live="polite">
        {game.gameOver ? `Game over. Final score ${game.score}.` : ''}
        {game.lastMove?.rushActivated ? 'Rush Mode activated: double points for three moves.' : ''}
        {game.lastMove?.score.total ? `${game.lastMove.score.total} points.` : ''}
      </p>
    </div>
  );
}
