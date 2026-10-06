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
        "my-2 rounded-lg border border-border/40 bg-muted/20 text-xs text-muted-foreground transition-colors",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-expanded={isOpen}
      >
        <Brain className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
        <span className="flex-1">Thinking process</span>
        <ChevronRight
          className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-90")}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <div className="border-t border-border/30 px-3 py-2 font-mono whitespace-pre-wrap break-words leading-relaxed opacity-90">
          {thinking}
        </div>
      )}
    </div>
  );
}
