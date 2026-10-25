interface HeaderProps {
  soundOn: boolean;
  onToggleSound: () => void;
}

/** Branding plus the sound settings button. */
export function Header({ soundOn, onToggleSound }: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <svg className="brand__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="mark-a" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#b38bff" />
              <stop offset="1" stopColor="#6d3fe6" />
            </linearGradient>
            <linearGradient id="mark-b" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8ff0ff" />
              <stop offset="1" stopColor="#0aa5d6" />
            </linearGradient>
            <radialGradient id="mark-c">
              <stop offset="0" stopColor="#fff6c2" />
              <stop offset="1" stopColor="#ffb020" />
            </radialGradient>
          </defs>
          <rect x="3" y="13" width="21" height="21" rx="6" fill="url(#mark-a)" transform="rotate(-8 13 23)" />
          <rect x="24" y="13" width="21" height="21" rx="6" fill="url(#mark-b)" transform="rotate(8 34 23)" />
          <path d="M24 14l2.6 6.4 6.9.5-5.3 4.4 1.7 6.7L24 28.3l-5.9 3.7 1.7-6.7-5.3-4.4 6.9-.5z" fill="url(#mark-c)" />
        </svg>
        <h1 className="brand__name">Merge&nbsp;Rush</h1>
      </div>
      <button
        type="button"
        className="btn btn--icon"
        onClick={onToggleSound}
        aria-pressed={soundOn}
        aria-label={soundOn ? 'Sound on. Mute game sounds.' : 'Sound off. Unmute game sounds.'}
        title={soundOn ? 'Mute' : 'Unmute'}
      >
        <span aria-hidden="true">{soundOn ? '🔊' : '🔇'}</span>
      </button>
    </header>
  );
}
