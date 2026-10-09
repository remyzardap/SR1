/*
 * Lab fixtures for Home and the composer. The values are the prototype's own sample
 * content (design/sutaeru-app/app.js: SAMPLE_Q at line 78, the attach names at 666-668)
 * so a reviewer is looking at the screen the mock showed, not at invented copy. Nothing
 * here reaches the production bundle: client/src/lab is loaded only when the Design Lab
 * is on, and lab-exclusion.test.ts fails the build if it leaks.
 */
import { chatModes } from "@/components/chat/ModeMenu";
import type { HomeAttachmentRow, HomeSourceRow } from "@/components/home/HomeComposer";
import { photoUrl } from "@/lib/studioPhotos";

export type HomeLabState =
  | "default"
  | "typing"
  | "files"
  | "attach"
  | "mode"
  | "deep"
  | "image"
  | "recording"
  | "private"
  | "loading"
  | "offline";

export const HOME_LAB_STATES: HomeLabState[] = [
  "default",
  "typing",
  "files",
  "attach",
  "mode",
  "deep",
  "image",
  "recording",
  "private",
  "loading",
  "offline",
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
  mode: string;
  modes: ReturnType<typeof chatModes>;
  thinking: boolean;
  privateChat: boolean;
  allowedTools: string[];
  attachments: HomeAttachmentRow[];
  driveEmail: string | null;
  /** The panel this state opens with, so a reviewer can see it without hunting for it. */
  initialPanel: "attach" | "mode" | null;
}

export function homeLabComposer(state: HomeLabState): HomeComposerFixture {
  return {
    value: state === "typing" || state === "recording" ? LAB_HOME_DRAFT : "",
    listening: state === "recording",
    offline: state === "offline",
    mode: state === "deep" ? "deep" : state === "image" ? "image" : "fast",
    modes: chatModes(false),
    thinking: false,
    privateChat: state === "private",
    allowedTools: ["web_search", "safe_files"],
    attachments: state === "files" || state === "attach" ? labHomeFiles() : [],
    driveEmail: "remy@sutaeru.com",
    initialPanel: state === "attach" ? "attach" : state === "mode" ? "mode" : null,
  };
}
