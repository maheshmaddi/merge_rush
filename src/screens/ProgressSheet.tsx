import { Sheet } from './Sheet';
import type { Progress } from '../progress/progress';
import {
  ACHIEVEMENTS,
  THEMES,
  levelForXp,
  missionDef,
  themeUnlocked,
  xpForLevel,
} from '../progress/rules';
import type { ThemeId } from '../progress/rules';
import { visibleStreak } from '../daily/daily';

interface ProgressSheetProps {
  progress: Progress;
  today: string;
  onTheme: (theme: ThemeId) => void;
  onClose: () => void;
}

/** Level, today's missions, streak, achievements and theme picker. */
export function ProgressSheet({ progress, today, onTheme, onClose }: ProgressSheetProps) {
  const level = levelForXp(progress.xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const pct = Math.min(100, Math.round(((progress.xp - floor) / (ceiling - floor)) * 100));
  const streak = visibleStreak(progress, today);
  const missions = progress.missionsDate === today ? progress.missions : [];

  return (
    <Sheet title="Progress" onClose={onClose}>
      <div className="level">
        <span className="level__badge" aria-label={`Level ${level}`}>
          {level}
        </span>
        <div className="level__bar">
          <div className="level__label">
            Level {level} · {progress.xp - floor}/{ceiling - floor} XP
          </div>
          <div className="meter" role="presentation">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <section aria-label="Daily streak" className="streakline">
        <span aria-hidden="true">🔥</span> {streak}-day streak
        <small>
          Best {progress.bestStreak}
          {progress.freezes > 0
            ? ` · ${progress.freezes} freeze${progress.freezes > 1 ? 's' : ''}`
            : ''}
        </small>
      </section>

      <section aria-label="Today's missions">
        <h3 className="sheet__sub">Today&rsquo;s missions</h3>
        <ul className="missions">
          {missions.map((mission) => {
            const def = missionDef(mission.id);
            if (def === undefined) return null;
            return (
              <li key={mission.id} className={mission.done ? 'mission mission--done' : 'mission'}>
                <span className="mission__text">
                  {mission.done ? '✓ ' : ''}
                  {def.text}
                </span>
                <span className="mission__count">
                  {Math.min(mission.value, def.target)}/{def.target}
                </span>
              </li>
            );
          })}
          {missions.length === 0 && (
            <li className="mission">Play a game to get today&rsquo;s missions.</li>
          )}
        </ul>
      </section>

      <section aria-label="Themes">
        <h3 className="sheet__sub">Tile themes</h3>
        <div className="themes">
          {THEMES.map((theme) => {
            const open = themeUnlocked(theme.id, level);
            return (
              <button
                key={theme.id}
                type="button"
                className={`theme theme--${theme.id}${progress.theme === theme.id ? ' theme--on' : ''}`}
                disabled={!open}
                aria-pressed={progress.theme === theme.id}
                onClick={() => onTheme(theme.id)}
              >
                <span className="theme__swatch" aria-hidden="true" />
                <span>{theme.name}</span>
                {!open && <small>Level {theme.level}</small>}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Achievements">
        <h3 className="sheet__sub">
          Achievements {progress.achievements.length}/{ACHIEVEMENTS.length}
        </h3>
        <ul className="badges">
          {ACHIEVEMENTS.map((a) => {
            const got = progress.achievements.includes(a.id);
            return (
              <li key={a.id} className={got ? 'badge badge--on' : 'badge'}>
                <strong>{got ? a.title : '???'}</strong>
                <small>{a.hint}</small>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="sheet__actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
