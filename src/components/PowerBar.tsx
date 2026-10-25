import type { CSSProperties } from 'react';
import type { GameState, PowerId } from '../game/types';
import { MAX_RESCUES, POWER_IDS, POWER_MAX_CHARGES } from '../game/constants';
import { canUsePower, energyCost, rescueLimit, rescuesLeft } from '../game/powers';

interface PowerMeta {
  name: string;
  blurb: string;
  hue: string;
  glow: string;
}

export const POWER_META: Record<PowerId, PowerMeta> = {
  bomb: { name: 'Bomb', blurb: 'Tap a tile to blast it', hue: '#ff6b5e', glow: 'rgba(255, 107, 94, 0.55)' },
  upgrade: { name: 'Upgrade', blurb: 'Tap a tile to double it', hue: '#ffc53d', glow: 'rgba(255, 197, 61, 0.55)' },
  shuffle: { name: 'Shuffle', blurb: 'Scatter every tile', hue: '#38e1ff', glow: 'rgba(56, 225, 255, 0.5)' },
  sweep: { name: 'Sweep', blurb: 'Clear the smallest tiles', hue: '#b388ff', glow: 'rgba(179, 136, 255, 0.55)' },
};

export function PowerIcon({ id }: { id: PowerId }) {
  switch (id) {
    case 'bomb':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <circle cx="14" cy="19" r="9" fill="currentColor" />
          <circle cx="11" cy="16" r="2.6" fill="#fff" opacity="0.45" />
          <rect x="17.5" y="7.5" width="5" height="5" rx="1.2" transform="rotate(45 20 10)" fill="currentColor" />
          <path d="M22 8 q3 -4 6 -2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <circle className="spark" cx="28" cy="5.5" r="2.2" fill="#fff6c2" />
        </svg>
      );
    case 'upgrade':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M16 3 19.4 11.6 28 12.3 21.4 18 23.4 26.6 16 22 8.6 26.6 10.6 18 4 12.3 12.6 11.6Z" fill="currentColor" />
          <path d="M16 9v10M12 13l4-4 4 4" stroke="#2b1a00" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'shuffle':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path
            d="M4 9h5c6 0 8 14 14 14h5M4 23h5c2.6 0 4.4-2.6 6-5.6M28 9h-5c-2.6 0-4.4 2.6-6 5.6"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M24 5l4 4-4 4M24 19l4 4-4 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'sweep':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M22 3 15 15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M9 14l9 5-3 9c-4-1-8-4-10-8z" fill="currentColor" />
          <path d="M10 21l-3 3M13 23l-2 4" stroke="#1d0f3d" strokeWidth="1.6" strokeLinecap="round" />
          <circle className="spark" cx="26" cy="20" r="1.8" fill="#fff" />
          <circle className="spark spark--late" cx="23" cy="27" r="1.3" fill="#fff" />
        </svg>
      );
  }
}

interface PowerBarProps {
  game: GameState;
  targeting: PowerId | null;
  onSelect: (power: PowerId) => void;
}

/**
 * Energy meter plus the four power buttons. Targeted powers (Bomb, Upgrade)
 * arm a tile-picking mode; the others fire immediately.
 */
export function PowerBar({ game, targeting, onSelect }: PowerBarProps) {
  const { powers } = game;
  const cost = energyCost(powers.earned);
  const energyPct = Math.min(100, (powers.energy / cost) * 100);

  return (
    <section className="powers" aria-label="Power-ups">
      <div className="energy" aria-label={`Power energy ${powers.energy} of ${cost}`}>
        <span className="energy__label">Energy</span>
        <span className="energy__track">
          <span className="energy__fill" style={{ width: `${energyPct}%` }} />
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="energy__tick" style={{ left: `${(i + 1) * 20}%` }} />
          ))}
        </span>
        <span className="energy__count">
          {powers.energy}/{cost}
        </span>
        <span
          className="rescues"
          role="img"
          aria-label={`${rescuesLeft(game.rescuesUsed, game.reviveUsed)} of ${rescueLimit(game.reviveUsed)} rescues left`}
          title="Rescues: powers fired on a stuck board"
        >
          {Array.from({ length: rescueLimit(game.reviveUsed) }, (_, i) => (
            <svg
              key={i}
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={[
                'heart',
                // Rescues are spent left to right, so the gold heart is the last one.
                i >= game.rescuesUsed ? 'heart--on' : '',
                // The revive's extra rescue shows as a gold heart.
                i >= MAX_RESCUES ? 'heart--bonus' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
            </svg>
          ))}
        </span>
      </div>

      <div className="powers__row">
        {POWER_IDS.map((id) => {
          const meta = POWER_META[id];
          const charges = powers.charges[id];
          const usable = canUsePower(game, id);
          const armed = targeting === id;
          return (
            <button
              key={id}
              type="button"
              className={[
                'power',
                `power--${id}`,
                armed ? 'power--armed' : '',
                usable ? 'power--ready' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--power-hue': meta.hue, '--power-glow': meta.glow } as CSSProperties}
              onClick={() => onSelect(id)}
              disabled={!usable && !armed}
              aria-pressed={armed}
              aria-label={`${meta.name}: ${meta.blurb}. ${charges} charge${charges === 1 ? '' : 's'}.`}
              title={`${meta.name} — ${meta.blurb}`}
            >
              <span className="power__icon">
                <PowerIcon id={id} />
              </span>
              <span className="power__name">{meta.name}</span>
              <span className="power__charges" aria-hidden="true">
                {Array.from({ length: POWER_MAX_CHARGES }, (_, i) => (
                  <span key={i} className={i < charges ? 'charge charge--on' : 'charge'} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
