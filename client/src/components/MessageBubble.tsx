import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { defaultRehypePlugins, type StreamdownProps } from "streamdown";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Message, MessageContent, MessageResponse, MessageActions, MessageAction } from "@/components/ai-elements/message";
import { Tool, ToolHeader, ToolContent } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { downloadResearchMarkdown, downloadResearchPdf } from "@/lib/researchReports";
import { SpeakButton } from "./SpeakButton";
import { PlanOptionCards } from "./PlanOptionCards";
import type { ChatMessageData, ChatSource, PlanDirection } from "@/types/chat";
import { ThinkingBlock } from "./chat/ThinkingBlock";
import { CitationChip } from "./chat/CitationChip";
import { citationAnchorId, createCitationPlugin, hostOf, numberedSources } from "@/lib/citations";
import { SutaeruIcon } from "./SutaeruIcon";
import { SourceCards } from "@/components/answer/AnswerParts";
import { ActivityFeed, type ActivityItem } from "./ActivityFeed";
import { toolState, formatDuration, type AgentStep } from "@/lib/streamReducer";

/** `<citationchip>` nodes come from `createCitationPlugin`; Streamdown types `components` as a map
 *  over HTML tags only, so the custom tag needs a cast. */
const CITATION_COMPONENTS = { citationchip: CitationChip } as unknown as StreamdownProps["components"];

/** Stable default so `useMemo` below is not invalidated by a fresh array on every render. */
const NO_SOURCES: ChatSource[] = [];

/** What the answer's `MessageResponse` needs to render numbered chips; empty while there are no sources. */
interface CitationRenderOptions {
  rehypePlugins?: StreamdownProps["rehypePlugins"];
  components?: StreamdownProps["components"];
}

function renderAssistantContent(
  content: string,
  segments: Array<{ kind: "narration" | "answer"; end: number }> | undefined,
  isStreaming: boolean,
  citations: CitationRenderOptions
) {
  if (!segments || segments.length === 0) {
    return (
      <MessageResponse isAnimating={isStreaming} {...citations}>
        {content}
      </MessageResponse>
    );
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
          <MessageResponse key={i} isAnimating={isStreaming} {...citations}>
            {part.text}
          </MessageResponse>
        )
      )}
    </>
  );
}

interface MessageBubbleProps {
  message: ChatMessageData;
  onSave?: (content: string) => void;
  tools?: AgentStep[];
  isRunning?: boolean;
  activity?: ActivityItem[];
  sources?: ChatSource[];
  question?: string;
  references?: string[];
  onSelectPlan?: (option: PlanDirection) => void;
}

export function MessageBubble({ message, onSave, tools = [], isRunning = false, activity = [], sources = NO_SOURCES, question, references = [], onSelectPlan }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const numbered = useMemo(() => numberedSources(sources), [sources]);
  const utils = trpc.useUtils();
  const createBlock = trpc.blocks.create.useMutation({
    onSuccess: () => { toast.success("Pinned to Board"); void utils.blocks.pinned.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const isUser = message.role === "user";
  // Streamdown replaces its rehype pipeline when one is supplied, so the defaults have to come
  // first (they harden links and sanitise HTML) with the citation plugin last.
  const citations = useMemo<CitationRenderOptions>(
    () => ({
      rehypePlugins: [
        ...Object.values(defaultRehypePlugins),
        createCitationPlugin({ sources, messageId: message.id }),
      ],
      components: CITATION_COMPONENTS,
    }),
    [sources, message.id]
  );

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
            renderAssistantContent(message.content, message.segments, !!message.streaming, citations)}
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
          <p className="mono">Sources / {sources.length}</p>
          <SourceCards
            label="Sources for this answer"
            activeId={activeSource ?? citationAnchorId(message.id, numbered[0].number)}
            onSelect={(s) => setActiveSource(s.id)}
            sources={numbered.map(({ source, number }) => ({
              id: citationAnchorId(message.id, number),
              number,
              host: hostOf(source.url),
              title: source.title,
              href: source.url,
            }))}
          />
        </section>
      )}
      {!isUser && activity.length === 0 && tools.length > 0 && (
        <div className="sutaeru-message-tools">
          {tools.map((tool) => {
            const headerState = toolState(tool, isRunning);
            const duration = typeof tool.durationMs === "number" ? formatDuration(tool.durationMs) : undefined;
            const headerTitle = duration ? (
              <>
                {tool.label}
                <span className="text-muted-foreground font-normal ml-1.5">{duration}</span>
              </>
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