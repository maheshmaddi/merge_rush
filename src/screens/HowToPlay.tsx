import { useState } from 'react';
import { Sheet } from './Sheet';

const CARDS = [
  {
    icon: '👆',
    title: 'Swipe to merge',
    text: 'Swipe the board. Equal tiles that touch merge into one: 2 + 2 = 4. Reach 2048 and beyond!',
  },
  {
    icon: '🔥',
    title: 'Chain for RUSH MODE',
    text: 'Merge on 3 moves in a row to start Rush Mode: double points for the next three moves.',
  },
  {
    icon: '⚡',
    title: 'Charge your powers',
    text: 'Merging fills the energy bar. Each time it fills you earn a power: Bomb, Upgrade, Shuffle or Sweep. Tap a power to use it.',
  },
  {
    icon: '❤️',
    title: 'Rescues keep you alive',
    text: 'Stuck? Fire a power to get unstuck. You have 3 rescues per game, and unspent charges give bonus points at the end.',
  },
];

interface HowToPlayProps {
  onClose: () => void;
}

export function HowToPlay({ onClose }: HowToPlayProps) {
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const last = index === CARDS.length - 1;
  return (
    <Sheet title="How to play" onClose={onClose}>
      <div className="howto" aria-live="polite">
        <div className="howto__icon" aria-hidden="true">
          {card.icon}
        </div>
        <h3 className="howto__title">{card.title}</h3>
        <p className="howto__text">{card.text}</p>
        <div className="howto__dots" aria-hidden="true">
          {CARDS.map((c, i) => (
            <span
              key={c.title}
              className={i === index ? 'howto__dot howto__dot--on' : 'howto__dot'}
            />
          ))}
        </div>
      </div>
      <div className="sheet__actions">
        {index > 0 && (
          <button type="button" className="btn" onClick={() => setIndex(index - 1)}>
            Back
          </button>
        )}
        <button
          type="button"
          className="btn btn--primary"
          onClick={last ? onClose : () => setIndex(index + 1)}
        >
          {last ? 'Let’s play' : 'Next'}
        </button>
      </div>
    </Sheet>
  );
}
