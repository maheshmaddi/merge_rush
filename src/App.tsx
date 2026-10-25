import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction, EngineState, PowerId } from './game/types';
import { POWER_IDS } from './game/constants';
import { hasAnyMoves } from './game/gameOver';
import { TARGETED_POWERS, canUsePower, rescuesLeft } from './game/powers';
import { useAdFlows } from './ads/useAdFlows';
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
import { ContinueOverlay } from './components/ContinueOverlay';
import { PowerBar, POWER_META } from './components/PowerBar';
import { Banner } from './components/Banner';
import { Backdrop } from './components/Backdrop';
import { TitleScreen } from './screens/TitleScreen';
import { HowToPlay } from './screens/HowToPlay';
import { SettingsSheet } from './screens/SettingsSheet';
import { PauseSheet } from './screens/PauseSheet';
import { useSettings } from './hooks/useSettings';
import pkg from '../package.json';

type Screen = 'title' | 'game';
type Sheet = 'howto' | 'settings' | 'pause' | null;

interface AppProps {
  /** Test hook: stage a deterministic starting state. */
  initialState?: EngineState;
}

export default function App({ initialState }: AppProps) {
  const { state, move, undo, firePower, restart, revive, declineRevive, toggleSound } =
    useGameEngine(initialState);
  const reducedMotion = useReducedMotion();
  const lite = useLiteMode();
  const boardRef = useRef<HTMLDivElement>(null);
  const [targeting, setTargeting] = useState<PowerId | null>(null);
  const [settings, updateSettings] = useSettings();
  // Tests stage a state directly and skip the menu.
  const [screen, setScreen] = useState<Screen>(initialState === undefined ? 'title' : 'game');
  const [sheet, setSheet] = useState<Sheet>(null);
  const blocked = screen !== 'game' || sheet !== null;

  // Any swipe cancels an armed power.
  const moveAndDisarm = useCallback(
    (direction: Direction) => {
      if (blocked) return;
      setTargeting(null);
      move(direction);
    },
    [move, blocked],
  );

  useSwipeInput(boardRef, moveAndDisarm);
  useKeyboardInput(moveAndDisarm);

  const selectPower = useCallback(
    (power: PowerId) => {
      if (targeting === power) {
        setTargeting(null);
        return;
      }
      if (blocked || !canUsePower(state.game, power)) return;
      if (TARGETED_POWERS.has(power)) {
        setTargeting(power);
        soundEngine.play('select');
      } else {
        setTargeting(null);
        firePower(power);
      }
    },
    [targeting, state.game, firePower, blocked],
  );

  const pickTile = useCallback(
    (cell: number) => {
      if (targeting === null || blocked) return;
      firePower(targeting, cell);
      setTargeting(null);
    },
    [targeting, firePower, blocked],
  );

  // Keys 1-4 pick powers; Escape disarms.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTargeting(null);
        return;
      }
      if (blocked) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < POWER_IDS.length) {
        selectPower(POWER_IDS[index]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectPower, blocked]);

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
  const ads = useAdFlows({
    game,
    revive,
    declineRevive,
    restart,
  });

  // Full music on the title, a soft bed while playing.
  useEffect(() => {
    soundEngine.setMusicMode(screen === 'title' ? 'title' : 'game');
  }, [screen]);

  const hasGame = game.score > 0 && !game.gameOver;
  const closeHowTo = () => {
    updateSettings({ tutorialSeen: true });
    setSheet(null);
  };
  const play = () => {
    setScreen('game');
    if (!settings.tutorialSeen) setSheet('howto');
  };
  const newGameFromMenu = () => {
    restart();
    play();
  };
  const canUndo = game.canUndo && game.undoSnapshot !== null;
  const beatBest = stats.best > 0 && game.score >= stats.best && game.celebratedRecord;
  const stuck = !game.gameOver && !game.lastChance && !hasAnyMoves(game.board);
  const rescues = rescuesLeft(game.rescuesUsed, game.reviveUsed);

  return (
    <>
      {screen === 'title' && (
        <div className="app app--title">
          <Backdrop rush={false} />
          <TitleScreen
            best={stats.best}
            hasGame={hasGame}
            onPlay={play}
            onNewGame={newGameFromMenu}
            onHowTo={() => setSheet('howto')}
            onSettings={() => setSheet('settings')}
          />
        </div>
      )}
      <div
        className={`app${reducedMotion ? ' app--reduced' : ''}`}
        style={screen === 'title' ? { display: 'none' } : undefined}
      >
        <Backdrop rush={game.rush.active} />
        <Header
          soundOn={prefs.soundOn}
          onToggleSound={toggleSound}
          onPause={() => setSheet('pause')}
          onSettings={() => setSheet('settings')}
        />

        <main className="app__main">
          <ScoreBoard
            score={game.score}
            best={stats.best}
            newRecord={game.lastMove?.newRecord ?? false}
          />
          <StatusBar pendingValue={game.pendingValue} streak={game.streak} rush={game.rush} />

          <div className="board-wrap">
            <Board
              game={game}
              boardRef={boardRef}
              targeting={targeting}
              onTileClick={pickTile}
              lite={lite}
            />
            <Banner
              lastMove={game.lastMove}
              rescuesUsed={game.rescuesUsed}
              reviveUsed={game.reviveUsed}
            />
            {targeting !== null && (
              <div className="board-callout board-callout--target" role="status">
                {POWER_META[targeting].blurb} · tap the power again to cancel
              </div>
            )}
            {targeting === null && stuck && (
              <div className="board-callout board-callout--stuck" role="status">
                {rescues === 1
                  ? 'No moves — last rescue! Fire a power'
                  : `No moves — ${rescues} rescues left. Fire a power!`}
              </div>
            )}
            {ads.reviveOffered && (
              <ContinueOverlay
                score={game.score}
                busy={ads.adPlaying}
                onWatch={ads.watchReviveAd}
                onDecline={ads.declineRevive}
              />
            )}
            {game.gameOver && (
              <GameOverOverlay
                score={game.score}
                best={stats.best}
                isNewBest={beatBest}
                powerBonus={game.powerBonus}
                onPlayAgain={ads.startNextGame}
              />
            )}
          </div>

          <PowerBar game={game} targeting={targeting} onSelect={selectPower} />

          <Controls canUndo={canUndo} onUndo={undo} onRestart={ads.startNextGame} />
          <SwipeHint />
        </main>

        <p className="sr-only" aria-live="polite">
          {game.gameOver ? `Game over. Final score ${game.score}.` : ''}
          {game.lastMove?.rushActivated
            ? 'Rush Mode activated: double points for three moves.'
            : ''}
          {game.lastMove?.score.total ? `${game.lastMove.score.total} points.` : ''}
        </p>
      </div>
      {sheet === 'howto' && <HowToPlay onClose={closeHowTo} />}
      {sheet === 'settings' && (
        <SettingsSheet
          soundOn={prefs.soundOn}
          settings={settings}
          stats={stats}
          version={pkg.version}
          onToggleSound={toggleSound}
          onChange={updateSettings}
          onPrivacy={ads.openPrivacyOptions}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'pause' && (
        <PauseSheet
          onResume={() => setSheet(null)}
          onRestart={() => {
            setSheet(null);
            ads.startNextGame();
          }}
          onSettings={() => setSheet('settings')}
          onHome={() => {
            setSheet(null);
            setScreen('title');
          }}
        />
      )}
    </>
  );
}
