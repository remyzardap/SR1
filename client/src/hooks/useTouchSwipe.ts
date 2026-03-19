import { useEffect, useRef } from "react";

type SwipeDirection = "left" | "right" | "up" | "down";

interface UseTouchSwipeOptions {
  onSwipe: (direction: SwipeDirection) => void;
  /** Minimum distance (px) to trigger a swipe. Default: 50 */
  threshold?: number;
  /** Maximum perpendicular distance (px) allowed. Default: 100 */
  restraint?: number;
  /** Maximum time (ms) allowed for the swipe. Default: 300 */
  allowedTime?: number;
  /** Whether to prevent the default touch behaviour during swipe. Default: false */
  preventDefault?: boolean;
}

/**
 * Attaches touch-swipe detection to `document` (or a provided element ref).
 * Calls `onSwipe` with the detected direction when the gesture completes.
 */
export function useTouchSwipe(
  options: UseTouchSwipeOptions,
  elementRef?: React.RefObject<HTMLElement | null>
) {
  const {
    onSwipe,
    threshold = 50,
    restraint = 100,
    allowedTime = 300,
    preventDefault = false,
  } = options;

  // Use a ref so the callback is always fresh without re-attaching listeners
  const onSwipeRef = useRef(onSwipe);
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  }, [onSwipe]);

  useEffect(() => {
    const target = elementRef?.current ?? document;

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const handleTouchStart = (e: Event) => {
      const touch = (e as TouchEvent).changedTouches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
    };

    const handleTouchEnd = (e: Event) => {
      const touch = (e as TouchEvent).changedTouches[0];
      const distX = touch.clientX - startX;
      const distY = touch.clientY - startY;
      const elapsed = Date.now() - startTime;

      if (elapsed > allowedTime) return;

      if (Math.abs(distX) >= threshold && Math.abs(distY) <= restraint) {
        if (preventDefault) e.preventDefault();
        onSwipeRef.current(distX < 0 ? "left" : "right");
      } else if (Math.abs(distY) >= threshold && Math.abs(distX) <= restraint) {
        if (preventDefault) e.preventDefault();
        onSwipeRef.current(distY < 0 ? "up" : "down");
      }
    };

    target.addEventListener("touchstart", handleTouchStart, { passive: true });
    target.addEventListener("touchend", handleTouchEnd, { passive: !preventDefault });

    return () => {
      target.removeEventListener("touchstart", handleTouchStart);
      target.removeEventListener("touchend", handleTouchEnd);
    };
  }, [elementRef, threshold, restraint, allowedTime, preventDefault]);
}
