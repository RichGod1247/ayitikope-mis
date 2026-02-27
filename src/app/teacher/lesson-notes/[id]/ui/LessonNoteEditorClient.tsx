// src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

/**
 * Bank-grade robustness: support BOTH API shapes safely.
 * - Old shape: items[].schemeItemId (linked via POST { schemeItemId })
 * - New shape: items[].curriculumUnitId (linked via POST { curriculumUnitId })
 */
type SchemeUnit = {
  // New canonical key
  schemeOfWorkItemId?: string | null;

  // Legacy key still supported for backward compatibility
  schemeItemId?: string | null;

  curriculumUnitId?: string | null;

  weekNumber: number;
  strandTitle: string | null;
  subStrandTitle: string | null;
  contentStandardCode: string | null;
  contentStandardDescription: string | null;
  indicatorCode: string | null;
  indicatorDescription: string | null;
};

type LessonNote = {
  id: string;
  subject: string;
  phase: string | null;
  level: string | null;

  term: string;
  academicYear: string;
  weekNumber: number | null;
  lessonDate: string | null;

  classroomId: string | null;
  curriculumUnitId: string | null;
  schemeOfWorkItemId: string | null;

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

  updatedAt: string | null;
};

type ToastTone = "success" | "error" | "info" | "warn";

type Toast = {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
};

type UnitQueryMode = {
  includeWeek: boolean; // strict when true; "ignore week" when false
};

type UnitsApiResponse = {
  ok: true;
  items: SchemeUnit[];
  widened?: boolean;
  // optional meta returned by some versions of the API
  reason?: string;
  message?: string;
  source?: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function safeStr(v: any) {
  return typeof v === "string" ? v : "";
}

function trimOrEmpty(v: any) {
  return safeStr(v).trim();
}

function nonEmpty(v: string) {
  return v.trim().length > 0;
}

function normalizeTitleForCompare(s: string) {
  return String(s ?? "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildWeekPlaceholderTitle(subject: string, weekNumber: number | null) {
  const wk = weekNumber ? String(weekNumber) : "";
  return `${subject} — Week ${wk}`.replace(/\s+/g, " ").trim();
}

function isAutoWeekPlaceholderTitle(title: string | null | undefined, subject: string, weekNumber: number | null) {
  const t = normalizeTitleForCompare(String(title ?? ""));
  if (!t) return false;
  const a = normalizeTitleForCompare(buildWeekPlaceholderTitle(subject, weekNumber));
  const b = normalizeTitleForCompare(`${subject} - Week ${weekNumber ?? ""}`);
  return t === a || t === b;
}

function handleAuthFailure() {
  window.location.href = "/auth/signin";
}

async function apiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store", credentials: "include" });

  if (res.status === 401 || res.status === 403) {
    handleAuthFailure();
    throw new Error("Unauthorized");
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "info" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : tone === "info"
          ? "bg-blue-50 text-blue-800 border-blue-200"
          : "bg-zinc-50 text-zinc-700 border-zinc-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{children}</span>;
}

function ToastViewport(props: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed right-3 top-3 z-[60] w-[min(420px,calc(100vw-24px))] space-y-2">
      {props.toasts.map((t) => {
        const cls =
          t.tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : t.tone === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : t.tone === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-blue-200 bg-blue-50 text-blue-900";
        return (
          <div key={t.id} className={`rounded-2xl border px-4 py-3 shadow-sm ${cls}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.message ? <div className="mt-1 text-xs opacity-90 whitespace-pre-wrap">{t.message}</div> : null}
              </div>
              <button
                type="button"
                className="rounded-lg border px-2 py-1 text-xs hover:bg-white/40"
                onClick={() => props.onDismiss(t.id)}
              >
                Close
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "neutral" | "danger";
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!props.open) return null;

  const btn =
    props.tone === "danger"
      ? "bg-red-600 border-red-600 text-white hover:bg-red-700"
      : "bg-black border-black text-white hover:bg-zinc-800";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-3xl border bg-white p-5 shadow-lg">
        <div className="space-y-2">
          <div className="text-lg font-semibold text-zinc-900">{props.title}</div>
          <div className="text-sm text-zinc-600">{props.message}</div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            onClick={props.onClose}
          >
            {props.cancelText ?? "Cancel"}
          </button>
          <button
            type="button"
            className={`rounded-xl border px-3 py-2 text-sm ${btn}`}
            onClick={() => {
              props.onConfirm();
              props.onClose();
            }}
          >
            {props.confirmText ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-zinc-700">{props.label}</label>
      {props.hint ? <div className="mt-1 text-[11px] text-zinc-500">{props.hint}</div> : null}
      <textarea
        className="mt-2 w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black disabled:bg-zinc-100"
        rows={props.rows ?? 4}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={!!props.disabled}
      />
    </div>
  );
}

function shouldRetryLinkPayload(msg: string) {
  const m = msg.toLowerCase();
  // zod / strict schemas / missing keys typically surface like this
  return (
    m.includes("invalid") ||
    m.includes("unrecognized") ||
    m.includes("required") ||
    m.includes("expected") ||
    m.includes("schemeitemid") ||
    m.includes("curriculumunitid")
  );
}

export default function LessonNoteEditorClient({ id }: { id: string }) {
  const router = useRouter();

  // --- toast system ---
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (t: Omit<Toast, "id">, ttlMs = 3500) => {
    const toast: Toast = { id: uid(), ...t };
    setToasts((prev) => [toast, ...prev].slice(0, 4));
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== toast.id)), ttlMs);
  };
  const dismissToast = (tid: string) => setToasts((prev) => prev.filter((x) => x.id !== tid));

  const [loading, setLoading] = useState(true);
  const [pageErr, setPageErr] = useState<string | null>(null);

  const [note, setNote] = useState<LessonNote | null>(null);

  // Editable fields
  const [lessonTitle, setLessonTitle] = useState("");
  const [objectives, setObjectives] = useState("");
  const [tlr, setTlr] = useState("");
  const [intro, setIntro] = useState("");
  const [dev, setDev] = useState("");
  const [concl, setConcl] = useState("");
  const [assessment, setAssessment] = useState("");
  const [homework, setHomework] = useState("");
  const [diff, setDiff] = useState("");
  const [refl, setRefl] = useState("");

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Unit picker (scheme-backed)
  const [unitOpen, setUnitOpen] = useState(false);
  const [unitQ, setUnitQ] = useState("");
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [units, setUnits] = useState<SchemeUnit[]>([]);
  const [unitErr, setUnitErr] = useState<string | null>(null);
  const [unitsMeta, setUnitsMeta] = useState<{ widened?: boolean; message?: string; reason?: string } | null>(null);

  const [unitMode, setUnitMode] = useState<UnitQueryMode>({ includeWeek: true });

  // AI coach
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiFields, setAiFields] = useState<any | null>(null);

  const baselineRef = useRef<string>("");
  const locked = note?.status === "SUBMITTED" || note?.status === "APPROVED";

  const context = useMemo(() => {
    if (!note) return "";
    return `${note.subject} • ${note.level ?? ""} • ${note.term} • ${note.academicYear} • Week ${note.weekNumber ?? "—"}`
      .replace(/\s+/g, " ")
      .trim();
  }, [note]);

  const draftSnapshot = useMemo(() => {
    return JSON.stringify({
      lessonTitle: lessonTitle.trim(),
      objectives: objectives.trim(),
      tlr: tlr.trim(),
      intro: intro.trim(),
      dev: dev.trim(),
      concl: concl.trim(),
      assessment: assessment.trim(),
      homework: homework.trim(),
      diff: diff.trim(),
      refl: refl.trim(),
    });
  }, [assessment, concl, dev, diff, homework, intro, lessonTitle, objectives, refl, tlr]);

  const dirty = useMemo(() => {
    if (!note) return false;
    return baselineRef.current !== "" && baselineRef.current !== draftSnapshot;
  }, [draftSnapshot, note]);

  // Submit gating
  const submitChecks = useMemo(() => {
    const hasUnit = Boolean(note?.schemeOfWorkItemId || note?.curriculumUnitId);
    const hasIndicator = Boolean(trimOrEmpty(note?.indicator));
    const hasObjectives = nonEmpty(objectives);
    const hasDev = nonEmpty(dev);
    const hasAssessment = nonEmpty(assessment);

    const canSubmit = hasUnit && hasIndicator && hasObjectives && hasDev && hasAssessment;
    return { canSubmit, hasUnit, hasIndicator, hasObjectives, hasDev, hasAssessment };
  }, [assessment, dev, objectives, note]);

  async function load() {
    setLoading(true);
    setPageErr(null);
    try {
      const data = await apiJson<{ ok: true; item: LessonNote }>(`/api/teachers/lesson-notes/item/${id}`);
      setNote(data.item);

      // ✅ IMPORTANT:
      // - DO NOT synthesize placeholder titles into state.
      // - If DB already contains the old placeholder and the note is NOT linked, hide it (treat as blank).
      const rawTitle = safeStr(data.item.lessonTitle);
      const isLinked = Boolean(data.item.schemeOfWorkItemId || data.item.curriculumUnitId);
      const shouldHideOldPlaceholder =
        !isLinked && rawTitle && isAutoWeekPlaceholderTitle(rawTitle, data.item.subject, data.item.weekNumber);

      const initialTitle = shouldHideOldPlaceholder ? "" : rawTitle;

      setLessonTitle(initialTitle);
      setObjectives(safeStr(data.item.objectives));
      setTlr(safeStr(data.item.teachingLearningResources));
      setIntro(safeStr(data.item.introduction));
      setDev(safeStr(data.item.lessonDevelopment));
      setConcl(safeStr(data.item.conclusion));
      setAssessment(safeStr(data.item.assessment));
      setHomework(safeStr(data.item.homework));
      setDiff(safeStr(data.item.differentiationNotes));
      setRefl(safeStr(data.item.reflectionNotes));

      baselineRef.current = JSON.stringify({
        lessonTitle: initialTitle.trim(),
        objectives: safeStr(data.item.objectives).trim(),
        tlr: safeStr(data.item.teachingLearningResources).trim(),
        intro: safeStr(data.item.introduction).trim(),
        dev: safeStr(data.item.lessonDevelopment).trim(),
        concl: safeStr(data.item.conclusion).trim(),
        assessment: safeStr(data.item.assessment).trim(),
        homework: safeStr(data.item.homework).trim(),
        diff: safeStr(data.item.differentiationNotes).trim(),
        refl: safeStr(data.item.reflectionNotes).trim(),
      });
    } catch (e: any) {
      setPageErr(e?.message || "Failed to load lesson note.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Warn on navigation if dirty
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Ctrl+S quick save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!locked) void saveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, note, lessonTitle, objectives, tlr, intro, dev, concl, assessment, homework, diff, refl]);

  async function saveDraft() {
    if (!note) return;
    if (locked) {
      pushToast({ tone: "warn", title: "Locked", message: "This note is locked while submitted/approved." });
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const resp = await apiJson<{ ok: true; item: LessonNote }>(`/api/teachers/lesson-notes/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonNoteId: note.id,

          // ✅ store null when blank (so list shows as blank, not empty string)
          lessonTitle: lessonTitle.trim() ? lessonTitle : null,

          objectives,
          teachingLearningResources: tlr,
          introduction: intro,
          lessonDevelopment: dev,
          conclusion: concl,
          assessment,
          homework,
          differentiationNotes: diff,
          reflectionNotes: refl,
          status: "DRAFT",
        }),
      });

      setNote(resp.item);
      baselineRef.current = draftSnapshot;

      pushToast({ tone: "success", title: "Saved", message: "Draft saved successfully." });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Save failed", message: e?.message || "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  async function submitNow() {
    if (!note) return;
    if (locked) {
      pushToast({ tone: "warn", title: "Locked", message: "This note is locked while submitted/approved." });
      return;
    }
    if (!submitChecks.canSubmit) {
      pushToast({
        tone: "warn",
        title: "Not ready to submit",
        message: "Fix the missing requirements shown in the checklist, then try again.",
      });
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      await apiJson<{ ok: true }>(`/api/teachers/lesson-notes/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonNoteId: note.id }),
      });
      await load();
      pushToast({ tone: "success", title: "Submitted", message: "Lesson note submitted for review." });
    } catch (e: any) {
      pushToast({ tone: "error", title: "Submit failed", message: e?.message || "Submit failed." });
    } finally {
      setSubmitting(false);
    }
  }

  function buildUnitsQueryString(mode: UnitQueryMode) {
    if (!note) return "";
    const sp = new URLSearchParams();
    sp.set("lessonNoteId", note.id);
    sp.set("take", "80");

    // strict = includeWeek true; widen = ignoreWeek=1
    if (mode.includeWeek && note.weekNumber) sp.set("weekNumber", String(note.weekNumber));
    if (!mode.includeWeek) sp.set("ignoreWeek", "1");

    if (unitQ.trim()) sp.set("q", unitQ.trim());
    return sp.toString();
  }

  async function loadUnits(modeOverride?: Partial<UnitQueryMode>) {
    if (!note) return;
    setUnitsLoading(true);
    setUnitErr(null);
    setUnitsMeta(null);

    const nextMode: UnitQueryMode = { ...unitMode, ...(modeOverride ?? {}) };
    setUnitMode(nextMode);

    try {
      const qs = buildUnitsQueryString(nextMode);
      const data = await apiJson<UnitsApiResponse>(`/api/teachers/lesson-notes/units?${qs}`);

      setUnits(Array.isArray(data.items) ? data.items : []);
      setUnitsMeta({ widened: data.widened, message: data.message, reason: data.reason });

      // If API tells us why it's empty, surface it (bank-grade UX: no silent failure)
      if ((data.items?.length ?? 0) === 0 && (data.message || data.reason)) {
        setUnitErr(data.message || (data.reason ? `No units: ${data.reason}` : null));
      } else if (data.widened) {
        pushToast(
          {
            tone: "info",
            title: "Auto-widened",
            message: "No units matched the week filter. Showing all scheme units instead.",
          },
          3200
        );
      }
    } catch (e: any) {
      setUnitErr(e?.message || "Failed to load units.");
      setUnits([]);
      setUnitsMeta(null);
    } finally {
      setUnitsLoading(false);
    }
  }

  async function pickUnit(u: SchemeUnit) {
    if (!note) return;
    if (locked) {
      pushToast({ tone: "warn", title: "Locked", message: "Cannot change unit while submitted/approved." });
      return;
    }

    const cu = trimOrEmpty(u.curriculumUnitId);
    const si = trimOrEmpty(u.schemeOfWorkItemId) || trimOrEmpty(u.schemeItemId);

    // Build payloads in safest order. Prefer curriculumUnitId if present (new API),
    // but fall back to schemeItemId (old API). This prevents you from getting trapped
    // in a client/server mismatch again.
    const payloads: Array<{ label: string; body: any }> = [];

    // 1) Preferred: curriculum unit (required by submit route)
    if (cu) payloads.push({ label: "curriculumUnitId", body: { lessonNoteId: note.id, curriculumUnitId: cu } });

    // 2) Canonical scheme link (DB field is schemeOfWorkItemId)
    if (si) payloads.push({ label: "schemeOfWorkItemId", body: { lessonNoteId: note.id, schemeOfWorkItemId: si } });

    // 3) Legacy fallback (older servers might expect schemeItemId)
    if (si) payloads.push({ label: "schemeItemId", body: { lessonNoteId: note.id, schemeItemId: si } });

    if (payloads.length === 0) {
      pushToast({
        tone: "error",
        title: "Bad unit data",
        message: "This unit is missing an ID (schemeItemId/curriculumUnitId). Fix the /units API response.",
      });
      return;
    }

    let lastErr: any = null;

    for (const p of payloads) {
      try {
        await apiJson<{ ok: true; lessonNoteId?: string; curriculumUnitId?: string }>(`/api/teachers/lesson-notes/link-unit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
        });

        await load();
        setUnitOpen(false);
        pushToast({ tone: "success", title: "Unit linked", message: "Unit linked to this lesson note." });
        return;
      } catch (e: any) {
        lastErr = e;
        const msg = safeStr(e?.message || "");
        // If it's a schema mismatch, try the next payload.
        if (shouldRetryLinkPayload(msg)) continue;
        // Otherwise it's a real failure (scope mismatch, forbidden, etc.)
        break;
      }
    }

    pushToast({
      tone: "error",
      title: "Link failed",
      message: lastErr?.message || "Failed to link unit.",
    });
  }

  async function runAi(mode: "QUICK" | "FULL") {
    if (!note) return;
    setAiLoading(true);
    setAiErr(null);
    setAiSuggestion(null);
    setAiFields(null);
    try {
      const data = await apiJson<{ ok: true; suggestion: string; fields: any }>(`/api/teachers/lesson-notes/ai-support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonNoteId: note.id, mode }),
      });
      setAiSuggestion(data.suggestion);
      setAiFields(data.fields);
      pushToast({ tone: "info", title: "AI ready", message: "Review the suggestion and apply if useful." }, 2800);
    } catch (e: any) {
      setAiErr(e?.message || "AI support failed.");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiToEmptyOnly() {
    if (!aiFields) return;

    let applied = 0;

    if (!lessonTitle.trim() && aiFields.lessonTitle) {
      setLessonTitle(aiFields.lessonTitle);
      applied++;
    }
    if (!objectives.trim() && aiFields.objectives) {
      setObjectives(aiFields.objectives);
      applied++;
    }
    if (!tlr.trim() && aiFields.teachingLearningResources) {
      setTlr(aiFields.teachingLearningResources);
      applied++;
    }
    if (!intro.trim() && aiFields.introduction) {
      setIntro(aiFields.introduction);
      applied++;
    }
    if (!dev.trim() && aiFields.lessonDevelopment) {
      setDev(aiFields.lessonDevelopment);
      applied++;
    }
    if (!concl.trim() && aiFields.conclusion) {
      setConcl(aiFields.conclusion);
      applied++;
    }
    if (!assessment.trim() && aiFields.assessment) {
      setAssessment(aiFields.assessment);
      applied++;
    }
    if (!homework.trim() && aiFields.homework) {
      setHomework(aiFields.homework);
      applied++;
    }
    if (!diff.trim() && aiFields.differentiationNotes) {
      setDiff(aiFields.differentiationNotes);
      applied++;
    }
    if (!refl.trim() && aiFields.reflectionNotes) {
      setRefl(aiFields.reflectionNotes);
      applied++;
    }

    pushToast({
      tone: "success",
      title: "AI applied",
      message: applied ? `Applied ${applied} section(s) to empty fields only.` : "Nothing applied (fields already filled).",
    });
  }

  // Auto-load units when dialog opens
  useEffect(() => {
    if (!unitOpen) return;
    void loadUnits({ includeWeek: true }); // strict first
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitOpen]);

  if (loading) return <div className="p-6 text-sm text-zinc-700">Loading…</div>;

  if (pageErr) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{pageErr}</div>
      </div>
    );
  }

  if (!note) return <div className="p-6 text-sm text-zinc-700">Not found.</div>;

  const statusTone =
    note.status === "APPROVED" ? "ok" : note.status === "SUBMITTED" ? "info" : note.status === "REJECTED" ? "warn" : "muted";

  const unitQueryPreview = buildUnitsQueryString(unitMode);

  const lessonTitlePlaceholder = note.curriculumUnitId || note.schemeOfWorkItemId
    ? (note.substrand ? `Auto title: ${note.substrand}` : "Auto-filled from Sub-strand after linking unit.")
    : "Auto-filled from Sub-strand after linking unit.";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      <ConfirmDialog
        open={confirmOpen}
        title="Submit lesson note?"
        message="After submission, the lesson note becomes locked until it is returned or approved."
        confirmText="Submit"
        cancelText="Cancel"
        onConfirm={() => void submitNow()}
        onClose={() => setConfirmOpen(false)}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-semibold text-zinc-900">Lesson Note Editor</h1>
            <Badge tone={statusTone}>{note.status}</Badge>
            {dirty ? <Badge tone="warn">Unsaved changes</Badge> : <Badge tone="muted">All changes saved</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-600">{context}</p>

          {note.headteacherComment ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-semibold">Headteacher comment</div>
              <div className="mt-1 whitespace-pre-wrap">{note.headteacherComment}</div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            onClick={() => router.push("/teacher/lesson-notes")}
          >
            Back
          </button>

          <button
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
            onClick={() => router.push(`/teacher/lesson-notes/${note.id}/print`)}
          >
            Print
          </button>

          <button
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
            disabled={locked || saving}
            onClick={() => void saveDraft()}
            title={locked ? "Locked while submitted/approved." : "Ctrl+S"}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>

          <button
            className="rounded-xl border border-black bg-black px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={locked || !submitChecks.canSubmit || submitting}
            onClick={() => setConfirmOpen(true)}
            title={
              locked
                ? "Locked while submitted/approved."
                : submitChecks.canSubmit
                  ? ""
                  : "Link a unit and fill objectives, lesson development, assessment."
            }
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>

      {/* Submission readiness */}
      <div className="mt-4 rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Submission checklist</div>
            <div className="mt-1 text-xs text-zinc-500">Submit is only enabled when all required items are satisfied.</div>
          </div>
          <div>{submitChecks.canSubmit ? <Badge tone="ok">Ready to submit</Badge> : <Badge tone="warn">Not ready</Badge>}</div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <ChecklistItem ok={submitChecks.hasUnit} label="Unit linked (scheme-backed)" />
          <ChecklistItem ok={submitChecks.hasIndicator} label="Indicator present" />
          <ChecklistItem ok={submitChecks.hasObjectives} label="Objectives filled" />
          <ChecklistItem ok={submitChecks.hasDev} label="Lesson development filled" />
          <ChecklistItem ok={submitChecks.hasAssessment} label="Assessment filled" />
        </div>

        {!submitChecks.canSubmit ? (
          <div className="mt-3 text-xs text-zinc-600">
            Fix the unchecked items. Most importantly: <span className="font-medium">Link the correct unit</span>.
          </div>
        ) : null}
      </div>

      {/* Unit Link */}
      <div className="mt-4 rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-zinc-900">NaCCA link</div>
            <div className="text-xs text-zinc-500 mt-1">Pulled from your Scheme of Work (term/year/subject/level scoped).</div>
          </div>

          <button
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
            disabled={locked}
            onClick={() => setUnitOpen(true)}
          >
            {note.curriculumUnitId ? "Change unit" : "Link unit"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <InfoBox label="Strand" value={note.strand || "—"} />
          <InfoBox label="Sub-strand" value={note.substrand || "—"} />
          <InfoBox label="Content standard" value={note.contentStandard || "—"} />
          <InfoBox label="Indicator" value={note.indicator || "—"} />
        </div>

        {unitOpen ? (
          <div className="mt-4 rounded-2xl border bg-zinc-50 p-3">
            {/* ...unchanged unit picker UI... */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">Pick unit from scheme</div>
              <button
                className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs hover:bg-zinc-50"
                onClick={() => setUnitOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <input
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                placeholder="Search indicator code / text..."
                value={unitQ}
                onChange={(e) => setUnitQ(e.target.value)}
              />
              <button
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                disabled={unitsLoading}
                onClick={() => void loadUnits()}
              >
                Search
              </button>
            </div>

            <div className="mt-3 rounded-xl border bg-white p-3">
              <div className="text-xs font-semibold text-zinc-800">Filters used</div>
              <div className="mt-1 text-[11px] text-zinc-600 break-all">{unitQueryPreview || "—"}</div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-60"
                  disabled={unitsLoading}
                  onClick={() => void loadUnits({ includeWeek: true })}
                  title="Strict: match note week first."
                >
                  Strict: match week
                </button>

                <button
                  type="button"
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-60"
                  disabled={unitsLoading}
                  onClick={() => void loadUnits({ includeWeek: false })}
                  title="Widen: ignore week, return all scheme items."
                >
                  Widen: ignore week
                </button>
              </div>

              <div className="mt-2 text-[11px] text-zinc-500">
                If strict finds nothing, widen. If widen finds nothing: your scheme scope doesn’t match the lesson note scope.
              </div>

              {unitsMeta?.widened ? (
                <div className="mt-2">
                  <Badge tone="info">Showing widened results</Badge>
                </div>
              ) : null}
            </div>

            {unitErr ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{unitErr}</div>
            ) : null}

            {unitsLoading ? (
              <div className="mt-3 text-sm text-zinc-700">Loading…</div>
            ) : (
              <div className="mt-3 max-h-[380px] overflow-auto rounded-2xl border bg-white">
                {units.length === 0 ? (
                  <div className="p-3 text-sm text-zinc-700">
                    <div className="font-semibold">No units found.</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Try <span className="font-medium">Widen: ignore week</span>. If still none, your lesson note scope and scheme scope don’t match.
                      {unitsMeta?.reason || unitsMeta?.message ? (
                        <div className="mt-2 text-[11px] text-zinc-600 whitespace-pre-wrap">
                          {unitsMeta.message ? unitsMeta.message : null}
                          {!unitsMeta.message && unitsMeta.reason ? `Reason: ${unitsMeta.reason}` : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {units.map((u, idx) => {
                      const cs = u.contentStandardCode
                        ? `${u.contentStandardCode}${u.contentStandardDescription ? ` — ${u.contentStandardDescription}` : ""}`
                        : u.contentStandardDescription || "—";

                      const ind = u.indicatorCode
                        ? `${u.indicatorCode}${u.indicatorDescription ? ` — ${u.indicatorDescription}` : ""}`
                        : u.indicatorDescription || "—";

                      const stableKey =
                        trimOrEmpty(u.curriculumUnitId) ||
                        trimOrEmpty(u.schemeOfWorkItemId) ||
                        trimOrEmpty(u.schemeItemId) ||
                        `${u.weekNumber}-${trimOrEmpty(u.indicatorCode) || "na"}-${idx}`;

                      return (
                        <li key={stableKey} className="p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900">{ind}</div>
                            <div className="mt-1 text-xs text-zinc-600">
                              {u.strandTitle || "—"} • {u.subStrandTitle || "—"} • {cs}
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-500">
                              Week: <span className="font-medium">{u.weekNumber}</span>
                            </div>
                          </div>

                          <button
                            className="shrink-0 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                            disabled={locked}
                            onClick={() => void pickUnit(u)}
                          >
                            Select
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Main grid */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fields */}
        <div className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold text-zinc-900">Lesson fields</div>
            {locked ? <Badge tone="warn">Locked</Badge> : <Badge tone="info">Editable</Badge>}
          </div>

          <div className="mt-3 grid gap-3">
            <Field
              label="Lesson title"
              value={lessonTitle}
              onChange={setLessonTitle}
              disabled={locked}
              rows={2}
              placeholder={lessonTitlePlaceholder}
              hint="Leave blank until you link a unit. Title will auto-fill from Sub-strand."
            />
            <Field label="Objectives" value={objectives} onChange={setObjectives} disabled={locked} rows={6} />
            <Field label="Teaching & learning resources" value={tlr} onChange={setTlr} disabled={locked} rows={6} />
            <Field label="Introduction" value={intro} onChange={setIntro} disabled={locked} rows={5} />
            <Field label="Lesson development" value={dev} onChange={setDev} disabled={locked} rows={10} />
            <Field label="Conclusion" value={concl} onChange={setConcl} disabled={locked} rows={4} />
            <Field label="Assessment" value={assessment} onChange={setAssessment} disabled={locked} rows={6} />
            <Field label="Homework" value={homework} onChange={setHomework} disabled={locked} rows={3} />
            <Field label="Differentiation notes" value={diff} onChange={setDiff} disabled={locked} rows={5} />
            <Field label="Reflection notes" value={refl} onChange={setRefl} disabled={locked} rows={4} />
          </div>

          <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
            <div className="text-[11px] text-zinc-500">
              Tip: Use <span className="font-medium">Ctrl+S</span> to save.
            </div>
            <button
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
              disabled={locked || saving}
              onClick={() => void saveDraft()}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
        </div>

        {/* AI */}
        <div className="rounded-2xl border bg-white p-4">
          {/* ...unchanged AI panel... */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-zinc-900">AI Co-Tutor</div>
              <div className="mt-1 text-xs text-zinc-500">Draft fast, then refine. It will not bypass submission rules.</div>
            </div>

            <div className="flex gap-2">
              <button
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                disabled={aiLoading}
                onClick={() => void runAi("QUICK")}
              >
                Quick
              </button>
              <button
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                disabled={aiLoading}
                onClick={() => void runAi("FULL")}
              >
                Full
              </button>
            </div>
          </div>

          {!note.curriculumUnitId ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Link a unit first. AI becomes far more grounded when indicator is present.
            </div>
          ) : null}

          {aiErr ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{aiErr}</div>
          ) : null}

          {aiLoading ? (
            <div className="mt-3 text-sm text-zinc-700">Generating…</div>
          ) : aiSuggestion ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-semibold text-zinc-900">Suggestion</div>
                <button
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  onClick={applyAiToEmptyOnly}
                >
                  Apply to empty only
                </button>
              </div>

              <textarea
                className="w-full rounded-2xl border border-zinc-300 bg-white p-3 text-xs h-[420px] focus:outline-none"
                readOnly
                value={aiSuggestion}
              />
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">Run AI after linking a unit. Otherwise it’s forced to guess.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-zinc-50 px-3 py-2">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
          ok ? "bg-emerald-600 text-white" : "bg-zinc-300 text-zinc-700"
        }`}
      >
        {ok ? "✓" : "•"}
      </span>
      <span className="text-sm text-zinc-900">{label}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-sm text-zinc-900 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
