import { SutaeruGlyph } from "@/components/brand";
import { cn } from "@/lib/utils";

export type InstallState = "prompt" | "ios" | "dismissed" | "installed";

export interface InstallPromptProps {
  state: InstallState;
  onInstall: () => void;
  onDismiss: () => void;
  onIosGuide: () => void;
  onIosDismiss: () => void;
  className?: string;
}

const cardStyle = {
  background: "var(--r-card)",
  borderColor: "var(--r-stroke)",
  boxShadow: "var(--r-shadow)",
};

export function InstallPrompt({ state, onInstall, onDismiss, onIosGuide, onIosDismiss, className }: InstallPromptProps) {
  if (state === "dismissed" || state === "installed") return null;

  if (state === "ios") {
    return (
      <div
        className={cn(
          "fixed pwa-bottom-card bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-auto z-50",
          "animate-slide-up",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <div className="sk-ios-guide-sheet" style={cardStyle}>
          <h2 id="ios-guide-title" className="mono">Add to Home Screen</h2>
          <div className="ios-phone" aria-hidden="true">
            <div className="ios-grid">
              {Array.from({ length: 11 }, (_, i) => <i key={i} />)}
              <span className="ios-app">
                <SutaeruGlyph detail="full" size={64} />
                <small>Sutaeru</small>
              </span>
            </div>
          </div>
          <ol className="ios-steps">
            <li>
              <span className="n">1</span>
              <span className="step-ico">
                <svg viewBox="0 0 96 96" className="ico" aria-hidden="true"><path d="M48 14v46M32 30l16-16 16 16M30 42H22v40h52V42h-8"/></svg>
              </span>
              <span>Tap <b>Share</b> in Safari&apos;s toolbar</span>
            </li>
            <li>
              <span className="n">2</span>
              <span className="step-ico">
                <svg viewBox="0 0 96 96" className="ico" aria-hidden="true"><rect x="18" y="18" width="60" height="60" rx="14"/><path d="M48 34v28M34 48h28"/></svg>
              </span>
              <span>Choose <b>Add to Home Screen</b></span>
            </li>
            <li>
              <span className="n">3</span>
              <span className="step-ico">
                <svg viewBox="0 0 96 96" className="ico" aria-hidden="true"><path d="m22 50 17 17 36-39"/></svg>
              </span>
              <span>Tap <b>Add</b>. Sutaeru opens full screen from now on.</span>
            </li>
          </ol>
          <button className="btn ink big" onClick={onIosDismiss}>Got it</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed pwa-bottom-card bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-auto z-50",
        "animate-slide-up",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="install card" style={cardStyle}>
        <span className="install-ico">
          <SutaeruGlyph detail="compact" size={44} />
        </span>
        <span className="install-tx">
          <b>Install Sutaeru</b>
          <small>Full screen, opens instantly, works offline.</small>
        </span>
        <span className="install-acts">
          <button className="btn ink" onClick={onInstall}>Install</button>
          <button className="btn ghost" onClick={onDismiss}>Not now</button>
        </span>
      </div>
    </div>
  );
}

export default InstallPrompt;