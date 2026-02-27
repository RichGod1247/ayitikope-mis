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
  "w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white";
const selectBase =
  "w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-black focus:border-black";
const btnBase =
  "inline-flex items-center justify-center rounded-xl border text-sm h-10 px-4 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

function uniq(list: string[]) {
  return Array.from(new Set(list.map((x) => String(x ?? "").trim()).filter(Boolean)));
}

const TERM_OPTIONS = ["1st Term", "2nd Term", "3rd Term"] as const;
type TermOption = (typeof TERM_OPTIONS)[number];

function normalizeTerm(raw: unknown): TermOption | "" {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const lc = s.toLowerCase().replace(/\s+/g, "");

  // Accept common variants
  if (lc === "1" || lc === "term1" || lc === "termone" || lc === "1stterm" || lc === "firstterm") return "1st Term";
  if (lc === "2" || lc === "term2" || lc === "termtwo" || lc === "2ndterm" || lc === "secondterm") return "2nd Term";
  if (lc === "3" || lc === "term3" || lc === "termthree" || lc === "3rdterm" || lc === "thirdterm") return "3rd Term";

  // If already canonical
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

  // Auto-run state (Scheme → Studio)
  const [autoMode, setAutoMode] = useState<boolean>(!!initialSchemeItemId);

  // For JHS: show only subjects that match the selected class level
  const subjectsForSelectedLevel = useMemo(() => {
    if (phase !== "JHS") return t.allowedSubjects;

    const lv = (level || "").toUpperCase().trim();
    if (!lv) return t.allowedSubjects;

    const allowed = t.jhsAssignments
      .filter((a) => a.classes.map((c) => String(c).toUpperCase().trim()).includes(lv))
      .map((a) => a.subject);

    return uniq(allowed).sort();
  }, [phase, level, t.allowedSubjects, t.jhsAssignments]);

  // Ensure selected subject stays valid as filters change
  useEffect(() => {
    if (!subject) return;
    if (subjectsForSelectedLevel.includes(subject)) return;
    setSubject("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, phase]);

  const canCreate = useMemo(() => {
    const base = Boolean(term && academicYear.trim() && subject.trim());
    if (!base) return false;

    // For JHS manual mode, class level must be explicit (prevents scope confusion)
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
      term, // canonical: "1st Term" | "2nd Term" | "3rd Term"
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
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <section className="rounded-2xl border bg-white p-4 md:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold text-zinc-900">Lesson Notes Studio</h1>
              <p className="text-sm text-zinc-600 mt-1">Create lesson notes inside your approved teaching scope.</p>
            </div>
            <button type="button" className={btnOutline} onClick={() => router.push("/teacher/lesson-notes")}>
              Back to list
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border bg-zinc-50 p-4">
              <p className="text-xs text-zinc-500">Teacher</p>
              <p className="mt-1 font-medium text-zinc-900 truncate">{t.name}</p>
              <p className="text-xs text-zinc-600 truncate mt-1">{t.email}</p>
            </div>

            <div className="rounded-xl border bg-zinc-50 p-4">
              <p className="text-xs text-zinc-500">Role</p>
              <p className="mt-1 font-medium text-zinc-900">{t.roleName || "TEACHER"}</p>
              <p className="text-xs text-zinc-600 mt-1">
                Phase: <span className="font-medium">{t.phase}</span>
              </p>
            </div>

            <div className="rounded-xl border bg-zinc-50 p-4">
              <p className="text-xs text-zinc-500">Class scope</p>
              <p className="mt-1 font-medium text-zinc-900">
                {fixedLevelForKgPrimary ? (t.signupLevel ?? "—") : (t.allowedLevels.join(", ") || "—")}
              </p>
              {t.primaryAssignedLabel ? (
                <p className="text-xs text-zinc-600 mt-1">
                  Primary assigned: <span className="font-medium">{t.primaryAssignedLabel}</span>
                </p>
              ) : (
                <p className="text-xs text-zinc-500 mt-1">Assignment can be set by admin later.</p>
              )}
            </div>
          </div>
        </section>

        {initialSchemeItemId ? (
          <div className="border rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs text-zinc-500">Scheme item link</div>
                <div className="font-medium break-all">{initialSchemeItemId}</div>
              </div>
              <button type="button" className={btnOutline} disabled={creating} onClick={() => setAutoMode(false)}>
                Use manual mode
              </button>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              Studio will not trust query strings like subject/week; only the Scheme item id.
            </div>
          </div>
        ) : null}

        {err && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-4 py-3 text-sm">
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
          <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Term <span className="text-red-600">*</span>
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
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Academic Year <span className="text-red-600">*</span>
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
                <label className="block text-xs font-medium text-zinc-700 mb-1">Class / Level</label>
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
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Subject <span className="text-red-600">*</span>
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
                  <p className="text-[11px] text-amber-700 mt-1">
                    No subjects assigned for <span className="font-medium">{level}</span>. Fix signup assignments.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Week Number (optional)</label>
                <input
                  className={inputBase}
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="e.g. 1"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={!canCreate || creating}
                onClick={handleCreate}
                title={canCreate ? "" : "Select Term, Academic Year, Subject (and JHS class if applicable)."}
              >
                {creating ? "Creating…" : "Create lesson note"}
              </button>

              <p className="text-xs text-zinc-500">After creation you’ll be redirected into the editor.</p>
            </div>
          </div>
        ) : (
          <div className="border rounded-2xl bg-white p-4 md:p-5 text-sm text-zinc-600">
            {creating ? "Generating lesson note from Scheme of Work…" : "Ready."}
          </div>
        )}
      </div>
    </main>
  );
}
