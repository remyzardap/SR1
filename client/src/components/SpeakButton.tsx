import { useEffect, useRef, useState } from "react";
import { Volume2, Square } from "lucide-react";
import { speakText } from "@/lib/kemmaCloud";
import { toast } from "sonner";

/** Small listen/stop button that reads a message aloud via the voice Cloud function. */
export function SpeakButton({ text, className }: { text: string; className?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function toggle() {
    if (state === "playing") {
      audioRef.current?.pause();
      audioRef.current = null;
      setState("idle");
      return;
    }
    if (state === "loading") return;
    setState("loading");
    try {
      const url = await speakText(text.replace(/[#*`_>\[\]()]/g, "").slice(0, 4000));
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => { setState("idle"); toast.error("Playback failed."); };
      await audio.play();
      setState("playing");
    } catch (error) {
      setState("idle");
      toast.error(error instanceof Error ? error.message : "Could not read this aloud.");
    }
  }

  const label = state === "playing" ? "Stop reading" : state === "loading" ? "Preparing audio…" : "Read aloud";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "loading"}
      aria-label={label}
      title={label}
      className={className}
      style={{ opacity: state === "loading" ? 0.5 : 1 }}
    >
      {state === "playing" ? <Square size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" className={state === "loading" ? "animate-pulse" : undefined} />}
    </button>
  );
}
