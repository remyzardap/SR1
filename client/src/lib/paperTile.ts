import type { SutaeruIconName } from "@/components/SutaeruIcon";

/* One tone for every picker thumbnail: a white page tile with a line icon, sitting on the panel.
   The picker pictures in /studio/o/ are not shown as photos any more; each id maps to the line
   icon that says the same thing. Sample photos (forge-*) stay photos: they are the work itself. */

const ICON: Record<string, SutaeruIconName> = {
  fast: "send", research: "research", image: "image", document: "report", code: "code",
  "out-report": "report", "out-slides": "plan", "out-table": "schedule", "out-monitor": "wave",
  "doc-proposal": "report", "doc-report": "report", "doc-resume": "agent", "doc-letter": "send",
  rewrite: "edit", reformat: "review",
  "model-auto": "make", "model-fast": "send", "model-best": "models",
  "src-web": "web", "src-files": "files", "src-drive": "connections",
  "eng-forge": "models",
  "nav-chat": "ask", "nav-agent": "agent", "nav-images": "image", "nav-documents": "report", "nav-files": "files", "nav-video": "video",
  "depth-quick": "make", "depth-standard": "research", "depth-deep": "memory",
  "tone-confident": "check", "tone-friendly": "ask", "tone-formal": "admin", "tone-plain": "edit",
  "len-short": "more", "len-medium": "report", "len-long": "memory",
  "style-keep": "lock", "style-modern": "make", "style-classic": "bookmark",
  "theme-dark": "eyeoff", "theme-light": "make", "theme-auto": "settings",
  "motion-full": "wave", "motion-reduced": "pause",
  "voice-warm": "voice", "voice-bright": "voice",
  "reformat-before": "copy", "reformat-after": "files",
};

const PICK = /^\/studio\/o\/([a-z0-9-]+)\.webp(?:\?.*)?$/;

/** The picker id inside a /studio/o/ picture url, or null for any other image. */
export function pickIdOf(url: string): string | null {
  const m = PICK.exec(url);
  return m ? m[1] : null;
}

/** The line icon for a picker picture, or null when it should stay a photo (samples, other images). */
export function paperIconFor(url: string): SutaeruIconName | null {
  const id = pickIdOf(url);
  if (!id || id.startsWith("forge-")) return null;
  return ICON[id] ?? "report";
}
