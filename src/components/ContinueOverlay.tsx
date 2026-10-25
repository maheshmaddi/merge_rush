import { REVIVE_BOMBS, REVIVE_RESCUES } from '../game/constants';
import { PowerIcon } from './PowerBar';

interface ContinueOverlayProps {
  score: number;
  /** An ad is playing; buttons are disabled until it closes. */
  busy: boolean;
  onWatch: () => void;
  onDecline: () => void;
}

/**
 * The once-per-game revive offer, shown when a game would end. The player
 * chooses: watch a short ad to keep going, or take the final score.
 */
export function ContinueOverlay({ score, busy, onWatch, onDecline }: ContinueOverlayProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="continue-title">
      <div className="overlay__panel continue">
        <h2 className="overlay__title continue__title" id="continue-title">
          Out of moves!
        </h2>
        <p className="continue__score">{score}</p>
        <p className="continue__pitch">Keep this run alive?</p>
        <div className="continue__rewards" aria-label="Reward">
          <span className="continue__reward">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="heart heart--on">
              <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
            </svg>
            +{REVIVE_RESCUES} rescue
          </span>
          <span className="continue__reward continue__reward--bomb">
            <span className="continue__bomb">
              <PowerIcon id="bomb" />
            </span>
            +{REVIVE_BOMBS} Bomb
          </span>
        </div>
        <button type="button" className="btn btn--primary continue__watch" onClick={onWatch} disabled={busy} autoFocus>
          <span aria-hidden="true">▶</span> Watch ad to continue
        </button>
        <button type="button" className="btn continue__decline" onClick={onDecline} disabled={busy}>
          No thanks
        </button>
      </div>
    </div>
  );
}
