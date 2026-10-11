/**
 * Build: describe an app, Sutaeru writes it, and it runs live beside the code.
 *
 * The project is a small React app that runs entirely in the browser (Sandpack,
 * Apache-2.0). Sutaeru's edits come back from `build.edit` as changed files and are
 * written straight into the editor, so the preview updates as soon as they land.
 * The person can also type in the editor themselves. The project and the chat are
 * kept in this browser only.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  SandpackCodeEditor,
  SandpackFileExplorer,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
  type SandpackFiles,
  type SandpackTheme,
} from "@codesandbox/sandpack-react";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import "@/styles/build.css";

type Pane = "chat" | "code" | "preview";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Notes about edits that could not be applied. */
  notes?: string[];
  error?: boolean;
  /** What the changed files held before this turn, so the turn can be undone. */
  before?: Record<string, string | null>;
  undone?: boolean;
}

const STORE_KEY = "sutaeru_build_v1";

const STARTER: Record<string, string> = {
  "/App.js": `export default function App() {
  return (
    <main className="wrap">
      <p className="label">BUILD</p>
      <h1>Describe an app.</h1>
      <p className="lead">Sutaeru writes it here and it runs straight away.</p>
    </main>
  );
}
`,
  "/styles.css": `* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, system-ui, sans-serif;
  background: #F7F6F2;
  color: #242320;
}
.wrap { max-width: 640px; margin: 0 auto; padding: 56px 24px; }
.label { font: 500 11px/1 ui-monospace, monospace; letter-spacing: .2em; color: #66645F; }
h1 { font-size: 40px; letter-spacing: -1.5px; margin: 12px 0 8px; }
.lead { font-size: 17px; color: #66645F; margin: 0; }
`,
};

const IDEAS = [
  "A to-do list with filters and a done counter",
  "A tip calculator that splits the bill",
  "A landing page for a coffee shop in Bali",
];

/** Sandpack in the app's own colours; follows light and dark through the tokens. */
const THEME: SandpackTheme = {
  colors: {
    surface1: "var(--r-paper)",
    surface2: "var(--r-stroke)",
    surface3: "var(--r-panel)",
    disabled: "var(--r-rule)",
    base: "var(--r-quiet)",
    clickable: "var(--r-quiet)",
    hover: "var(--r-ink)",
    accent: "var(--r-ink)",
    error: "var(--r-alert)",
    errorSurface: "var(--r-alert-tint)",
  },
  syntax: {
    plain: "var(--r-ink)",
    comment: { color: "var(--r-quiet)", fontStyle: "italic" },
    keyword: "var(--r-accent)",
    tag: "var(--r-accent)",
    punctuation: "var(--r-quiet)",
    definition: "var(--r-ink)",
    property: "var(--r-ink)",
    static: "var(--r-accent-deep, var(--r-accent))",
    string: "var(--r-quiet)",
  },
  font: {
    body: "var(--r-font-body)",
    mono: "var(--r-font-mono)",
    size: "13px",
    lineHeight: "20px",
  },
};

interface Saved {
  files: Record<string, string>;
  messages: Message[];
  /** Open editor tabs, so a reload looks the same. */
  open?: string[];
  active?: string;
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (!parsed || typeof parsed.files !== "object") return null;
    return {
      files: parsed.files,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      open: Array.isArray(parsed.open) ? parsed.open.filter((p) => p in parsed.files) : undefined,
      active: typeof parsed.active === "string" && parsed.active in parsed.files ? parsed.active : undefined,
    };
  } catch {
    return null;
  }
}

function save(data: Saved) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* storage can be full or blocked; the project still works this session */
  }
}

const newId = () => Math.random().toString(36).slice(2, 10);

export default function Build() {
  useSeoMeta({ title: "Build" });
  const saved = useMemo(loadSaved, []);
  const [project, setProject] = useState(() => ({
    key: 0,
    files: saved?.files ?? STARTER,
    messages: saved?.messages ?? [],
    open: saved?.open?.length ? saved.open : ["/App.js", "/styles.css"],
    active: saved?.active ?? "/App.js",
  }));

  const startOver = useCallback(() => {
    save({ files: STARTER, messages: [] });
    setProject((p) => ({ key: p.key + 1, files: STARTER, messages: [], open: ["/App.js", "/styles.css"], active: "/App.js" }));
  }, []);

  const files: SandpackFiles = project.files;

  return (
    <div className="bld">
      <SandpackProvider
        key={project.key}
        template="react"
        files={files}
        theme={THEME}
        options={{
          recompileMode: "delayed",
          recompileDelay: 250,
          autorun: true,
          initMode: "immediate",
          visibleFiles: project.open,
          activeFile: project.active,
        }}
      >
        <Workspace initialMessages={project.messages} onStartOver={startOver} />
      </SandpackProvider>
    </div>
  );
}

function Workspace({ initialMessages, onStartOver }: { initialMessages: Message[]; onStartOver: () => void }) {
  const isMobile = useIsMobile();
  const { sandpack } = useSandpack();
  const [pane, setPane] = useState<Pane>("chat");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const edit = trpc.build.edit.useMutation();

  // Plain text of every file, as the server wants it.
  const codeOf = useCallback(() => {
    const out: Record<string, string> = {};
    for (const [path, file] of Object.entries(sandpack.files)) out[path] = file.code;
    return out;
  }, [sandpack.files]);

  // Keep the project and chat in this browser, a moment after each change.
  useEffect(() => {
    const t = window.setTimeout(
      () => save({ files: codeOf(), messages: messages.slice(-60), open: sandpack.visibleFiles, active: sandpack.activeFile }),
      500
    );
    return () => window.clearTimeout(t);
  }, [codeOf, messages, sandpack.visibleFiles, sandpack.activeFile]);

  const writeFiles = useCallback(
    (changed: Record<string, string | null>) => {
      let firstNew: string | null = null;
      for (const [path, code] of Object.entries(changed)) {
        if (code === null) {
          if (sandpack.files[path]) sandpack.deleteFile(path);
        } else if (sandpack.files[path]) {
          sandpack.updateFile(path, code);
        } else {
          sandpack.addFile(path, code);
          firstNew ??= path;
        }
      }
      if (firstNew) sandpack.openFile(firstNew);
    },
    [sandpack]
  );

  const send = useCallback(
    async (text: string) => {
      const instruction = text.trim();
      if (!instruction || edit.isPending) return;
      const userMsg: Message = { id: newId(), role: "user", text: instruction };
      const history = messages
        .filter((m) => !m.error)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text.slice(0, 4000) }));
      setMessages((list) => [...list, userMsg]);
      try {
        const current = codeOf();
        const res = await edit.mutateAsync({ files: current, instruction, history, activeFile: sandpack.activeFile });
        const before: Record<string, string | null> = {};
        for (const path of Object.keys(res.changed)) before[path] = current[path] ?? null;
        writeFiles(res.changed);
        const changedCount = Object.keys(res.changed).length;
        setMessages((list) => [
          ...list,
          {
            id: newId(),
            role: "assistant",
            text: res.reply,
            notes: res.skipped.length ? res.skipped : undefined,
            before: changedCount ? before : undefined,
          },
        ]);
        if (changedCount && isMobile) setPane("preview");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setMessages((list) => [...list, { id: newId(), role: "assistant", text: message, error: true }]);
      }
    },
    [codeOf, edit, isMobile, messages, sandpack.activeFile, writeFiles]
  );

  const undo = useCallback(
    (id: string) => {
      const msg = messages.find((m) => m.id === id);
      if (!msg?.before) return;
      writeFiles(msg.before);
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, undone: true } : m)));
    },
    [messages, writeFiles]
  );

  const working = edit.isPending;
  const show = (p: Pane) => !isMobile || pane === p;

  return (
    <div className="bld-shell" data-pane={pane}>
      <header className="bld-bar">
        <span className="bld-label">
          {working ? <i className="bld-live" aria-hidden="true" /> : null}
          {working ? "Working" : "Build"}
        </span>
        {isMobile ? (
          <nav className="bld-tabs" aria-label="Build panes">
            {(["chat", "code", "preview"] as Pane[]).map((p) => (
              <button key={p} type="button" aria-pressed={pane === p} onClick={() => setPane(p)}>
                {p === "chat" ? "Chat" : p === "code" ? "Code" : "Preview"}
              </button>
            ))}
          </nav>
        ) : null}
        <button type="button" className="bld-ghost" onClick={() => { if (window.confirm("Start a new project? This clears the code and the chat.")) onStartOver(); }}>
          New
        </button>
      </header>

      <div className="bld-panes">
        <section className="bld-pane bld-chat" hidden={!show("chat")} aria-label="Chat">
          <ChatPane messages={messages} working={working} onSend={send} onUndo={undo} />
        </section>

        <section className="bld-pane bld-code" hidden={!show("code")} aria-label="Code">
          {!isMobile ? <SandpackFileExplorer className="bld-files" /> : null}
          <SandpackCodeEditor className="bld-editor" showTabs showLineNumbers closableTabs wrapContent={isMobile} />
        </section>

        <section className="bld-pane bld-preview" hidden={!show("preview")} aria-label="Preview">
          <SandpackPreview className="bld-frame" showOpenInCodeSandbox={false} showRefreshButton showNavigator={false} />
        </section>
      </div>
    </div>
  );
}

function ChatPane({
  messages,
  working,
  onSend,
  onUndo,
}: {
  messages: Message[];
  working: boolean;
  onSend: (text: string) => void;
  onUndo: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const lastUndoable = [...messages].reverse().find((m) => m.before && !m.undone)?.id;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, working]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || working) return;
    onSend(draft);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <div className="bld-thread" ref={listRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="bld-empty">
            <h1>What should we build?</h1>
            <p>Describe it. Sutaeru writes the code and the preview runs as soon as it lands. You can edit the code too.</p>
            <div className="bld-ideas">
              {IDEAS.map((idea) => (
                <button key={idea} type="button" onClick={() => onSend(idea)} disabled={working}>
                  {idea}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <p key={m.id} className="bld-msg bld-msg-user">{m.text}</p>
            ) : (
              <div key={m.id} className={m.error ? "bld-msg bld-msg-bot is-error" : "bld-msg bld-msg-bot"}>
                <p>{m.text}</p>
                {m.notes?.map((n) => (
                  <p key={n} className="bld-note">{n}</p>
                ))}
                {m.undone ? <p className="bld-note">Undone.</p> : null}
                {m.id === lastUndoable ? (
                  <button type="button" className="bld-undo" onClick={() => onUndo(m.id)} disabled={working}>
                    Undo this change
                  </button>
                ) : null}
              </div>
            )
          )
        )}
        {working ? (
          <p className="bld-working">
            <i className="bld-live" aria-hidden="true" />
            Writing code
          </p>
        ) : null}
      </div>

      <form className="bld-composer" onSubmit={submit}>
        <label htmlFor="bld-input" className="sr-only">Describe a change</label>
        <textarea
          id="bld-input"
          rows={2}
          value={draft}
          placeholder={messages.length ? "Change something…" : "Describe an app…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          maxLength={8000}
        />
        <button type="submit" className="bld-send" aria-label="Send" disabled={!draft.trim() || working}>
          <SutaeruIcon name="up" width={20} height={20} aria-hidden="true" />
        </button>
      </form>
    </>
  );
}
