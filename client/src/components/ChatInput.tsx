import { FileText, Paperclip } from "lucide-react";
import type { FileUIPart } from "ai";
import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { VoiceButton } from "./VoiceButton";
import { SutaeruIcon } from "./SutaeruIcon";

interface ChatInputProps {
  value: string;
  isStreaming: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: (message?: PromptInputMessage) => void | Promise<void>;
  onStop?: () => void;
  allowAttachments?: boolean;
}

function AttachmentList({ enabled }: { enabled: boolean }) {
  const attachments = usePromptInputAttachments();
  if (!enabled || attachments.files.length === 0) return null;

  return (
    <PromptInputHeader className="sutaeru-attachment-list">
      {attachments.files.map((file) => (
        <span className="sutaeru-attachment-chip" key={file.id}>
          <FileText aria-hidden="true" />
          <span>{file.filename || "Reference file"}</span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => attachments.remove(file.id)} aria-label={`Remove ${file.filename || "file"}`}>
            <SutaeruIcon name="close" aria-hidden="true" />
          </Button>
        </span>
      ))}
    </PromptInputHeader>
  );
}

function AttachButton({ enabled }: { enabled: boolean }) {
  const attachments = usePromptInputAttachments();
  if (!enabled) return null;
  return <PromptInputButton className="sutaeru-attach-button" onClick={attachments.openFileDialog} tooltip="Attach reference files" aria-label="Attach reference files"><Paperclip aria-hidden="true" /></PromptInputButton>;
}

export function ChatInput({ value, isStreaming, onChange, onKeyDown, onSend, onStop, allowAttachments = false }: ChatInputProps) {
  const handleSubmit = async (message: PromptInputMessage) => {
    if (isStreaming || (!message.text.trim() && message.files.length === 0)) return;
    await onSend(message);
  };

  return (
    <div className="sutaeru-chat-input w-full focus-bracket-target max-w-[var(--composer-width)] mx-auto relative shadow-[var(--shadow-floating)] rounded-[var(--radius-input)] bg-sutaeru-card border border-sutaeru-stroke-card p-[var(--pad-composer)]">
      <span className="focus-bracket-tl"></span>
      <span className="focus-bracket-tr"></span>
      <span className="focus-bracket-bl"></span>
      <span className="focus-bracket-br"></span>
      <PromptInput
        className="sutaeru-input-box"
        accept="application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        maxFiles={5}
        maxFileSize={5 * 1024 * 1024}
        onError={(error) => window.dispatchEvent(new CustomEvent("sutaeru:attachment-error", { detail: error.message }))}
        onSubmit={handleSubmit}
      >
        <AttachmentList enabled={allowAttachments} />
        <PromptInputTextarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Kemma anything…"
          aria-label="Message Kemma"
          className="composer-textarea text-sutaeru-ink bg-transparent focus:outline-none w-full"
        />
        <PromptInputFooter className="sutaeru-composer-footer justify-end">
          <AttachButton enabled={allowAttachments} />
          <VoiceButton disabled={isStreaming} onTranscript={(text) => onChange(value ? `${value} ${text}` : text)} />
          <PromptInputSubmit
            status={isStreaming ? "streaming" : "ready"}
            onStop={onStop}
            disabled={!isStreaming && !value.trim()}
            className="sutaeru-composer-send"
            title={isStreaming ? "Stop generation" : "Send message"}
          >{!isStreaming && <SutaeruIcon name="arrow" className="size-5 -rotate-90" />}</PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}