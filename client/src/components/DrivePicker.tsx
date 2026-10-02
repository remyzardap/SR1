import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { callFunction } from "@/lib/kemmaCloud";
import { formatBytes, isImageType, type DriveAttachment } from "@/lib/attachments";
import "@/styles/attach.css";

/** One row as the server sends it (POST /api/fn/drive, action list). */
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  isFolder: boolean;
}

interface DriveListResult {
  files: DriveFile[];
  nextPageToken?: string;
}

interface DriveStatusResult {
  connected: boolean;
  email?: string;
}

interface FolderCrumb {
  id: string;
  name: string;
}

interface DrivePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many more attachments the composer can take right now. */
  remaining: number;
  /** Reference photos on the Images page: only image rows can be picked. */
  imagesOnly?: boolean;
  /** Document brief: folders and documents, no photos. */
  documentsOnly?: boolean;
  onAttach: (files: DriveAttachment[]) => void;
}

const NATIVE_KINDS: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.presentation": "Google Slide",
};

const SIMPLE_KINDS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "text/plain": "Text",
  "text/markdown": "Markdown",
  "text/csv": "CSV",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/gif": "GIF",
};

function kindOf(file: DriveFile): string {
  if (file.isFolder) return "Folder";
  const native = NATIVE_KINDS[file.mimeType];
  if (native) return native;
  const simple = SIMPLE_KINDS[file.mimeType];
  if (simple) return simple;
  if (isImageType(file.mimeType)) return "Photo";
  return "File";
}

/** Row icon: folders get their own mark, everything else reuses the app's icon family. */
function FileGlyph({ file }: { file: DriveFile }) {
  const kind = kindOf(file);
  if (file.isFolder) {
    return (
      <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sutaeru-feature-icon">
        <path d="M15 30h24l8 10h34v38H15V30Z" />
      </svg>
    );
  }
  if (isImageType(file.mimeType)) return <SutaeruIcon name="image" className="sutaeru-feature-icon" />;
  if (kind === "Google Sheet" || kind === "CSV") return <SutaeruIcon name="plan" className="sutaeru-feature-icon" />;
  if (kind === "Google Slide") return <SutaeruIcon name="review" className="sutaeru-feature-icon" />;
  return <SutaeruIcon name="report" className="sutaeru-feature-icon" />;
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Google Drive file picker. Reads the connection status first, then lists folders
 * and attachable files, and hands back Drive attachment objects for what the user picks.
 */
export function DrivePicker({ open, onOpenChange, remaining, imagesOnly = false, documentsOnly = false, onAttach }: DrivePickerProps) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"checking" | "ready" | "offline" | "error">("checking");
  const [statusError, setStatusError] = useState("");
  const [email, setEmail] = useState("");

  const [folder, setFolder] = useState<FolderCrumb[]>([]);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState("");
  const [listState, setListState] = useState<"idle" | "loading" | "loading-more" | "error">("idle");
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<Record<string, DriveFile>>({});

  const requestId = useRef(0);

  // Reset every time the picker opens so the user never sees the previous folder.
  useEffect(() => {
    if (!open) return;
    setStatus("checking");
    setStatusError("");
    setFolder([]);
    setInput("");
    setQuery("");
    setFiles([]);
    setNextPageToken("");
    setSelected({});
    requestId.current += 1;
    let cancelled = false;
    void (async () => {
      try {
        const result = await callFunction<DriveStatusResult>("drive", { action: "status" });
        if (cancelled) return;
        setEmail(result.email || "");
        setStatus(result.connected ? "ready" : "offline");
      } catch (err) {
        if (cancelled) return;
        setStatusError(err instanceof Error ? err.message : "Could not reach Google Drive.");
        setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const load = useCallback(
    async (pageToken?: string) => {
      const id = ++requestId.current;
      setListState(pageToken ? "loading-more" : "loading");
      setListError("");
      try {
        const result = await callFunction<DriveListResult>("drive", {
          action: "list",
          ...(query ? { query } : {}),
          ...(folder.length > 0 ? { folderId: folder[folder.length - 1].id } : {}),
          ...(pageToken ? { pageToken } : {}),
        });
        if (id !== requestId.current) return;
        const rows = Array.isArray(result.files) ? result.files : [];
        setFiles((prev) => (pageToken ? [...prev, ...rows] : rows));
        setNextPageToken(result.nextPageToken || "");
        setListState("idle");
      } catch (err) {
        if (id !== requestId.current) return;
        setListError(err instanceof Error ? err.message : "Could not load your Drive files.");
        setListState("error");
      }
    },
    [folder, query],
  );

  // Search is debounced so typing does not call Drive on every keystroke.
  useEffect(() => {
    if (!open || status !== "ready") return;
    const timer = window.setTimeout(() => setQuery(input.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [input, open, status]);

  useEffect(() => {
    if (!open || status !== "ready") return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status, folder, query]);

  const rows = useMemo(() => files.filter((f) => {
    if (f.isFolder) return true;
    const image = isImageType(f.mimeType);
    return imagesOnly ? image : documentsOnly ? !image : true;
  }), [files, imagesOnly, documentsOnly]);

  const picked = Object.values(selected);
  const canAttachMore = remaining > 0;

  function toggle(file: DriveFile) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[file.id]) {
        delete next[file.id];
        return next;
      }
      if (Object.keys(next).length >= remaining) return prev;
      next[file.id] = file;
      return next;
    });
  }

  function openFolder(file: DriveFile) {
    setFolder((prev) => [...prev, { id: file.id, name: file.name }]);
  }

  function goUp() {
    setFolder((prev) => prev.slice(0, -1));
  }

  function attach() {
    onAttach(
      picked.map((file) => ({
        source: "drive" as const,
        fileId: file.id,
        filename: file.name,
        mediaType: file.mimeType,
      })),
    );
    onOpenChange(false);
  }

  const busy = listState === "loading";
  const crumbs = [{ id: "", name: "My Drive" }, ...folder];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sk-dialog sk-attach-dialog" style={{ maxWidth: "min(620px, calc(100vw - 24px))" }}>
        <DialogHeader>
          <DialogTitle>From Google Drive</DialogTitle>
          <DialogDescription className="sk-muted">
            {status === "ready" && email ? `Attached by reference, not copied. Signed in as ${email}.` : "Pick files that are already in your Google Drive."}
          </DialogDescription>
        </DialogHeader>

        {status === "checking" && (
          <div className="sk-empty">
            <span className="sk-label">Google Drive</span>
            <div className="sk-col" style={{ gap: 10 }}>
              <div className="sk-skeleton" style={{ height: 14, width: "40%" }} />
              <div className="sk-skeleton" style={{ height: 44, width: "100%" }} />
              <div className="sk-skeleton" style={{ height: 44, width: "100%" }} />
            </div>
            <p className="sk-empty-text" role="status">Checking your Google connection...</p>
          </div>
        )}

        {(status === "offline" || status === "error") && (
          <div className="sk-empty">
            <span className="sk-label">Not connected</span>
            <p className="sk-empty-text">
              {status === "error" ? statusError : "Sutaeru needs permission to read your Google Drive before you can attach files from it."}
            </p>
            <button type="button" className="sk-btn mt-3 self-start" onClick={() => onOpenChange(false)}>
              Attach from this device instead
            </button>
            <button
              type="button"
              className="sk-btn sk-btn-ghost sk-btn-sm mt-2 self-start"
              onClick={() => { onOpenChange(false); navigate("/connections"); }}
            >
              <SutaeruIcon name="connections" className="sk-attach-glyph" />
              {status === "error" ? "Open Connections" : "Connect Google"}
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="sk-search">
              <SutaeruIcon name="search" className="sk-attach-glyph" />
              <input
                type="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search Drive"
                aria-label="Search Google Drive"
              />
            </div>

            <div className="sk-attach-crumbs" role="navigation" aria-label="Drive folders">
              {folder.length > 0 && (
                <button type="button" className="sk-icon-btn" onClick={goUp} aria-label="Back to the parent folder">
                  <SutaeruIcon name="arrow" className="sk-attach-glyph rotate-180" />
                </button>
              )}
              <ol className="sk-attach-crumb-list">
                {crumbs.map((crumb, index) => {
                  const last = index === crumbs.length - 1;
                  return (
                    <li key={crumb.id || "root"}>
                      {last ? (
                        <span aria-current="page">{crumb.name}</span>
                      ) : (
                        <button type="button" onClick={() => setFolder(folder.slice(0, index))}>{crumb.name}</button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>

            {busy && (
              <div className="sk-col sk-attach-skeletons" style={{ gap: 10 }} role="status" aria-label="Loading files">
                {[0, 1, 2, 3].map((i) => <div key={i} className="sk-skeleton" style={{ height: 52, width: "100%" }} />)}
              </div>
            )}

            {!busy && listState === "error" && (
              <div className="sk-empty">
                <span className="sk-label">Could not load Drive</span>
                <p className="sk-empty-text">{listError}</p>
                <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm mt-2 self-start" onClick={() => void load()}>Try again</button>
              </div>
            )}

            {!busy && listState !== "error" && rows.length === 0 && (
              <div className="sk-empty">
                <span className="sk-label">{query ? "No match" : "Empty"}</span>
                <p className="sk-empty-text">
                  {query
                    ? `Nothing in ${folder.length > 0 ? folder[folder.length - 1].name : "your Drive"} matches "${query}".`
                    : imagesOnly
                      ? "No photos here. Only image files can be used as a reference photo."
                      : documentsOnly
                        ? "No documents here. The brief reads PDF, Word, text, Markdown and CSV, plus Google Docs."
                        : "No attachable files in this folder."}
                </p>
              </div>
            )}

            {!busy && rows.length > 0 && (
              <ul className="sk-attach-list">
                {rows.map((file) => {
                  const checked = !!selected[file.id];
                  const full = !checked && picked.length >= remaining;
                  if (file.isFolder) {
                    return (
                      <li key={file.id}>
                        <button type="button" className="sk-attach-row" onClick={() => openFolder(file)}>
                          <span className="sk-attach-row-icon"><FileGlyph file={file} /></span>
                          <span className="sk-attach-row-main">
                            <span className="sk-attach-row-name">{file.name}</span>
                            <span className="sk-attach-row-meta">Folder</span>
                          </span>
                          <SutaeruIcon name="arrow" className="sk-attach-row-open" />
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={file.id}>
                      <label className={`sk-attach-row${checked ? " is-checked" : ""}${full ? " is-full" : ""}`}>
                        <input
                          type="checkbox"
                          className="sk-attach-check"
                          checked={checked}
                          disabled={full}
                          onChange={() => toggle(file)}
                          aria-describedby="sk-attach-count"
                        />
                        <span className="sk-attach-row-icon"><FileGlyph file={file} /></span>
                        <span className="sk-attach-row-main">
                          <span className="sk-attach-row-name">{file.name}</span>
                          <span className="sk-attach-row-meta sk-num">
                            {kindOf(file)}
                            {file.size ? ` - ${formatBytes(file.size)}` : ""}
                            {formatDate(file.modifiedTime) ? ` - ${formatDate(file.modifiedTime)}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {nextPageToken && !busy && (
              <button
                type="button"
                className="sk-btn sk-btn-ghost sk-btn-sm mt-3 self-start"
                onClick={() => void load(nextPageToken)}
                disabled={listState === "loading-more"}
              >
                {listState === "loading-more" ? "Loading..." : "Load more"}
              </button>
            )}

            <div className="sk-attach-foot">
              <span className="sk-label sk-num" id="sk-attach-count">
                {picked.length} selected of {remaining} allowed
              </span>
              {!canAttachMore && <span className="sk-empty-text">This message is already at the attachment limit.</span>}
              <button type="button" className="sk-btn" onClick={attach} disabled={picked.length === 0}>
                {picked.length === 0 ? "Attach" : `Attach ${picked.length}`}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default DrivePicker;
