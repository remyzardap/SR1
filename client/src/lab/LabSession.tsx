import * as React from "react";
import { useSearch } from "wouter";
import { LabLayout } from "./LabLayout";
import { SessionView } from "@/components/session/SessionView";
import { sessionFixtures } from "./fixtures/session";
import type { SessionViewProps } from "@/components/session/SessionView";

export default function LabSession() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const state = params.get("state") || "working";
  const fixture = sessionFixtures[state] || sessionFixtures.working;

  const handleStop = React.useCallback(() => {
    console.log("Stop clicked");
  }, []);

  const handleResume = React.useCallback(() => {
    console.log("Resume clicked");
  }, []);

  const handleKeepWorking = React.useCallback(() => {
    console.log("Keep working clicked");
  }, []);

  const handleSendMessage = React.useCallback((text: string) => {
    console.log("Send message:", text);
  }, []);

  const handleSkipDemo = React.useCallback(() => {
    console.log("Skip demo clicked");
  }, []);

  const props: SessionViewProps = {
    ...fixture,
    onStop: handleStop,
    onResume: handleResume,
    onKeepWorking: handleKeepWorking,
    onSendMessage: handleSendMessage,
    onSkipDemo: handleSkipDemo,
  };

  return (
    <LabLayout title={`Session / ${state}`}>
      <SessionView {...props} />
    </LabLayout>
  );
}