// src/components/headteacher/HeadteacherLessonNoteReviewClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type LessonNoteDetail = {
  id: string;

  teacherUserId: string;
  teacherName: string | null;

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

type ItemResponse = { ok: true; item: LessonNoteDetail } | { ok: false; error: string };

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

type SignatureResp =
  | { ok: true; signatureSvg: string | null; signatureHash: string | null; updatedAt: string | null }
  | { ok: false; error: string };

type SignatureSaveResp =
  | { ok: true; signatureSvg: string; signatureHash: string; updatedAt: string }
  | { ok: false; error: string };

const btnBase =
  "inline-flex items-center justify-center rounded-xl border text-xs md:text-sm h-9 px-3 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const btnGhost =
  "inline-flex items-center justify-center text-xs md:text-sm h-9 px-2 rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100";

const textAreaBase =
  "w-full min-h-28 resize-vertical rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-950 shadow-inner placeholder:text-slate-500 focus:border-black focus:outline-none focus:ring-4 focus:ring-black/10 disabled:bg-slate-100 disabled:text-slate-700";

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

type Pt = { x: number; y: number };
type Stroke = Pt[];

function buildSignatureSvg(strokes: Stroke[], w: number, h: number) {
  const safeW = Math.max(1, Math.floor(w));
  const safeH = Math.max(1, Math.floor(h));

  const paths: string[] = [];
  const circles: string[] = [];

  for (const stroke of strokes) {
    if (!stroke || stroke.length === 0) continue;
    if (stroke.length === 1) {
      const p = stroke[0]!;
      circles.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.2" />`);
      continue;
    }
    const d = stroke
      .map((p, i) => (i === 0 ? `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}` : `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`))
      .join(" ");
    paths.push(`<path d="${d}" />`);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeW} ${safeH}" width="${safeW}" height="${safeH}">`,
    `<rect x="0" y="0" width="${safeW}" height="${safeH}" fill="white" />`,
    `<g fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
    ...paths,
    `</g>`,
    circles.length ? `<g fill="black">${circles.join("")}</g>` : "",
    `</svg>`,
  ]
    .filter(Boolean)
    .join("");
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function HeadteacherLessonNoteReviewClient({ noteId }: { noteId: string }) {
  const router = useRouter();

  const [note, setNote] = useState<LessonNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [commentDraft, setCommentDraft] = useState<string>("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Saved signature (tenant-scoped)
  const [sigLoading, setSigLoading] = useState(true);
  const [sigError, setSigError] = useState<string | null>(null);
  const [savedSigSvg, setSavedSigSvg] = useState<string | null>(null);
  const [savedSigUpdatedAt, setSavedSigUpdatedAt] = useState<string | null>(null);
  const [sigSaving, setSigSaving] = useState(false);

  // Mode: use saved signature OR draw/update
  const [sigMode, setSigMode] = useState<"USE_SAVED" | "DRAW">("USE_SAVED");

  // Signature pad (only used when DRAW)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke>([]);
  const [signatureDirty, setSignatureDirty] = useState(false);

  const canApprove = note?.status === "SUBMITTED";
  const canReturn = note?.status === "SUBMITTED";

  const handleBack = useCallback(() => {
    router.push("/headteacher/lesson-notes");
  }, [router]);

  const printHref = useMemo(() => {
    const id = note?.id || noteId;
    return `/teacher/lesson-notes/${encodeURIComponent(id)}/print`;
  }, [note?.id, noteId]);

  const printEmbedHref = useMemo(() => `${printHref}?embed=1`, [printHref]);

  const clearSignature = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = [];
    drawingRef.current = false;
    setSignatureDirty(false);

    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const resizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;

    const parent = c.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

    const w = Math.max(260, Math.floor(rect.width));
    const h = 140;

    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;

    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    for (const stroke of strokesRef.current) {
      if (!stroke.length) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i]!.x, stroke[i]!.y);
      ctx.stroke();
    }
  }, []);

  function canvasPoint(e: PointerEvent, canvas: HTMLCanvasElement): Pt {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return { x: Math.max(0, Math.min(r.width, x)), y: Math.max(0, Math.min(r.height, y)) };
  }

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canApprove) return;
      if (sigMode !== "DRAW") return;

      const c = canvasRef.current;
      if (!c) return;

      c.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const p = canvasPoint(e.nativeEvent, c);
      currentStrokeRef.current = [p];

      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    },
    [canApprove, sigMode]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const c = canvasRef.current;
      if (!c) return;

      const p = canvasPoint(e.nativeEvent, c);
      currentStrokeRef.current.push(p);

      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      if (!signatureDirty) setSignatureDirty(true);
    },
    [signatureDirty]
  );

  const endStroke = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const stroke = currentStrokeRef.current;
    if (stroke.length) strokesRef.current.push(stroke);

    currentStrokeRef.current = [];
  }, []);

  async function loadSignature() {
    setSigLoading(true);
    setSigError(null);

    try {
      const res = await fetch("/api/headteacher/signature", { method: "GET", headers: { "Cache-Control": "no-store" } });
      const data = (await res.json().catch(() => ({}))) as SignatureResp;

      if (!res.ok || !data.ok) {
        setSigError((data as any)?.error ?? "Failed to load signature.");
        setSavedSigSvg(null);
        setSavedSigUpdatedAt(null);
        setSigMode("DRAW");
        return;
      }

      setSavedSigSvg(data.signatureSvg ?? null);
      setSavedSigUpdatedAt(data.updatedAt ?? null);

      // If signature exists, default to using it
      setSigMode(data.signatureSvg ? "USE_SAVED" : "DRAW");
    } catch (e) {
      console.error("HEADTEACHER_SIGNATURE_LOAD_CLIENT_ERROR", e);
      setSigError("Network error while loading signature.");
      setSavedSigSvg(null);
      setSavedSigUpdatedAt(null);
      setSigMode("DRAW");
    } finally {
      setSigLoading(false);
    }
  }

  async function saveSignatureFromPad() {
    if (sigMode !== "DRAW") return;

    if (!signatureDirty || strokesRef.current.length === 0) {
      setReviewError("Please sign first, then click Save Signature.");
      return;
    }

    const c = canvasRef.current;
    if (!c) {
      setReviewError("Signature pad not ready. Refresh and try again.");
      return;
    }

    const w = c.getBoundingClientRect().width;
    const h = c.getBoundingClientRect().height;
    const svg = buildSignatureSvg(strokesRef.current, w, h);

    setSigSaving(true);
    setSigError(null);

    try {
      const res = await fetch("/api/headteacher/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ signatureSvg: svg }),
      });

      const data = (await res.json().catch(() => ({}))) as SignatureSaveResp;

      if (!res.ok || !data.ok) {
        setSigError((data as any)?.error ?? "Failed to save signature.");
        return;
      }

      setSavedSigSvg(data.signatureSvg);
      setSavedSigUpdatedAt(data.updatedAt);
      setSigMode("USE_SAVED");

      // Clean pad after saving
      clearSignature();
    } catch (e) {
      console.error("HEADTEACHER_SIGNATURE_SAVE_CLIENT_ERROR", e);
      setSigError("Network error while saving signature.");
    } finally {
      setSigSaving(false);
    }
  }

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
    void loadSignature();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    // pad setup only matters when drawing
    if (sigMode !== "DRAW") return;

    resizeCanvas();
    clearSignature();

    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sigMode, resizeCanvas, clearSignature]);

  async function runReview(action: "APPROVE" | "REJECT") {
    if (!note) return;

    setReviewSaving(true);
    setReviewError(null);

    if (action === "REJECT" && !commentDraft.trim()) {
      setReviewSaving(false);
      setReviewError("You must write a clear comment before returning a lesson note.");
      return;
    }

    let signatureSvg: string | null = null;

    if (action === "APPROVE") {
      // Prefer saved signature if available and selected
      if (savedSigSvg && sigMode === "USE_SAVED") {
        signatureSvg = null; // server uses stored signature
      } else {
        // Draw mode: require strokes
        if (!signatureDirty || strokesRef.current.length === 0) {
          setReviewSaving(false);
          setReviewError("Approval requires a signature. Save a signature once or sign now.");
          return;
        }

        const c = canvasRef.current;
        if (!c) {
          setReviewSaving(false);
          setReviewError("Signature pad is not ready. Refresh and try again.");
          return;
        }

        const w = c.getBoundingClientRect().width;
        const h = c.getBoundingClientRect().height;
        signatureSvg = buildSignatureSvg(strokesRef.current, w, h);
      }
    }

    try {
      const res = await fetch("/api/headteacher/lesson-notes/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          lessonNoteId: note.id,
          action,
          comment: commentDraft,
          signatureSvg, // may be null -> server uses saved signature
          ifMatchUpdatedAt: note.updatedAt,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as ReviewResponse;

      if (!res.ok || !data.ok) {
        setReviewError((data as any)?.error ?? "Could not update lesson note status.");
        return;
      }

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

      // If this was first-time signature via DRAW, server may have saved it — refresh local saved signature
      if (action === "APPROVE") {
        await loadSignature();
        setSigMode((m) => (savedSigSvg ? m : "USE_SAVED"));
      }
    } catch (err) {
      console.error("HEADTEACHER_REVIEW_CLIENT_ERROR", err);
      setReviewError("Network or server error while saving your review.");
    } finally {
      setReviewSaving(false);
    }
  }

  const showCanvas = sigMode === "DRAW" || !savedSigSvg;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-5 md:py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <button type="button" onClick={handleBack} className={btnGhost}>
              ← Back to headteacher list
            </button>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-950 md:text-2xl">
  Lesson Note Review
</h1>
<p className="max-w-2xl text-xs font-medium text-slate-700 md:text-sm">
              Teacher: <span className="font-semibold">{note?.teacherName ?? "—"}</span> · Subject:{" "}
              <span className="font-semibold">{note?.subject ?? "—"}</span>
            </p>
          </div>

          <div className="flex flex-col md:items-end gap-2 text-right">
            {note && <span className={statusBadgeClasses(note.status)}>{statusLabel(note.status)}</span>}
            {note && <span className="text-[11px] text-zinc-500">Last updated: {formatDateTimeShort(note.updatedAt)}</span>}
          </div>
        </div>

        {loadError && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-3 py-2 text-sm">{loadError}</div>
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
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-4 md:gap-5">
            {/* LEFT: print preview */}
            <section className="space-y-3">
              <div className="border rounded-2xl bg-white p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">Print preview</p>
<p className="truncate text-[12px] font-medium text-slate-700">
                    This is exactly what education officials will accept (print-ready view).
                  </p>
                </div>
                <a className={btnOutline} href={printHref} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>

              <div className="border rounded-2xl bg-white overflow-hidden">
                <iframe
  title="Lesson note print preview"
  src={printEmbedHref}
  className="h-[720px] w-full bg-white md:h-[860px]"
  sandbox="allow-same-origin allow-scripts"
  referrerPolicy="same-origin"
/>
              </div>
            </section>

            {/* RIGHT: review + reusable signature */}
            <aside className="space-y-4">
              <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">Headteacher review</h2>
<p className="text-xs font-medium text-slate-700">
  Approve or return. Approval uses your saved signature.
</p>
                  </div>
                  <span className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-zinc-900 text-white text-[11px] font-medium">
                    Visible to teacher
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-[0.08em] text-slate-700">
  Your comment to the teacher
</label>
                  <textarea
                    className={textAreaBase}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Be specific: what to improve, where, and how."
                    disabled={!canApprove && !canReturn}
                  />
                  <p className="text-[11px] font-medium text-slate-600">
  Returning requires a comment (server-enforced).
</p>
                </div>

                {/* Saved signature panel */}
                <div className="border border-zinc-200 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-zinc-900">Your saved signature</p>
                      <p className="text-[11px] text-zinc-500">
                        {sigLoading
                          ? "Loading…"
                          : savedSigSvg
                          ? `Last updated: ${formatDateTimeShort(savedSigUpdatedAt)}`
                          : "No saved signature yet."}
                      </p>
                    </div>

                    {savedSigSvg ? (
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() => {
                          setSigMode("DRAW");
                          setReviewError(null);
                          setSigError(null);
                        }}
                        disabled={!canApprove || reviewSaving || sigSaving}
                      >
                        Change
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={() => setSigMode("DRAW")}
                        disabled={!canApprove || reviewSaving || sigSaving}
                      >
                        Create
                      </button>
                    )}
                  </div>

                  {sigError && (
                    <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {sigError}
                    </div>
                  )}

                  {savedSigSvg ? (
                    <div className="bg-white border border-zinc-200 rounded-xl p-2">
                      <img src={svgToDataUrl(savedSigSvg)} alt="Saved signature" className="h-10 object-contain" />
                      <div className="mt-1 text-[10px] text-zinc-500">
                        Using: <span className="font-semibold">Saved signature</span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className={btnOutline}
                          onClick={() => setSigMode("USE_SAVED")}
                          disabled={!canApprove || reviewSaving || sigSaving}
                        >
                          Use saved
                        </button>
                        {sigMode === "DRAW" ? (
                          <button
                            type="button"
                            className={btnOutline}
                            onClick={() => {
                              setSigMode("USE_SAVED");
                              clearSignature();
                            }}
                            disabled={!canApprove || reviewSaving || sigSaving}
                          >
                            Cancel drawing
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Drawing pad (only when needed) */}
                {showCanvas && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-800">
                        {savedSigSvg ? "Update signature (draw new)" : "Create signature (draw once)"}
                      </h3>
                      <button
                        type="button"
                        className={btnOutline}
                        onClick={clearSignature}
                        disabled={!canApprove || reviewSaving || sigSaving}
                      >
                        Clear
                      </button>
                    </div>

                    <div className="border border-zinc-200 rounded-2xl bg-white p-2">
                      <canvas
                        ref={canvasRef}
                        className={`w-full rounded-xl ${canApprove ? "cursor-crosshair" : "opacity-60"}`}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endStroke}
                        onPointerCancel={endStroke}
                        onPointerLeave={endStroke}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-zinc-500">
                        Save once, then approvals reuse it automatically.
                      </p>
                      <button
                        type="button"
                        className={btnPrimary}
                        onClick={() => void saveSignatureFromPad()}
                        disabled={!canApprove || reviewSaving || sigSaving}
                      >
                        {sigSaving ? "Saving…" : "Save signature"}
                      </button>
                    </div>
                  </div>
                )}

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
                    Only <span className="font-semibold">SUBMITTED</span> notes can be reviewed.
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