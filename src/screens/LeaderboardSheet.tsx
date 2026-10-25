import { useState } from 'react';
import { Sheet } from './Sheet';
import { leaderboards } from '../social/leaderboard';
import type { BoardKind } from '../social/leaderboard';

interface LeaderboardSheetProps {
  onClose: () => void;
}

/** Picks which Google Play Games leaderboard to open. */
export function LeaderboardSheet({ onClose }: LeaderboardSheetProps) {
  const [message, setMessage] = useState('');
  const open = async (kind: BoardKind) => {
    const shown = await leaderboards.show(kind);
    setMessage(
      shown
        ? ''
        : 'Could not open the leaderboard. Check your connection and Google Play Games sign-in.',
    );
  };
  return (
    <Sheet title="Leaderboards" onClose={onClose}>
      <div className="sheet__stack">
        <button type="button" className="btn btn--primary" onClick={() => void open('allTime')}>
          High scores
        </button>
        <button type="button" className="btn" onClick={() => void open('daily')}>
          Daily Challenge
        </button>
      </div>
      {message !== '' && (
        <p className="howto__text" role="status">
          {message}
        </p>
      )}
      <div className="sheet__actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
