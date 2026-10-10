import * as React from "react";
import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { LabLayout } from "./LabLayout";
import { FilesScreen } from "@/components/files/FilesScreen";
import type { FileFilterId, FileItem, FileSort } from "@/components/files/fileModel";
import { FILES_LAB_STATES } from "./fixtures/files";
import { toast } from "sonner";

export default function LabFiles() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);

  const rawState = params.get("state") || "populated";
  const stateKey = rawState in FILES_LAB_STATES ? rawState : "populated";
  const currentConfig = FILES_LAB_STATES[stateKey];

  const widthParam = params.get("w") || "full";

  const [files, setFiles] = useState<FileItem[]>(currentConfig.files);
  const [query, setQuery] = useState(currentConfig.query);
  const [filter, setFilter] = useState<FileFilterId>(currentConfig.filter);
  const [sort, setSort] = useState<FileSort>(currentConfig.sort);
  const [view, setView] = useState<"active" | "trashed">(currentConfig.view);
  const [isUploading, setIsUploading] = useState<boolean>(Boolean(currentConfig.isUploading));

  useEffect(() => {
    const next = FILES_LAB_STATES[stateKey];
    setFiles(next.files);
    setQuery(next.query);
    setFilter(next.filter);
    setSort(next.sort);
    setView(next.view);
    setIsUploading(Boolean(next.isUploading));
  }, [stateKey]);

  const updateStateParam = (newKey: string) => {
    const nextParams = new URLSearchParams(search);
    nextParams.set("state", newKey);
    setLocation(`/__lab/files?${nextParams.toString()}`);
  };

  const updateWidthParam = (newWidth: string) => {
    const nextParams = new URLSearchParams(search);
    if (newWidth === "full") nextParams.delete("w");
    else nextParams.set("w", newWidth);
    setLocation(`/__lab/files?${nextParams.toString()}`);
  };

  const frameWidthStyle =
    widthParam === "360"
      ? { maxWidth: 360, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden" }
      : widthParam === "390"
      ? { maxWidth: 390, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden" }
      : widthParam === "430"
      ? { maxWidth: 430, margin: "0 auto", border: "1px solid var(--stroke)", borderRadius: 28, overflow: "hidden" }
      : widthParam === "1280"
      ? { maxWidth: 1280, margin: "0 auto" }
      : { width: "100%" };

  return (
    <LabLayout title="Files Screen">
      {/* State & Width Pickers */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          padding: 16,
          background: "var(--card)",
          borderRadius: 16,
          border: "1px solid var(--stroke)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, marginRight: 4 }}>
            State:
          </span>
          {Object.entries(FILES_LAB_STATES).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              className={`pill ${stateKey === key ? "on" : ""}`}
              style={{ fontSize: 12, minHeight: 30, padding: "0 10px" }}
              aria-pressed={stateKey === key}
              onClick={() => updateStateParam(key)}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, marginRight: 4 }}>
            Width:
          </span>
          {(["full", "1280", "430", "390", "360"] as const).map((w) => (
            <button
              key={w}
              type="button"
              className={`pill ${widthParam === w ? "on" : ""}`}
              style={{ fontSize: 12, minHeight: 30, padding: "0 10px" }}
              aria-pressed={widthParam === w}
              onClick={() => updateWidthParam(w)}
            >
              {w === "full" ? "Full" : `${w}px`}
            </button>
          ))}
        </div>
      </div>

      {/* Frame Container */}
      <div style={frameWidthStyle}>
        <FilesScreen
          files={files}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          storageUsedBytes={currentConfig.storageUsedBytes}
          storageCapBytes={currentConfig.storageCapBytes}
          isUploading={isUploading}
          uploadingFileName={currentConfig.uploadingFileName}
          uploadProgress={currentConfig.uploadProgress}
          onUpload={() => {
            setIsUploading(true);
            toast("Choose files to upload");
            setTimeout(() => setIsUploading(false), 3000);
          }}
          onOpenFile={(f) => toast(`Preview: ${f.name}`)}
          onOpenFileInChat={(f) => toast(`Open in chat: ${f.name}`)}
          onDownloadFile={(f) => toast(`Downloading ${f.name}`)}
          onRenameFile={(f) => toast(`Rename: ${f.name}`)}
          onMoveFile={(f) => toast(`Move to Space: ${f.name}`)}
          onOpenAsBrief={(f) => toast(`Brief: ${f.name}`)}
          onPreviewFile={(f) => toast(`Preview: ${f.name}`)}
          onTrashFile={(f) => {
            toast(`Moved to trash: ${f.name}`);
            setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, trashed: true } : x)));
          }}
          onRestoreFile={(f) => {
            toast(`Restored: ${f.name}`);
            setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, trashed: false } : x)));
          }}
          onDeleteFile={(f) => {
            toast(`Deleted for good: ${f.name}`);
            setFiles((prev) => prev.filter((x) => x.id !== f.id));
          }}
          onAskSutaeru={() => toast("Ask Sutaeru to make one")}
        />
      </div>
    </LabLayout>
  );
}
