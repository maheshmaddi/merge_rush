import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { soundEngine } from '../audio/soundEngine';
import { buzz } from '../native/haptics';

interface MilestoneProps {
  game: GameState;
  lite: boolean;
  reducedMotion: boolean;
}

const MILESTONES = [512, 1024, 2048, 4096, 8192];
const SHOW_MS = 2000;
const CONFETTI = 22;

/** Celebrates the first 512 / 1024 / 2048 ... tile of each game. */
export function Milestone({ game, lite, reducedMotion }: MilestoneProps) {
  const [shown, setShown] = useState<{ value: number; key: number } | null>(null);
  const reached = useRef(0);

  const maxTile = game.tiles.reduce((max, tile) => Math.max(max, tile.value), 0);
  const freshGame = game.score === 0 && game.tiles.length <= 2;

  useEffect(() => {
    if (freshGame) reached.current = 0;
  }, [freshGame]);

  useEffect(() => {
    // A restored save should not replay milestones already passed.
    const hit = MILESTONES.filter((m) => m <= maxTile && m > reached.current).pop();
    if (hit === undefined) return;
    const firstSight = reached.current === 0 && game.lastMove === null;
    reached.current = hit;
    if (firstSight) return;
    setShown({ value: hit, key: Date.now() });
    soundEngine.play('milestone', { value: hit });
    buzz('heavy');
  }, [maxTile, game.lastMove]);

  useEffect(() => {
    if (shown === null) return;
    const timer = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (shown === null) return null;
  const pieces = reducedMotion ? 0 : lite ? 10 : CONFETTI;
  return (
    <div
      className="milestone"
      key={shown.key}
      role="status"
      aria-label={`${shown.value} tile reached`}
    >
      <div className="milestone__value">{shown.value}!</div>
      <div className="milestone__sub">{shown.value >= 2048 ? 'LEGENDARY' : 'AMAZING'}</div>
      {Array.from({ length: pieces }, (_, i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              '--x': `${((i * 37) % 100) - 50}vw`,
              '--r': `${(i * 83) % 360}deg`,
              '--d': `${(i % 5) * 60}ms`,
              '--h': `${(i * 47) % 360}`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
