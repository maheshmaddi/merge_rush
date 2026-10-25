import { BrandMark } from '../components/Header';

interface TitleScreenProps {
  best: number;
  hasGame: boolean;
  onPlay: () => void;
  onNewGame: () => void;
  onHowTo: () => void;
  onSettings: () => void;
  onProgress: () => void;
  onDaily: () => void;
  /** Present only where Google Play Games leaderboards are available. */
  onLeaderboard?: () => void;
  /** Day streak shown on the Daily button. */
  streak: number;
  /** Today's daily best, or 0 if not played yet. */
  dailyBest: number;
  level: number;
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
  onProgress,
  onDaily,
  onLeaderboard,
  streak,
  dailyBest,
  level,
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
        <button type="button" className="btn title__daily" onClick={onDaily}>
          <span className="title__daily-main">
            <span aria-hidden="true">📅</span> Daily Challenge
          </span>
          <small>
            {dailyBest > 0
              ? `Today's best ${dailyBest.toLocaleString()}`
              : 'Same board for everyone'}
            {streak > 0 ? ` · 🔥 ${streak}` : ''}
          </small>
        </button>
        <div className="title__row">
          <button
            type="button"
            className="btn title__small"
            onClick={onProgress}
            aria-label="Progress"
          >
            <span aria-hidden="true">🏆</span> Lv {level}
          </button>
          <button
            type="button"
            className="btn title__small"
            onClick={onHowTo}
            aria-label="How to play"
          >
            <span aria-hidden="true">?</span> Help
          </button>
          <button
            type="button"
            className="btn title__small"
            onClick={onSettings}
            aria-label="Settings"
          >
            <span aria-hidden="true">⚙</span> Settings
          </button>
        </div>
        {onLeaderboard !== undefined && (
          <button type="button" className="btn title__small" onClick={onLeaderboard}>
            <span aria-hidden="true">🌍</span> Leaderboards
          </button>
        )}
      </div>
      <p className="title__best" aria-label={`Best score ${best}`}>
        <span>Best</span> {best.toLocaleString()}
      </p>
    </main>
  );
}
