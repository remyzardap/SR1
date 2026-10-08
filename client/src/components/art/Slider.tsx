import * as React from "react";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

export interface SliderProps {
  /** Current value. */
  value: number;
  /** Minimum value (default 0). */
  min?: number;
  /** Maximum value (default 100). */
  max?: number;
  /** Step increment (default 1). */
  step?: number;
  /** Callback fired when the value changes. */
  onChange?: (next: number) => void;
  /** Accessible name for the slider. */
  label: string;
  /** Disabled state. */
  disabled?: boolean;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * Slider:
 * Themed range / slider component featuring:
 * - Clean 4-6 px track and solid fill
 * - 28 px thumb with ink border
 * - Zero browser-default blue anywhere
 * - Keyboard navigation (ArrowLeft/Right, ArrowUp/Down, Home, End, PageUp/Down)
 * - Full ARIA slider semantics (role="slider", aria-valuenow, etc.)
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  disabled = false,
  className,
  id,
  style,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const clampedValue = Math.max(min, Math.min(max, value));
  const range = Math.max(1e-5, max - min);
  const pct = Math.max(0, Math.min(100, ((clampedValue - min) / range) * 100));

  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (disabled || !trackRef.current || !onChange) return;
      const rect = trackRef.current.getBoundingClientRect();
      const rawFrac = (clientX - rect.left) / rect.width;
      const clampedFrac = Math.max(0, Math.min(1, rawFrac));
      const rawVal = min + clampedFrac * (max - min);
      const steppedVal = Math.round((rawVal - min) / step) * step + min;
      const decimals = (String(step).split(".")[1] ?? "").length;
      const finalVal = Number(Math.max(min, Math.min(max, steppedVal)).toFixed(decimals));
      onChange(finalVal);
    },
    [disabled, max, min, onChange, step]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    updateFromPointer(e.clientX);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !onChange) return;
    let nextVal = clampedValue;
    const bigStep = Math.max(step * 5, (max - min) / 10);

    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        nextVal = Math.min(max, clampedValue + step);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        nextVal = Math.max(min, clampedValue - step);
        break;
      case "PageUp":
        nextVal = Math.min(max, clampedValue + bigStep);
        break;
      case "PageDown":
        nextVal = Math.max(min, clampedValue - bigStep);
        break;
      case "Home":
        nextVal = min;
        break;
      case "End":
        nextVal = max;
        break;
      default:
        return;
    }

    e.preventDefault();
    onChange(nextVal);
  };

  return (
    <div
      id={id}
      className={cn("art-slider-root", disabled && "is-disabled", className)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: 36,
        userSelect: "none",
        touchAction: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}
      role="slider"
      aria-label={label}
      aria-valuenow={clampedValue}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {/* 4px rounded track */}
      <div
        ref={trackRef}
        className="art-slider-track"
        style={{
          position: "relative",
          width: "100%",
          height: 4,
          borderRadius: 999,
          background: "var(--r-rule, #d2d0c8)",
          overflow: "visible",
        }}
      >
        {/* Solid ink fill */}
        <div
          className="art-slider-fill"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            borderRadius: 999,
            background: "var(--r-ink, #242320)",
          }}
        />

        {/* 28 px thumb with ink border */}
        <div
          className="art-slider-thumb"
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--r-card, #FFFFFF)",
            border: "2px solid var(--r-ink, #242320)",
            boxShadow: "0 1px 3px var(--r-shadow, rgba(36,35,32,0.18))",
            cursor: disabled ? "not-allowed" : "grab",
            transition: "box-shadow 160ms ease, transform 120ms ease",
          }}
        />
      </div>
    </div>
  );
}

export default Slider;
