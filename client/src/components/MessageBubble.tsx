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
import { ThinkingBlock } from "./chat/ThinkingBlock";
import { SutaeruIcon } from "./SutaeruIcon";
import { FocusBrackets } from "@/components/art";
import { ActivityFeed, type ActivityItem } from "./ActivityFeed";
import { toolState, formatDuration, type AgentStep } from "@/lib/streamReducer";

function renderAssistantContent(
  content: string,
  segments: Array<{ kind: "narration" | "answer"; end: number }> | undefined,
  isStreaming: boolean
) {
  if (!segments || segments.length === 0) {
    return <MessageResponse isAnimating={isStreaming}>{content}</MessageResponse>;
  }

  const parts: Array<{ kind: "narration" | "answer"; text: string }> = [];
  let prev = 0;
  for (const seg of segments) {
    const end = Math.min(seg.end, content.length);
    if (end > prev) {
      parts.push({ kind: seg.kind, text: content.slice(prev, end) });
      prev = end;
    }
  }
  if (prev < content.length) {
    parts.push({ kind: "answer", text: content.slice(prev) });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.kind === "narration" ? (
          <div key={i} className="text-muted-foreground/80 text-sm italic mb-2 whitespace-pre-wrap">
            {part.text}
          </div>
        ) : (
          <MessageResponse key={i} isAnimating={isStreaming}>
            {part.text}
          </MessageResponse>
        )
      )}
    </>
  );
}

/** Host label for a source card, e.g. "irena.org". Empty when the url is not absolute. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

interface MessageBubbleProps {
  message: ChatMessageData;
  onSave?: (content: string) => void;
  tools?: AgentStep[];
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
      {!message.queued && (
        <div className="sutaeru-message-label">
          <strong>{isUser ? "You" : "Sutaeru"}</strong>
          <span>{message.createdAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        </div>
      )}
      {!isUser && activity.length > 0 && <ActivityFeed items={activity} isRunning={isRunning} />}
      {message.queued ? (
        <div className="sutaeru-queued-wrap">
          <div className="sutaeru-queued-content">
            <span className="whitespace-pre-wrap">{message.content}</span>
          </div>
          <span className="sutaeru-queued-line" aria-hidden="true" />
          <span className="sutaeru-queued-label">Waiting to send</span>
        </div>
      ) : (
        <MessageContent className={isUser ? "sutaeru-user-content" : "sutaeru-assistant-content"}>
          {message.streaming && !message.content ? <Shimmer>Thinking…</Shimmer> :
            isUser ? <span className="whitespace-pre-wrap">{message.content}</span> :
            renderAssistantContent(message.content, message.segments, !!message.streaming)}
        </MessageContent>
      )}
      {!isUser && message.thinking && (
        <ThinkingBlock thinking={message.thinking} />
      )}
      {!isUser && message.planOptions?.length && onSelectPlan ? (
        <PlanOptionCards options={message.planOptions} selectedId={message.selectedOptionId} disabled={message.streaming} onSelect={onSelectPlan} />
      ) : null}
      {isUser && references.length > 0 && <div className="sutaeru-message-references">{references.map((name) => <span key={name}><FileText />{name}</span>)}</div>}
      {!isUser && sources.length > 0 && (
        <section className="sutaeru-message-sources" aria-label="Sources for this answer">
          <strong>Sources / {sources.length}</strong>
          <ol>
            {sources.map((source, index) => (
              <li key={`${source.url}-${index}`}>
                {index === 0 && <FocusBrackets />}
                <a href={source.url} target="_blank" rel="noreferrer">
                  <span className="sutaeru-cite-chip">{index + 1}</span>
                  <span className="sutaeru-source-copy">
                    <span className="sutaeru-source-host">{index + 1} · {hostOf(source.url)}</span>
                    <span className="sutaeru-source-title">{source.title}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!isUser && activity.length === 0 && tools.length > 0 && (
        <div className="sutaeru-message-tools">
          {tools.map((tool) => {
            const headerState = toolState(tool, isRunning);
            const duration = typeof tool.durationMs === "number" ? formatDuration(tool.durationMs) : undefined;
            const headerTitle = duration ? (
              (
                <>
                  {tool.label}
                  <span className="text-muted-foreground font-normal ml-1.5">{duration}</span>
                </>
              ) as unknown as string
            ) : (
              tool.label
            );

            return (
              <Tool key={tool.id} defaultOpen={false}>
                <ToolHeader
                  type="dynamic-tool"
                  toolName={tool.detail ?? tool.label}
                  title={headerTitle}
                  state={headerState}
                />
                <ToolContent>{tool.detail && <p>{tool.detail}</p>}</ToolContent>
              </Tool>
            );
          })}
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