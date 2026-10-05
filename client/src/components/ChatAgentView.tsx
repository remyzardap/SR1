import { cn } from "@/lib/utils";

const ENGINES = [
  {
    id: "investor",
    name: "Investor Update",
    desc: "Speed: High, Detail: Medium, Text: Concise",
    metrics: { speed: 5, detail: 3, text: 2 },
  },
  {
    id: "editorial",
    name: "Editorial Longform",
    desc: "Speed: Low, Detail: High, Text: Deep",
    metrics: { speed: 2, detail: 5, text: 5 },
  },
  {
    id: "technical",
    name: "Technical Summary",
    desc: "Speed: Medium, Detail: High, Text: Bulleted",
    metrics: { speed: 3, detail: 4, text: 3 },
  }
];

export function ChatAgentView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 fade-in mb-8 w-full max-w-[var(--hero-width)] mx-auto relative z-10">
      <div className="w-full flex flex-col gap-4 mb-7 text-center md:text-left">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-sutaeru-accent">AGENT MODE</div>
        <h1 className="text-3xl md:text-[42px] leading-[1.1] tracking-[-0.02em] font-title font-extrabold text-sutaeru-ink">Select an engine<br className="hidden md:block"/>to begin working.</h1>
      </div>
      
      <div className="w-full flex flex-col md:flex-row gap-4">
        {ENGINES.map((engine, idx) => (
          <button
            key={engine.id}
            className={cn(
              "flex-1 text-left p-5 rounded-[var(--radius-card-sm)] bg-sutaeru-card border transition-all relative overflow-hidden",
              idx === 0 ? "border-sutaeru-ink shadow-sm focus-bracket-target" : "border-sutaeru-stroke-card hover:border-sutaeru-quiet"
            )}
          >
            {idx === 0 && (
              <>
                <span className="focus-bracket-tl"></span>
                <span className="focus-bracket-tr"></span>
                <span className="focus-bracket-bl"></span>
                <span className="focus-bracket-br"></span>
              </>
            )}
            
            <h3 className="font-title font-bold text-lg text-sutaeru-ink mb-1">{engine.name}</h3>
            <p className="font-body text-xs text-sutaeru-quiet mb-6">{engine.desc}</p>
            
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase text-sutaeru-quiet tracking-wider">SPD</span>
                <div className="stepped-meter">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="stepped-bar-segment" style={{ backgroundColor: i < engine.metrics.speed ? "var(--color-ink)" : "var(--color-rule)" }}></div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase text-sutaeru-quiet tracking-wider">DET</span>
                <div className="stepped-meter">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="stepped-bar-segment" style={{ backgroundColor: i < engine.metrics.detail ? "var(--color-ink)" : "var(--color-rule)" }}></div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase text-sutaeru-quiet tracking-wider">TXT</span>
                <div className="stepped-meter">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="stepped-bar-segment" style={{ backgroundColor: i < engine.metrics.text ? "var(--color-ink)" : "var(--color-rule)" }}></div>
                  ))}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
