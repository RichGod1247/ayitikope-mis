// src/app/teacher/lesson-notes/studio/ui/LessonNotesStudioClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type JhsAssignment = { subject: string; classes: string[] };

type TeacherScope = {
  name: string;
  email: string;
  roleName: string;
  phase: string; // "KG" | "PRIMARY" | "JHS"
  signupLevel: string | null;
  primaryAssignedLabel: string | null;
  jhsAssignments: JhsAssignment[];
  allowedLevels: string[];
  allowedSubjects: string[];
  defaultTerm: string;
  defaultAcademicYear: string;
};

type CreateResp =
  | { ok: true; note: { id: string } }
  | { ok: true; item: { id: string } }
  | { ok: true; lessonNoteId: string }
  | { ok: true; id: string }
  | { ok: false; error: string };

async function safeJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function extractCreatedNoteId(r: CreateResp): string | null {
  if (!("ok" in r) || !r.ok) return null;
  if ("lessonNoteId" in r && r.lessonNoteId) return r.lessonNoteId;
  if ("note" in r && (r as any).note?.id) return (r as any).note.id;
  if ("item" in r && (r as any).item?.id) return (r as any).item.id;
  if ("id" in r && (r as any).id) return (r as any).id;
  return null;
}

function handleAuthFailure() {
  window.location.href = "/auth/signin";
}

const inputBase =
  "w-full rounded-2xl border border-white/10 bg-[#07111F] px-3 py-2.5 text-sm text-[#F7F4ED] placeholder:text-[#7E8796] focus:border-[#D4AF37]/40 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 disabled:cursor-not-allowed disabled:opacity-70";
const selectBase =
  "w-full rounded-2xl border border-white/10 bg-[#07111F] px-3 py-2.5 text-sm text-[#F7F4ED] focus:border-[#D4AF37]/40 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20";
const btnBase =
  "inline-flex items-center justify-center rounded-xl text-sm h-10 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary =
  `${btnBase} bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] font-semibold shadow-[0_16px_40px_rgba(212,175,55,0.22)] hover:brightness-105`;
const btnOutline =
  `${btnBase} border border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10`;

function uniq(list: string[]) {
  return Array.from(new Set(list.map((x) => String(x ?? "").trim()).filter(Boolean)));
}

const TERM_OPTIONS = ["1st Term", "2nd Term", "3rd Term"] as const;
type TermOption = (typeof TERM_OPTIONS)[number];

function normalizeTerm(raw: unknown): TermOption | "" {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const lc = s.toLowerCase().replace(/\s+/g, "");

  if (lc === "1" || lc === "term1" || lc === "termone" || lc === "1stterm" || lc === "firstterm") return "1st Term";
  if (lc === "2" || lc === "term2" || lc === "termtwo" || lc === "2ndterm" || lc === "secondterm") return "2nd Term";
  if (lc === "3" || lc === "term3" || lc === "termthree" || lc === "3rdterm" || lc === "thirdterm") return "3rd Term";

  if (TERM_OPTIONS.includes(s as TermOption)) return s as TermOption;

  return "";
}

function isAcademicYearFormat(s: string) {
  return /^\d{4}\/\d{4}$/.test(s.trim());
}

function buildAcademicYearOptions(seed: string[]) {
  const nowYear = new Date().getFullYear();
  const computed = [
    `${nowYear - 2}/${nowYear - 1}`,
    `${nowYear - 1}/${nowYear}`,
    `${nowYear}/${nowYear + 1}`,
    `${nowYear + 1}/${nowYear + 2}`,
    `${nowYear + 2}/${nowYear + 3}`,
  ];

  return uniq([...seed, ...computed])
    .filter((x) => isAcademicYearFormat(x))
    .sort((a, b) => a.localeCompare(b));
}

export default function LessonNotesStudioClient(props: {
  initialSchemeItemId?: string | null;
  prefill?: {
    term?: string;
    academicYear?: string;
    level?: string;
    subject?: string;
    weekNumber?: string;
  };
  teacher: TeacherScope;
}) {
  const router = useRouter();

  const t = props.teacher;
  const initialSchemeItemId = props.initialSchemeItemId?.trim() || null;

  const phase = t.phase;
  const fixedLevelForKgPrimary = phase === "KG" || phase === "PRIMARY";

  const initialLevel =
    (fixedLevelForKgPrimary ? t.signupLevel : undefined) ||
    props.prefill?.level ||
    t.allowedLevels[0] ||
    "";

  const academicYearOptions = useMemo(() => {
    const seed: string[] = [
      String(t.defaultAcademicYear ?? "").trim(),
      String(props.prefill?.academicYear ?? "").trim(),
    ].filter(Boolean);
    return buildAcademicYearOptions(seed);
  }, [t.defaultAcademicYear, props.prefill?.academicYear]);

  const [term, setTerm] = useState<TermOption | "">(
    normalizeTerm(props.prefill?.term ?? t.defaultTerm ?? "")
  );

  const [academicYear, setAcademicYear] = useState<string>(() => {
    const pref = String(props.prefill?.academicYear ?? "").trim();
    const def = String(t.defaultAcademicYear ?? "").trim();
    const pick = pref || def;
    if (pick && isAcademicYearFormat(pick)) return pick;

    const nowYear = new Date().getFullYear();
    const likely = academicYearOptions.find((x) => x === `${nowYear - 1}/${nowYear}`);
    return likely ?? "";
  });

  const [level, setLevel] = useState<string>(initialLevel);
  const [subject, setSubject] = useState<string>(props.prefill?.subject ?? "");
  const [weekNumber, setWeekNumber] = useState<string>(props.prefill?.weekNumber ?? "");

  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [autoMode, setAutoMode] = useState<boolean>(!!initialSchemeItemId);

  const subjectsForSelectedLevel = useMemo(() => {
    if (phase !== "JHS") return t.allowedSubjects;

    const lv = (level || "").toUpperCase().trim();
    if (!lv) return t.allowedSubjects;

    const allowed = t.jhsAssignments
      .filter((a) => a.classes.map((c) => String(c).toUpperCase().trim()).includes(lv))
      .map((a) => a.subject);

    return uniq(allowed).sort();
  }, [phase, level, t.allowedSubjects, t.jhsAssignments]);

  useEffect(() => {
    if (!subject) return;
    if (subjectsForSelectedLevel.includes(subject)) return;
    setSubject("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, phase]);

  const canCreate = useMemo(() => {
    const base = Boolean(term && academicYear.trim() && subject.trim());
    if (!base) return false;

    if (phase === "JHS" && !String(level || "").trim()) return false;

    return true;
  }, [term, academicYear, subject, phase, level]);

  const createFromSchemeItem = useCallback(
    async (schemeItemId: string) => {
      if (!schemeItemId) return;

      setCreating(true);
      setErr(null);

      try {
        const res = await fetch("/api/teachers/lesson-notes/from-scheme-item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schemeItemId }),
        });

        if (res.status === 401 || res.status === 403) return handleAuthFailure();

        const data = await safeJson<CreateResp>(res);

        if (!res.ok || !data.ok) {
          setErr((!data.ok && data.error) || "Failed to create from Scheme of Work. Please try again.");
          return;
        }

        const id = extractCreatedNoteId(data);
        if (!id) {
          setErr("Created, but server did not return a lesson note id.");
          return;
        }

        router.push(`/teacher/lesson-notes/${encodeURIComponent(id)}?from=scheme`);
      } catch {
        setErr("Network/server error while creating from scheme. Try again.");
      } finally {
        setCreating(false);
      }
    },
    [router]
  );

  useEffect(() => {
    if (!autoMode) return;
    if (!initialSchemeItemId) return;
    void createFromSchemeItem(initialSchemeItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, initialSchemeItemId]);

  const handleCreate = useCallback(async () => {
    if (creating) return;

    if (!term) {
      setErr("Select a term (1st Term, 2nd Term, or 3rd Term).");
      return;
    }
    if (!academicYear.trim()) {
      setErr("Select an academic year.");
      return;
    }
    if (!subject.trim()) {
      setErr("Choose a subject to continue.");
      return;
    }
    if (phase === "JHS" && !String(level || "").trim()) {
      setErr("For JHS, select the class (e.g., JHS 1 / JHS 2 / JHS 3).");
      return;
    }

    setCreating(true);
    setErr(null);

    const payload: Record<string, any> = {
      term,
      academicYear: academicYear.trim(),
      phase,
      level: (fixedLevelForKgPrimary ? t.signupLevel : level)?.trim() || null,
      subject: subject.trim(),
      weekNumber: weekNumber.trim() ? Number(weekNumber.trim()) : 1,
    };

    const endpoint = "/api/teachers/lesson-notes/create";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401 || res.status === 403) return handleAuthFailure();

      const data = await safeJson<CreateResp>(res);

      if (!res.ok || !data.ok) {
        setErr((!data.ok && data.error) || "Failed to create lesson note. Please try again.");
        return;
      }

      const id = extractCreatedNoteId(data);
      if (!id) {
        setErr("Lesson note created, but no ID was returned by the server.");
        return;
      }

      router.push(`/teacher/lesson-notes/${encodeURIComponent(id)}?from=studio`);
    } catch {
      setErr("Network/server error while creating. Try again.");
    } finally {
      setCreating(false);
    }
  }, [creating, term, academicYear, phase, fixedLevelForKgPrimary, level, subject, weekNumber, router, t.signupLevel]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Teacher</p>
            <h1 className="mt-2 text-xl font-extrabold text-[#F7F4ED] md:text-2xl">
              Lesson Notes Studio
            </h1>
            <p className="mt-2 text-sm text-[#C9CDD6]">
              Create lesson notes inside your approved teaching scope.
            </p>
          </div>
          <button type="button" className={btnOutline} onClick={() => router.push("/teacher/lesson-notes")}>
            Back to list
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:p-5">
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#0C1730]/78 p-4">
            <p className="text-xs text-[#8F98A8]">Teacher</p>
            <p className="mt-1 truncate font-medium text-[#F7F4ED]">{t.name}</p>
            <p className="mt-1 truncate text-xs text-[#C9CDD6]">{t.email}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0C1730]/78 p-4">
            <p className="text-xs text-[#8F98A8]">Role</p>
            <p className="mt-1 font-medium text-[#F7F4ED]">{t.roleName || "TEACHER"}</p>
            <p className="mt-1 text-xs text-[#C9CDD6]">
              Phase: <span className="font-medium text-[#F7F4ED]">{t.phase}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0C1730]/78 p-4">
            <p className="text-xs text-[#8F98A8]">Class scope</p>
            <p className="mt-1 font-medium text-[#F7F4ED]">
              {fixedLevelForKgPrimary ? (t.signupLevel ?? "—") : (t.allowedLevels.join(", ") || "—")}
            </p>
            {t.primaryAssignedLabel ? (
              <p className="mt-1 text-xs text-[#C9CDD6]">
                Primary assigned: <span className="font-medium text-[#F7F4ED]">{t.primaryAssignedLabel}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-[#8F98A8]">Assignment can be set by admin later.</p>
            )}
          </div>
        </div>
      </section>

      {initialSchemeItemId ? (
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/12 px-4 py-3 text-sm text-cyan-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-cyan-100/75">Scheme item link</div>
              <div className="font-medium break-all">{initialSchemeItemId}</div>
            </div>
            <button type="button" className={btnOutline} disabled={creating} onClick={() => setAutoMode(false)}>
              Use manual mode
            </button>
          </div>
          <div className="mt-2 text-xs text-cyan-100/75">
            Studio will not trust query strings like subject/week; only the Scheme item id.
          </div>
        </div>
      ) : null}

      {err && (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
          {err}
          {initialSchemeItemId && !creating ? (
            <div className="mt-2 flex gap-2 flex-wrap">
              <button type="button" className={btnOutline} onClick={() => createFromSchemeItem(initialSchemeItemId)}>
                Retry
              </button>
            </div>
          ) : null}
        </div>
      )}

      {!initialSchemeItemId || !autoMode ? (
        <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#C9CDD6]">
                Term <span className="text-[#E8C96A]">*</span>
              </label>
              <select className={selectBase} value={term} onChange={(e) => setTerm(normalizeTerm(e.target.value))}>
                <option value="">Select term</option>
                {TERM_OPTIONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#C9CDD6]">
                Academic Year <span className="text-[#E8C96A]">*</span>
              </label>
              <select className={selectBase} value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                <option value="">Select academic year</option>
                {academicYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#C9CDD6]">Class / Level</label>
              {fixedLevelForKgPrimary ? (
                <input className={inputBase} value={t.signupLevel ?? ""} disabled />
              ) : (
                <select className={selectBase} value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="">Select class</option>
                  {t.allowedLevels.map((lv) => (
                    <option key={lv} value={lv}>
                      {lv}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#C9CDD6]">
                Subject <span className="text-[#E8C96A]">*</span>
              </label>
              <select className={selectBase} value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Select subject</option>
                {(phase === "JHS" ? subjectsForSelectedLevel : t.allowedSubjects).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {phase === "JHS" && level && subjectsForSelectedLevel.length === 0 ? (
                <p className="mt-2 text-[11px] text-amber-200">
                  No subjects assigned for <span className="font-medium text-[#F7F4ED]">{level}</span>. Fix signup assignments.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#C9CDD6]">Week Number (optional)</label>
              <input
                className={inputBase}
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="e.g. 1"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 pt-4 md:flex-row md:items-center">
            <button
              type="button"
              className={btnPrimary}
              disabled={!canCreate || creating}
              onClick={handleCreate}
              title={canCreate ? "" : "Select Term, Academic Year, Subject (and JHS class if applicable)."}
            >
              {creating ? "Creating…" : "Create lesson note"}
            </button>

            <p className="text-xs text-[#8F98A8]">After creation you’ll be redirected into the editor.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-[#C9CDD6]">
          {creating ? "Generating lesson note from Scheme of Work…" : "Ready."}
        </div>
      )}
    </div>
  );
}