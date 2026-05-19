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
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
        : tone === "info"
          ? "border-sky-300/20 bg-sky-400/12 text-sky-100"
          : "border-white/10 bg-white/5 text-[#D0D6E2]";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${cls}`}>{children}</span>;
}

function ToastViewport(props: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed right-3 top-3 z-[60] w-[min(420px,calc(100vw-24px))] space-y-2">
      {props.toasts.map((t) => {
        const cls =
          t.tone === "success"
            ? "border-emerald-300/20 bg-[#08111F]/95 text-emerald-100"
            : t.tone === "error"
              ? "border-rose-300/20 bg-[#1A0E14]/95 text-rose-100"
              : t.tone === "warn"
                ? "border-amber-300/20 bg-[#181109]/95 text-amber-100"
                : "border-sky-300/20 bg-[#08111F]/95 text-sky-100";
        return (
          <div key={t.id} className={`rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl ${cls}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.message ? <div className="mt-1 whitespace-pre-wrap text-xs opacity-90">{t.message}</div> : null}
              </div>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
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
      ? "bg-rose-600 border-rose-600 text-white hover:bg-rose-700"
      : "bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] border-transparent text-[#071A3D] hover:opacity-95";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.96),rgba(7,26,61,0.96),rgba(5,7,11,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.35)]">
        <div className="space-y-2">
          <div className="text-lg font-semibold text-[#F7F4ED]">{props.title}</div>
          <div className="text-sm text-[#C9CDD6]">{props.message}</div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10"
            onClick={props.onClose}
          >
            {props.cancelText ?? "Cancel"}
          </button>
          <button
            type="button"
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${btn}`}
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
      <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#F7F4ED]">
        {props.label}
      </label>

      {props.hint ? (
        <div className="mt-1 text-[12px] leading-5 text-[#DDE3EE]">
          {props.hint}
        </div>
      ) : null}

      <textarea
        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-3 text-[15px] leading-7 text-slate-950 shadow-inner placeholder:text-slate-500 focus:border-[#D4AF37] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/20 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-700"
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

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [unitOpen, setUnitOpen] = useState(false);
  const [unitQ, setUnitQ] = useState("");
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [units, setUnits] = useState<SchemeUnit[]>([]);
  const [unitErr, setUnitErr] = useState<string | null>(null);
  const [unitsMeta, setUnitsMeta] = useState<{ widened?: boolean; message?: string; reason?: string } | null>(null);

  const [unitMode, setUnitMode] = useState<UnitQueryMode>({ includeWeek: true });

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

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

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

    const payloads: Array<{ label: string; body: any }> = [];

    if (cu) payloads.push({ label: "curriculumUnitId", body: { lessonNoteId: note.id, curriculumUnitId: cu } });
    if (si) payloads.push({ label: "schemeOfWorkItemId", body: { lessonNoteId: note.id, schemeOfWorkItemId: si } });
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
        if (shouldRetryLinkPayload(msg)) continue;
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

  useEffect(() => {
    if (!unitOpen) return;
    void loadUnits({ includeWeek: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitOpen]);

  if (loading) return <div className="p-6 text-sm text-[#C9CDD6]">Loading…</div>;

  if (pageErr) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">{pageErr}</div>
      </div>
    );
  }

  if (!note) return <div className="p-6 text-sm text-[#C9CDD6]">Not found.</div>;

  const statusTone =
    note.status === "APPROVED" ? "ok" : note.status === "SUBMITTED" ? "info" : note.status === "REJECTED" ? "warn" : "muted";

  const unitQueryPreview = buildUnitsQueryString(unitMode);

  const lessonTitlePlaceholder =
    note.curriculumUnitId || note.schemeOfWorkItemId
      ? (note.substrand ? `Auto title: ${note.substrand}` : "Auto-filled from Sub-strand after linking unit.")
      : "Auto-filled from Sub-strand after linking unit.";

  return (
    <div className="space-y-6">
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

      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Teacher</p>
              <Badge tone={statusTone}>{note.status}</Badge>
              {dirty ? <Badge tone="warn">Unsaved changes</Badge> : <Badge tone="muted">All changes saved</Badge>}
            </div>

            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#F7F4ED] md:text-3xl">
              Lesson Note Editor
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">{context}</p>

            {note.headteacherComment ? (
              <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/12 px-4 py-3 text-sm text-amber-100">
                <div className="font-semibold">Headteacher comment</div>
                <div className="mt-1 whitespace-pre-wrap">{note.headteacherComment}</div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10"
              onClick={() => router.push("/teacher/lesson-notes")}
            >
              Back
            </button>

            <button
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10"
              onClick={() => router.push(`/teacher/lesson-notes/${note.id}/print`)}
            >
              Print
            </button>

            <button
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
              disabled={locked || saving}
              onClick={() => void saveDraft()}
              title={locked ? "Locked while submitted/approved." : "Ctrl+S"}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>

            <button
              className="rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] disabled:opacity-60"
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
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-[#F7F4ED]">Submission checklist</div>
            <div className="mt-1 text-xs text-[#8F98A8]">Submit is only enabled when all required items are satisfied.</div>
          </div>
          <div>{submitChecks.canSubmit ? <Badge tone="ok">Ready to submit</Badge> : <Badge tone="warn">Not ready</Badge>}</div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <ChecklistItem ok={submitChecks.hasUnit} label="Unit linked (scheme-backed)" />
          <ChecklistItem ok={submitChecks.hasIndicator} label="Indicator present" />
          <ChecklistItem ok={submitChecks.hasObjectives} label="Objectives filled" />
          <ChecklistItem ok={submitChecks.hasDev} label="Lesson development filled" />
          <ChecklistItem ok={submitChecks.hasAssessment} label="Assessment filled" />
        </div>

        {!submitChecks.canSubmit ? (
          <div className="mt-3 text-xs text-[#C9CDD6]">
            Fix the unchecked items. Most importantly: <span className="font-medium text-[#F7F4ED]">Link the correct unit</span>.
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-[#F7F4ED]">NaCCA link</div>
            <div className="mt-1 text-xs text-[#8F98A8]">Pulled from your Scheme of Work (term/year/subject/level scoped).</div>
          </div>

          <button
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
            disabled={locked}
            onClick={() => setUnitOpen(true)}
          >
            {note.curriculumUnitId ? "Change unit" : "Link unit"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoBox label="Strand" value={note.strand || "—"} />
          <InfoBox label="Sub-strand" value={note.substrand || "—"} />
          <InfoBox label="Content standard" value={note.contentStandard || "—"} />
          <InfoBox label="Indicator" value={note.indicator || "—"} />
        </div>

        {unitOpen ? (
          <div className="mt-4 rounded-[24px] border border-white/10 bg-[#07111F]/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[#F7F4ED]">Pick unit from scheme</div>
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#F7F4ED] hover:bg-white/10"
                onClick={() => setUnitOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow-inner placeholder:text-slate-500 focus:border-[#D4AF37] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/20"
                placeholder="Search indicator code / text..."
                value={unitQ}
                onChange={(e) => setUnitQ(e.target.value)}
              />
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
                disabled={unitsLoading}
                onClick={() => void loadUnits()}
              >
                Search
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-semibold text-[#F7F4ED]">Filters used</div>
              <div className="mt-1 break-all text-[11px] text-[#AEB6C4]">{unitQueryPreview || "—"}</div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
                  disabled={unitsLoading}
                  onClick={() => void loadUnits({ includeWeek: true })}
                  title="Strict: match note week first."
                >
                  Strict: match week
                </button>

                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
                  disabled={unitsLoading}
                  onClick={() => void loadUnits({ includeWeek: false })}
                  title="Widen: ignore week, return all scheme items."
                >
                  Widen: ignore week
                </button>
              </div>

              <div className="mt-2 text-[11px] text-[#8F98A8]">
                If strict finds nothing, widen. If widen finds nothing: your scheme scope doesn’t match the lesson note scope.
              </div>

              {unitsMeta?.widened ? (
                <div className="mt-2">
                  <Badge tone="info">Showing widened results</Badge>
                </div>
              ) : null}
            </div>

            {unitErr ? (
              <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-sm text-rose-100">{unitErr}</div>
            ) : null}

            {unitsLoading ? (
              <div className="mt-3 text-sm text-[#C9CDD6]">Loading…</div>
            ) : (
              <div className="mt-3 max-h-[380px] overflow-auto rounded-2xl border border-slate-300 bg-white text-slate-950 shadow-inner">
                {units.length === 0 ? (
                  <div className="p-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-950">No units found.</div>
                    <div className="mt-1 text-xs text-[#8F98A8]">
                      Try <span className="font-bold text-slate-950">Widen: ignore week</span>. If still none, your lesson note scope and scheme scope don’t match.
                      {unitsMeta?.reason || unitsMeta?.message ? (
                        <div className="mt-2 whitespace-pre-wrap text-[11px] font-medium text-slate-600">
                          {unitsMeta.message ? unitsMeta.message : null}
                          {!unitsMeta.message && unitsMeta.reason ? `Reason: ${unitsMeta.reason}` : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200">
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
                        <li key={stableKey} className="flex items-start justify-between gap-3 p-3 hover:bg-amber-50">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-950">{ind}</div>
                            <div className="mt-1 text-xs leading-5 text-slate-700">
                              {u.strandTitle || "—"} • {u.subStrandTitle || "—"} • {cs}
                            </div>
                            <div className="mt-1 text-[11px] font-medium text-slate-600">
                              Week: <span className="font-bold text-slate-950">{u.weekNumber}</span>
                            </div>
                          </div>

                          <button
                            className="shrink-0 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/15 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-[#D4AF37]/25 disabled:opacity-60"
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
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold text-[#F7F4ED]">Lesson fields</div>
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
            <div className="text-[11px] text-[#8F98A8]">
              Tip: Use <span className="font-medium text-[#F7F4ED]">Ctrl+S</span> to save.
            </div>
            <button
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
              disabled={locked || saving}
              onClick={() => void saveDraft()}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-[#F7F4ED]">AI Co-Tutor</div>
              <div className="mt-1 text-xs text-[#8F98A8]">Draft fast, then refine. It will not bypass submission rules.</div>
            </div>

            <div className="flex gap-2">
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
                disabled={aiLoading}
                onClick={() => void runAi("QUICK")}
              >
                Quick
              </button>
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
                disabled={aiLoading}
                onClick={() => void runAi("FULL")}
              >
                Full
              </button>
            </div>
          </div>

          {!note.curriculumUnitId ? (
            <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/12 px-4 py-3 text-sm text-amber-100">
              Link a unit first. AI becomes far more grounded when indicator is present.
            </div>
          ) : null}

          {aiErr ? (
            <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">{aiErr}</div>
          ) : null}

          {aiLoading ? (
            <div className="mt-3 text-sm text-[#C9CDD6]">Generating…</div>
          ) : aiSuggestion ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-semibold text-[#F7F4ED]">Suggestion</div>
                <button
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10"
                  onClick={applyAiToEmptyOnly}
                >
                  Apply to empty only
                </button>
              </div>

              <textarea
  className="h-[420px] w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-950 shadow-inner focus:outline-none"
  readOnly
  value={aiSuggestion}
/>
            </div>
          ) : (
            <div className="mt-3 text-sm text-[#C9CDD6]">Run AI after linking a unit. Otherwise it’s forced to guess.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white px-3 py-2 shadow-sm">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
          ok ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"
        }`}
      >
        {ok ? "✓" : "•"}
      </span>
      <span className="text-sm font-semibold text-slate-950">{label}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-600">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-950">
        {value}
      </div>
    </div>
  );
}