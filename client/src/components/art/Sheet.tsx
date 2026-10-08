import * as React from "react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Reusable bottom sheet honoring reduced motion:
 * - Grab handle (.grab)
 * - Backdrop scrim (.sheet-scrim)
 * - Closes on backdrop click or Escape
 * - Dialog role and accessibility attributes
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const content = (
    <div className={cn("sheet-wrap open", className)} role="presentation">
      <div className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Dialog"}
      >
        <span className="grab" aria-hidden="true" />
        {title ? <h2 className="sheet-title">{title}</h2> : null}
        {description ? <p className="sheet-p">{description}</p> : null}
        {children}
      </div>
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(content, document.body);
  }

  return content;
}

export default Sheet;
