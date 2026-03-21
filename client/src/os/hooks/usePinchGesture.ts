import { useRef, useEffect, useCallback } from 'react';

interface PinchOptions {
  onPinch?: () => void;
  onLongPress?: () => void;
  enabled?: boolean;
  pinchThreshold?: number;
  longPressMs?: number;
}

export function usePinchGesture(
  ref: React.RefObject<HTMLElement>,
  options: PinchOptions = {}
) {
  const {
    onPinch,
    onLongPress,
    enabled = true,
    pinchThreshold = 0.7,
    longPressMs = 500,
  } = options;

  const initialDistance = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFire = useRef(false);

  const getDistance = useCallback((t1: Touch, t2: Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      didFire.current = false;

      // Two-finger pinch
      if (e.touches.length === 2) {
        initialDistance.current = getDistance(e.touches[0], e.touches[1]);
        clearTimeout(longPressTimer.current!);
        return;
      }

      // Single-finger long press
      if (e.touches.length === 1) {
        longPressTimer.current = setTimeout(() => {
          if (!didFire.current) {
            didFire.current = true;
            if (navigator.vibrate) navigator.vibrate(10);
            onLongPress?.();
          }
        }, longPressMs);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      // Cancel long press on any move
      clearTimeout(longPressTimer.current!);

      if (e.touches.length === 2 && initialDistance.current !== null) {
        const current = getDistance(e.touches[0], e.touches[1]);
        const ratio = current / initialDistance.current;

        if (ratio < pinchThreshold && !didFire.current) {
          didFire.current = true;
          if (navigator.vibrate) navigator.vibrate(10);
          onPinch?.();
          initialDistance.current = null;
        }
      }
    };

    const onTouchEnd = () => {
      clearTimeout(longPressTimer.current!);
      initialDistance.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      clearTimeout(longPressTimer.current!);
    };
  }, [ref, enabled, onPinch, onLongPress, pinchThreshold, longPressMs, getDistance]);
}
