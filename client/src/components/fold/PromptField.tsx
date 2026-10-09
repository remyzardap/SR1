import * as React from "react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { SutaeruIcon } from "@/components/SutaeruIcon";
import { cn } from "@/lib/utils";

export interface PromptRef {
  name: string;
  src: string;
}

export interface PromptFieldProps {
  value: string;
  onChange: (v: string) => void;
  /** The only words on the field, e.g. "Describe your picture". Also its accessible name. */
  placeholder: string;
  /** Cmd/Ctrl+Enter. */
  onSubmit?: () => void;
  maxLength?: number;
  id?: string;
  /** Rows before it grows. */
  minRows?: number;
  /** Reference photos: the round button shows when `onAddRefs` is given and fewer than `maxRefs` are attached. */
  refs?: PromptRef[];
  maxRefs?: number;
  onAddRefs?: (files: FileList | null) => void;
  onRemoveRef?: (index: number) => void;
  /** Anything else for the bottom row (right side). */
  extra?: ReactNode;
  className?: string;
}

const PhotoIcon = () => (
  <svg className="fi"viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="9" cy="11" r="2" />
    <path d="M21 16l-5-4-9 7" />
  </svg>
);

/** One soft prompt field: no label, no hint, grows with the words. Reusable on every page. */
export function PromptField({
  value,
  onChange,
  placeholder,
  onSubmit,
  maxLength,
  id,
  minRows = 2,
  refs = [],
  maxRefs = 0,
  onAddRefs,
  onRemoveRef,
  extra,
  className,
}: PromptFieldProps) {
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  /* Auto-grow: measure from the minimum each time so deleting text shrinks it again. */
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const canAdd = !!onAddRefs && refs.length < maxRefs;
  const showRow = canAdd || refs.length > 0 || !!extra;

  return (
    <div className={cn("pfield", className)} onClick={(e) => e.target === e.currentTarget && area.current?.focus()}>
      <textarea
        ref={area}
        id={id}
        rows={minRows}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit?.();
        }}
      />
      {showRow && (
        <div className="pfield-row">
          {onAddRefs && (
            <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { onAddRefs(e.target.files); e.target.value = ""; }} />
          )}
          {canAdd && (
            <button type="button" className="pfield-ib" aria-label="Add a reference photo" title="Add a reference photo" onClick={() => file.current?.click()}>
              <PhotoIcon />
            </button>
          )}
          {refs.map((r, i) => (
            <span key={`${r.name}${i}`} className="pfield-ref">
              <img src={r.src} alt={`Reference photo ${r.name}`} />
              {onRemoveRef && (
                <button type="button" className="pfield-x" aria-label={`Remove ${r.name}`} onClick={() => onRemoveRef(i)}>
                  <SutaeruIcon name="close" signal={false} className="ico" />
                </button>
              )}
            </span>
          ))}
          {extra ? <span className="pfield-extra">{extra}</span> : null}
        </div>
      )}
    </div>
  );
}
