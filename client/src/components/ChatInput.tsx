import type { ReactNode } from "react";
import { FileText, Paperclip } from "lucide-react";
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
  /** No connection: the composer locks and says why. */
  offline?: boolean;
  /**
   * The tools row, left of the send button: the attach plus, the mode chip and the
   * private switch, the same order Home's composer uses.
   */
  tools?: ReactNode;
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

/**
 * The thread composer. It shares the Home composer's look: a roomy field of three lines,
 * the tools row under it, and one 50px button on the right that is the mic while the
 * field is empty, Send once there is a question, and Stop while a run streams.
 */
export function ChatInput({ value, isStreaming, onChange, onKeyDown, onSend, onStop, allowAttachments = false, offline = false, tools }: ChatInputProps) {
  const handleSubmit = async (message: PromptInputMessage) => {
    if (isStreaming || (!message.text.trim() && message.files.length === 0)) return;
    await onSend(message);
  };
  const showVoice = !isStreaming && !value.trim();

  return (
    <div className="sutaeru-chat-input w-full">
      <PromptInput
        className="sutaeru-input-box"
        data-offline={offline ? "true" : undefined}
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
          placeholder={offline ? "Reconnect to send" : "Ask anything…"}
          aria-label="Message Sutaeru"
          className="sutaeru-composer-textarea"
          rows={3}
        />
        <PromptInputFooter className="sutaeru-composer-footer">
          <div className="sutaeru-composer-tools ctrls">
            <AttachButton enabled={allowAttachments} />
            {tools}
          </div>
          {showVoice ? (
            <VoiceButton disabled={offline} onTranscript={(text) => onChange(value ? `${value} ${text}` : text)} />
          ) : (
            <PromptInputSubmit
              status={isStreaming ? "streaming" : "ready"}
              onStop={onStop}
              disabled={(!isStreaming && !value.trim()) || offline}
              className="sutaeru-composer-send"
              title={isStreaming ? "Stop generation" : offline ? "Waiting to send" : "Send message"}
              aria-label={isStreaming ? "Stop generation" : "Send message"}
            >{!isStreaming && <SutaeruIcon name="arrow" className="size-5 -rotate-90" />}</PromptInputSubmit>
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
