import * as React from "react";
import { useLocation, useSearch } from "wouter";
import { AppHeader } from "@/components/chrome/AppHeader";
import { HomeScreen } from "@/components/home/HomeScreen";
import { AnswerScreen, type AnswerScreenState } from "@/components/answer/AnswerScreen";
import { AgentScreen } from "@/components/agent/AgentScreen";
import { ResultCard } from "@/components/done/ResultCard";
import { FilesView, type FileItem } from "@/components/files/FilesView";
import { homeLabComposer, homeLabRows, LAB_HOME_SOURCES } from "./fixtures/home";
import { ANSWER_APPROVAL, ANSWER_CHART, ANSWER_FACTS, ANSWER_QUESTION, ANSWER_RELATED, ANSWER_SEGMENTS, ANSWER_SOURCES, ANSWER_STEPS, ANSWER_TAIL, ANSWER_THINKING } from "./fixtures/answer";
import { AGENT_LAB_STATES } from "./fixtures/agent";
import { planFor } from "@/lib/agentBuilder";
import { doneFixtures } from "./fixtures/done";
import { FILES_LAB_STATES } from "./fixtures/files";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ThinkingBlock } from "@/components/chat/ThinkingBlock";
import { ApprovalCard } from "@/components/chat/ApprovalCard";

const noop = () => {};

function HomePreview() {
  const composer = {
    ...homeLabComposer("default"),
    onChange: noop, onSubmit: noop, onListen: noop, onStopListen: noop,
    onThinkingChange: noop, onPrivateChange: noop, onToggleTool: noop,
    sourceRows: LAB_HOME_SOURCES, onAddAttachment: noop, onRemoveAttachment: noop,
  };
  return <><AppHeader mode="chat" userInitial="R" /><HomeScreen rows={homeLabRows("default")} composer={composer} onHandoff={noop} /></>;
}

function AnswerPreview() {
  return <><AppHeader mode="chat" userInitial="R" /><AnswerScreen state="done" question={ANSWER_QUESTION} sources={ANSWER_SOURCES} segments={ANSWER_SEGMENTS} tail={ANSWER_TAIL} chart={{title:"Payback by system size",data:ANSWER_CHART,highlight:3}} facts={ANSWER_FACTS} related={ANSWER_RELATED} summary="Searched 14 sources · 6 s" extra={<ThinkingBlock thinking={ANSWER_THINKING} />} animate={false} /></>;
}

function AgentPreview() {
  const s = AGENT_LAB_STATES[0];
  return <><AppHeader mode="agent" userInitial="R" /><AgentScreen agent={s.agent} plan={planFor(s.agent.out, s.agent.depth)} status={s.status} notice={s.notice} redrawing={s.redrawing} onSelectOutput={noop} onBrief={noop} onSelectDepth={noop} onToggleSource={noop} onNotify={noop} onStart={noop} /></>;
}

function DonePreview() {
  const f = doneFixtures["finished-report"];
  return <><AppHeader mode="title" title="Done" userInitial="R" /><ResultCard {...f} onDownload={noop} onOpenDocuments={noop} onShare={noop} onFollowUp={noop} /></>;
}

function FilesPreview() {
  const cfg = FILES_LAB_STATES["populated"];
  const [files,setFiles] = React.useState<FileItem[]>(cfg.files);
  return <><AppHeader mode="title" title="Files" userInitial="R" /><FilesView files={files} searchQuery="" onSearchChange={noop} activeFilter="all" onFilterChange={noop} storageUsedBytes={cfg.storageUsedBytes} storageCapBytes={cfg.storageCapBytes} isUploading={false} uploadingFileName={undefined} uploadProgress={0} onUpload={noop} onPreviewFile={noop} onOpenFileInChat={noop} onDownloadFile={noop} onRenameFile={noop} onMoveFile={noop} onTrashFile={f=>setFiles(prev=>prev.filter(x=>x.id!==f.id))} onAskSutaeru={noop} /></>;
}

export default function PolishPreview() {
  const [location] = useLocation();
  const path = location.split("?")[0];
  if (path.endsWith("/answer")) return <AnswerPreview />;
  if (path.endsWith("/agent")) return <AgentPreview />;
  if (path.endsWith("/done")) return <DonePreview />;
  if (path.endsWith("/files")) return <FilesPreview />;
  return <HomePreview />;
}
