import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
import { cardHover } from "@/lib/design";

export function HoverCard({
  children, style, delay = 0, className,
}: {
  children: ReactNode;
  style: CSSProperties;
  delay?: number;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const t = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(t);
    });
    return () => cancelAnimationFrame(id);
  }, [delay]);

  return (
    <div
      className={className}
      style={{
        ...style,
        ...(hovered ? cardHover : {}),
        opacity: visible ? 1 : 0,
        transform: visible
          ? hovered ? "translateY(-4px)" : "translateY(0)"
          : "translateY(16px)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  );
}
