import { Shimmer } from "@/components/ai-elements/shimmer";

export function TypingIndicator() {
  return <div className="sutaeru-typing-indicator" role="status"><Shimmer>Thinking…</Shimmer></div>;
}