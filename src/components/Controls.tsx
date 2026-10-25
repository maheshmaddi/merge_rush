interface ControlsProps {
  canUndo: boolean;
  onUndo: () => void;
  onRestart: () => void;
}

export function Controls({ canUndo, onUndo, onRestart }: ControlsProps) {
  return (
    <section className="controls" aria-label="Game controls">
      <button
        type="button"
        className="btn btn--control"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo last move"
        title="Undo last move (one per game)"
      >
        <span aria-hidden="true">↩</span> Undo
      </button>
      <button
        type="button"
        className="btn btn--control btn--primary"
        onClick={onRestart}
        aria-label="Restart with a new game"
        title="New game"
      >
        <span aria-hidden="true">⟳</span> New game
      </button>
    </section>
  );
}
