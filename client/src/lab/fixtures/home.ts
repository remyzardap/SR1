/*
 * Lab fixtures for Home. The values are the prototype's own sample content
 * (design/sutaeru-app/app.js: SAMPLE_Q at line 78, the attach names at 666-668, the
 * photo row at 551) so a reviewer is looking at the screen the mock showed, not at
 * invented copy. Nothing here reaches the production bundle: client/src/lab is loaded
 * only when the Design Lab is on, and lab-exclusion.test.ts fails the build if it leaks.
 */
import type { HomeAttachmentRow, HomeSourceRow } from "@/components/home/HomeComposer";
import type { HomeRecentRow } from "@/components/home/HomeScreen";
import { photoUrl } from "@/lib/studioPhotos";

export type HomeLabState =
  | "default"
  | "typing"
  | "files"
  | "attach"
  | "sources"
  | "recording"
  | "stopped"
  | "queued"
  | "private"
  | "no-recents"
  | "loading"
  | "offline";

export const HOME_LAB_STATES: HomeLabState[] = [
  "default",
  "typing",
  "files",
  "attach",
  "sources",
  "recording",
  "stopped",
  "queued",
  "private",
  "no-recents",
  "loading",
  "offline",
];

/** The rows the prototype lists under Recently updated, in the order it lists them. */
export const LAB_HOME_ROWS: HomeRecentRow[] = [
  { id: "run", kind: "running", title: "Rooftop solar payback", when: "Now", progress: 0.42 },
  { id: "answer", kind: "done", title: "How fast do commercial rooftop systems pay back?", when: "Yesterday" },
  {
    id: "photo",
    kind: "photo",
    title: "Ceramic mug, morning light",
    when: "2 days ago",
    image: { src: photoUrl("light-window", "t"), alt: "Ceramic mug, morning light" },
  },
];

/** A finished run, which is what every conversation row becomes once the answer lands. */
export const LAB_HOME_DONE: HomeRecentRow[] = [
  { id: "done", kind: "done", title: "Villa BOQ and budget", when: "Just now", tag: "Done" },
  ...LAB_HOME_ROWS.slice(1),
];

/** The row the prototype draws for a run that was stopped: the pause glyph and an alert chip. */
export const LAB_HOME_STOPPED: HomeRecentRow[] = [
  { id: "stopped", kind: "stopped", title: "Off grid solar board brief", when: "Today", tag: "Stopped" },
  ...LAB_HOME_ROWS.slice(1),
];

/** A question held on screen because the device has no connection. */
export const LAB_HOME_QUEUED: HomeRecentRow[] = [
  { id: "queued", kind: "queued", title: "Summarise the attached file" },
  ...LAB_HOME_DONE,
];

/** The three sources the composer offers; the lab switches them through props. */
export const LAB_HOME_SOURCES: HomeSourceRow[] = [
  { id: "web_search", label: "Web", caption: "News, papers and public sites" },
  { id: "safe_files", label: "My files", caption: "Everything in Files" },
  { id: "browse", label: "Browse", caption: "Pages opened and read in full" },
];

/** The prototype's own sample question, typed but not sent. */
export const LAB_HOME_DRAFT = "How fast do commercial rooftop systems pay back?";

/**
 * The files as the prototype names them, with the sizes it prints. The last row starts
 * climbing when it is built, which is the uploading state a reviewer needs to see.
 */
export function labHomeFiles(): HomeAttachmentRow[] {
  return [
    { id: "held-0", name: "supplier_quotes.pdf", meta: "2.4 MB", icon: "report", startedAt: null },
    {
      id: "held-1",
      name: "Photo, whiteboard",
      meta: "1.1 MB",
      icon: "camera",
      preview: photoUrl("light-window", "t"),
      startedAt: null,
    },
    { id: "pending-lab", name: "Q3 ledger.xlsx", meta: "Google Drive", icon: "plan", startedAt: performance.now() },
  ];
}

/** The fields HomeComposer needs besides its handlers, for one state. */
export interface HomeComposerFixture {
  value: string;
  listening: boolean;
  offline: boolean;
  thinking: boolean;
  privateChat: boolean;
  allowedTools: string[];
  attachments: HomeAttachmentRow[];
  driveEmail: string | null;
  /** The panel this state opens with, so a reviewer can see it without hunting for it. */
  initialPanel: "attach" | "sources" | null;
}

export function homeLabComposer(state: HomeLabState): HomeComposerFixture {
  return {
    value: state === "typing" || state === "recording" ? LAB_HOME_DRAFT : "",
    listening: state === "recording",
    offline: state === "offline",
    thinking: state === "default" || state === "typing",
    privateChat: state === "private",
    allowedTools: ["web_search", "safe_files"],
    attachments: state === "files" || state === "attach" ? labHomeFiles() : [],
    driveEmail: "remy@sutaeru.com",
    initialPanel: state === "attach" ? "attach" : state === "sources" ? "sources" : null,
  };
}

export function homeLabRows(state: HomeLabState): HomeRecentRow[] {
  if (state === "no-recents" || state === "loading") return [];
  if (state === "stopped") return LAB_HOME_STOPPED;
  if (state === "queued" || state === "offline") return LAB_HOME_QUEUED;
  if (state === "default") return LAB_HOME_ROWS;
  return LAB_HOME_DONE;
}
