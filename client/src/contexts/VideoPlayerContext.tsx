import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface VideoItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  views: string;
  tag: string;
}

type PlayerState = "hidden" | "pip" | "fullscreen";

interface VideoPlayerContextValue {
  currentVideo: VideoItem | null;
  playerState: PlayerState;
  playlist: VideoItem[];
  playVideo: (video: VideoItem, playlist?: VideoItem[]) => void;
  closePlayer: () => void;
  toPip: () => void;
  toFullscreen: () => void;
  nextVideo: () => void;
  prevVideo: () => void;
}

const VideoPlayerContext = createContext<VideoPlayerContextValue | null>(null);

export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>("hidden");
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);

  const playVideo = useCallback((video: VideoItem, list: VideoItem[] = []) => {
    setCurrentVideo(video);
    setPlaylist(list);
    setPlayerState("pip");
  }, []);

  const closePlayer = useCallback(() => {
    setPlayerState("hidden");
    setCurrentVideo(null);
  }, []);

  const toPip = useCallback(() => setPlayerState("pip"), []);
  const toFullscreen = useCallback(() => setPlayerState("fullscreen"), []);

  const nextVideo = useCallback(() => {
    if (!currentVideo || !playlist.length) return;
    const idx = playlist.findIndex((v) => v.videoId === currentVideo.videoId);
    const next = playlist[(idx + 1) % playlist.length];
    if (next) setCurrentVideo(next);
  }, [currentVideo, playlist]);

  const prevVideo = useCallback(() => {
    if (!currentVideo || !playlist.length) return;
    const idx = playlist.findIndex((v) => v.videoId === currentVideo.videoId);
    const prev = playlist[(idx - 1 + playlist.length) % playlist.length];
    if (prev) setCurrentVideo(prev);
  }, [currentVideo, playlist]);

  return (
    <VideoPlayerContext.Provider value={{ currentVideo, playerState, playlist, playVideo, closePlayer, toPip, toFullscreen, nextVideo, prevVideo }}>
      {children}
    </VideoPlayerContext.Provider>
  );
}

export function useVideoPlayer() {
  const ctx = useContext(VideoPlayerContext);
  if (!ctx) throw new Error("useVideoPlayer must be used within VideoPlayerProvider");
  return ctx;
}
