"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ReviewResponse = {
  ok: boolean;
  item?: {
    id: string;
    status: LessonNoteStatus;
    headteacherComment: string | null;
    headteacherUserId: string | null;
    reviewedAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    updatedAt: string;
  };
  error?: string;
};

interface HeadteacherReviewPanelProps {
  noteId: string;
  tenantId: string;
  initialComment: string;
  currentStatus: string;
}

export default function HeadteacherReviewPanel({
  noteId,
  tenantId,
  initialComment,
  currentStatus,
}: HeadteacherReviewPanelProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Only render when opened from HEADTEACHER portal
  // e.g. /teacher/lesson-notes/[id]/print?tenantId=...&headteacherUserId=...&reviewMode=headteacher
  const mode = searchParams.get("reviewMode");
  const headteacherUserId = searchParams.get("headteacherUserId");

  const [comment, setComment] = useState(initialComment);
  const [status, setStatus] = useState<LessonNoteStatus | string>(
    currentStatus
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setComment(initialComment);
  }, [initialComment]);

  if (mode !== "headteacher") {
    // Teacher view / normal print view → hide panel
    return null;
  }

  const isApproved = status === "APPROVED";

  async function handleReview(action: "APPROVE" | "REJECT") {
    if (!headteacherUserId) {
      setError(
        "Headteacher ID is missing in the URL. Please open this page from the headteacher portal."
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/headteacher/lesson-notes/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          headteacherUserId,
          lessonNoteId: noteId,
          action,
          comment,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as ReviewResponse;

      if (!res.ok || !data.ok || !data.item) {
        setError(
          data.error ??
            "Could not update this lesson note. Please try again."
        );
        return;
      }

      setStatus(data.item.status);
      setSuccess(
        action === "APPROVE"
          ? "Lesson note approved and signed."
          : "Lesson note returned to the teacher with your comment."
      );

      // Pull fresh data from the server so the PDF part
      // shows the signature and approval date immediately.
      router.refresh();
    } catch (err) {
      console.error("HEADTEACHER_REVIEW_PANEL_ERROR", err);
      setError(
        "Network or server error while updating this lesson note."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-4 print:hidden">
      <div className="border border-zinc-200 bg-zinc-50 rounded-2xl px-3 py-3 text-[11px] md:text-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-zinc-800">
            Headteacher review panel
          </div>
          <div className="text-[10px] text-zinc-500">
            Approving here will stamp your signature &amp; date on the
            learner note sheet.
          </div>
        </div>

        {error && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-xl px-2 py-1 text-[11px]">
            {error}
          </div>
        )}
        {success && (
          <div className="border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-xl px-2 py-1 text-[11px]">
            {success}
          </div>
        )}

        {!headteacherUserId && (
          <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded-xl px-2 py-1 text-[11px]">
            Headteacher ID is missing in the URL. Please open this page
            from the Headteacher portal so that your approval is recorded
            correctly.
          </div>
        )}

        <label className="block text-[11px] text-zinc-700 mb-1">
          Comment to teacher
        </label>
        <textarea
          className="w-full rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-[11px] resize-vertical min-h-[70px] focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write your feedback or instructions to the teacher…"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleReview("APPROVE")}
            disabled={submitting || isApproved}
            className="inline-flex items-center justify-center h-8 px-3 rounded-xl border border-black bg-black text-white text-[11px] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✓ Approve &amp; Stamp Signature
          </button>

          <button
            type="button"
            onClick={() => handleReview("REJECT")}
            disabled={submitting}
            className="inline-flex items-center justify-center h-8 px-3 rounded-xl border border-zinc-300 bg-white text-[11px] shadow-sm hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ↩ Return to teacher
          </button>

          {isApproved && (
            <span className="text-[10px] text-emerald-700">
              This note is already approved. You can still return it if
              something must change.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
