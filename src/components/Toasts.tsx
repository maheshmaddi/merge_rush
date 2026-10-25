import { useEffect } from 'react';

interface ToastsProps {
  toasts: string[];
  onDismiss: () => void;
}

const TOAST_MS = 3200;

/** Shows queued progress messages (missions, levels, achievements) one at a time. */
export function Toasts({ toasts, onDismiss }: ToastsProps) {
  const current = toasts[0];
  useEffect(() => {
    if (current === undefined) return;
    const timer = window.setTimeout(onDismiss, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [current, onDismiss]);
  if (current === undefined) return null;
  return (
    <div className="toast" role="status" key={`${toasts.length}-${current}`}>
      {current}
    </div>
  );
}
