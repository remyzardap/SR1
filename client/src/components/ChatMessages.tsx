import { ExternalLink } from "lucide-react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ChatEmptyState } from "./ChatEmptyState";

interface MessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  streaming?: boolean;
  createdAt: Date;
  sources?: Array<{ title: string; url: string }>;
  question?: string;
  references?: string[];
}

interface ChatMessagesProps {
  messages: MessageData[];
  isStreaming: boolean;
  agentName?: string;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onSaveMemory?: (content: string) => void;
  onSuggestion: (text: string) => void;
  sources?: Array<{ title: string; url: string }>;
  steps?: Array<{ id: string; label: string; detail?: string }>;
}

export function ChatMessages({ messages, isStreaming, agentName, messagesEndRef, onSaveMemory, onSuggestion, sources = [], steps = [] }: ChatMessagesProps) {
  const lastAssistantIndex = messages.length - 1 - [...messages].reverse().findIndex((message) => message.role === "assistant");
  const toolSteps = steps.filter((step) => step.detail);

  return (
    <Conversation className="sutaeru-chat-transcript min-w-0">
      <ConversationContent className="sutaeru-chat-content mx-auto w-full max-w-[800px]">
        {messages.length === 0 && !isStreaming ? <ChatEmptyState agentName={agentName} onSuggestion={onSuggestion} /> : (
          <div className="sutaeru-answer-flow">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                onSave={!message.streaming && message.role === "assistant" ? onSaveMemory : undefined}
                tools={index === lastAssistantIndex ? toolSteps : undefined}
                isRunning={isStreaming && index === lastAssistantIndex}
                sources={message.sources}
                question={message.question}
                references={message.references}
              />
            ))}
            {isStreaming && messages.at(-1)?.role !== "assistant" && <TypingIndicator />}
            {sources.length > 0 && !messages.some((message) => message.sources?.length) && (
              <section className="sutaeru-answer-sources" aria-label="Research sources">
                <span className="sutaeru-editorial-kicker">Sources / {sources.length}</span>
                <div className="sutaeru-answer-source-list">
                  {sources.map((source, index) => (
                    <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">
                      <span className="sutaeru-source-number">{String(index + 1).padStart(2, "0")}</span>
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