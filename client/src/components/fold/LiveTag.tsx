import { cn } from "@/lib/utils";

/**
 * Small faded pill with a quietly breathing orange dot, for live previews.
 * Positioned by the parent (`.live-tag` is absolute only inside `.vf`); the dot holds still under reduced motion.
 */
export function LiveTag({ label = "Live", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("live-tag", className)}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
