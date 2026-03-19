import { useState } from "react";
import { Star, MessageSquare } from "lucide-react";
import { trpc } from "../lib/trpc";

interface SkillReviewProps {
  skillId: string;
  currentUserId?: string;
}

export function SkillReview({ skillId, currentUserId }: SkillReviewProps) {
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);

  const {
    data: reviews,
    isLoading,
    refetch,
  } = trpc.skills.getReviews.useQuery({ skillId });

  const submitReviewMutation = trpc.skills.submitReview.useMutation({
    onSuccess: () => {
      setReviewText("");
      setReviewRating(0);
      refetch();
    },
  });

  async function handleSubmitReview() {
    if (!currentUserId || !reviewText.trim() || reviewRating === 0) return;
    await submitReviewMutation.mutateAsync({
      skillId,
      userId: currentUserId,
      rating: reviewRating,
      comment: reviewText.trim(),
    });
  }

  return (
    <div className="space-y-5">
      {currentUserId && (
        <div
          className="p-4 rounded-xl space-y-3"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Write a Review
          </h3>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setReviewRating(star)}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={18}
                  className={
                    star <= (hoveredStar || reviewRating)
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-white/30"
                  }
                />
              </button>
            ))}
          </div>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share your experience with this skill..."
            rows={3}
            className="w-full bg-black/20 text-white/80 placeholder-white/30 text-sm p-3 rounded-lg resize-none outline-none focus:ring-1 focus:ring-white/20"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <button
            onClick={handleSubmitReview}
            disabled={
              !reviewText.trim() ||
              reviewRating === 0 ||
              submitReviewMutation.isPending
            }
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all"
            style={{
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.7), rgba(168,85,247,0.7))",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {submitReviewMutation.isPending ? "Submitting..." : "Submit Review"}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-white/40 py-8 text-sm">
          Loading reviews...
        </div>
      ) : !reviews || reviews.length === 0 ? (
        <div className="text-center text-white/40 py-8 text-sm flex flex-col items-center gap-2">
          <MessageSquare size={24} className="opacity-40" />
          No reviews yet. Be the first to review this skill!
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review: any) => (
            <div
              key={review.id}
              className="p-4 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white/80">
                  {review.authorName}
                </span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={13}
                      className={
                        s <= review.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-white/20"
                      }
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-white/60 leading-relaxed">
                {review.comment}
              </p>
              <span className="text-xs text-white/30 mt-2 block">
                {new Date(review.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
