import { AnimatePresence, motion } from "framer-motion";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ChatEmptyState } from "./ChatEmptyState";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  streaming?: boolean;
  createdAt: Date;
}

interface ChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
  agentName?: string;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onSaveMemory?: (content: string) => void;
  onSuggestion: (text: string) => void;
}

export function ChatMessages({
  messages,
  isStreaming,
  agentName,
  messagesEndRef,
  onSaveMemory,
  onSuggestion,
}: ChatMessagesProps) {
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-6 min-w-0">
      <div className="max-w-2xl mx-auto w-full h-full">
        <AnimatePresence mode="wait">
          {isEmpty ? (
            <ChatEmptyState
              key="empty"
              agentName={agentName}
              onSuggestion={onSuggestion}
            />
          ) : (
            <motion.div key="messages" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onSave={!msg.streaming && msg.role === "assistant" ? onSaveMemory : undefined}
                />
              ))}
              {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                <TypingIndicator />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
