import { useState } from "react";
import { Download, ChevronLeft, ChevronRight, Copy, ImageOff, Images, Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { NEON } from "@/lib/design";

export interface GeneratedImage {
  index: number;
  prompt: string;
  url?: string;
  fileId?: number;
  mimeType?: string;
  error?: string;
}

interface GeneratedImageGalleryProps {
  images: GeneratedImage[];
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Renders the result of a generate_image batch call as an interactive
 * gallery instead of the raw JSON dump every tool result gets by default
 * (see ai-elements/tool.tsx) — a grid the user can open, page through,
 * download one-by-one or all at once, straight from the chat message that
 * produced them.
 */
export function GeneratedImageGallery({ images }: GeneratedImageGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  if (!images || images.length === 0) return null;

  const succeeded = images.filter((img) => img.url);
  const failed = images.filter((img) => !img.url);
  const active = openIndex !== null ? images[openIndex] : null;

  const goTo = (delta: number) => {
    if (openIndex === null) return;
    let next = openIndex + delta;
    if (next < 0) next = images.length - 1;
    if (next >= images.length) next = 0;
    setOpenIndex(next);
    setCopiedPrompt(false);
  };

  const downloadAll = () => {
    succeeded.forEach((img, i) => {
      if (!img.url) return;
      window.setTimeout(() => triggerDownload(img.url!, `sutaeru-image-${i + 1}.${(img.mimeType?.split("/")[1] ?? "png")}`), i * 250);
    });
    toast.success(`Downloading ${succeeded.length} image${succeeded.length === 1 ? "" : "s"}…`);
  };

  return (
    <div className="sutaeru-image-gallery" role="group" aria-label={`${succeeded.length} generated images`}>
      <div className="sutaeru-image-gallery-toolbar">
        <span className="sutaeru-image-gallery-count">
          <Images size={13} aria-hidden="true" />
          {succeeded.length} image{succeeded.length === 1 ? "" : "s"}
          {failed.length > 0 ? ` · ${failed.length} failed` : ""}
        </span>
        {succeeded.length > 1 && (
          <button type="button" className="sutaeru-image-gallery-download-all" onClick={downloadAll}>
            <Download size={13} aria-hidden="true" /> Download all
          </button>
        )}
      </div>

      <div className="sutaeru-image-gallery-grid">
        {images.map((img, i) => (
          <button
            key={`${img.index}-${i}`}
            type="button"
            className="sutaeru-image-gallery-tile"
            disabled={!img.url}
            aria-label={img.url ? `Open image ${i + 1}: ${img.prompt}` : `Image ${i + 1} failed: ${img.error ?? "unknown error"}`}
            onClick={() => img.url && setOpenIndex(i)}
          >
            {img.url ? (
              <>
                <img src={img.url} alt={img.prompt} loading="lazy" />
                <span className="sutaeru-image-gallery-tile-overlay">
                  <span
                    role="button"
                    tabIndex={0}
                    className="sutaeru-image-gallery-tile-download"
                    aria-label={`Download image ${i + 1}`}
                    onClick={(e) => { e.stopPropagation(); triggerDownload(img.url!, `sutaeru-image-${i + 1}.${(img.mimeType?.split("/")[1] ?? "png")}`); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); triggerDownload(img.url!, `sutaeru-image-${i + 1}.${(img.mimeType?.split("/")[1] ?? "png")}`); } }}
                  >
                    <Download size={14} aria-hidden="true" />
                  </span>
                </span>
              </>
            ) : (
              <span className="sutaeru-image-gallery-tile-error" title={img.error}>
                <ImageOff size={18} aria-hidden="true" />
                <span>Failed</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <Dialog open={openIndex !== null} onOpenChange={(open) => { if (!open) setOpenIndex(null); }}>
        <DialogContent className="sutaeru-image-lightbox" showCloseButton>
          {active && (
            <>
              <DialogTitle className="sr-only">Generated image {openIndex! + 1} of {images.length}</DialogTitle>
              <DialogDescription className="sr-only">{active.prompt}</DialogDescription>
              <div className="sutaeru-image-lightbox-stage">
                {images.length > 1 && (
                  <button type="button" className="sutaeru-image-lightbox-nav sutaeru-image-lightbox-prev" aria-label="Previous image" onClick={() => goTo(-1)}>
                    <ChevronLeft size={20} aria-hidden="true" />
                  </button>
                )}
                {active.url ? (
                  <img src={active.url} alt={active.prompt} />
                ) : (
                  <div className="sutaeru-image-gallery-tile-error"><ImageOff size={24} aria-hidden="true" /><span>{active.error ?? "This image failed to render."}</span></div>
                )}
                {images.length > 1 && (
                  <button type="button" className="sutaeru-image-lightbox-nav sutaeru-image-lightbox-next" aria-label="Next image" onClick={() => goTo(1)}>
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="sutaeru-image-lightbox-meta">
                <span className="sutaeru-image-lightbox-index">{openIndex! + 1} / {images.length}</span>
                <p className="sutaeru-image-lightbox-prompt">{active.prompt}</p>
                <div className="sutaeru-image-lightbox-actions">
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard.writeText(active.prompt).then(() => { setCopiedPrompt(true); window.setTimeout(() => setCopiedPrompt(false), 1200); }); }}
                  >
                    {copiedPrompt ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />} {copiedPrompt ? "Copied" : "Copy prompt"}
                  </button>
                  {active.url && (
                    <button type="button" onClick={() => triggerDownload(active.url!, `sutaeru-image-${openIndex! + 1}.${(active.mimeType?.split("/")[1] ?? "png")}`)}>
                      <Download size={13} aria-hidden="true" /> Download
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        .sutaeru-image-gallery { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .sutaeru-image-gallery-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .sutaeru-image-gallery-count { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: ${NEON.muted}; }
        .sutaeru-image-gallery-download-all { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 600; padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.1); background: #fff; color: ${NEON.ink}; cursor: pointer; transition: transform .15s ease, border-color .15s ease; }
        .sutaeru-image-gallery-download-all:hover { transform: translateY(-1px); border-color: ${NEON.orange}; color: ${NEON.orange}; }
        .sutaeru-image-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; max-width: 560px; }
        .sutaeru-image-gallery-tile { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; border: 1px solid rgba(0,0,0,0.08); background: rgba(0,0,0,0.03); padding: 0; cursor: pointer; transition: transform .18s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow .18s ease; animation: sutaeruImgIn .35s ease backwards; }
        .sutaeru-image-gallery-tile:nth-child(1) { animation-delay: 0ms; } .sutaeru-image-gallery-tile:nth-child(2) { animation-delay: 30ms; } .sutaeru-image-gallery-tile:nth-child(3) { animation-delay: 60ms; } .sutaeru-image-gallery-tile:nth-child(4) { animation-delay: 90ms; } .sutaeru-image-gallery-tile:nth-child(5) { animation-delay: 120ms; }
        .sutaeru-image-gallery-tile:not(:disabled):hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 8px 24px rgba(0,0,0,0.14); z-index: 1; }
        .sutaeru-image-gallery-tile:disabled { cursor: default; }
        .sutaeru-image-gallery-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .sutaeru-image-gallery-tile-overlay { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: flex-end; padding: 6px; background: linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.45) 100%); opacity: 0; transition: opacity .15s ease; }
        .sutaeru-image-gallery-tile:hover .sutaeru-image-gallery-tile-overlay { opacity: 1; }
        .sutaeru-image-gallery-tile-download { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 999px; background: rgba(255,255,255,0.92); color: ${NEON.ink}; cursor: pointer; }
        .sutaeru-image-gallery-tile-download:hover { background: #fff; }
        .sutaeru-image-gallery-tile-error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #b3402a; background: rgba(179,64,42,0.06); font-size: 0.62rem; font-weight: 600; text-align: center; padding: 6px; }
        @keyframes sutaeruImgIn { from { opacity: 0; transform: translateY(6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .sutaeru-image-lightbox { max-width: min(90vw, 640px) !important; padding: 16px !important; background: #17140f !important; border: none !important; }
        .sutaeru-image-lightbox-stage { position: relative; display: flex; align-items: center; justify-content: center; min-height: 200px; }
        .sutaeru-image-lightbox-stage img { max-width: 100%; max-height: 60vh; border-radius: 8px; display: block; }
        .sutaeru-image-lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 999px; background: rgba(255,255,255,0.12); color: #fff; cursor: pointer; }
        .sutaeru-image-lightbox-nav:hover { background: rgba(255,255,255,0.22); }
        .sutaeru-image-lightbox-prev { left: -6px; } .sutaeru-image-lightbox-next { right: -6px; }
        .sutaeru-image-lightbox-meta { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .sutaeru-image-lightbox-index { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .sutaeru-image-lightbox-prompt { font-size: 0.82rem; line-height: 1.4; color: rgba(255,255,255,0.85); margin: 0; }
        .sutaeru-image-lightbox-actions { display: flex; gap: 8px; }
        .sutaeru-image-lightbox-actions button { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 600; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); color: #fff; cursor: pointer; }
        .sutaeru-image-lightbox-actions button:hover { background: rgba(255,255,255,0.14); }
      `}</style>
    </div>
  );
}
