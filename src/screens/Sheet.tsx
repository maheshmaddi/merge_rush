import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Full-screen modal panel used by How to play, Settings and Pause. */
export function Sheet({ title, onClose, children }: SheetProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet__panel">
        <h2 className="sheet__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
