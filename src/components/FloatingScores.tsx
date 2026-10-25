import { useEffect, useRef, useState } from 'react';
import type { LastMoveInfo } from '../game/types';

interface FloatingScoresProps {
  lastMove: LastMoveInfo | null;
}

interface FloatItem {
  key: number;
  row: number;
  col: number;
  text: string;
  rush: boolean;
}

const FLOAT_MS = 750;

/**
 * "+points" label that floats up from the strongest merge cell of the last
 * move. Purely decorative; removed from the accessibility tree.
 */
export function FloatingScores({ lastMove }: FloatingScoresProps) {
  const [items, setItems] = useState<FloatItem[]>([]);
  const lastRef = useRef<LastMoveInfo | null>(null);

  useEffect(() => {
    if (lastMove === null || lastMove === lastRef.current) return;
    lastRef.current = lastMove;
    if (lastMove.score.total <= 0 || lastMove.mergeCells.length === 0) {
      setItems([]);
      return;
    }
    const best = lastMove.mergeCells.reduce((max, cell) =>
      cell.value > max.value ? cell : max,
    );
    setItems([
      {
        key: Date.now(),
        row: best.row,
        col: best.col,
        text: `+${lastMove.score.total}`,
        rush: lastMove.score.multiplier > 1,
      },
    ]);
    const timer = window.setTimeout(() => setItems([]), FLOAT_MS);
    return () => window.clearTimeout(timer);
  }, [lastMove]);

  if (items.length === 0) return null;
  return (
    <div className="floats" aria-hidden="true">
      {items.map((item) => (
        <span
          key={item.key}
          className={item.rush ? 'floats__item floats__item--rush' : 'floats__item'}
          style={{ '--row': item.row, '--col': item.col } as React.CSSProperties}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}
