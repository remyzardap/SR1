import { ExternalLink } from "lucide-react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { MessageBubble } from "./MessageBubble";
import { ChatRunCard } from "./ChatRunCard";
import { OfflineBanner } from "./OfflineBanner";
import type { ActivityItem } from "./ActivityFeed";
import { TypingIndicator } from "./TypingIndicator";
import { ChatEmptyState } from "./ChatEmptyState";
import type { ChatMessageData, PlanDirection } from "@/types/chat";
import type { AgentStep } from "@/lib/streamReducer";

interface ChatMessagesProps {
  messages: ChatMessageData[];
  isStreaming: boolean;
  agentName?: string;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onSaveMemory?: (content: string) => void;
  sources?: Array<{ title: string; url: string }>;
  steps?: AgentStep[];
  activity?: ActivityItem[];
  /** The step currently running, for the progress card. */
  runLabel?: string;
  /** No connection: the banner, and sends stay on screen as queued. */
  offline?: boolean;
  onSelectPlan?: (messageId: string, option: PlanDirection) => void;
}

export function ChatMessages({ messages, isStreaming, agentName, messagesEndRef, onSaveMemory, sources = [], steps = [], activity = [], runLabel, offline = false, onSelectPlan }: ChatMessagesProps) {
  const lastAssistantIndex = messages.length - 1 - [...messages].reverse().findIndex((message) => message.role === "assistant");
  const toolSteps = steps.filter((step) => step.detail);

  return (
    <Conversation className="sutaeru-chat-transcript min-w-0">
      <ConversationContent className="sutaeru-chat-content mx-auto w-full max-w-[800px]">
        {offline && <OfflineBanner />}
        {messages.length === 0 && !isStreaming ? <ChatEmptyState agentName={agentName} /> : (
          <div className="sutaeru-answer-flow">
            {messages.map((message, index) => {
              const isCurrentStreaming = Boolean(
                isStreaming && (message.streaming || (lastAssistantIndex !== -1 && index === lastAssistantIndex))
              );
              const messageTools = message.steps?.filter((step) => step.detail);
              const tools = message.role === "assistant"
                ? (isCurrentStreaming ? (messageTools && messageTools.length > 0 ? messageTools : toolSteps) : messageTools)
                : undefined;
              const msgActivity = message.role === "assistant"
                ? (isCurrentStreaming ? (message.activity && message.activity.length > 0 ? message.activity : activity) : message.activity)
                : undefined;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onSave={!message.streaming && message.role === "assistant" ? onSaveMemory : undefined}
                  tools={tools}
                  activity={msgActivity}
                  isRunning={isCurrentStreaming}
                  sources={message.sources}
                  question={message.question}
                  references={message.references}
                  onSelectPlan={onSelectPlan ? (option) => onSelectPlan(message.id, option) : undefined}
                />
              );
            })}
            {isStreaming && activity.length > 0 && <ChatRunCard activity={activity} label={runLabel || "Working"} />}
            {isStreaming && messages.at(-1)?.role !== "assistant" && <TypingIndicator />}
            {sources.length > 0 && !messages.some((message) => message.sources?.length) && (
              <section className="sutaeru-answer-sources" aria-label="Research sources">
                <span className="sutaeru-editorial-kicker">Sources / {sources.length}</span>
                <div className="sutaeru-answer-source-list">
                  {sources.map((source, index) => (
                    <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">
                      <span className="sutaeru-source-number">{index + 1}</span>
                      <span>{source.title}</span><ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </ConversationContent>
      <ConversationScrollButton aria-label="Scroll to latest message" />
    </Conversation>
  );
}
