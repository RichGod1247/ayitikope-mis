//src/app/headteacher/teacher-appraisal/ui.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ScoreChoice = 1 | 2 | 3 | 4 | 5 | "na" | null;
type AppraisalStatus = "DRAFT" | "FINALIZED";

type RubricItem = { key: string; order: number; label: string };
type RubricSection = {
  key: string;
  title: string;
  order: number;
  maxScore: number;
  items: RubricItem[];
};

type TeacherItem = {
  teacherUserId: string;
  staffId: string | null;
  name: string;
  email: string | null;
  phase: string | null;
  classLevel: string | null;
  primaryClassroomId: string | null;
  primaryClassroomName: string | null;
};

type EvidenceOption = { value: string; label: string; classroomId?: string | null };

type EvidenceScheme = {
  id: string;
  subject: string | null;
  level: string | null;
  term: string | null;
  academicYear: string | null;
  classroomId: string | null;
  approvedAt: string | null;
  updatedAt: string | null;
  itemCount: number;
};

type EvidenceNote = {
  id: string;
  subject: string | null;
  level: string | null;
  term: string | null;
  academicYear: string | null;
  classroomId: string | null;
  lessonTitle: string | null;
  substrand: string | null;
  weekNumber: number | null;
  approvedAt: string | null;
  updatedAt: string | null;
};

type EvidenceDelivery = {
  id: string;
  classroomId: string | null;
  subject: string | null;
  term: string | null;
  academicYear: string | null;
  lessonNoteId: string | null;
  dateTaught: string | null;
  contentStandardCode: string | null;
  indicatorCode: string | null;
  assessmentItemCount: number;
  assessmentScoreCount: number;
};

type EvidenceResp =
  | {
      ok: true;
      current?: { term: string | null; academicYear: string | null };
      teacher: { teacherUserId: string; name: string; staffId: string | null };
      classOptions?: EvidenceOption[];
      subjectOptions?: EvidenceOption[];
      termOptions?: EvidenceOption[];
      academicYearOptions?: EvidenceOption[];
      schemes: EvidenceScheme[];
      lessonNotes: EvidenceNote[];
      lessonDeliveries: EvidenceDelivery[];
    }
  | { ok: false; error: string };

type AppraisalScore = {
  itemKey: string;
  score: number | null;
  notApplicable: boolean;
};

type AppraisalItem = {
  id: string;
  teacherUserId: string;
  teacherName: string;
  classroomId: string | null;
  classroomName?: string | null;
  dateObserved: string;
  classTaught: string | null;
  term?: string | null;
  academicYear?: string | null;
  subject: string | null;
  subStrand?: string | null;
  durationMinutes?: number | null;
  yearsInService?: number | null;
  yearsInPresentSchool?: number | null;
  schemeOfWorkId?: string | null;
  lessonNoteId?: string | null;
  lessonDeliveryId?: string | null;
  status: AppraisalStatus;
  overallPercentage: number | null;
  preparationPercent?: number | null;
  lessonDeliveryPercent?: number | null;
  classroomCulturePercent?: number | null;
  learnerParticipationPercent?: number | null;
  understandingStrategiesPercent?: number | null;
  evaluationStrategiesPercent?: number | null;
  generalComment?: string | null;
  finalizedAt: string | null;
  updatedAt: string;
  scores?: AppraisalScore[];
};

type LoadResp<T> = ({ ok: true } & T) | { ok: false; error: string };

type FormState = {
  id: string | null;
  teacherUserId: string;
  classroomId: string;
  dateObserved: string;
  classTaught: string;
  term: string;
  academicYear: string;
  subject: string;
  subStrand: string;
  durationMinutes: string;
  yearsInService: string;
  yearsInPresentSchool: string;
  schemeOfWorkId: string;
  lessonNoteId: string;
  lessonDeliveryId: string;
  generalComment: string;
};

const emptyForm = (): FormState => ({
  id: null,
  teacherUserId: "",
  classroomId: "",
  dateObserved: new Date().toISOString().slice(0, 10),
  classTaught: "",
  term: "",
  academicYear: "",
  subject: "",
  subStrand: "",
  durationMinutes: "",
  yearsInService: "",
  yearsInPresentSchool: "",
  schemeOfWorkId: "",
  lessonNoteId: "",
  lessonDeliveryId: "",
  generalComment: "",
});

const sectionPercentKeys: Record<string, keyof AppraisalItem> = {
  PREPARATION: "preparationPercent",
  LESSON_DELIVERY: "lessonDeliveryPercent",
  CLASSROOM_CULTURE: "classroomCulturePercent",
  LEARNER_PARTICIPATION: "learnerParticipationPercent",
  UNDERSTANDING_STRATEGIES: "understandingStrategiesPercent",
  EVALUATION_STRATEGIES: "evaluationStrategiesPercent",
};

const DEFAULT_TERMS: EvidenceOption[] = [
  { value: "1st Term", label: "1st Term" },
  { value: "2nd Term", label: "2nd Term" },
  { value: "3rd Term", label: "3rd Term" },
];

function addUniqueOption(options: EvidenceOption[], option: EvidenceOption | null | undefined) {
  if (!option?.value || !option.label) return;
  if (options.some((o) => o.value === option.value)) return;
  options.push(option);
}

function currentAcademicYearOptions(current?: string | null) {
  const out: EvidenceOption[] = [];
  if (current) addUniqueOption(out, { value: current, label: current });

  const now = new Date();
  const start = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  for (let y = start - 1; y <= start + 1; y++) {
    const label = `${y}/${y + 1}`;
    addUniqueOption(out, { value: label, label });
  }

  return out;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!json) throw new Error(`Failed to parse response (${res.status}).`);
  return json;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return v.slice(0, 10);
}

function fmtPercent(v: number | null | undefined) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v))}%`;
}

function evidenceLabel(prefix: string, subject?: string | null, detail?: string | null, date?: string | null) {
  const parts = [prefix, subject, detail, date ? fmtDate(date) : null].filter(Boolean);
  return parts.join(" · ");
}

function scoreToChoice(score?: AppraisalScore | null): ScoreChoice {
  if (!score) return null;
  if (score.notApplicable) return "na";
  if (score.score === 1 || score.score === 2 || score.score === 3 || score.score === 4 || score.score === 5) return score.score;
  return null;
}

function choiceTone(choice: ScoreChoice) {
  if (choice === "na") return "border-slate-400/30 bg-slate-400/10 text-slate-100";
  if (choice == null) return "border-white/10 bg-white/[0.03] text-slate-300";
  if (choice <= 2) return "border-rose-300/30 bg-rose-400/10 text-rose-100";
  if (choice === 3) return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
}

export default function TeacherAppraisalClient() {
  const [sections, setSections] = useState<RubricSection[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [items, setItems] = useState<AppraisalItem[]>([]);
  const [evidence, setEvidence] = useState<EvidenceResp | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [scores, setScores] = useState<Record<string, ScoreChoice>>({});
  const [loading, setLoading] = useState(true);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [saving, setSaving] = useState<"save" | "finalize" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const allItems = useMemo(() => sections.flatMap((s) => s.items.map((item) => ({ ...item, section: s }))), [sections]);
  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.teacherUserId === form.teacherUserId) ?? null,
    [teachers, form.teacherUserId],
  );

  const classOptions = useMemo(() => {
    const out: EvidenceOption[] = [];
    if (evidence?.ok) {
      for (const option of evidence.classOptions ?? []) addUniqueOption(out, option);
    }
    if (selectedTeacher?.primaryClassroomId && selectedTeacher.primaryClassroomName) {
      addUniqueOption(out, {
        value: selectedTeacher.primaryClassroomId,
        label: selectedTeacher.primaryClassroomName,
        classroomId: selectedTeacher.primaryClassroomId,
      });
    }
    return out;
  }, [evidence, selectedTeacher]);

  const subjectOptions = useMemo(() => {
    const out: EvidenceOption[] = [];
    if (evidence?.ok) {
      for (const option of evidence.subjectOptions ?? []) addUniqueOption(out, option);
      for (const row of [...evidence.schemes, ...evidence.lessonNotes, ...evidence.lessonDeliveries]) {
        if (row.subject) addUniqueOption(out, { value: row.subject, label: row.subject });
      }
    }
    if (form.subject) addUniqueOption(out, { value: form.subject, label: form.subject });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [evidence, form.subject]);

  const termOptions = useMemo(() => {
    const out: EvidenceOption[] = [];
    if (evidence?.ok) for (const option of evidence.termOptions ?? []) addUniqueOption(out, option);
    for (const option of DEFAULT_TERMS) addUniqueOption(out, option);
    if (form.term) addUniqueOption(out, { value: form.term, label: form.term });
    return out;
  }, [evidence, form.term]);

  const academicYearOptions = useMemo(() => {
    const out: EvidenceOption[] = [];
    if (evidence?.ok) for (const option of evidence.academicYearOptions ?? []) addUniqueOption(out, option);
    for (const option of currentAcademicYearOptions(evidence?.ok ? evidence.current?.academicYear : null)) addUniqueOption(out, option);
    if (form.academicYear) addUniqueOption(out, { value: form.academicYear, label: form.academicYear });
    return out;
  }, [evidence, form.academicYear]);

  const classSelectValue = useMemo(() => {
    const byId = classOptions.find((o) => o.classroomId && o.classroomId === form.classroomId) ?? classOptions.find((o) => o.value === form.classroomId);
    if (byId) return byId.value;
    return classOptions.find((o) => o.label === form.classTaught)?.value ?? "";
  }, [classOptions, form.classroomId, form.classTaught]);

  const filteredDeliveries = useMemo(() => {
    if (!evidence?.ok) return [];
    if (!form.lessonNoteId) return evidence.lessonDeliveries;
    const linked = evidence.lessonDeliveries.filter((d) => d.lessonNoteId === form.lessonNoteId);
    return linked.length ? linked : evidence.lessonDeliveries;
  }, [evidence, form.lessonNoteId]);

  function classLabelForId(classroomId: string | null | undefined) {
    if (!classroomId) return null;
    return classOptions.find((o) => o.classroomId === classroomId || o.value === classroomId)?.label ?? null;
  }

  const completion = useMemo(() => {
    if (!allItems.length) return 0;
    const done = allItems.filter((i) => scores[i.key] != null).length;
    return Math.round((done / allItems.length) * 100);
  }, [allItems, scores]);

  const canFinalize = Boolean(form.teacherUserId && form.dateObserved && allItems.length && completion === 100);

  const loadList = useCallback(async () => {
    const json = await fetchJson<LoadResp<{ items: AppraisalItem[] }>>("/api/headteacher/teacher-appraisal");
    if (!json.ok) throw new Error(json.error);
    setItems(Array.isArray(json.items) ? json.items : []);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rubric, teacherResp] = await Promise.all([
        fetchJson<LoadResp<{ sections: RubricSection[] }>>("/api/headteacher/teacher-appraisal?mode=rubric"),
        fetchJson<LoadResp<{ teachers: TeacherItem[] }>>("/api/headteacher/teacher-appraisal?mode=teachers"),
      ]);

      if (!rubric.ok) throw new Error(rubric.error);
      if (!teacherResp.ok) throw new Error(teacherResp.error);

      setSections(rubric.sections ?? []);
      setTeachers(teacherResp.teachers ?? []);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load teacher appraisal.");
    } finally {
      setLoading(false);
    }
  }, [loadList]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function loadEvidence(teacherUserId: string) {
    if (!teacherUserId) {
      setEvidence(null);
      return;
    }

    setEvidenceLoading(true);
    setError(null);
    try {
      const json = await fetchJson<EvidenceResp>(
        `/api/headteacher/teacher-appraisal?mode=evidence&teacherUserId=${encodeURIComponent(teacherUserId)}`,
      );
      setEvidence(json);
      if (!json.ok) {
        setError(json.error);
        return;
      }
      setForm((prev) => ({
        ...prev,
        term: prev.term || json.current?.term || "",
        academicYear: prev.academicYear || json.current?.academicYear || "",
      }));
    } catch (err) {
      setEvidence(null);
      setError(err instanceof Error ? err.message : "Failed to load teacher evidence.");
    } finally {
      setEvidenceLoading(false);
    }
  }

  function startNew(teacherUserId?: string) {
    const next = emptyForm();
    next.teacherUserId = teacherUserId ?? "";
    setForm(next);
    setScores({});
    setEvidence(null);
    setSuccess(null);
    setError(null);
    if (teacherUserId) void loadEvidence(teacherUserId);
  }

  async function loadDetail(id: string) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const json = await fetchJson<LoadResp<{ item: AppraisalItem; sections: RubricSection[] }>>(
        `/api/headteacher/teacher-appraisal?id=${encodeURIComponent(id)}`,
      );
      if (!json.ok) throw new Error(json.error);
      const item = json.item;
      setSections(json.sections ?? sections);
      setForm({
        id: item.id,
        teacherUserId: item.teacherUserId,
        classroomId: item.classroomId ?? "",
        dateObserved: item.dateObserved,
        classTaught: item.classTaught ?? "",
        term: item.term ?? "",
        academicYear: item.academicYear ?? "",
        subject: item.subject ?? "",
        subStrand: item.subStrand ?? "",
        durationMinutes: item.durationMinutes == null ? "" : String(item.durationMinutes),
        yearsInService: item.yearsInService == null ? "" : String(item.yearsInService),
        yearsInPresentSchool: item.yearsInPresentSchool == null ? "" : String(item.yearsInPresentSchool),
        schemeOfWorkId: item.schemeOfWorkId ?? "",
        lessonNoteId: item.lessonNoteId ?? "",
        lessonDeliveryId: item.lessonDeliveryId ?? "",
        generalComment: item.generalComment ?? "",
      });
      const nextScores: Record<string, ScoreChoice> = {};
      for (const s of item.scores ?? []) nextScores[s.itemKey] = scoreToChoice(s);
      setScores(nextScores);
      await loadEvidence(item.teacherUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appraisal detail.");
    } finally {
      setLoading(false);
    }
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function chooseTeacher(teacherUserId: string) {
    const teacher = teachers.find((t) => t.teacherUserId === teacherUserId) ?? null;
    setForm((prev) => ({
      ...emptyForm(),
      teacherUserId,
      classTaught: teacher?.primaryClassroomName ?? "",
      classroomId: teacher?.primaryClassroomId ?? "",
    }));
    setScores({});
    setSuccess(null);
    setError(null);
    void loadEvidence(teacherUserId);
  }

  function chooseClass(value: string) {
    const option = classOptions.find((o) => o.value === value) ?? null;
    setForm((prev) => ({
      ...prev,
      classroomId: option?.classroomId ?? (option?.value && !option.value.startsWith("label:") ? option.value : ""),
      classTaught: option?.label ?? "",
    }));
  }

  function chooseScheme(id: string) {
    const scheme = evidence?.ok ? evidence.schemes.find((s) => s.id === id) : null;
    setForm((prev) => ({
      ...prev,
      schemeOfWorkId: id,
      classroomId: scheme?.classroomId ?? prev.classroomId,
      classTaught: classLabelForId(scheme?.classroomId) ?? prev.classTaught,
      subject: scheme?.subject ?? prev.subject,
      term: scheme?.term ?? prev.term,
      academicYear: scheme?.academicYear ?? prev.academicYear,
    }));
  }

  function chooseNote(id: string) {
    const note = evidence?.ok ? evidence.lessonNotes.find((n) => n.id === id) : null;
    const linkedDelivery = evidence?.ok ? evidence.lessonDeliveries.find((d) => d.lessonNoteId === id) : null;

    setForm((prev) => ({
      ...prev,
      lessonNoteId: id,
      lessonDeliveryId: linkedDelivery?.id ?? "",
      classroomId: note?.classroomId ?? prev.classroomId,
      classTaught: classLabelForId(note?.classroomId) ?? prev.classTaught,
      subject: note?.subject ?? prev.subject,
      term: note?.term ?? prev.term,
      academicYear: note?.academicYear ?? prev.academicYear,
      subStrand: note ? note.substrand ?? "" : "",
    }));
  }

  function chooseDelivery(id: string) {
    const delivery = evidence?.ok ? evidence.lessonDeliveries.find((d) => d.id === id) : null;
    const linkedNote = evidence?.ok && delivery?.lessonNoteId ? evidence.lessonNotes.find((n) => n.id === delivery.lessonNoteId) : null;

    setForm((prev) => ({
      ...prev,
      lessonDeliveryId: id,
      classroomId: delivery?.classroomId ?? prev.classroomId,
      classTaught: classLabelForId(delivery?.classroomId) ?? prev.classTaught,
      lessonNoteId: delivery?.lessonNoteId ?? prev.lessonNoteId,
      subject: delivery?.subject ?? linkedNote?.subject ?? prev.subject,
      term: delivery?.term ?? linkedNote?.term ?? prev.term,
      academicYear: delivery?.academicYear ?? linkedNote?.academicYear ?? prev.academicYear,
      subStrand: linkedNote?.substrand ?? prev.subStrand,
      dateObserved: delivery?.dateTaught ? delivery.dateTaught.slice(0, 10) : prev.dateObserved,
    }));
  }

  function sectionPercent(section: RubricSection) {
    let total = 0;
    let denominator = 0;
    for (const item of section.items) {
      const choice = scores[item.key];
      if (choice == null || choice === "na") continue;
      total += choice;
      denominator += 5;
    }
    if (!denominator) return null;
    return Math.round((total / denominator) * 100);
  }

  function scorePayload() {
    return allItems.map((item) => {
      const choice = scores[item.key];
      return {
        itemKey: item.key,
        score: typeof choice === "number" ? choice : null,
        notApplicable: choice === "na",
      };
    });
  }

  async function submit(action: "save" | "finalize") {
    setSaving(action);
    setError(null);
    setSuccess(null);

    try {
      const json = await fetchJson<LoadResp<{ item: AppraisalItem }>>("/api/headteacher/teacher-appraisal", {
        method: "POST",
        body: JSON.stringify({
          action,
          id: form.id,
          teacherUserId: form.teacherUserId,
          classroomId: form.classroomId || null,
          dateObserved: form.dateObserved,
          classTaught: form.classTaught || null,
          term: form.term || null,
          academicYear: form.academicYear || null,
          subject: form.subject || null,
          subStrand: form.subStrand || null,
          durationMinutes: form.durationMinutes || null,
          yearsInService: form.yearsInService || null,
          yearsInPresentSchool: form.yearsInPresentSchool || null,
          schemeOfWorkId: form.schemeOfWorkId || null,
          lessonNoteId: form.lessonNoteId || null,
          lessonDeliveryId: form.lessonDeliveryId || null,
          generalComment: form.generalComment || null,
          scores: scorePayload(),
        }),
      });

      if (!json.ok) throw new Error(json.error);
      setForm((prev) => ({ ...prev, id: json.item.id }));
      setSuccess(action === "finalize" ? "Appraisal finalized and locked." : "Draft saved.");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save appraisal.");
    } finally {
      setSaving(null);
    }
  }

  const formIsFinalized = useMemo(() => {
    if (!form.id) return false;
    return items.some((item) => item.id === form.id && item.status === "FINALIZED");
  }, [form.id, items]);

  return (
    <div className="min-h-screen bg-[#070B12] px-4 py-6 text-[#F7F4ED] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.96),rgba(28,19,48,0.94),rgba(7,11,18,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
          <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-fuchsia-400/15 blur-3xl" />
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Headteacher</p>
              <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">Teacher Appraisal</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
                Score one observed lesson using the appraisal form. Link approved scheme, approved lesson note, lesson delivery and assessment evidence where available.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/headteacher/dashboard" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.08]">
                ← Dashboard
              </Link>
              <button onClick={() => startNew()} className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-400/15 px-4 py-3 text-sm font-semibold text-fuchsia-50 hover:bg-fuchsia-400/20">
                New appraisal
              </button>
            </div>
          </div>
        </section>

        {error ? <div className="rounded-3xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
        {success ? <div className="rounded-3xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">{success}</div> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Teachers" value={teachers.length} />
          <StatCard label="Saved appraisals" value={items.length} />
          <StatCard label="Score completion" value={`${completion}%`} />
          <StatCard label="Overall score" value={fmtPercent(items.find((i) => i.id === form.id)?.overallPercentage ?? null)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
              <h2 className="text-lg font-semibold text-white">1. Choose teacher</h2>
              <p className="mt-1 text-sm text-slate-300">Start with the teacher being observed.</p>
              <select
                value={form.teacherUserId}
                onChange={(e) => chooseTeacher(e.target.value)}
                disabled={formIsFinalized}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-300/50 disabled:opacity-60"
              >
                <option value="">Select teacher...</option>
                {teachers.map((t) => (
                  <option key={t.teacherUserId} value={t.teacherUserId}>
                    {t.name} {t.primaryClassroomName ? `· ${t.primaryClassroomName}` : ""}
                  </option>
                ))}
              </select>
              {selectedTeacher ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                  <p className="font-semibold text-white">{selectedTeacher.name}</p>
                  <p>{selectedTeacher.phase ?? "No phase"} {selectedTeacher.classLevel ? `· ${selectedTeacher.classLevel}` : ""}</p>
                  <p>Staff ID: {selectedTeacher.staffId ?? "—"}</p>
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
              <h2 className="text-lg font-semibold text-white">Saved records</h2>
              <p className="mt-1 text-sm text-slate-300">Drafts can be reopened. Finalized records are locked.</p>
              <div className="mt-4 space-y-2">
                {loading ? <p className="text-sm text-slate-300">Loading...</p> : null}
                {!loading && items.length === 0 ? <p className="text-sm text-slate-300">No appraisal records yet.</p> : null}
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => void loadDetail(item.id)}
                    className={cx(
                      "w-full rounded-2xl border p-3 text-left text-sm transition hover:bg-white/[0.08]",
                      form.id === item.id ? "border-fuchsia-300/40 bg-fuchsia-400/10" : "border-white/10 bg-black/20",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{item.teacherName}</span>
                      <span className={cx("rounded-full px-2 py-1 text-[10px] font-bold", item.status === "FINALIZED" ? "bg-emerald-400/15 text-emerald-100" : "bg-amber-400/15 text-amber-100")}>{item.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">{fmtDate(item.dateObserved)} · {item.subject ?? "No subject"}</p>
                    <p className="mt-1 text-xs text-slate-400">Overall: {fmtPercent(item.overallPercentage)}</p>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">2. Lesson details</h2>
                </div>
                {formIsFinalized ? <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-100">FINALIZED · LOCKED</span> : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Input label="Date observed" type="date" value={form.dateObserved} disabled={formIsFinalized} onChange={(v) => updateForm("dateObserved", v)} />
                <SelectBox label="Class taught" value={classSelectValue} empty="Select class taught..." disabled={formIsFinalized || !form.teacherUserId} options={classOptions.map((o) => ({ value: o.value, label: o.label }))} onChange={chooseClass} />
                <SelectBox label="Subject" value={form.subject} empty="Select subject..." disabled={formIsFinalized || !form.teacherUserId} options={subjectOptions.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => updateForm("subject", v)} />
                <SelectBox label="Term" value={form.term} empty="Select term..." disabled={formIsFinalized} options={termOptions.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => updateForm("term", v)} />
                <SelectBox label="Academic year" value={form.academicYear} empty="Select academic year..." disabled={formIsFinalized} options={academicYearOptions.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => updateForm("academicYear", v)} />
                <Input label="Duration in minutes" type="number" value={form.durationMinutes} disabled={formIsFinalized} onChange={(v) => updateForm("durationMinutes", v)} />
                <Input label="Years in service" type="number" value={form.yearsInService} disabled={formIsFinalized} onChange={(v) => updateForm("yearsInService", v)} />
                <Input label="Years in present school" type="number" value={form.yearsInPresentSchool} disabled={formIsFinalized} onChange={(v) => updateForm("yearsInPresentSchool", v)} />
                <Input label="Sub-strand" value={form.subStrand} disabled={formIsFinalized} onChange={(v) => updateForm("subStrand", v)} />
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-white">3. Link evidence</h2>
              <p className="mt-1 text-sm text-slate-300">Evidence is optional for draft, but it makes the appraisal defensible.</p>

              {evidenceLoading ? <p className="mt-3 text-sm text-slate-300">Loading evidence...</p> : null}
              {evidence?.ok ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <SelectBox
                    label="Approved scheme"
                    value={form.schemeOfWorkId}
                    disabled={formIsFinalized}
                    onChange={chooseScheme}
                    empty="No scheme selected"
                    options={evidence.schemes.map((s) => ({
                      value: s.id,
                      label: evidenceLabel("Scheme", s.subject, `${s.itemCount} item(s)`, s.approvedAt),
                    }))}
                  />
                  <SelectBox
                    label="Approved lesson note"
                    value={form.lessonNoteId}
                    disabled={formIsFinalized}
                    onChange={chooseNote}
                    empty="No lesson note selected"
                    options={evidence.lessonNotes.map((n) => ({
                      value: n.id,
                      label: evidenceLabel("Note", n.subject, n.lessonTitle || `Week ${n.weekNumber ?? "—"}`, n.approvedAt),
                    }))}
                  />
                  <SelectBox
                    label="Lesson delivery"
                    value={form.lessonDeliveryId}
                    disabled={formIsFinalized}
                    onChange={chooseDelivery}
                    empty="No delivery selected"
                    options={evidence.lessonDeliveries.map((d) => ({
                      value: d.id,
                      label: evidenceLabel("Delivered", d.subject, `${d.assessmentScoreCount} score(s)`, d.dateTaught),
                    }))}
                  />
                </div>
              ) : form.teacherUserId ? (
                <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                  No evidence loaded yet. You can still save a draft, but finalized appraisal should be evidence-backed where possible.
                </p>
              ) : null}
            </section>

            <section className="space-y-4">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">4. Score the observation</h2>
                    <p className="text-sm text-slate-300">Use N/A only where the row truly does not apply.</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-white">{completion}% complete</span>
                </div>
              </div>

              {sections.map((section) => (
                <div key={section.key} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">Section {section.order} · Max {section.maxScore}</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">{section.title}</h3>
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-white">{fmtPercent(sectionPercent(section))}</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {section.items.map((item) => (
                      <div key={item.key} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="text-xs font-bold text-[#E8C96A]">{item.key}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-100">{item.label}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {([1, 2, 3, 4, 5] as const).map((n) => (
                              <button
                                key={n}
                                disabled={formIsFinalized}
                                onClick={() => setScores((prev) => ({ ...prev, [item.key]: n }))}
                                className={cx(
                                  "h-10 w-10 rounded-2xl border text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60",
                                  scores[item.key] === n ? choiceTone(n) : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]",
                                )}
                              >
                                {n}
                              </button>
                            ))}
                            <button
                              disabled={formIsFinalized}
                              onClick={() => setScores((prev) => ({ ...prev, [item.key]: "na" }))}
                              className={cx(
                                "h-10 rounded-2xl border px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60",
                                scores[item.key] === "na" ? choiceTone("na") : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]",
                              )}
                            >
                              N/A
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
              <h2 className="text-lg font-semibold text-white">5. Comment and submit</h2>
              <textarea
                value={form.generalComment}
                disabled={formIsFinalized}
                onChange={(e) => updateForm("generalComment", e.target.value)}
                rows={4}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-300/50 disabled:opacity-60"
                placeholder="General comment, strengths, and next improvement steps..."
              />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => void submit("save")}
                  disabled={formIsFinalized || saving !== null || !form.teacherUserId || !form.dateObserved}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving === "save" ? "Saving..." : "Save draft"}
                </button>
                <button
                  onClick={() => void submit("finalize")}
                  disabled={formIsFinalized || saving !== null || !canFinalize}
                  className="rounded-2xl border border-emerald-300/25 bg-emerald-400/15 px-5 py-3 text-sm font-bold text-emerald-50 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving === "finalize" ? "Finalizing..." : "Finalize and lock"}
                </button>
              </div>
              {!canFinalize && !formIsFinalized ? (
                <p className="mt-3 text-xs text-slate-400">To finalize: choose a teacher, set observation date, and score every row or mark N/A.</p>
              ) : null}
            </section>
          </main>
        </section>
      </div>
    </div>
  );
}

function StatCard(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{props.value}</p>
    </div>
  );
}

function Input(props: {
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-300/50 disabled:opacity-60"
      />
    </label>
  );
}

function SelectBox(props: {
  label: string;
  value: string;
  empty: string;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{props.label}</span>
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-300/50 disabled:opacity-60"
      >
        <option value="">{props.empty}</option>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
