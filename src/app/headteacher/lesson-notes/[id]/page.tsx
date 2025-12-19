// src/app/headteacher/lesson-notes/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

interface LessonNoteDetail {
  id: string;

  tenantId: string;
  teacherUserId: string;
  headteacherUserId: string | null;
  classroomId: string | null;

  phase?: string | null;
  level?: string | null;
  curriculumUnitId?: string | null;

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
}

interface LessonNoteItemResponse {
  ok: boolean;
  item?: LessonNoteDetail;
  error?: string;
}

interface ReviewResponseOk {
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

interface ReviewResponseError {
  ok: false;
  error: string;
}

type ReviewResponse = ReviewResponseOk | ReviewResponseError;

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
  const base =
    "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium";

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
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Returned for improvement";
  return status;
}

export default function HeadteacherLessonNoteReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const noteId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const tenantIdFromQuery = searchParams.get("tenantId") ?? "";
  const headteacherUserIdFromQuery =
    searchParams.get("headteacherUserId") ?? "HEADTEACHER_DEMO_ID";

  const [note, setNote] = useState<LessonNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [commentDraft, setCommentDraft] = useState<string>("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!noteId) {
        setLoadError("Missing lesson note ID in the URL.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch(
          `/api/teachers/lesson-notes/item/${encodeURIComponent(noteId)}`
        );
        const data = (await res.json()) as LessonNoteItemResponse;

        if (!res.ok || !data.ok || !data.item) {
          if (!cancelled) {
            setLoadError(
              data.error ??
                "Failed to load this lesson note. Please try again or contact the system administrator."
            );
          }
          return;
        }

        if (cancelled) return;

        const item = data.item;
        setNote(item);
        setCommentDraft(item.headteacherComment ?? "");
      } catch {
        if (!cancelled) {
          setLoadError(
            "Network or server error while loading this lesson note. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const handleBack = useCallback(() => {
    const paramsForBack = new URLSearchParams();
    if (tenantIdFromQuery) {
      paramsForBack.set("tenantId", tenantIdFromQuery);
    }
    if (headteacherUserIdFromQuery) {
      paramsForBack.set("headteacherUserId", headteacherUserIdFromQuery);
    }
    router.push(`/headteacher/lesson-notes?${paramsForBack.toString()}`);
  }, [router, tenantIdFromQuery, headteacherUserIdFromQuery]);

  async function runReview(action: "APPROVE" | "REJECT") {
    if (!note || !noteId) return;
    if (!tenantIdFromQuery) {
      setReviewError(
        "Missing tenantId in the URL. Please navigate from the main headteacher lesson notes page."
      );
      return;
    }

    setReviewSaving(true);
    setReviewError(null);

    try {
      const res = await fetch("/api/headteacher/lesson-notes/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantIdFromQuery,
          headteacherUserId: headteacherUserIdFromQuery,
          lessonNoteId: noteId,
          action,
          comment: commentDraft,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as ReviewResponse;

      if (!res.ok || !data.ok) {
        const errMsg =
          !res.ok && "error" in data
            ? data.error
            : "Could not update lesson note status. Please try again.";
        setReviewError(errMsg);
        return;
      }

      const updated = data.item;
      setNote((prev) =>
        prev
          ? {
              ...prev,
              status: updated.status,
              headteacherComment: updated.headteacherComment,
              headteacherUserId: updated.headteacherUserId,
              reviewedAt: updated.reviewedAt,
              approvedAt: updated.approvedAt,
              rejectedAt: updated.rejectedAt,
              updatedAt: updated.updatedAt,
            }
          : prev
      );
    } catch (err) {
      console.error("HEADTEACHER_REVIEW_CLIENT_ERROR", err);
      setReviewError(
        "Network or server error while saving your review. Please try again."
      );
    } finally {
      setReviewSaving(false);
    }
  }

  const canApprove = note?.status === "SUBMITTED" || note?.status === "REJECTED";
  const canReturn =
    note?.status === "SUBMITTED" || note?.status === "APPROVED";

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-5 md:py-6 space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleBack}
              className={btnGhost}
            >
              ← Back to headteacher list
            </button>
            <h1 className="text-xl md:text-2xl font-semibold">
              Lesson Note Review
            </h1>
            <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
              Read the{" "}
              <span className="font-semibold">
                full NaCCA-aligned lesson note
              </span>{" "}
              exactly as the teacher sees it, then{" "}
              <span className="font-semibold">
                approve or return with clear written feedback
              </span>
              .
            </p>
          </div>

          <div className="flex flex-col md:items-end gap-2 text-right">
            {note && (
              <span className={statusBadgeClasses(note.status)}>
                {statusLabel(note.status)}
              </span>
            )}
            {note && (
              <span className="text-[11px] text-zinc-500">
                Last updated: {formatDateTimeShort(note.updatedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Error / loading */}
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
            {/* LEFT: Full lesson note content (read-only) */}
            <section className="space-y-4">
              {/* Summary card */}
              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">
                      {note.subject} •{" "}
                      <span className="text-zinc-700">
                        {note.strand}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-600 space-y-0.5">
                      {note.substrand && (
                        <div>
                          <span className="font-medium">
                            Sub-strand:
                          </span>{" "}
                          {note.substrand}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">
                          Term / Year:
                        </span>{" "}
                        {note.term} • {note.academicYear}
                      </div>
                      <div>
                        <span className="font-medium">
                          Week:
                        </span>{" "}
                        {note.weekNumber ?? "—"}
                      </div>
                      {(note.phase || note.level) && (
                        <div>
                          <span className="font-medium">
                            Phase / Level:
                          </span>{" "}
                          {note.phase ?? "—"}{" "}
                          {note.level ? `• ${note.level}` : ""}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">
                          Teacher ID:
                        </span>{" "}
                        <span className="font-mono text-[11px]">
                          {note.teacherUserId}
                        </span>
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

              {/* Lesson fields (read-only) */}
              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
                {/* Lesson title + prior knowledge */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Lesson title
                    </label>
                    <input
                      type="text"
                      className={`${inputBase} bg-zinc-50`}
                      value={note.lessonTitle ?? ""}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Prior knowledge / learner profile
                    </label>
                    <textarea
                      className={`${textAreaBase} bg-zinc-50`}
                      value={note.priorKnowledge ?? ""}
                      readOnly
                    />
                  </div>
                </div>

                {/* Objectives */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-700">
                    Objectives (general &amp; specific)
                  </label>
                  <textarea
                    className={`${textAreaBase} bg-zinc-50`}
                    value={note.objectives ?? ""}
                    readOnly
                  />
                </div>

                {/* TLM + Introduction */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Teaching &amp; learning resources (TLM)
                    </label>
                    <textarea
                      className={`${textAreaBase} bg-zinc-50`}
                      value={note.teachingLearningResources ?? ""}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Introduction (Starter)
                    </label>
                    <textarea
                      className={`${textAreaBase} bg-zinc-50`}
                      value={note.introduction ?? ""}
                      readOnly
                    />
                  </div>
                </div>

                {/* Development */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-700">
                    Lesson development (I do – We do – You do)
                  </label>
                  <textarea
                    className={`${textAreaBase} bg-zinc-50`}
                    value={note.lessonDevelopment ?? ""}
                    readOnly
                  />
                </div>

                {/* Conclusion + Assessment */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Conclusion / Plenary
                    </label>
                    <textarea
                      className={`${textAreaBase} bg-zinc-50`}
                      value={note.conclusion ?? ""}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Assessment / Evaluation
                    </label>
                    <textarea
                      className={`${textAreaBase} bg-zinc-50`}
                      value={note.assessment ?? ""}
                      readOnly
                    />
                  </div>
                </div>

                {/* Homework + Differentiation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Homework / Assignment
                    </label>
                    <textarea
                      className={`${textAreaBase} bg-zinc-50`}
                      value={note.homework ?? ""}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Differentiation (support &amp; extension)
                    </label>
                    <textarea
                      className={`${textAreaBase} bg-zinc-50`}
                      value={note.differentiationNotes ?? ""}
                      readOnly
                    />
                  </div>
                </div>

                {/* Reflection */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-700">
                    Teacher reflection (after the lesson)
                  </label>
                  <textarea
                    className={`${textAreaBase} bg-zinc-50`}
                    value={note.reflectionNotes ?? ""}
                    readOnly
                  />
                </div>

                {/* Print shortcut (optional) */}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <p className="text-[11px] text-zinc-500">
                    This view mirrors the{" "}
                    <span className="font-semibold">
                      Lesson Design Studio
                    </span>{" "}
                    layout, so your feedback stays aligned with what the
                    teacher sees.
                  </p>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      const url = `/teacher/lesson-notes/${encodeURIComponent(
                        note.id
                      )}/print`;
                      window.open(url, "_blank");
                    }}
                  >
                    🖨️ Open teacher print view
                  </button>
                </div>
              </div>
            </section>

            {/* RIGHT: Review panel */}
            <aside className="space-y-4">
              {/* Review controls */}
              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">
                      Headteacher review
                    </h2>
                    <p className="text-xs text-zinc-600">
                      Write your feedback once, then{" "}
                      <span className="font-semibold">
                        approve or return
                      </span>{" "}
                      the note. The teacher sees this instantly.
                    </p>
                  </div>
                  <span className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-zinc-900 text-white text-[11px] font-medium">
                    Visible in teacher portal
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-700">
                    Your comment to the teacher
                  </label>
                  <textarea
                    className={textAreaBase}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Example: Very clear use of I do–We do–You do. Please add a short formative assessment at the end for slow learners."
                  />
                  <p className="text-[11px] text-zinc-500">
                    This comment is saved on the lesson note and appears
                    for the teacher on their side.
                  </p>
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
                      {reviewSaving ? "Saving…" : "Approve lesson note"}
                    </button>
                    <button
                      type="button"
                      className={btnOutline}
                      disabled={!canReturn || reviewSaving}
                      onClick={() => void runReview("REJECT")}
                    >
                      {reviewSaving
                        ? "Saving…"
                        : "Return for improvement"}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500 max-w-xs">
                    A returned note becomes{" "}
                    <span className="font-semibold">REJECTED</span> on
                    the teacher side, so they know it needs revision.
                    Approved notes are locked from teacher editing.
                  </p>
                </div>
              </div>

              {/* Timeline / meta */}
              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-2 text-xs text-zinc-600">
                <h3 className="text-xs font-semibold text-zinc-800">
                  Status timeline
                </h3>
                <div className="space-y-0.5">
                  <div>
                    Created:{" "}
                    <span className="font-medium">
                      {formatDateTimeShort(note.createdAt)}
                    </span>
                  </div>
                  {note.submittedAt && (
                    <div>
                      Submitted by teacher:{" "}
                      <span className="font-medium">
                        {formatDateTimeShort(note.submittedAt)}
                      </span>
                    </div>
                  )}
                  {note.reviewedAt && (
                    <div>
                      Reviewed by you:{" "}
                      <span className="font-medium">
                        {formatDateTimeShort(note.reviewedAt)}
                      </span>
                    </div>
                  )}
                  {note.approvedAt && (
                    <div>
                      Approved:{" "}
                      <span className="font-medium">
                        {formatDateTimeShort(note.approvedAt)}
                      </span>
                    </div>
                  )}
                  {note.rejectedAt && (
                    <div>
                      Returned:{" "}
                      <span className="font-medium">
                        {formatDateTimeShort(note.rejectedAt)}
                      </span>
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
