import { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  thinking: string;
  className?: string;
}

export function ThinkingBlock({ thinking, className }: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!thinking || !thinking.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        "think",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="think-btn"
        aria-expanded={isOpen}
      >
        <Brain className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
        <span className="mono flex-1">Thinking process</span>
        <ChevronRight
          className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-90")}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <div className="think-body">
          {thinking}
        </div>
      )}
    </div>
  );
}
