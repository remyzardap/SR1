import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { X, Download, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NEON, NEON_FD } from "@/lib/design";

/**
 * Install prompt component - shows a dismissible "Install Sutaeru" button
 * when the app is installable and not already installed.
 * On iOS Safari, shows a "Share, then Add to Home Screen" hint.
 */
export function InstallPrompt() {
  const { canInstall, isStandalone, showIosHint, install, dismiss, dismissIosHint } = useInstallPrompt();

  if (isStandalone) return null;

  const cardStyle = {
    background: "var(--r-card)",
    borderColor: "var(--r-stroke)",
    boxShadow: "var(--r-shadow)",
  };

  if (showIosHint) {
    return (
      <div
        className={cn(
          "fixed pwa-bottom-card bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-auto z-50",
          "animate-slide-up"
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg" style={cardStyle}>
          <Share2 className="h-5 w-5 flex-shrink-0" style={{ color: NEON.orange }} />
          <span className="text-sm font-medium flex-1" style={{ color: NEON.ink, fontFamily: NEON_FD }}>
            Share, then <strong>Add to Home Screen</strong>
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismissIosHint}
            aria-label="Dismiss iOS install hint"
            className="flex-shrink-0"
            style={{ color: NEON.muted }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (!canInstall) return null;

  return (
    <div
      className={cn(
        "fixed pwa-bottom-card bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-auto z-50",
        "animate-slide-up"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg" style={cardStyle}>
        <Download className="h-5 w-5 flex-shrink-0" style={{ color: NEON.orange }} />
        <span className="text-sm font-medium flex-1" style={{ color: NEON.ink, fontFamily: NEON_FD }}>
          Install Sutaeru
        </span>
        <Button
          variant="default"
          size="sm"
          onClick={install}
          className="flex-shrink-0"
          style={{
            background: NEON.orange,
            color: NEON.cream,
            fontFamily: NEON_FD,
          }}
        >
          Install
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="flex-shrink-0"
          style={{ color: NEON.muted }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default InstallPrompt;