import React, { useState, useRef, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Youtube, MessageSquare, Maximize2, Minimize2,
  BookmarkPlus, X, TrendingUp, Sparkles, Rss,
  ChevronUp, ChevronDown, ExternalLink,
} from 'lucide-react';

// ─── Mock data ────────────────────────────────────────────────────────────────
interface VideoItem {
  id: string;
  title: string;
  channel: string;
  views: string;
  ago: string;
  playlistId: string;
  tag: string;
}

interface PostItem {
  id: string;
  sub: string;
  title: string;
  ups: string;
  comments: string;
  time: string;
  tag: string;
}

const VIDEOS: VideoItem[] = [
  { id: 'v1', title: 'Indonesian Renewable Energy: Solar Revolution 2025', channel: 'Bloomberg Asia', views: '2.4M', ago: '3d ago', playlistId: 'PLfGibfZpCMzHR8KiMeP-XxSPWdJCVMtVy', tag: 'Energy' },
  { id: 'v2', title: 'How AI is Transforming Southeast Asian Startups', channel: 'TechCrunch', views: '891K', ago: '1w ago', playlistId: 'PLbpi6ZahtOH6Ar_3GPy3workX-X', tag: 'AI' },
  { id: 'v3', title: 'Building a Super App: WeChat vs Everything', channel: 'a16z', views: '1.2M', ago: '2w ago', playlistId: 'PLM3XGnGYhGMR2', tag: 'Product' },
  { id: 'v4', title: 'DFI Infrastructure Investment: Norfund & BII Deep Dive', channel: 'CFI Education', views: '334K', ago: '5d ago', playlistId: 'PLJ5RN8EQ', tag: 'Finance' },
];

const POSTS: PostItem[] = [
  { id: 'p1', sub: 'r/investing',            title: 'DFI capital flows into Southeast Asian infrastructure 2025 — tracking Norfund, BII, ADB deals', ups: '2.1k', comments: '847', time: '4h', tag: 'Finance' },
  { id: 'p2', sub: 'r/Entrepreneur',          title: 'Built a full-stack AI platform in 4 days with zero coding experience — AMA', ups: '18.4k', comments: '2.3k', time: '6h', tag: 'AI' },
  { id: 'p3', sub: 'r/artificialintelligence',title: 'Perplexity Sonar Pro vs GPT-4 web search — comprehensive comparison', ups: '4.7k', comments: '912', time: '2h', tag: 'AI' },
  { id: 'p4', sub: 'r/indonesia',             title: 'PLN opens 2GW solar tender — C&I developers rush to qualify', ups: '891', comments: '234', time: '8h', tag: 'Energy' },
  { id: 'p5', sub: 'r/startups',              title: 'How we raised $110M Series B for our solar IPP in Indonesia', ups: '6.2k', comments: '1.1k', time: '1d', tag: 'Finance' },
  { id: 'p6', sub: 'r/MachineLearning',       title: 'Multi-model routing in production: lessons from 10M+ queries', ups: '3.8k', comments: '445', time: '5h', tag: 'AI' },
];

const S1_TIPS: Record<string, string[]> = {
  youtube: [
    'This video is relevant to your TGWI research on Indonesian C&I solar funding.',
    "Bloomberg's coverage matches the Xurya $110M deal you researched. Save to memory?",
    '3 videos about renewable energy today — want S1 to generate a summary brief?',
  ],
  reddit: [
    'r/investing has a thread about DFI infrastructure deals in Southeast Asia.',
    'This post overlaps with your TGWI investor memo context. Add to research?',
    'Trending: Indonesian startup ecosystem. Relevant to your work.',
  ],
};

const TABS = [
  { id: 'foryou',   label: 'For You',  icon: Sparkles   },
  { id: 'trending', label: 'Trending', icon: TrendingUp  },
  { id: 's1picks',  label: 'S1 Picks', icon: Rss         },
];

const TAG_COLORS: Record<string, string> = {
  Energy:  '#2dd4bf',
  AI:      '#a78bfa',
  Finance: '#f59e0b',
  Product: '#f97316',
};

// ─── S1 insight panel ─────────────────────────────────────────────────────────
function S1Panel({ message, onDismiss, onSave }: { message: string; onDismiss: () => void; onSave: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl p-4"
      style={{
        background: 'rgba(242,242,242,0.04)',
        border: '1px solid rgba(242,242,242,0.09)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            style={{ background: '#f2f2f2' }}
          />
          <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(242,242,242,0.4)', fontFamily: "'Syne', sans-serif" }}>
            S1 Insight
          </span>
        </div>
        <button onClick={onDismiss} style={{ color: 'rgba(242,242,242,0.25)' }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'rgba(242,242,242,0.65)' }}>
        {message}
      </p>
      <button
        onClick={onSave}
        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full transition-all"
        style={{
          background: 'rgba(242,242,242,0.06)',
          border: '1px solid rgba(242,242,242,0.10)',
          color: 'rgba(242,242,242,0.5)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(242,242,242,0.10)';
          (e.currentTarget as HTMLButtonElement).style.color = '#f2f2f2';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(242,242,242,0.06)';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(242,242,242,0.5)';
        }}
      >
        <BookmarkPlus className="w-3 h-3" />
        Save to memory
      </button>
    </motion.div>
  );
}

// ─── Video card ───────────────────────────────────────────────────────────────
function VideoCard({ video, active, onClick }: { video: VideoItem; active: boolean; onClick: () => void }) {
  const tagColor = TAG_COLORS[video.tag] ?? '#f2f2f2';
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className="cursor-pointer rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: active ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Thumbnail placeholder */}
      <div className="relative aspect-video" style={{ background: '#0a0a0a' }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <Youtube className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.12)' }} />
        </div>
        <div className="absolute top-2 left-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${tagColor}18`, border: `1px solid ${tagColor}30`, color: tagColor, fontFamily: "'Syne', sans-serif" }}>
            {video.tag}
          </span>
        </div>
        {active && (
          <div className="absolute inset-0 border-2 rounded-2xl pointer-events-none" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />
        )}
      </div>
      <div className="p-3">
        <p className="text-[13px] font-medium leading-snug mb-1.5 line-clamp-2" style={{ color: active ? '#f2f2f2' : 'rgba(242,242,242,0.7)' }}>
          {video.title}
        </p>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(242,242,242,0.3)' }}>
          <span style={{ color: 'rgba(242,242,242,0.5)' }}>{video.channel}</span>
          <span>·</span>
          <span>{video.views} views</span>
          <span>·</span>
          <span>{video.ago}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────
function PostCard({ post, onS1Click }: { post: PostItem; onS1Click: () => void }) {
  const tagColor = TAG_COLORS[post.tag] ?? '#f2f2f2';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl p-4 transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.10)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)';
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold tracking-wide" style={{ color: 'rgba(242,242,242,0.4)' }}>
              {post.sub}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${tagColor}12`, color: tagColor, border: `1px solid ${tagColor}25` }}>
              {post.tag}
            </span>
          </div>
          <p className="text-[13px] leading-snug font-medium mb-2 line-clamp-2" style={{ color: 'rgba(242,242,242,0.75)' }}>
            {post.title}
          </p>
          <div className="flex items-center gap-3 text-[11px]" style={{ color: 'rgba(242,242,242,0.3)' }}>
            <span>↑ {post.ups}</span>
            <span>💬 {post.comments}</span>
            <span>{post.time}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onS1Click(); }}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-all"
            style={{
              background: 'rgba(242,242,242,0.05)',
              border: '1px solid rgba(242,242,242,0.09)',
              color: 'rgba(242,242,242,0.4)',
            }}
          >
            <Sparkles className="w-2.5 h-2.5" />
            S1
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Feed ────────────────────────────────────────────────────────────────
const FeedInner: React.FC = () => {
  const [activeTab, setActiveTab] = useState('foryou');
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [s1Message, setS1Message] = useState('');
  const [s1Visible, setS1Visible] = useState(false);

  // Auto-show S1 tip after a few seconds
  useEffect(() => {
    const t = setTimeout(() => {
      const msgs = S1_TIPS.youtube;
      setS1Message(msgs[Math.floor(Math.random() * msgs.length)]);
      setS1Visible(true);
    }, 3500);
    return () => clearTimeout(t);
  }, []);

  const activeVideo = VIDEOS[activeVideoIdx];

  const triggerS1Reddit = () => {
    const msgs = S1_TIPS.reddit;
    setS1Message(msgs[Math.floor(Math.random() * msgs.length)]);
    setS1Visible(true);
  };

  const prevVideo = () => setActiveVideoIdx((i) => (i - 1 + VIDEOS.length) % VIDEOS.length);
  const nextVideo = () => setActiveVideoIdx((i) => (i + 1) % VIDEOS.length);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>

      {/* ── Top nav ── */}
      <div
        className="flex-none flex items-center justify-between px-4 sm:px-5 py-3"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)',
          background: 'rgba(5,5,5,0.85)',
        }}
      >
        <h1 className="text-sm font-semibold" style={{ color: '#f2f2f2', fontFamily: "'Syne', sans-serif" }}>
          Hub
        </h1>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-200"
              style={
                activeTab === id
                  ? { background: 'rgba(255,255,255,0.10)', color: '#f2f2f2', fontFamily: "'Syne', sans-serif" }
                  : { color: 'rgba(242,242,242,0.35)', fontFamily: "'Syne', sans-serif" }
              }
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="w-16" /> {/* spacer */}
      </div>

      {/* ── Body: two-column layout ── */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-0">

        {/* LEFT — Video player + playlist */}
        <div className={`flex flex-col transition-all duration-300 ${expanded ? 'lg:flex-1' : 'lg:w-[55%]'}`}
          style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Player */}
          <div className="relative" style={{ background: '#000' }}>
            <div className="relative aspect-video">
              <iframe
                key={activeVideo.playlistId}
                src={`https://www.youtube.com/embed/videoseries?list=${activeVideo.playlistId}&autoplay=1&mute=1&controls=1&rel=0&modestbranding=1`}
                className="absolute inset-0 w-full h-full"
                style={{ border: 'none' }}
                allow="autoplay; encrypted-media; picture-in-picture"
              />
            </div>

            {/* Overlay controls */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              <button
                onClick={() => setExpanded((e) => !e)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
              >
                {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Video nav arrows */}
            <div className="absolute top-1/2 -translate-y-1/2 left-3 z-10">
              <button onClick={prevVideo} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' }}>
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-12 z-10">
              <button onClick={nextVideo} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)' }}>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Now playing strip */}
            <div className="px-4 py-3" style={{ background: 'rgba(5,5,5,0.9)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: '#f2f2f2' }}>{activeVideo.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(242,242,242,0.4)' }}>
                    {activeVideo.channel} · {activeVideo.views} views · {activeVideo.ago}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: `${TAG_COLORS[activeVideo.tag] ?? '#f2f2f2'}15`, color: TAG_COLORS[activeVideo.tag] ?? '#f2f2f2', border: `1px solid ${TAG_COLORS[activeVideo.tag] ?? '#f2f2f2'}28` }}>
                  {activeVideo.tag}
                </span>
              </div>
            </div>
          </div>

          {/* Playlist */}
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2.5 content-start">
            {VIDEOS.map((v, i) => (
              <VideoCard key={v.id} video={v} active={i === activeVideoIdx} onClick={() => setActiveVideoIdx(i)} />
            ))}
          </div>
        </div>

        {/* RIGHT — Reddit feed + S1 panel */}
        {!expanded && (
          <div className="flex flex-col lg:flex-1 overflow-hidden">
            {/* S1 panel */}
            <div className="flex-none p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <AnimatePresence>
                {s1Visible && (
                  <S1Panel
                    message={s1Message}
                    onDismiss={() => setS1Visible(false)}
                    onSave={() => setS1Visible(false)}
                  />
                )}
              </AnimatePresence>
              {!s1Visible && (
                <button
                  onClick={() => { setS1Message(S1_TIPS.youtube[0]); setS1Visible(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(242,242,242,0.35)',
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Ask Kemma about this content…
                </button>
              )}
            </div>

            {/* Reddit posts */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <div className="w-2 h-2 rounded-full" style={{ background: '#ff4500', boxShadow: '0 0 6px rgba(255,69,0,0.5)' }} />
                <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(242,242,242,0.3)', fontFamily: "'Syne', sans-serif" }}>
                  Reddit
                </span>
              </div>
              {POSTS.map((post) => (
                <PostCard key={post.id} post={post} onS1Click={() => triggerS1Reddit()} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Feed() {
  return (
    <DashboardLayout noPadding>
      <FeedInner />
    </DashboardLayout>
  );
}
