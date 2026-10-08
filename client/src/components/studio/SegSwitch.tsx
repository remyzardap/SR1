import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface SegOption<T extends string> {
  id: T;
  label: string;
}

/** A small segmented switch with the sliding ink thumb (`.seg`). */
export function SegSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (next: T) => void;
  label: string;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (on) setThumb({ x: on.offsetLeft - 2, w: on.offsetWidth });
    };
    place();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [value, options.length]);

  return (
    <div ref={root} className={cn("seg small", className)} role="group" aria-label={label}>
      <span className="thumb" style={thumb ? { width: thumb.w, transform: `translateX(${thumb.x}px)` } : { width: 0 }} />
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default SegSwitch;
