import { useEffect, useRef } from "react";

/**
 * Attaches touch listeners to `targetRef` and calls `onClose` when the user
 * swipes left by more than `threshold` pixels (default 60 px).
 * Only active when `isOpen` is true.
 */
export function useSwipeToClose(
  targetRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  threshold = 60
) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el || !isOpen) return;

    const handleTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (startX.current === null || startY.current === null) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - startY.current);
      // Only treat as a horizontal swipe if horizontal movement dominates
      if (dx < -threshold && dy < Math.abs(dx) * 0.5) {
        onClose();
      }
      startX.current = null;
      startY.current = null;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isOpen, onClose, targetRef, threshold]);
}
