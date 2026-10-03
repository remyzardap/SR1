import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageTitleProps {
  children: ReactNode;
  className?: string;
  /** Render as h2 while keeping the page-title type (for pages that already have an h1). */
  level?: 1 | 2;
}

/** Single-line page title: Inter Tight 42/800, letter-spacing -2px. */
export function PageTitle({ children, className, level = 1 }: PageTitleProps) {
  const Tag = level === 1 ? "h1" : "h2";
  return <Tag className={cn("skx-page-title", className)}>{children}</Tag>;
}

export default PageTitle;
