import { useState } from "react";
import { FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Message, MessageContent, MessageResponse, MessageActions, MessageAction } from "@/components/ai-elements/message";
import { Tool, ToolHeader, ToolContent } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { downloadResearchMarkdown, downloadResearchPdf } from "@/lib/researchReports";
import { SpeakButton } from "./SpeakButton";
import { PlanOptionCards } from "./PlanOptionCards";
import type { ChatMessageData, PlanDirection } from "@/types/chat";
import { SutaeruIcon } from "./SutaeruIcon";
import { ActivityFeed, type ActivityItem } from "./ActivityFeed";

interface MessageBubbleProps {
  message: ChatMessageData;
  onSave?: (content: string) => void;
  tools?: Array<{ id: string; label: string; detail?: string }>;
  isRunning?: boolean;
  activity?: ActivityItem[];
  sources?: Array<{ title: string; url: string }>;
  question?: string;
  references?: string[];
  onSelectPlan?: (option: PlanDirection) => void;
}

export function MessageBubble({ message, onSave, tools = [], isRunning = false, activity = [], sources = [], question, references = [], onSelectPlan }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const utils = trpc.useUtils();
  const createBlock = trpc.blocks.create.useMutation({
    onSuccess: () => { toast.success("Pinned to Board"); void utils.blocks.pinned.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const isUser = message.role === "user";

  return (
    <Message from={message.role} className="sutaeru-editorial-message max-w-full">
      <div className="sutaeru-message-label">
        <strong>{isUser ? "You" : "Kemma"}</strong>
        <span>{message.createdAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        {!isUser && message.model && <span>{message.model}</span>}
      </div>
      {!isUser && activity.length > 0 && <ActivityFeed items={activity} isRunning={isRunning} />}
      <MessageContent className={isUser ? "sutaeru-user-content" : "sutaeru-assistant-content"}>
        {message.streaming && !message.content ? <Shimmer>Thinking…</Shimmer> :
          isUser ? <span className="whitespace-pre-wrap">{message.content}</span> :
          <MessageResponse isAnimating={message.streaming}>{message.content}</MessageResponse>}
      </MessageContent>
      {!isUser && message.planOptions?.length && onSelectPlan ? (
        <PlanOptionCards options={message.planOptions} selectedId={message.selectedOptionId} disabled={message.streaming} onSelect={onSelectPlan} />
      ) : null}
      {isUser && references.length > 0 && <div className="sutaeru-message-references">{references.map((name) => <span key={name}><FileText />{name}</span>)}</div>}
      {!isUser && sources.length > 0 && (
        <section className="sutaeru-message-sources" aria-label="Sources for this answer">
          <strong>Sources / {sources.length}</strong>
          <ol>{sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer"><span>{String(index + 1).padStart(2, "0")}</span>{source.title}</a></li>)}</ol>
        </section>
      )}
      {!isUser && activity.length === 0 && tools.length > 0 && (
        <div className="sutaeru-message-tools">
          {tools.map((tool) => (
            <Tool key={tool.id} defaultOpen={false}>
              <ToolHeader type="dynamic-tool" toolName={tool.detail ?? tool.label} title={tool.label} state={isRunning ? "input-available" : "output-available"} />
              <ToolContent>{tool.detail && <p>{tool.detail}</p>}</ToolContent>
            </Tool>
          ))}
        </div>
      )}
      {!isUser && !message.streaming && message.content && (
        <MessageActions className="sutaeru-message-actions">
          <MessageAction tooltip={copied ? "Copied" : "Copy answer"} label="Copy answer" onClick={() => {
            void navigator.clipboard.writeText(message.content).then(() => {
              setCopied(true); window.setTimeout(() => setCopied(false), 1500);
            });
          }}>{<SutaeruIcon name={copied ? "check" : "copy"} />}</MessageAction>
          <SpeakButton text={message.content} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" />
          <MessageAction tooltip="Pin to Board" label="Pin to Board" onClick={() => createBlock.mutate({
            type: "chat", source: "s1", content: { text: message.content }, pinned: true, tags: [],
          })}><SutaeruIcon name="pin" /></MessageAction>
          {onSave && <MessageAction tooltip="Save to memory" label="Save to memory" onClick={() => onSave(message.content)}><SutaeruIcon name="bookmark" /></MessageAction>}
          {question && <MessageAction tooltip="Download PDF report" label="Download PDF report" onClick={() => downloadResearchPdf({ question, answer: message.content, sources, createdAt: message.createdAt })}><SutaeruIcon name="download" /></MessageAction>}
          {question && <MessageAction tooltip="Download Markdown report" label="Download Markdown report" onClick={() => downloadResearchMarkdown({ question, answer: message.content, sources, createdAt: message.createdAt })}><FileText /></MessageAction>}
        </MessageActions>
      )}
    </Message>
  );
}