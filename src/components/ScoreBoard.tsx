interface ScoreBoardProps {
  score: number;
  best: number;
  /** Flashes a celebration when the current move set a new record. */
  newRecord: boolean;
}

export function ScoreBoard({ score, best, newRecord }: ScoreBoardProps) {
  return (
    <section className="scores" aria-label="Scores">
      <div className="score">
        <span className="score__label">Score</span>
        <span className="score__value" data-testid="score">
          {score}
        </span>
      </div>
      <div className="score score--best">
        <span className="score__label">Best</span>
        <span className="score__value" data-testid="best">
          {best}
        </span>
        {newRecord && (
          <span className="score__record" aria-hidden="true">
            ★ new
          </span>
        )}
      </div>
    </section>
  );
}
