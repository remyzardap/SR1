import { useRef } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { X, Maximize2, Minimize2, ChevronLeft, ChevronRight, GripHorizontal } from "lucide-react";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";

export function FloatingVideoPlayer() {
  const { currentVideo, playerState, closePlayer, toPip, toFullscreen, nextVideo, prevVideo } = useVideoPlayer();
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  if (playerState === "hidden" || !currentVideo) return null;

  const isPip = playerState === "pip";

  return (
    <>
      <AnimatePresence>
        {!isPip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[998]"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
            onClick={toPip}
          />
        )}
      </AnimatePresence>

      {isPip && (
        <div ref={constraintsRef} className="fixed inset-0 z-[998] pointer-events-none" />
      )}

      <AnimatePresence mode="wait">
        {isPip ? (
          <motion.div
            key="pip"
            drag
            dragControls={dragControls}
            dragMomentum={false}
            dragConstraints={constraintsRef}
            initial={{ opacity: 0, scale: 0.8, x: 0, y: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-[999] rounded-2xl overflow-hidden"
            style={{
              width: 320,
              background: "#000",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)",
            }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing"
              style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripHorizontal className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(242,242,242,0.25)" }} />
                <span className="text-[11px] truncate" style={{ color: "rgba(242,242,242,0.5)" }}>{currentVideo.title}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={toFullscreen}
                  className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                  style={{ color: "rgba(242,242,242,0.4)" }}
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
                <button
                  onClick={closePlayer}
                  className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                  style={{ color: "rgba(242,242,242,0.4)" }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="relative" style={{ aspectRatio: "16/9" }}>
              <iframe
                key={currentVideo.videoId}
                src={`https://www.youtube.com/embed/${currentVideo.videoId}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1`}
                className="absolute inset-0 w-full h-full"
                style={{ border: "none" }}
                allow="autoplay; encrypted-media; picture-in-picture"
              />
            </div>

            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ background: "rgba(5,5,5,0.9)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-[10px]" style={{ color: "rgba(242,242,242,0.3)" }}>{currentVideo.channel}</span>
              <div className="flex items-center gap-1">
                <button onClick={prevVideo} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: "rgba(242,242,242,0.4)" }}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={nextVideo} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: "rgba(242,242,242,0.4)" }}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="fullscreen"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed z-[999] rounded-2xl overflow-hidden"
            style={{
              top: "5%",
              left: "5%",
              width: "90%",
              height: "90%",
              background: "#000",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.9)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="flex-none flex items-center justify-between px-5 py-3"
              style={{ background: "rgba(5,5,5,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium truncate" style={{ color: "#f2f2f2" }}>{currentVideo.title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(242,242,242,0.4)" }}>{currentVideo.channel} · {currentVideo.views} views</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button onClick={prevVideo} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: "rgba(242,242,242,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={nextVideo} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: "rgba(242,242,242,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={toPip} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: "rgba(242,242,242,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button onClick={closePlayer} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: "rgba(242,242,242,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative">
              <iframe
                key={currentVideo.videoId + "-fs"}
                src={`https://www.youtube.com/embed/${currentVideo.videoId}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1`}
                className="absolute inset-0 w-full h-full"
                style={{ border: "none" }}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
