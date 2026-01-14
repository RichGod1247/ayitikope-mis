// src/components/headteacher/HeadteacherLessonNoteReviewClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type LessonNoteDetail = {
  id: string;
  teacherUserId: string;
  classroomId: string | null;

  phase: string | null;
  level: string | null;
  curriculumUnitId: string | null;

  subject: string;
  term: string;
  academicYear: string;
  weekNumber: number | null;
  lessonDate: string | null;

  strand: string;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  lessonTitle: string | null;

  objectives: string | null;
  priorKnowledge: string | null;
  teachingLearningResources: string | null;
  introduction: string | null;
  lessonDevelopment: string | null;
  conclusion: string | null;
  assessment: string | null;
  homework: string | null;
  differentiationNotes: string | null;
  reflectionNotes: string | null;

  status: LessonNoteStatus;
  headteacherComment: string | null;

  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;

  createdAt: string;
  updatedAt: string;
};

type ItemResponse =
  | { ok: true; item: LessonNoteDetail }
  | { ok: false; error: string };

type ReviewResponse =
  | {
      ok: true;
      item: {
        id: string;
        status: LessonNoteStatus;
        headteacherComment: string | null;
        headteacherUserId: string | null;
        reviewedAt: string | null;
        approvedAt: string | null;
        rejectedAt: string | null;
        updatedAt: string;
      };
    }
  | { ok: false; error: string };

const btnBase =
  "inline-flex items-center justify-center rounded-xl border text-xs md:text-sm h-9 px-3 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const btnGhost =
  "inline-flex items-center justify-center text-xs md:text-sm h-9 px-2 rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100";

const inputBase =
  "w-full rounded-xl border border-zinc-300 px-2 py-1.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white";
const textAreaBase =
  "w-full rounded-xl border border-zinc-300 px-2 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white resize-vertical min-h-24";

function formatDateTimeShort(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClasses(status: LessonNoteStatus) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium";
  switch (status) {
    case "DRAFT":
      return `${base} bg-zinc-50 border-zinc-200 text-zinc-700`;
    case "SUBMITTED":
      return `${base} bg-amber-50 border-amber-200 text-amber-800`;
    case "APPROVED":
      return `${base} bg-emerald-50 border-emerald-200 text-emerald-800`;
    case "REJECTED":
      return `${base} bg-red-50 border-red-200 text-red-800`;
    default:
      return base;
  }
}

function statusLabel(status: LessonNoteStatus) {
  if (status === "DRAFT") return "Draft (not submitted)";
  if (status === "SUBMITTED") return "Submitted, awaiting your review";
  if (status === "APPROVED") return "Approved (locked)";
  if (status === "REJECTED") return "Returned for improvement";
  return status;
}

export default function HeadteacherLessonNoteReviewClient({ noteId }: { noteId: string }) {
  const router = useRouter();

  const [note, setNote] = useState<LessonNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [commentDraft, setCommentDraft] = useState<string>("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    router.push("/headteacher/lesson-notes");
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setLoadError(null);
      setReviewError(null);

      try {
        const res = await fetch(`/api/headteacher/lesson-notes/item/${encodeURIComponent(noteId)}`, {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
        });

        const data = (await res.json().catch(() => ({}))) as ItemResponse;

        if (!res.ok || !data.ok) {
          if (!cancelled) setLoadError((data as any)?.error ?? "Failed to load this lesson note.");
          return;
        }

        if (cancelled) return;

        setNote(data.item);
        setCommentDraft(data.item.headteacherComment ?? "");
      } catch (err) {
        console.error("HEADTEACHER_ITEM_CLIENT_ERROR", err);
        if (!cancelled) setLoadError("Network or server error while loading this lesson note.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const canApprove = note?.status === "SUBMITTED";
  const canReturn = note?.status === "SUBMITTED";

  async function runReview(action: "APPROVE" | "REJECT") {
    if (!note) return;

    setReviewSaving(true);
    setReviewError(null);

    if (action === "REJECT" && !commentDraft.trim()) {
      setReviewSaving(false);
      setReviewError("You must write a clear comment before returning a lesson note.");
      return;
    }

    try {
      const res = await fetch("/api/headteacher/lesson-notes/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          lessonNoteId: note.id,
          action,
          comment: commentDraft,
          ifMatchUpdatedAt: note.updatedAt, // optimistic concurrency
        }),
      });

      const data = (await res.json().catch(() => ({}))) as ReviewResponse;

      if (!res.ok || !data.ok) {
        setReviewError((data as any)?.error ?? "Could not update lesson note status.");
        return;
      }

      // Update local note snapshot
      setNote((prev) =>
        prev
          ? {
              ...prev,
              status: data.item.status,
              headteacherComment: data.item.headteacherComment,
              reviewedAt: data.item.reviewedAt,
              approvedAt: data.item.approvedAt,
              rejectedAt: data.item.rejectedAt,
              updatedAt: data.item.updatedAt,
            }
          : prev
      );
    } catch (err) {
      console.error("HEADTEACHER_REVIEW_CLIENT_ERROR", err);
      setReviewError("Network or server error while saving your review.");
    } finally {
      setReviewSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-5 md:py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <button type="button" onClick={handleBack} className={btnGhost}>
              ← Back to headteacher list
            </button>
            <h1 className="text-xl md:text-2xl font-semibold">Lesson Note Review</h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              This page is server-gated and tenant-scoped. You cannot spoof tenant IDs or reviewer IDs.
            </p>
          </div>

          <div className="flex flex-col md:items-end gap-2 text-right">
            {note && <span className={statusBadgeClasses(note.status)}>{statusLabel(note.status)}</span>}
            {note && (
              <span className="text-[11px] text-zinc-500">Last updated: {formatDateTimeShort(note.updatedAt)}</span>
            )}
          </div>
        </div>

        {loadError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">
            {loadError}
          </div>
        )}

        {loading && (
          <div className="border border-zinc-200 bg-white rounded-2xl p-4 md:p-5 space-y-3">
            <div className="h-4 w-48 bg-zinc-100 rounded-md animate-pulse" />
            <div className="h-3 w-64 bg-zinc-100 rounded-md animate-pulse" />
            <div className="h-3 w-40 bg-zinc-100 rounded-md animate-pulse" />
            <div className="h-24 w-full bg-zinc-100 rounded-xl animate-pulse" />
          </div>
        )}

        {!loading && note && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.1fr)] gap-4 md:gap-5">
            <section className="space-y-4">
              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">
                      {note.subject} • <span className="text-zinc-700">{note.strand}</span>
                    </div>
                    <div className="text-xs text-zinc-600 space-y-0.5">
                      {note.substrand && (
                        <div>
                          <span className="font-medium">Sub-strand:</span> {note.substrand}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Term / Year:</span> {note.term} • {note.academicYear}
                      </div>
                      <div>
                        <span className="font-medium">Week:</span> {note.weekNumber ?? "—"}
                      </div>
                      {(note.phase || note.level) && (
                        <div>
                          <span className="font-medium">Phase / Level:</span> {note.phase ?? "—"}{" "}
                          {note.level ? `• ${note.level}` : ""}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Teacher ID:</span>{" "}
                        <span className="font-mono text-[11px]">{note.teacherUserId}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-600 space-y-2 max-w-xs">
                    {note.contentStandard && (
                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
                        <div className="font-semibold text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
                          Content standard
                        </div>
                        <p>{note.contentStandard}</p>
                      </div>
                    )}
                    {note.indicator && (
                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
                        <div className="font-semibold text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
                          Indicator
                        </div>
                        <p>{note.indicator}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Lesson title</label>
                    <input type="text" className={`${inputBase} bg-zinc-50`} value={note.lessonTitle ?? ""} readOnly />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Prior knowledge / learner profile</label>
                    <textarea className={`${textAreaBase} bg-zinc-50`} value={note.priorKnowledge ?? ""} readOnly />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-700">Objectives (general &amp; specific)</label>
                  <textarea className={`${textAreaBase} bg-zinc-50`} value={note.objectives ?? ""} readOnly />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Teaching &amp; learning resources (TLM)</label>
                    <textarea className={`${textAreaBase} bg-zinc-50`} value={note.teachingLearningResources ?? ""} readOnly />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Introduction (Starter)</label>
                    <textarea className={`${textAreaBase} bg-zinc-50`} value={note.introduction ?? ""} readOnly />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-700">Lesson development (I do – We do – You do)</label>
                  <textarea className={`${textAreaBase} bg-zinc-50`} value={note.lessonDevelopment ?? ""} readOnly />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Conclusion / Plenary</label>
                    <textarea className={`${textAreaBase} bg-zinc-50`} value={note.conclusion ?? ""} readOnly />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Assessment / Evaluation</label>
                    <textarea className={`${textAreaBase} bg-zinc-50`} value={note.assessment ?? ""} readOnly />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Homework / Assignment</label>
                    <textarea className={`${textAreaBase} bg-zinc-50`} value={note.homework ?? ""} readOnly />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Differentiation (support &amp; extension)</label>
                    <textarea className={`${textAreaBase} bg-zinc-50`} value={note.differentiationNotes ?? ""} readOnly />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-700">Teacher reflection (after the lesson)</label>
                  <textarea className={`${textAreaBase} bg-zinc-50`} value={note.reflectionNotes ?? ""} readOnly />
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Headteacher review</h2>
                    <p className="text-xs text-zinc-600">Approve or return. Approved becomes locked.</p>
                  </div>
                  <span className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-zinc-900 text-white text-[11px] font-medium">
                    Visible to teacher
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-700">Your comment to the teacher</label>
                  <textarea
                    className={textAreaBase}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Be specific: what to improve, where, and how."
                  />
                  <p className="text-[11px] text-zinc-500">Returning requires a comment (enforced server-side).</p>
                </div>

                {reviewError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {reviewError}
                  </div>
                )}

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={!canApprove || reviewSaving}
                      onClick={() => void runReview("APPROVE")}
                    >
                      {reviewSaving ? "Saving…" : "Approve"}
                    </button>

                    <button
                      type="button"
                      className={btnOutline}
                      disabled={!canReturn || reviewSaving}
                      onClick={() => void runReview("REJECT")}
                    >
                      {reviewSaving ? "Saving…" : "Return"}
                    </button>
                  </div>

                  <p className="text-[11px] text-zinc-500 max-w-xs">
                    Only <span className="font-semibold">SUBMITTED</span> notes can be reviewed. If a note is returned,
                    the teacher must revise and resubmit.
                  </p>
                </div>
              </div>

              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-2 text-xs text-zinc-600">
                <h3 className="text-xs font-semibold text-zinc-800">Status timeline</h3>
                <div className="space-y-0.5">
                  <div>
                    Created: <span className="font-medium">{formatDateTimeShort(note.createdAt)}</span>
                  </div>
                  {note.submittedAt && (
                    <div>
                      Submitted: <span className="font-medium">{formatDateTimeShort(note.submittedAt)}</span>
                    </div>
                  )}
                  {note.reviewedAt && (
                    <div>
                      Reviewed: <span className="font-medium">{formatDateTimeShort(note.reviewedAt)}</span>
                    </div>
                  )}
                  {note.approvedAt && (
                    <div>
                      Approved: <span className="font-medium">{formatDateTimeShort(note.approvedAt)}</span>
                    </div>
                  )}
                  {note.rejectedAt && (
                    <div>
                      Returned: <span className="font-medium">{formatDateTimeShort(note.rejectedAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
