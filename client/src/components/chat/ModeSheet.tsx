import * as React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { FocusBrackets, Sheet, Toggle } from "@/components/art";
import { FoldGroup, FoldSection, Pic, PickTiles, Showcase, Tick, useFoldState, type PickItem, type ShowcaseItem } from "@/components/fold";
import { pickArt, type PickArtId } from "@/lib/pickArt";
import { cn } from "@/lib/utils";
import { MODEL_CHOICES, type ModelChoice } from "./modelChoice";
import "./modeSheet.css";

/** One chat mode as the composer chip and the mode sheet show it. */
export interface ChatModeOption {
  key: string;
  label: string;
  /** What the chip says when the tools row is too narrow for `label`. */
  short?: string;
  text: string;
  icon: import("@/components/SutaeruIcon").SutaeruIconName;
  adminOnly?: boolean;
}

/** A source the chat may search, bound to one real tool id. */
export interface ModeSourceRow {
  /** The tool id this switch turns on and off in the thread settings. */
  id: string;
  label: string;
  caption: string;
}

export interface ChatToolOption {
  id: string;
  label: string;
}

/** The tools a thread can allow, as pills. */
export const CHAT_TOOLS: ChatToolOption[] = [
  { id: "web_search", label: "Search" },
  { id: "browse", label: "Browse" },
  { id: "run_code", label: "Sandbox" },
  { id: "safe_files", label: "Files" },
  { id: "generate_file", label: "Documents" },
];

/** Picture of each mode, by mode key (`deep` is the research picture). */
const MODE_ART: Record<string, PickArtId> = { fast: "fast", deep: "research", image: "image", document: "document", code: "code" };
const SOURCE_ART: Record<string, PickArtId> = { web_search: "src-web", safe_files: "src-files", drive_search: "src-drive" };
const MODEL_ART: Record<ModelChoice, PickArtId> = { auto: "model-auto", fast: "model-fast", best: "model-best" };
const MODEL_LABEL: Record<ModelChoice, string> = { auto: "Auto", fast: "Fast", best: "Best" };

export interface ModeSheetBodyProps {
  mode: string;
  modes: ChatModeOption[];
  onModeChange(key: string): void;
  /** The thread's real tool allowlist, which the Sources tiles and the Tools pills change. */
  allowedTools: string[];
  onToggleTool(id: string): void;
  sourceRows: ModeSourceRow[];
  /** Omit to hide the Tools section. */
  tools?: ChatToolOption[];
  /** Omit onModelChange to hide the Model section. */
  model?: ModelChoice;
  onModelChange?(next: ModelChoice): void;
  /** Approved skills the person can tag for the next message. Omit or leave empty to hide. */
  skills?: Array<{ id: number; name: string }>;
  taggedSkills?: number[];
  onToggleSkill?(id: number): void;
  /** The slower, more careful run the stream endpoint reads off the body. Omit to hide the row. */
  thinking?: boolean;
  onThinkingChange?(next: boolean): void;
  /** Omit onPrivateChange to hide the row: it must only show where a chat can really be kept private. */
  privateChat?: boolean;
  onPrivateChange?(next: boolean): void;
  /** Fold memory key, one per page. */
  foldKey?: string;
}

const art = (id: PickArtId) => pickArt(id);

/** Multi-select picture tiles for the Sources fold: the Studio tile with checkbox semantics. */
function SourceTiles({ rows, allowedTools, onToggle }: { rows: ModeSourceRow[]; allowedTools: string[]; onToggle(id: string): void }) {
  return (
    <div className="opts" role="group" aria-label="Sources">
      {rows.map((row) => {
        const on = allowedTools.includes(row.id);
        const pic = SOURCE_ART[row.id];
        return (
          <button
            key={row.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            data-id={row.id}
            className="opt"
            onClick={() => onToggle(row.id)}
          >
            <span className="otw">
              <span className="ot">
                {pic ? <Pic art={art(pic)} /> : null}
                <Tick />
              </span>
              {on && <FocusBrackets />}
            </span>
            <span className="cap"><b>{row.label}</b></span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The sheet's content, exported on its own for the lab and the tests. Mode, Model, Sources and
 * Tools are FoldSections (one open at a time on phones), then Thinking and Private as switch rows.
 */
export function ModeSheetBody({
  mode,
  modes,
  onModeChange,
  allowedTools,
  onToggleTool,
  sourceRows,
  tools,
  model = "auto",
  onModelChange,
  skills,
  taggedSkills = [],
  onToggleSkill,
  thinking,
  onThinkingChange,
  privateChat,
  onPrivateChange,
  foldKey = "chat-sheet",
}: ModeSheetBodyProps) {
  const showModel = !!onModelChange;
  const showTools = !!tools && tools.length > 0;
  const showSkills = !!skills && skills.length > 0 && !!onToggleSkill;
  const ids = ["mode", ...(showModel ? ["model"] : []), ...(sourceRows.length ? ["sources"] : []), ...(showTools ? ["tools"] : []), ...(showSkills ? ["skills"] : [])];
  const fold = useFoldState(foldKey, ids, { first: "mode" });

  const current = modes.find((m) => m.key === mode) ?? modes[0];
  const modeItems = useMemo<ShowcaseItem[]>(
    () => modes.map((m) => ({ id: m.key, name: m.label, art: art(MODE_ART[m.key] ?? "fast"), description: m.text })),
    [modes],
  );
  const modelItems = useMemo<PickItem[]>(
    () => MODEL_CHOICES.map((id) => ({ id, label: MODEL_LABEL[id], art: art(MODEL_ART[id]) })),
    [],
  );
  const onSources = sourceRows.filter((row) => allowedTools.includes(row.id));
  const onTools = (tools ?? []).filter((tool) => allowedTools.includes(tool.id)).length;
  let n = 0;

  return (
    <div className="mode-menu">
      <FoldGroup state={fold}>
        <FoldSection id="mode" index={++n} label="Mode" pick={current?.label} mini={current ? art(MODE_ART[current.key] ?? "fast") : undefined}>
          <Showcase items={modeItems} value={mode} onChange={onModeChange} label="Mode" />
        </FoldSection>

        {showModel && (
          <FoldSection id="model" index={++n} label="Model" pick={MODEL_LABEL[model]} mini={art(MODEL_ART[model])}>
            <PickTiles items={modelItems} value={model} onChange={(id) => onModelChange?.(id as ModelChoice)} label="Model" />
          </FoldSection>
        )}

        {sourceRows.length > 0 && (
          <FoldSection
            id="sources"
            index={++n}
            label="Sources"
            pick={onSources.length ? onSources.map((row) => row.label).join(", ") : "None"}
            mini={onSources[0] && SOURCE_ART[onSources[0].id] ? art(SOURCE_ART[onSources[0].id]) : undefined}
          >
            <SourceTiles rows={sourceRows} allowedTools={allowedTools} onToggle={onToggleTool} />
          </FoldSection>
        )}

        {showTools && (
          <FoldSection id="tools" index={++n} label="Tools" pick={`${onTools} of ${tools!.length} on`}>
            <div className="mode-pills" role="group" aria-label="Tools">
              {tools!.map((tool) => (
                <button key={tool.id} type="button" className="pill" aria-pressed={allowedTools.includes(tool.id)} onClick={() => onToggleTool(tool.id)}>
                  {tool.label}
                </button>
              ))}
            </div>
          </FoldSection>
        )}

        {showSkills && (
          <FoldSection id="skills" index={++n} label="Skills" pick={taggedSkills.length ? `${taggedSkills.length} tagged` : "None"}>
            <div className="mode-pills" role="group" aria-label="Skills for the next message">
              {skills!.map((skill) => (
                <button key={skill.id} type="button" className="pill" aria-pressed={taggedSkills.includes(skill.id)} onClick={() => onToggleSkill?.(skill.id)}>
                  {skill.name}
                </button>
              ))}
            </div>
          </FoldSection>
        )}
      </FoldGroup>

      {(onThinkingChange || onPrivateChange) && (
        <div className="mode-switches">
          {onThinkingChange && (
            <div className="toggle-row">
              <div className="tx"><b>Thinking</b><small>Slower, more careful</small></div>
              <Toggle checked={!!thinking} onCheckedChange={onThinkingChange} label="Thinking" />
            </div>
          )}
          {onPrivateChange && (
            <div className="toggle-row">
              <div className="tx"><b>Private chat</b><small>Not saved to history</small></div>
              <Toggle checked={!!privateChat} onCheckedChange={onPrivateChange} label="Private chat" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface ModeSheetProps extends ModeSheetBodyProps {
  open: boolean;
  onClose(): void;
  /** The chip that opened the sheet; on wide screens the popover sits above it. */
  anchor?: React.RefObject<HTMLElement | null>;
}

const WIDE = "(min-width: 760px)";

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(WIDE).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** The popover (>= 760 px): a card above the chip, closed by Escape, a click outside or Done. */
function Popover({ onClose, anchor, children }: { onClose(): void; anchor?: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor?.current?.getBoundingClientRect();
      if (!rect) return setStyle({});
      const width = Math.min(520, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const above = rect.top - 24;
      const below = window.innerHeight - rect.bottom - 24;
      // Above the chip when there is room (the docked composer), below it otherwise.
      if (above >= 380 || above >= below) setStyle({ left, bottom: window.innerHeight - rect.top + 10, width, maxHeight: Math.max(240, above) });
      else setStyle({ left, top: rect.bottom + 10, width, maxHeight: Math.max(240, below) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); anchor?.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor?.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose, anchor]);

  return createPortal(
    <div ref={ref} className="mode-pop" role="dialog" aria-label="This chat" tabIndex={-1} style={style}>
      {children}
    </div>,
    document.body,
  );
}

/**
 * The one sheet behind the mode chip: Mode, Model, Sources, Tools and the switches. An art Sheet on
 * phones, a popover above the chip from 760 px.
 */
export function ModeSheet({ open, onClose, anchor, ...body }: ModeSheetProps) {
  const wide = useWide();
  if (!open) return null;
  const content = (
    <>
      <ModeSheetBody {...body} />
      <button type="button" className="btn ink big sheet-done" onClick={onClose}>Done</button>
    </>
  );
  if (wide) {
    return (
      <Popover onClose={onClose} anchor={anchor}>
        <span className="mono ink mode-pop-title">This chat</span>
        {content}
      </Popover>
    );
  }
  return (
    <Sheet open onClose={onClose} title="This chat" className={cn("mode-sheet")}>
      {content}
    </Sheet>
  );
}
