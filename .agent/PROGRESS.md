# T-184: Quiet — Voice screen

## Done
- Read task instructions (T-184.task.md), all spec docs (HANDOVER, README, FRONTEND-QUIET, FRONTEND-REDO, AGENT_OPS)
- Read Voice.dc.html design board (the visual target)
- Read existing useVoiceDictation hook and kemmaCloud.ts (transcribeAudio, speakText)
- Read reskin-tokens.css for token reference
- Explored codebase structure: page pattern (container + presentational), lab pattern, fixture pattern
- Verified npm run check and npm test pass (baseline)

## In progress
- Creating Voice presentational component + container + lab + fixtures
- Adding /voice route

## Next
- Wire Voice into Home mic button and Menu (NAV_DESTINATIONS)
- Write tests
- npm run check && npm test gate

## Decisions
- Voice is a new screen (not an existing one), so there's no old component to delete in styles/redo/
- Pattern follows existing screens: VoiceScreen (presentational) + Voice (container page) + LabVoice + fixtures
- Reuse useVoiceDictation hook for mic recording and transcribeAudio for backend
- No server changes per spec; only client work
- Voice.dc.html shows: header with logo menu, "Voice Listening" title, animated waveform SVG, "Plan my week around Friday…" hint, three buttons (Type instead, Speak/Stop, Show it)
- Photos: use existing studio images (e.g., o/nav-voice.webp if it exists, or generic art)

## Commands to verify
- npm run check
- npm test
- npm run build
