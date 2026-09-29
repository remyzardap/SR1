import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { transcribeAudio } from "@/lib/kemmaCloud";
import { toast } from "sonner";

type Phase = "idle" | "recording" | "transcribing";

/**
 * Microphone button for the chat composer. Records with MediaRecorder,
 * sends the audio to the voice Cloud function, and types the transcript
 * into the composer.
 */
export function VoiceButton({ onTranscript, disabled }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice input is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 500) { setPhase("idle"); return; }
        setPhase("transcribing");
        try {
          const text = await transcribeAudio(blob);
          if (text) onTranscript(text);
          else toast.error("I couldn't make out any speech — try again.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Transcription failed.");
        } finally {
          setPhase("idle");
        }
      };
      recorder.start();
      setPhase("recording");
    } catch {
      toast.error("Microphone access is needed for voice input.");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  const label = phase === "recording" ? "Stop and transcribe" : phase === "transcribing" ? "Transcribing…" : "Dictate a message";
  return (
    <PromptInputButton
      className={`sutaeru-voice-button${phase === "recording" ? " is-recording" : ""}`}
      onClick={phase === "recording" ? stop : start}
      disabled={disabled || phase === "transcribing"}
      tooltip={label}
      aria-label={label}
    >
      {phase === "recording" ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" className={phase === "transcribing" ? "animate-pulse" : undefined} />}
    </PromptInputButton>
  );
}
