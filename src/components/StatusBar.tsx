import type { RushState } from '../game/types';
import { RUSH_MOVES, RUSH_TRIGGER_STREAK } from '../game/constants';
import { NextTilePreview } from './NextTilePreview';

interface StatusBarProps {
  pendingValue: 2 | 4;
  streak: number;
  rush: RushState;
}

/**
 * The row above the board: next tile preview, combo streak meter, and the
 * Rush Mode indicator with its multiplier and remaining moves.
 */
export function StatusBar({ pendingValue, streak, rush }: StatusBarProps) {
  return (
    <section className="statusbar" aria-label="Combo and Rush status">
      <NextTilePreview value={pendingValue} />

      <div className="combo" aria-label={`Combo streak ${streak}`}>
        <span className="combo__label">Combo</span>
        <span className="combo__pips" aria-hidden="true">
          {Array.from({ length: RUSH_TRIGGER_STREAK }, (_, i) => (
            <span key={i} className={i < streak ? 'pip pip--on' : 'pip'} />
          ))}
        </span>
        <span className="combo__count">{rush.active ? '—' : `${RUSH_TRIGGER_STREAK - streak} to rush`}</span>
      </div>

      <div
        className={rush.active ? 'rush rush--on' : 'rush'}
        aria-live="polite"
        aria-label={
          rush.active
            ? `Rush Mode active, double points, ${rush.remaining} moves left`
            : 'Rush Mode inactive'
        }
      >
        <span className="rush__name">RUSH ×2</span>
        {rush.active && (
          <>
            <span className="rush__pips" aria-hidden="true">
              {Array.from({ length: RUSH_MOVES }, (_, i) => (
                <span key={i} className={i < rush.remaining ? 'pip pip--gold' : 'pip'} />
              ))}
            </span>
            <span className="rush__moves">{rush.remaining} left</span>
          </>
        )}
      </div>
    </section>
  );
}
