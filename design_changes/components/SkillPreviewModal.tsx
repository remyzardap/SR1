import { useState } from "react";
import { X, Star, GitFork, Tag, Zap, User } from "lucide-react";
import { SkillDetails } from "./SkillDetails";
import { SkillReview } from "./SkillReview";
import { trpc } from "../lib/trpc";

export interface Skill {
  id: string;
  name: string;
  description: string;
  author: string;
  authorId: string;
  tags: string[];
  averageRating: number;
  ratingCount: number;
  forkCount: number;
  dependencies: string[];
  requirements: string[];
  sampleInput?: string;
  sampleOutput?: string;
  createdAt: number;
  updatedAt: number;
}

interface SkillPreviewModalProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
  onTrySkill: (skill: Skill) => void;
  currentUserId?: string;
}

type Tab = "details" | "reviews";

export function SkillPreviewModal({
  skill,
  isOpen,
  onClose,
  onTrySkill,
  currentUserId,
}: SkillPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [userRating, setUserRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);

  const rateSkillMutation = trpc.skills.rateSkill.useMutation();

  if (!isOpen || !skill) return null;

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleTrySkill() {
    onTrySkill(skill!);
    onClose();
  }

  async function handleRatingSubmit(rating: number) {
    if (!currentUserId || !skill) return;
    setUserRating(rating);
    await rateSkillMutation.mutateAsync({
      skillId: skill.id,
      userId: currentUserId,
      rating,
    });
  }

  const displayRating = hoveredStar || userRating;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow:
            "0 32px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white truncate">
              {skill.name}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-sm text-white/60">
                <User size={12} />
                {skill.author}
              </span>
              <span className="flex items-center gap-1 text-sm text-white/60">
                <Star size={12} className="fill-yellow-400 text-yellow-400" />
                {skill.averageRating.toFixed(1)} ({skill.ratingCount})
              </span>
              <span className="flex items-center gap-1 text-sm text-white/60">
                <GitFork size={12} />
                {skill.forkCount}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tags */}
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 px-6 pt-4">
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white/70"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          {(["details", "reviews"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === "details" && <SkillDetails skill={skill} />}
          {activeTab === "reviews" && (
            <SkillReview skillId={skill.id} currentUserId={currentUserId} />
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10">
          {currentUserId && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-white/60">Your rating:</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleRatingSubmit(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    disabled={rateSkillMutation.isPending}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      size={20}
                      className={
                        star <= displayRating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-white/30"
                      }
                    />
                  </button>
                ))}
              </div>
              {rateSkillMutation.isSuccess && (
                <span className="text-xs text-green-400">Saved!</span>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleTrySkill}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-white transition-all"
              style={{
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.8), rgba(168,85,247,0.8))",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <Zap size={16} />
              Try Skill
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-medium text-white/70 hover:text-white transition-colors"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
