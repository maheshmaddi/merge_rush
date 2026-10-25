import { LEFTOVER_CHARGE_BONUS } from '../game/constants';

interface GameOverOverlayProps {
  score: number;
  best: number;
  isNewBest: boolean;
  /** Points from unspent charges, cashed in when the game ended. */
  powerBonus: number;
  onPlayAgain: () => void;
  onShare?: () => void;
  /** Extra line, e.g. the daily-challenge result. */
  note?: string;
}

export function GameOverOverlay({
  score,
  best,
  isNewBest,
  powerBonus,
  onPlayAgain,
  onShare,
  note,
}: GameOverOverlayProps) {
  // Charges left over means the game ended on the rescue limit, not on an
  // empty power bar.
  const outOfRescues = powerBonus > 0;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
      <div className="overlay__panel">
        <h2 className="overlay__title" id="gameover-title">
          {outOfRescues ? 'Out of rescues' : 'No moves left'}
        </h2>
        <p className="overlay__final" data-testid="final-score">
          {score}
        </p>
        {powerBonus > 0 && (
          <p className="overlay__bonus" data-testid="power-bonus">
            +{powerBonus} power bonus · {powerBonus / LEFTOVER_CHARGE_BONUS} unspent charge
            {powerBonus / LEFTOVER_CHARGE_BONUS === 1 ? '' : 's'}
          </p>
        )}
        <p className="overlay__best">
          {isNewBest ? 'New best score!' : `Best: ${best}`}
        </p>
        {note !== undefined && <p className="overlay__note">{note}</p>}
        <button type="button" className="btn btn--primary" onClick={onPlayAgain} autoFocus>
          Play Again
        </button>
        {onShare !== undefined && (
          <button type="button" className="btn" onClick={onShare}>
            Share score
          </button>
        )}
      </div>
    </div>
  );
}
