import type { VoicePhase } from "@/hooks/useVoiceDictation";
import type { VoiceScreenProps } from "@/components/voice/VoiceScreen";

export type VoiceLabState = "idle" | "recording" | "transcribing" | "done";

export const VOICE_LAB_STATES: VoiceLabState[] = ["idle", "recording", "transcribing", "done"];

export const VOICE_STATE_NAMES: VoiceLabState[] = ["idle", "recording", "transcribing", "done"];

function voiceFixture(state: VoiceLabState): VoiceScreenProps {
  const base: VoiceScreenProps = {
    phase: "idle",
    listening: false,
    busy: false,
    onStart: () => {},
    onStop: () => {},
    onTypeInstead: () => {},
    onShowResult: () => {},
  };

  switch (state) {
    case "recording":
      return { ...base, phase: "recording", listening: true, busy: true, hintText: "Plan my week around", hintSuffix: "Friday…" };
    case "transcribing":
      return { ...base, phase: "transcribing", listening: false, busy: true, hintText: "Plan my week around", hintSuffix: "Friday…" };
    case "done":
      return { ...base, phase: "idle", listening: false, busy: false, transcript: "Plan my week around Friday with a workout at 7am, then the team standup at 10." };
    case "idle":
    default:
      return { ...base, phase: "idle", listening: false, busy: false, hintText: "Plan my week around", hintSuffix: "Friday…" };
  }
}

export const VOICE_LAB_FIXTURES: Record<VoiceLabState, VoiceScreenProps> = {
  idle: voiceFixture("idle"),
  recording: voiceFixture("recording"),
  transcribing: voiceFixture("transcribing"),
  done: voiceFixture("done"),
};
