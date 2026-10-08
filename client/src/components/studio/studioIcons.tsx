import type { ReactNode } from "react";

/* The few prototype icons the shared icon set does not have. Same 96 grid and stroke as the app's icons. */
const paths = {
  back: <path d="M78 48H22M41 28 21 48l20 20" />,
  grid: <><rect x="18" y="18" width="60" height="60" rx="6" /><path d="M38 18v60M58 18v60M18 38h60M18 58h60" /></>,
  stop: <rect x="29" y="29" width="38" height="38" rx="6" />,
  refresh: <><path d="M73 38a27 27 0 1 0 2 18" /><path d="M76 20v20H56" /></>,
} satisfies Record<string, ReactNode>;

export function StudioIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="ico" viewBox="0 0 96 96" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** The mark that sits on each engine card. None of them use the twin-lens shape, which belongs to the logo. */
export function EngineMark({ id }: { id: string }) {
  const common = { viewBox: "0 0 96 96", fill: "none", stroke: "currentColor", strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "gemini") {
    return (
      <svg {...common} aria-hidden="true"><circle cx="37" cy="48" r="21" /><circle cx="59" cy="48" r="21" /></svg>
    );
  }
  if (id === "qwen") {
    return (
      <svg {...common} aria-hidden="true"><path d="M16 64a32 32 0 0 1 64 0" /><path d="M29 64a19 19 0 0 1 38 0" /><path d="M42 64a6 6 0 0 1 12 0" /></svg>
    );
  }
  if (id === "forge") {
    return (
      <svg {...common} aria-hidden="true"><rect x="18" y="22" width="60" height="14" rx="7" /><rect x="18" y="41" width="60" height="14" rx="7" /><rect x="18" y="60" width="60" height="14" rx="7" /></svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true"><rect x="19" y="19" width="58" height="58" rx="17" /><circle cx="48" cy="48" r="12" /></svg>
  );
}
