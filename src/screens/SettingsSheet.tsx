import { Sheet } from './Sheet';
import type { Settings } from '../hooks/useSettings';
import { PRIVACY_POLICY_URL } from '../components/SwipeHint';

interface SettingsSheetProps {
  soundOn: boolean;
  settings: Settings;
  stats: { best: number; highestTile: number; gamesPlayed: number };
  version: string;
  onToggleSound: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onPrivacy?: () => void;
  onClose: () => void;
}

function Toggle({
  label,
  hint,
  on,
  onClick,
}: {
  label: string;
  hint: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="setting" role="switch" aria-checked={on} onClick={onClick}>
      <span className="setting__text">
        <span className="setting__label">{label}</span>
        <span className="setting__hint">{hint}</span>
      </span>
      <span className={on ? 'switch switch--on' : 'switch'} aria-hidden="true" />
    </button>
  );
}

export function SettingsSheet({
  soundOn,
  settings,
  stats,
  version,
  onToggleSound,
  onChange,
  onPrivacy,
  onClose,
}: SettingsSheetProps) {
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="settings">
        <Toggle
          label="Sound effects"
          hint="Merges, powers and rewards"
          on={soundOn}
          onClick={onToggleSound}
        />
        <Toggle
          label="Music"
          hint="Background music"
          on={settings.music}
          onClick={() => onChange({ music: !settings.music })}
        />
        <Toggle
          label="Vibration"
          hint="Haptic feedback on your phone"
          on={settings.haptics}
          onClick={() => onChange({ haptics: !settings.haptics })}
        />
      </div>
      <dl className="stats" aria-label="Your stats">
        <div>
          <dt>Best score</dt>
          <dd>{stats.best.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Highest tile</dt>
          <dd>{stats.highestTile || '–'}</dd>
        </div>
        <div>
          <dt>Games played</dt>
          <dd>{stats.gamesPlayed}</dd>
        </div>
      </dl>
      <div className="sheet__links">
        {onPrivacy && (
          <button type="button" className="linkbtn" onClick={onPrivacy}>
            Ad privacy choices
          </button>
        )}
        <a className="linkbtn" href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
          Privacy policy
        </a>
      </div>
      <p className="sheet__version">Merge Rush v{version}</p>
      <div className="sheet__actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
