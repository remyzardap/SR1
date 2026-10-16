import { useCallback } from "react";
import { useLocation } from "wouter";
import { VoiceScreen } from "@/components/voice/VoiceScreen";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { toast } from "sonner";

export default function Voice() {
  useSeoMeta({ title: "Voice", path: "/voice" });
  const [, navigate] = useLocation();

  const handleTranscript = useCallback(
    (text: string) => {
      navigate(`/chat?q=${encodeURIComponent(text)}`);
    },
    [navigate]
  );

  const voice = useVoiceDictation(handleTranscript);

  return (
    <VoiceScreen
      phase={voice.phase}
      listening={voice.listening}
      busy={voice.busy}
      onStart={voice.start}
      onStop={voice.stop}
      onTypeInstead={() => navigate("/chat")}
      onShowResult={() => {
        toast.info("Start speaking to see the transcript here.");
      }}
      hintText="Plan my week around"
      hintSuffix="Friday…"
    />
  );
}
