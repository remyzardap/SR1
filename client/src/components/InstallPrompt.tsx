import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { InstallPrompt as InstallPromptComponent, type InstallState } from "@/components/redo/InstallPrompt";

export function InstallPrompt() {
  const { canInstall, isStandalone, showIosHint, install, dismiss, dismissIosHint } = useInstallPrompt();

  if (isStandalone) return null;

  let state: InstallState = "dismissed";
  if (showIosHint) state = "ios";
  else if (canInstall) state = "prompt";

  return (
    <InstallPromptComponent
      state={state}
      onInstall={install}
      onDismiss={dismiss}
      onIosGuide={dismissIosHint}
      onIosDismiss={dismissIosHint}
    />
  );
}

export default InstallPrompt;