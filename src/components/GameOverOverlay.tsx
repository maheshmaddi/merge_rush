interface GameOverOverlayProps {
  score: number;
  best: number;
  isNewBest: boolean;
  onPlayAgain: () => void;
}

export function GameOverOverlay({ score, best, isNewBest, onPlayAgain }: GameOverOverlayProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
      <div className="overlay__panel">
        <h2 className="overlay__title" id="gameover-title">
          No moves left
        </h2>
        <p className="overlay__final" data-testid="final-score">
          {score}
        </p>
        <p className="overlay__best">
          {isNewBest ? 'New best score!' : `Best: ${best}`}
        </p>
        <button type="button" className="btn btn--primary" onClick={onPlayAgain} autoFocus>
          Play Again
        </button>
      </div>
    </div>
  );
}
