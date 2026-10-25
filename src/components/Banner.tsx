import { useEffect, useRef, useState } from 'react';
import type { LastMoveInfo } from '../game/types';
import { rescuesLeft } from '../game/powers';
import { POWER_META } from './PowerBar';

interface BannerProps {
  lastMove: LastMoveInfo | null;
  rescuesUsed: number;
}

interface BannerItem {
  key: number;
  title: string;
  sub: string;
  tone: 'rush' | 'power' | 'record' | 'rescue';
}

const BANNER_MS = 1300;

/** Big celebratory text that flashes over the board for key moments. */
export function Banner({ lastMove, rescuesUsed }: BannerProps) {
  const [item, setItem] = useState<BannerItem | null>(null);
  const lastRef = useRef<LastMoveInfo | null>(lastMove);

  useEffect(() => {
    if (lastMove === null || lastMove === lastRef.current) return;
    lastRef.current = lastMove;
    let next: BannerItem | null = null;
    if (lastMove.rescue) {
      const left = rescuesLeft(rescuesUsed);
      next = {
        key: Date.now(),
        title: 'RESCUED!',
        sub: left === 0 ? 'no rescues left' : `${left} rescue${left === 1 ? '' : 's'} left`,
        tone: 'rescue',
      };
    } else if (lastMove.rushActivated) {
      next = { key: Date.now(), title: 'RUSH MODE', sub: 'double points · 3 moves', tone: 'rush' };
    } else if (lastMove.newRecord) {
      next = { key: Date.now(), title: 'NEW BEST!', sub: 'keep it going', tone: 'record' };
    } else if (lastMove.powerEarned !== null) {
      const meta = POWER_META[lastMove.powerEarned];
      next = { key: Date.now(), title: `+1 ${meta.name.toUpperCase()}`, sub: 'power charged', tone: 'power' };
    }
    if (next === null) return;
    setItem(next);
    const timer = window.setTimeout(() => setItem(null), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [lastMove, rescuesUsed]);

  if (item === null) return null;
  return (
    <div className={`banner banner--${item.tone}`} key={item.key} aria-hidden="true">
      <span className="banner__title">{item.title}</span>
      <span className="banner__sub">{item.sub}</span>
    </div>
  );
}
