import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "@/lib/kemmaCloud";
import { toast } from "sonner";

export type VoicePhase = "idle" | "recording" | "transcribing";

/**
 * Records from the microphone and types the transcript back, which is exactly what the
 * thread composer's VoiceButton does. Home needs the same path without that button's
 * markup, because its send button is also the mic (design/sutaeru-app/app.js:596-605),
 * so the logic lives here instead. Extracting it out of VoiceButton would mean
 * refactoring a component this task does not otherwise touch.
 */
export function useVoiceDictation(onTranscript: (text: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;

  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const start = useCallback(async () => {
    if (phase !== "idle") return;
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
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 500) {
          setPhase("idle");
          return;
        }
        setPhase("transcribing");
        try {
          const text = await transcribeAudio(blob);
          if (text) transcriptRef.current(text);
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
  }, [phase]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  return {
    phase,
    listening: phase === "recording",
    busy: phase !== "idle",
    start,
    stop,
    toggle: () => (phase === "recording" ? stop() : void start()),
  };
}
