import { NEON, NEON_FD } from "@/lib/design";

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
  },
];

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: NEON.muted, fontFamily: NEON_FD }}>{label}</span>
      <div className="flex gap-[3px]">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-[6px] h-[10px] rounded-[1px]" style={{ background: i < value ? NEON.ink : "rgba(10,10,10,0.12)" }} />
        ))}
      </div>
    </div>
  );
}

export function ChatAgentView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 w-full max-w-3xl mx-auto">
      <div className="w-full flex flex-col gap-3 mb-7 text-center md:text-left">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: NEON.orange, fontFamily: NEON_FD }}>Agent mode</span>
        <h1 className="text-3xl md:text-[40px] leading-[1.1] tracking-[-0.02em] font-extrabold" style={{ color: NEON.ink, fontFamily: NEON_FD }}>
          Select an engine<br className="hidden md:block" />to begin working.
        </h1>
      </div>

      <div className="w-full flex flex-col md:flex-row gap-4">
        {ENGINES.map((engine) => (
          <button
            key={engine.id}
            type="button"
            className="flex-1 text-left p-5 rounded-2xl transition-all"
            style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(10,10,10,0.08)" }}
          >
            <h3 className="font-bold text-lg mb-1" style={{ color: NEON.ink, fontFamily: NEON_FD }}>{engine.name}</h3>
            <p className="text-xs mb-6" style={{ color: NEON.muted }}>{engine.desc}</p>

            <div className="flex items-center gap-4">
              <Meter label="SPD" value={engine.metrics.speed} />
              <Meter label="DET" value={engine.metrics.detail} />
              <Meter label="TXT" value={engine.metrics.text} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
