import { BrandMark } from '../components/Header';

interface TitleScreenProps {
  best: number;
  hasGame: boolean;
  onPlay: () => void;
  onNewGame: () => void;
  onHowTo: () => void;
  onSettings: () => void;
}

const TILES = [2, 4, 8, 16, 32, 64, 128, 256];

/** First screen: logo, Play/Continue, best score, and the help/settings buttons. */
export function TitleScreen({
  best,
  hasGame,
  onPlay,
  onNewGame,
  onHowTo,
  onSettings,
}: TitleScreenProps) {
  return (
    <main className="title" aria-label="Merge Rush main menu">
      <div className="title__tiles" aria-hidden="true">
        {TILES.map((v, i) => (
          <span key={v} className={`title__tile title__tile--${i}`}>
            {v}
          </span>
        ))}
      </div>
      <div className="title__hero">
        <BrandMark className="title__mark" />
        <h1 className="title__name">
          Merge<span> Rush</span>
        </h1>
        <p className="title__tag">Merge · Chain · Rush</p>
      </div>
      <div className="title__actions">
        <button type="button" className="btn btn--primary title__play" onClick={onPlay} autoFocus>
          {hasGame ? 'Continue' : 'Play'}
        </button>
        {hasGame && (
          <button type="button" className="btn title__secondary" onClick={onNewGame}>
            New game
          </button>
        )}
        <div className="title__row">
          <button type="button" className="btn title__small" onClick={onHowTo}>
            <span aria-hidden="true">?</span> How to play
          </button>
          <button type="button" className="btn title__small" onClick={onSettings}>
            <span aria-hidden="true">⚙</span> Settings
          </button>
        </div>
      </div>
      <p className="title__best" aria-label={`Best score ${best}`}>
        <span>Best</span> {best.toLocaleString()}
      </p>
    </main>
  );
}
