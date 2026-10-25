import { useEffect } from 'react';
import type { Direction } from '../game/types';

const KEY_MAP: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Arrow keys and WASD on window. Keystrokes are ignored while the user is
 * typing in an input/textarea/select/contenteditable host or composing text.
 */
export function useKeyboardInput(onDirection: (direction: Direction) => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (isTypingTarget(event.target)) return;
      const direction = KEY_MAP[event.key];
      if (direction === undefined) return;
      event.preventDefault();
      onDirection(direction);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDirection]);
}
