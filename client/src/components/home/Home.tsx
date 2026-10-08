import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DrivePicker } from "@/components/DrivePicker";
import type { ActivityItem } from "@/components/ActivityFeed";
import { markIntroSeen, shouldPlayIntro } from "@/components/brand";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";
import { trpc } from "@/lib/trpc";
import {
  ACCEPT,
  IMAGE_ACCEPT,
  MAX_FILES,
  attachmentBytes,
  attachmentName,
  attachmentSize,
  fileToAttachment,
  formatBytes,
  isImageType,
  validateDeviceFiles,
  type Attachment,
  type DriveAttachment,
} from "@/lib/attachments";
import { toast } from "sonner";
import type { HomeAttachmentRow, HomeSourceRow } from "./HomeComposer";
import { HomeScreen, type HomeRecentRow } from "./HomeScreen";
import { relativeTime } from "./relativeTime";

/** A file the browser is still reading; its row shows the prototype's upload bar. */
interface PendingFile {
  key: string;
  name: string;
  startedAt: number;
  preview?: string;
}

export interface HomeProps {
  /** The page's own send path, so a Home question runs exactly like a thread one. */
  onSend: (submission: { text: string; attachments?: Attachment[] }) => void;
  /** Draft and files live on the page: nothing is lost between the two composers. */
  value: string;
  onValueChange: (next: string) => void;
  attachments: Attachment[];
  onAttachmentsChange: (next: Attachment[]) => void;
  /** The thread's real tool allowlist, which is what the sources switches change. */
  allowedTools: string[];
  onToggleTool: (toolId: string) => void;
  /** Slow, careful answers: the page's own deep mode. */
  thinking: boolean;
  onThinkingChange: (next: boolean) => void;
  privateChat: boolean;
  onPrivateChange: (next: boolean) => void;
  offline: boolean;
  /** The thread history is still being read, so the rows are placeholders. */
  loading?: boolean;
  /** A run this page is in the middle of, its step, and the question it started from. */
  running: boolean;
  runningTitle?: string | null;
  activity?: ActivityItem[];
  /** The question waiting on a connection, if there is one. */
  queued?: string | null;
  onOpenSession: (sessionId: string) => void;
  onHandoff: () => void;
  banners?: ReactNode;
}

/**
 * The three sources the prototype offers, bound to tool ids the engine really has.
 * The prototype's third row is Memory; the API has no per-chat memory switch, so that
 * row is the `browse` tool and the difference is reported as a deviation.
 */
const SOURCE_ROWS: HomeSourceRow[] = [
  { id: "web_search", label: "Web", caption: "News, papers and public sites" },
  { id: "safe_files", label: "My files", caption: "Everything in Files" },
  { id: "browse", label: "Browse", caption: "Pages opened and read in full" },
];

/** The promise the switch makes is one no endpoint keeps yet, so the button says this instead. */
const PRIVATE_HINT = "Private chats are not available yet.";

/** The glyph a chip shows: photos, documents and Drive files, in the prototype's own set. */
function iconFor(attachment: Attachment): HomeAttachmentRow["icon"] {
  if (attachment.source === "drive") return "plan";
  return isImageType(attachment.mediaType) ? "camera" : "report";
}

/**
 * How far a run has got when the server says none. This is the same measured estimate
 * ChatRunCard uses — the running step out of the steps it has reported — so the Home row
 * and the run card never disagree, and a run with no steps yet sits at the middle rather
 * than at an invented number.
 */
function runProgress(activity: ActivityItem[]): number {
  const total = Math.max(activity.length, 1);
  const runningIndex = activity.findIndex((item) => item.status === "running");
  const step = runningIndex >= 0 ? runningIndex + 1 : total;
  return Math.min(0.95, Math.max(0.05, (step - 0.5) / total));
}

/**
 * Home with real data: the person's own conversations, the run this page is in, the
 * thread's own tool allowlist, and files from this device or from Google Drive.
 */
export function Home({
  onSend,
  value,
  onValueChange,
  attachments,
  onAttachmentsChange,
  allowedTools,
  onToggleTool,
  thinking,
  onThinkingChange,
  privateChat,
  onPrivateChange,
  offline,
  loading,
  running,
  runningTitle,
  activity = [],
  queued,
  onOpenSession,
  onHandoff,
  banners,
}: HomeProps) {
  const deviceInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [pending, setPending] = useState<PendingFile[]>([]);
  // The reads still in flight. A question sent while one is running waits for it rather
  // than leaving the file behind, so what is on screen is what gets sent.
  const readsRef = useRef<Promise<Attachment[]>[]>([]);
  const [driveOpen, setDriveOpen] = useState(false);
  const [intro, setIntro] = useState(shouldPlayIntro);
  const { data: sessions = [], isLoading } = trpc.chat.listSessions.useQuery();
  const { data: google } = trpc.google.status.useQuery(undefined, { staleTime: 60_000 });

  const voice = useVoiceDictation((text) => {
    onValueChange(value.trim() ? `${value.trim()} ${text}` : text);
  });

  useEffect(() => {
    if (!intro) return;
    setIntro(false);
    markIntroSeen();
  }, [intro]);

  const progress = useMemo(() => runProgress(activity), [activity]);

  const rows: HomeRecentRow[] = useMemo(() => {
    const out: HomeRecentRow[] = [];
    if (queued) out.push({ id: "queued", kind: "queued", title: queued });
    if (running) {
      out.push({
        id: "run",
        kind: "running",
        title: runningTitle || "Working on it",
        when: "Now",
        progress,
      });
    }
    sessions.slice(0, 4).forEach((session) => {
      out.push({
        id: `session-${session.id}`,
        kind: "done",
        title: session.title || "Untitled chat",
        when: relativeTime(session.lastMessageAt ?? session.updatedAt ?? session.createdAt),
        onSelect: () => onOpenSession(session.id),
      });
    });
    return out;
  }, [queued, running, runningTitle, sessions, progress, onOpenSession]);

  const composerAttachments: HomeAttachmentRow[] = useMemo(() => {
    const reading = pending.map((file) => ({
      id: `pending-${file.key}`,
      name: file.name,
      meta: "Uploading",
      icon: (file.preview ? "camera" : "report") as HomeAttachmentRow["icon"],
      preview: file.preview,
      startedAt: file.startedAt,
    }));
    const done = attachments.map((attachment, index) => ({
      id: `held-${index}`,
      name: attachmentName(attachment),
      meta: attachment.source === "drive" ? "Google Drive" : formatBytes(attachmentSize(attachment)),
      icon: iconFor(attachment),
      preview: attachment.source === "device" && isImageType(attachment.mediaType) ? attachment.dataUrl : undefined,
      startedAt: null,
    }));
    return [...done, ...reading];
  }, [pending, attachments]);

  const readDeviceFiles = useCallback(
    async (list: FileList | File[] | null, photosOnly: boolean) => {
      const { accepted, rejected } = validateDeviceFiles(list, attachmentsRef.current.length, {
        max: MAX_FILES,
        imagesOnly: photosOnly,
        attachedBytes: attachmentsRef.current.reduce((sum, item) => sum + attachmentBytes(item), 0),
      });
      if (rejected.length > 0) {
        // Chat already listens for these and shows them its own way; keep it the one voice.
        window.dispatchEvent(new CustomEvent("sutaeru:attachment-error", { detail: rejected[0] }));
      }
      if (accepted.length === 0) return;
      const marks: PendingFile[] = accepted.map((file, index) => ({
        key: `${file.name}-${Date.now()}-${index}`,
        name: file.name || "attachment",
        startedAt: performance.now(),
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      }));
      setPending((current) => [...current, ...marks]);
      const reading = Promise.all(accepted.map(fileToAttachment));
      readsRef.current.push(reading);
      try {
        const read = await reading;
        onAttachmentsChange([...attachmentsRef.current, ...read]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The file could not be read.");
      } finally {
        readsRef.current = readsRef.current.filter((item) => item !== reading);
        setPending((current) => current.filter((item) => !marks.some((mark) => mark.key === item.key)));
        marks.forEach((mark) => mark.preview && URL.revokeObjectURL(mark.preview));
      }
    },
    [onAttachmentsChange]
  );

  function addDriveFiles(picked: DriveAttachment[]) {
    const room = Math.max(0, MAX_FILES - attachmentsRef.current.length);
    const fitted = picked.slice(0, room);
    onAttachmentsChange([...attachmentsRef.current, ...fitted]);
    if (picked.length > fitted.length) toast.error(`You can attach up to ${MAX_FILES} files.`);
  }

  function removeRow(id: string) {
    if (id.startsWith("pending-")) {
      const key = id.slice("pending-".length);
      setPending((current) => current.filter((file) => file.key !== key));
      return;
    }
    const index = Number(id.slice("held-".length));
    onAttachmentsChange(attachmentsRef.current.filter((_, at) => at !== index));
  }

  return (
    <>
      <HomeScreen
        rows={rows}
        loading={isLoading || !!loading}
        intro={intro}
        listening={voice.listening}
        banners={banners}
        onHandoff={onHandoff}
        composer={{
          value,
          onChange: onValueChange,
          onSubmit: async (text) => {
            // The prototype's own stand-in for a question made of nothing but files.
            const question = text || "Summarise the attached file";
            const outstanding = readsRef.current;
            const stillReading = outstanding.length
              ? (await Promise.all(outstanding.map((reading) => reading.catch(() => [] as Attachment[])))).flat()
              : [];
            // The Set collapses a file that finished and reached the page while this was waiting.
            onSend({ text: question, attachments: [...new Set([...attachmentsRef.current, ...stillReading])] });
            setPending([]);
          },
          onListen: () => void voice.start(),
          onStopListen: voice.stop,
          listening: voice.listening,
          offline,
          thinking,
          onThinkingChange: (next) => {
            onThinkingChange(next);
            toast.success(next ? "Thinking on: slower, more careful answers" : "Thinking off");
          },
          privateChat,
          privateHint: PRIVATE_HINT,
          onPrivateChange: (next) => {
            if (!next) {
              onPrivateChange(false);
              return;
            }
            // Nothing in the product keeps a chat out of history or memory yet, so the
            // switch says so rather than pretending. T-113 lists the API this needs.
            toast.error(PRIVATE_HINT);
          },
          allowedTools,
          onToggleTool,
          sourceRows: SOURCE_ROWS,
          attachments: composerAttachments,
          onAddAttachment: (kind) => {
            if (kind === "drive") {
              setDriveOpen(true);
              return;
            }
            if (kind === "camera") cameraInput.current?.click();
            else deviceInput.current?.click();
          },
          onRemoveAttachment: removeRow,
          driveEmail: google?.connected ? google.email : null,
        }}
      />
      <input
        ref={deviceInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          void readDeviceFiles(event.target.files, false);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept={IMAGE_ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void readDeviceFiles(event.target.files, true);
          event.target.value = "";
        }}
      />
      <DrivePicker
        open={driveOpen}
        onOpenChange={setDriveOpen}
        remaining={Math.max(0, MAX_FILES - attachments.length)}
        onAttach={addDriveFiles}
      />
    </>
  );
}

export default Home;
