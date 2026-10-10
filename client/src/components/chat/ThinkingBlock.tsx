import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerFold } from "./AnswerFold";

interface ThinkingBlockProps {
  thinking: string;
  className?: string;
}

/** The first words of the reasoning, so the folded panel says what is inside. */
function preview(thinking: string): string {
  return thinking.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function ThinkingBlock({ thinking, className }: ThinkingBlockProps) {
  if (!thinking || !thinking.trim()) {
    return null;
  }

  return (
    <AnswerFold
      className={cn("think", className)}
      label="Thinking"
      icon={<Brain size={18} />}
      summary={preview(thinking)}
    >
      <div className="think-body">{thinking}</div>
    </AnswerFold>
  );
}
