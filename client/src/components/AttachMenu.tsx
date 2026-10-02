import { useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DrivePicker } from "@/components/DrivePicker";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import {
  ACCEPT,
  DOCUMENT_ACCEPT,
  IMAGE_ACCEPT,
  MAX_FILES,
  attachmentKey,
  attachmentName,
  attachmentSize,
  fileToAttachment,
  formatBytes,
  isImageType,
  validateDeviceFiles,
  type Attachment,
} from "@/lib/attachments";
import "@/styles/attach.css";

interface AttachMenuProps {
  /** The attachments that will go with this request. */
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** Total cap for this composer, counting what is already attached. Defaults to MAX_FILES. */
  max?: number;
  /** Reference photos: images only, and no documents. */
  imagesOnly?: boolean;
  /** Document brief: one document, no photos. */
  documentsOnly?: boolean;
  disabled?: boolean;
  /** Small caption above the control, e.g. "Reference photos". */
  label?: string;
}

/** Google Drive mark, drawn in the app's own icon style. Not the vendor logo. */
function DriveGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M38 20h20l22 44H16L38 20Z" />
      <path d="M30 54h36" />
    </svg>
  );
}

/**
 * The one attach control used wherever the user writes a prompt: a menu with
 * "From this device" and "From Google Drive", plus the chips of what is attached.
 */
export function AttachMenu({ attachments, onChange, max = MAX_FILES, imagesOnly = false, documentsOnly = false, disabled = false, label }: AttachMenuProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);

  const remaining = Math.max(0, max - attachments.length);
  const accept = imagesOnly ? IMAGE_ACCEPT : documentsOnly ? DOCUMENT_ACCEPT : ACCEPT;

  function replace(next: Attachment[]) {
    onChange(next);
    setErrors([]);
  }

  function removeAt(index: number) {
    replace(attachments.filter((_, i) => i !== index));
  }

  async function addDeviceFiles(list: FileList | File[] | null) {
    const { accepted, rejected } = validateDeviceFiles(list, attachments.length, { max, imagesOnly, documentsOnly });
    if (accepted.length === 0) {
      setErrors(rejected);
      return;
    }
    setReading(true);
    setErrors(rejected);
    try {
      const read = await Promise.all(accepted.map(fileToAttachment));
      onChange([...attachments, ...read]);
    } catch (err) {
      setErrors([...rejected, err instanceof Error ? err.message : "The file could not be read."]);
    } finally {
      setReading(false);
    }
  }

  function addDriveFiles(picked: Attachment[]) {
    const room = Math.max(0, max - attachments.length);
    const fitted = picked.slice(0, room);
    const next = [...attachments, ...fitted];
    onChange(next);
    setErrors(picked.length > fitted.length ? [`You can attach up to ${max} files. ${picked.length - fitted.length} were not added.`] : []);
  }

  return (
    <div className={`sk-attach${label ? " sk-attach-labelled" : ""}`}>
      {label && <span className="sk-label">{label}</span>}

      {(attachments.length > 0 || errors.length > 0 || reading) && (
        <ul className="sk-attach-chips">
          {attachments.map((att, index) => {
            const thumb = att.source === "device" && isImageType(att.mediaType);
            const bytes = attachmentSize(att);
            return (
              <li key={attachmentKey(att, index)} className="sk-attach-chip">
                {thumb ? (
                  <img src={att.dataUrl} alt="" className="sk-attach-thumb" />
                ) : (
                  <span className="sk-attach-chip-icon">
                    {att.source === "drive" ? <DriveGlyph className="sk-attach-glyph" /> : <SutaeruIcon name="report" className="sk-attach-glyph" />}
                  </span>
                )}
                <span className="sk-attach-chip-name">{attachmentName(att)}</span>
                <span className="sk-attach-chip-meta sk-num">
                  {att.source === "drive" ? "Drive" : bytes > 0 ? formatBytes(bytes) : ""}
                </span>
                <button type="button" className="sk-attach-remove" onClick={() => removeAt(index)} aria-label={`Remove ${attachmentName(att)}`}>
                  <SutaeruIcon name="close" className="sk-attach-glyph" />
                </button>
              </li>
            );
          })}
          {reading && <li className="sk-attach-chip is-quiet">Reading files...</li>}
        </ul>
      )}

      {errors.length > 0 && (
        <ul className="sk-attach-errors" role="alert">
          {errors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
        </ul>
      )}

      <div className="sk-attach-control">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={max > 1}
          className="hidden"
          onChange={(event) => {
            void addDeviceFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className="sk-attach-button"
            disabled={disabled || remaining === 0}
            title={remaining === 0 ? `You can attach up to ${max} files` : "Add photos or files"}
            aria-label="Add photos or files"
          >
            <SutaeruIcon name="plus" className="sk-attach-glyph" />
            <span>Add photos or files</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="sk-attach-menu">
            <DropdownMenuItem onSelect={() => inputRef.current?.click()} disabled={disabled || remaining === 0}>
              <SutaeruIcon name="files" className="sk-attach-glyph" />
              From this device
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPickerOpen(true)} disabled={disabled || remaining === 0}>
              <DriveGlyph className="sk-attach-glyph" />
              From Google Drive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="sk-attach-count sk-num">{attachments.length} / {max}</span>
      </div>

      <DrivePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        remaining={remaining}
        imagesOnly={imagesOnly}
        documentsOnly={documentsOnly}
        onAttach={(picked) => addDriveFiles(picked)}
      />
    </div>
  );
}

export default AttachMenu;
