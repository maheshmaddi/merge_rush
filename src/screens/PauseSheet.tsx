import { Sheet } from './Sheet';

interface PauseSheetProps {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onHome: () => void;
}

export function PauseSheet({ onResume, onRestart, onSettings, onHome }: PauseSheetProps) {
  return (
    <Sheet title="Paused" onClose={onResume}>
      <div className="sheet__stack">
        <button type="button" className="btn btn--primary" onClick={onResume} autoFocus>
          Resume
        </button>
        <button type="button" className="btn" onClick={onRestart}>
          New game
        </button>
        <button type="button" className="btn" onClick={onSettings}>
          Settings
        </button>
        <button type="button" className="btn" onClick={onHome}>
          Main menu
        </button>
      </div>
    </Sheet>
  );
}
