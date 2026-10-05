import React, { useState, useEffect } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import "./Design.css";
import { Button } from "@/components/ui/button";
import { Edit2, Plus, Code, Download, MessageSquare } from "lucide-react";

export default function Design() {
  useSeoMeta({ title: "Design Workspace", path: "/design" });
  
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "kemma", content: string }[]>([
    { role: "kemma", content: "I've drafted the Hero Studio Asset based on your brief. I opted for a clean, architectural layout to emphasize the crisp typography and material highlights." }
  ]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setMessages(prev => [...prev, { role: "user", content: prompt }]);
    setPrompt("");
    setIsGenerating(true);
    
    // Mock generation delay
    setTimeout(() => {
      setIsGenerating(false);
      setMessages(prev => [...prev, { role: "kemma", content: "I updated the design to reflect your changes. The glaze now has a softer, cinematic lighting." }]);
    }, 1500);
  };

  return (
    <div className="sk-design-workspace">
      {/* Top Stepper Area - matches the reference */}
      <header className="px-12 py-3 border-b border-[var(--stroke-card)] flex items-center justify-between bg-[var(--bg-paper)] shrink-0 hidden md:flex">
        <div className="flex items-center gap-2 font-title font-bold text-lg text-[var(--color-ink)] tracking-tight">
          Sutaeru Design
        </div>
        
        <div className="topbar-stepper">
          <div className="step-node"><span>01 BRIEF</span></div>
          <span className="step-separator">·</span>
          <div className="step-node active">
            <span className="step-pill-badge">02 DESIGN</span>
          </div>
          <span className="step-separator">·</span>
          <div className="step-node"><span>03 CODE</span></div>
          <span className="step-separator">·</span>
          <div className="step-node"><span>04 DONE</span></div>
        </div>

        <div className="flex items-center gap-4">
          <div className="font-mono text-[11px] uppercase tracking-[1.54px] text-[var(--color-quiet)] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse"></span>
            KEMMA / READY
          </div>
        </div>
      </header>

      {/* Main Stage */}
      <main className="proposal-stage">
        
        {/* Left Rail */}
        <aside className="left-rail">
          <span className="mono-label">WHAT I UNDERSTOOD</span>
          
          <div className="rail-recap-box focus-bracket-target">
            <span className="focus-bracket-tl"></span>
            <span className="focus-bracket-tr"></span>
            <span className="focus-bracket-bl"></span>
            <span className="focus-bracket-br"></span>

            <p className="recap-quote">“A ceramic mug on a wooden table in soft light with Sutaeru typography.”</p>
            <div className="understand-table">
              <div className="understand-row">
                <span className="understand-label">OBJECTIVE</span>
                <span className="understand-val">Hero Studio Asset</span>
              </div>
              <div className="understand-row">
                <span className="understand-label">ASPECT RATIO</span>
                <span className="understand-val">4:5 Portrait</span>
              </div>
              <div className="understand-row">
                <span className="understand-label">LIGHTING</span>
                <span className="understand-val">Crisp Specular</span>
              </div>
            </div>
          </div>

          <div className="rail-actions">
            <button className="btn-secondary">
              <Edit2 size={12} />
              <span>Edit Brief</span>
            </button>
            <button className="btn-secondary">
              <Plus size={12} />
              <span>Reference</span>
            </button>
          </div>

          <div className="mt-4 flex-1 flex flex-col min-h-0">
            <span className="mono-label mb-2">ITERATE WITH KEMMA</span>
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2 pb-4">
              {messages.map((msg, i) => (
                <div key={i} className={`text-[13px] leading-relaxed p-3 rounded-xl ${msg.role === 'kemma' ? 'bg-[var(--bg-card)] border border-[var(--stroke-card)] text-[var(--color-ink)]' : 'bg-[var(--color-ink)] text-[var(--bg-paper)]'}`}>
                  {msg.content}
                </div>
              ))}
              {isGenerating && (
                <div className="text-[13px] leading-relaxed p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--stroke-card)] text-[var(--color-quiet)] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-quiet)] animate-bounce"></span>
                  Drawing...
                </div>
              )}
            </div>
          </div>
          
          <div className="chat-input-wrapper">
            <form onSubmit={handleSend} className="relative">
              <input 
                type="text" 
                className="chat-input" 
                placeholder="Ask Kemma to modify..." 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                disabled={isGenerating}
              />
            </form>
          </div>
        </aside>

        {/* Main Canvas Area */}
        <section className="proposal-main">
          <div className="heading-row">
            <h1 className="section-title">Canvas Preview</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs font-medium rounded-full bg-[var(--bg-card)] border-[var(--stroke-card)] text-[var(--color-ink)] hover:bg-[var(--bg-panel)]">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export
              </Button>
              <Button size="sm" className="h-8 text-xs font-medium rounded-full bg-[var(--color-ink)] text-[var(--bg-paper)] hover:opacity-90">
                <Code className="w-3.5 h-3.5 mr-1.5" />
                Move to Code
              </Button>
            </div>
          </div>

          <div className="canvas-container focus-bracket-target">
             {/* SVGs from board-04 Gemini reference */}
             <svg width="100%" height="100%" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="max-w-md w-full max-h-full">
                {/* Clean architectural table plane */}
                <line x1="40" y1="300" x2="360" y2="300" stroke="var(--color-ink)" strokeWidth="2"/>
                {/* Subtle straight wood grain lines */}
                <line x1="40" y1="320" x2="360" y2="320" stroke="var(--color-rule)" strokeWidth="1"/>
                <line x1="40" y1="340" x2="360" y2="340" stroke="var(--color-rule)" strokeWidth="1"/>
                {/* Crisp geometric shadow */}
                <ellipse cx="200" cy="300" rx="70" ry="12" fill="var(--color-ink)" opacity="0.12"/>
                {/* Crisp cylindrical mug body */}
                <path d="M140 120h120v140c0 15-12 28-28 28h-64c-16 0-28-13-28-28V120z" fill="var(--bg-card)" stroke="var(--color-ink)" strokeWidth="3"/>
                {/* Crisp rim */}
                <ellipse cx="200" cy="120" rx="60" ry="14" fill="var(--bg-panel)" stroke="var(--color-ink)" strokeWidth="2.5"/>
                <ellipse cx="200" cy="120" rx="52" ry="10" fill="var(--bg-card)" stroke="var(--color-rule)" strokeWidth="1.5"/>
                {/* Sharp geometric handle */}
                <path d="M260 146c24 0 36 15 36 40s-12 40-36 40" stroke="var(--color-ink)" strokeWidth="4" fill="none" strokeLinecap="round"/>
                {/* Embossed legible typography on glaze */}
                <text x="200" y="200" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="18" fontWeight="700" letterSpacing="3" fill="var(--color-ink)">SUTAERU 01</text>
                <text x="200" y="220" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="14" letterSpacing="1" fill="var(--color-quiet)">ATELIER · 2026</text>
                {/* Crisp specular light glint */}
                <line x1="156" y1="140" x2="156" y2="250" stroke="var(--bg-paper)" strokeWidth="4" opacity="0.8"/>
             </svg>
          </div>

          <div className="flex items-center justify-between py-2 px-1 border-t border-[var(--stroke-card)] shrink-0">
             <div className="flex items-center gap-4">
                <span className="mono-label">ENGINE</span>
                <span className="text-[13px] font-semibold text-[var(--color-ink)]">Gemini 3.1 Pro (High)</span>
             </div>
             
             <div className="flex items-center gap-4">
                <span className="mono-label">RATIO</span>
                <div className="flex items-center gap-1">
                   <button className="px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--stroke-card)] text-[11px] font-mono text-[var(--color-quiet)]">1:1</button>
                   <button className="px-2 py-1 rounded bg-[var(--bg-panel)] border border-[var(--color-ink)] text-[11px] font-mono text-[var(--color-ink)]">4:5</button>
                   <button className="px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--stroke-card)] text-[11px] font-mono text-[var(--color-quiet)]">16:9</button>
                </div>
             </div>
          </div>
        </section>
      </main>
    </div>
  );
}
