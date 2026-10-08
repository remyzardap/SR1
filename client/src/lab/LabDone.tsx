import * as React from "react";
import { useSearch } from "wouter";
import { LabLayout } from "./LabLayout";
import { ResultCard } from "@/components/done/ResultCard";
import { doneFixtures } from "./fixtures/done";
import type { ResultCardProps } from "@/components/done/ResultCard";

export default function LabDone() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const state = params.get("state") || "finished-report";
  const fixture = doneFixtures[state] || doneFixtures["finished-report"];

  const handleDownload = React.useCallback(() => {
    console.log("Download clicked");
  }, []);

  const handleOpenDocuments = React.useCallback(() => {
    console.log("Open documents clicked");
  }, []);

  const handleShare = React.useCallback(() => {
    console.log("Share clicked");
  }, []);

  const handleFollowUp = React.useCallback((text: string) => {
    console.log("Follow up:", text);
  }, []);

  const props: ResultCardProps = {
    ...fixture,
    onDownload: handleDownload,
    onOpenDocuments: handleOpenDocuments,
    onShare: handleShare,
    onFollowUp: handleFollowUp,
  };

  return (
    <LabLayout title={`Done / ${state}`}>
      <ResultCard {...props} />
    </LabLayout>
  );
}