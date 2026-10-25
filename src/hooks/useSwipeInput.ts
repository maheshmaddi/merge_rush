import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Direction } from '../game/types';

/** Minimum travel before a gesture counts as a swipe (px). */
const MIN_DISTANCE = 24;
/** The dominant axis must beat the other by this ratio to reject diagonals. */
const DOMINANCE_RATIO = 1.25;

/**
 * Pointer-based swipe detection (covers touch, pen, and mouse drag) on the
 * given element. One move fires per gesture; diagonal gestures without a
 * clear dominant axis are ignored. Page scrolling is prevented via
 * touch-action: none on the board only, so the rest of the page still scrolls.
 */
export function useSwipeInput(
  targetRef: RefObject<HTMLElement>,
  onSwipe: (direction: Direction) => void,
): void {
  useEffect(() => {
    const element = targetRef.current;
    if (!element) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let fired = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      tracking = true;
      fired = false;
      startX = event.clientX;
      startY = event.clientY;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!tracking || fired) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < MIN_DISTANCE) return;

      let direction: Direction | null = null;
      if (absX > absY * DOMINANCE_RATIO) {
        direction = dx > 0 ? 'right' : 'left';
      } else if (absY > absX * DOMINANCE_RATIO) {
        direction = dy > 0 ? 'down' : 'up';
      }
      if (direction !== null) {
        fired = true;
        onSwipe(direction);
      }
    };

    const onPointerEnd = () => {
      tracking = false;
      fired = false;
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerEnd);
    element.addEventListener('pointercancel', onPointerEnd);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [targetRef, onSwipe]);
}
