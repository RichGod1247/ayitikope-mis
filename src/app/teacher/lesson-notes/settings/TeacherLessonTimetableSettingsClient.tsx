"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type ClassroomOption = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
  label: string;
  level: string | null;
};

type SubjectOption = {
  key: string;
  label: string;
  classes: ClassroomOption[];
};

type SavedEntry = {
  id: string;
  classroomId: string;
  subject: string;
  subjectNorm: string;
  subjectKey: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
};

type ApiState = {
  ok: true;
  subjects: SubjectOption[];
  entries: SavedEntry[];
  message?: string;
};

type PeriodDraft = {
  localId: string;
  weekday: number;
  startTime: string;
  endTime: string;
};

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
] as const;

const shell =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const field =
  "mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-3 text-sm text-[#F7F4ED] focus:border-[#D4AF37]/40 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 disabled:opacity-60";
const outlineBtn =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-60";
const goldBtn =
  "inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-3 text-sm font-bold text-[#071A3D] shadow-[0_16px_40px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:opacity-60";

function newPeriod(): PeriodDraft {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    weekday: 1,
    startTime: "",
    endTime: "",
  };
}

function dayLabel(weekday: number) {
  return DAY_OPTIONS.find((item) => item.value === weekday)?.label ?? "Day";
}

function periodLabel(entry: Pick<SavedEntry, "weekday" | "startTime" | "endTime">) {
  return `${dayLabel(entry.weekday)} · ${entry.startTime}–${entry.endTime}`;
}

function hasClassArm(classroom: ClassroomOption) {
  return Boolean(String(classroom.arm ?? "").trim());
}

function classroomLevelKey(classroom: ClassroomOption) {
  return String(classroom.level || classroom.grade || classroom.name || classroom.id)
    .trim()
    .toUpperCase();
}

function singleStreamClassOptions(classes: ClassroomOption[]) {
  const byLevel = new Map<string, ClassroomOption[]>();

  for (const classroom of classes) {
    const key = classroomLevelKey(classroom);
    const rows = byLevel.get(key) ?? [];
    rows.push(classroom);
    byLevel.set(key, rows);
  }

  const visible: ClassroomOption[] = [];

  for (const rows of byLevel.values()) {
    const singleStreamRows = rows.filter((classroom) => !hasClassArm(classroom));
    visible.push(...(singleStreamRows.length ? singleStreamRows : rows));
  }

  return visible.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

async function parseJsonResponse(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status}).`);
  }
  return data as ApiState;
}

export default function TeacherLessonTimetableSettingsClient() {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [entries, setEntries] = useState<SavedEntry[]>([]);
  const [subjectKey, setSubjectKey] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [showMultipleStreams, setShowMultipleStreams] = useState(false);
  const [periods, setPeriods] = useState<PeriodDraft[]>([newPeriod()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.key === subjectKey) ?? null,
    [subjectKey, subjects],
  );

  const singleStreamClasses = useMemo(
    () => (selectedSubject ? singleStreamClassOptions(selectedSubject.classes) : []),
    [selectedSubject],
  );

  const visibleClasses = useMemo(
    () => (showMultipleStreams ? selectedSubject?.classes ?? [] : singleStreamClasses),
    [selectedSubject, showMultipleStreams, singleStreamClasses],
  );

  const hasMultipleStreams = useMemo(
    () => Boolean(selectedSubject?.classes.some(hasClassArm)),
    [selectedSubject],
  );

  const selectedClass = useMemo(
    () => selectedSubject?.classes.find((item) => item.id === classroomId) ?? null,
    [classroomId, selectedSubject],
  );

  const savedForSelection = useMemo(
    () =>
      entries
        .filter((entry) => entry.classroomId === classroomId && entry.subjectKey === subjectKey)
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
    [classroomId, entries, subjectKey],
  );

  const classLookup = useMemo(() => {
    const map = new Map<string, ClassroomOption>();
    for (const subject of subjects) {
      for (const classroom of subject.classes) map.set(classroom.id, classroom);
    }
    return map;
  }, [subjects]);

  const savedGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        subjectKey: string;
        subject: string;
        classroomId: string;
        classroomLabel: string;
        entries: SavedEntry[];
      }
    >();

    for (const entry of entries) {
      const key = `${entry.subjectKey}:${entry.classroomId}`;
      const current = map.get(key) ?? {
        subjectKey: entry.subjectKey,
        subject: entry.subject,
        classroomId: entry.classroomId,
        classroomLabel: classLookup.get(entry.classroomId)?.label ?? "Assigned class",
        entries: [],
      };
      current.entries.push(entry);
      map.set(key, current);
    }

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        entries: group.entries.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
      }))
      .sort(
        (a, b) =>
          a.subject.localeCompare(b.subject) || a.classroomLabel.localeCompare(b.classroomLabel),
      );
  }, [classLookup, entries]);

  async function load() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/teacher/lesson-notes/settings", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const data = await parseJsonResponse(res);
      setSubjects(data.subjects ?? []);
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Lesson Note settings.");
      setSubjects([]);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (subjectKey || subjects.length !== 1) return;
    setSubjectKey(subjects[0]!.key);
  }, [subjectKey, subjects]);

  useEffect(() => {
    if (!selectedSubject) {
      setClassroomId("");
      return;
    }

    if (visibleClasses.some((item) => item.id === classroomId)) return;

    setClassroomId(visibleClasses.length === 1 ? visibleClasses[0]!.id : "");
  }, [classroomId, selectedSubject, visibleClasses]);

  useEffect(() => {
    if (!subjectKey || !classroomId) {
      setPeriods([newPeriod()]);
      return;
    }

    if (!savedForSelection.length) {
      setPeriods([newPeriod()]);
      return;
    }

    setPeriods(
      savedForSelection.map((entry) => ({
        localId: entry.id,
        weekday: entry.weekday,
        startTime: entry.startTime,
        endTime: entry.endTime,
      })),
    );
  }, [classroomId, savedForSelection, subjectKey]);

  function changeMultipleStreams(next: boolean) {
    setShowMultipleStreams(next);

    if (!next && selectedSubject) {
      const defaultClasses = singleStreamClassOptions(selectedSubject.classes);
      if (!defaultClasses.some((item) => item.id === classroomId)) {
        setClassroomId(defaultClasses.length === 1 ? defaultClasses[0]!.id : "");
      }
    }

    setNotice(null);
    setError(null);
  }

  function updatePeriod(localId: string, patch: Partial<PeriodDraft>) {
    setPeriods((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  function removePeriod(localId: string) {
    setPeriods((current) => {
      const next = current.filter((item) => item.localId !== localId);
      return next.length ? next : [newPeriod()];
    });
  }

  function validatePeriods() {
    for (const item of periods) {
      if (!item.startTime || !item.endTime) return "Choose both start and end time for every lesson period.";
      if (item.endTime <= item.startTime) return "End time must be later than start time.";
    }
    return null;
  }

  async function save() {
    if (!selectedSubject || !selectedClass) {
      setError("Choose a subject and class first.");
      return;
    }

    const validationError = validatePeriods();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/teacher/lesson-notes/settings", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId: selectedClass.id,
          subject: selectedSubject.label,
          periods: periods.map((item) => ({
            weekday: item.weekday,
            startTime: item.startTime,
            endTime: item.endTime,
          })),
        }),
      });

      const data = await parseJsonResponse(res);
      setSubjects(data.subjects ?? subjects);
      setEntries(data.entries ?? []);
      setNotice(data.message ?? "Lesson times saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Lesson Note settings.");
    } finally {
      setSaving(false);
    }
  }

  async function clearSaved() {
    if (!selectedSubject || !selectedClass || !savedForSelection.length) return;
    if (!window.confirm(`Clear all saved lesson times for ${selectedSubject.label} · ${selectedClass.label}?`)) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/teacher/lesson-notes/settings", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId: selectedClass.id,
          subject: selectedSubject.label,
          periods: [],
        }),
      });

      const data = await parseJsonResponse(res);
      setSubjects(data.subjects ?? subjects);
      setEntries(data.entries ?? []);
      setPeriods([newPeriod()]);
      setNotice(data.message ?? "Saved lesson times cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear saved lesson times.");
    } finally {
      setSaving(false);
    }
  }

  function editGroup(group: (typeof savedGroups)[number]) {
    const editedClass = classLookup.get(group.classroomId);
    setSubjectKey(group.subjectKey);
    setShowMultipleStreams(Boolean(editedClass && hasClassArm(editedClass)));
    setClassroomId(group.classroomId);
    setError(null);
    setNotice(null);
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">Lesson Note Settings</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#F7F4ED] md:text-3xl">Set your weekly lesson times</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
              Set each assigned subject and class once. EduLife will place the correct day and time on the Lesson Note print page.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className={outlineBtn} href="/teacher/lesson-notes">
              Back to Lesson Notes
            </Link>
            <button className={outlineBtn} onClick={() => void load()} disabled={loading || saving}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-4 text-sm leading-6 text-sky-100">
        <div className="font-semibold">How it works</div>
        <div className="mt-1">Choose Subject → Class → add every weekly day and time → Save. If a subject meets the same class more than once, add another lesson time.</div>
      </section>

      <section ref={editorRef} id="lesson-note-timetable-editor" className={shell}>
        <div className="p-4 md:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#F7F4ED]">1. Choose subject and class</h2>
              <p className="mt-1 text-xs leading-5 text-[#9AA4B2]">Only your current teaching assignments are shown.</p>
            </div>
            {savedGroups.length ? (
              <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                {savedGroups.length} class-subject {savedGroups.length === 1 ? "setting" : "settings"} saved
              </span>
            ) : null}
          </div>

          {error ? <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-500/12 p-3 text-sm text-rose-100">{error}</div> : null}
          {notice ? <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-500/12 p-3 text-sm text-emerald-100">{notice}</div> : null}

          {loading ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-[#C9CDD6]">Loading your assigned subjects…</div>
          ) : subjects.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
              No teaching assignments are available yet. Ask your School Admin or Headteacher to assign your subject and class first.
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-[#F7F4ED]" htmlFor="lesson-setting-subject">Subject</label>
                  <select
                    id="lesson-setting-subject"
                    className={field}
                    value={subjectKey}
                    onChange={(event) => {
                      setSubjectKey(event.target.value);
                      setClassroomId("");
                      setShowMultipleStreams(false);
                      setNotice(null);
                      setError(null);
                    }}
                    disabled={saving}
                  >
                    <option value="">Choose subject</option>
                    {subjects.map((subject) => (
                      <option key={subject.key} value={subject.key}>
                        {subject.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#F7F4ED]" htmlFor="lesson-setting-class">Class</label>
                  <select
                    id="lesson-setting-class"
                    className={field}
                    value={classroomId}
                    onChange={(event) => {
                      setClassroomId(event.target.value);
                      setNotice(null);
                      setError(null);
                    }}
                    disabled={!selectedSubject || saving}
                  >
                    <option value="">Choose class</option>
                    {visibleClasses.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.label}
                      </option>
                    ))}
                  </select>

                  {selectedSubject && hasMultipleStreams ? (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                      <input
                        className="mt-0.5 h-4 w-4 accent-[#D4AF37]"
                        type="checkbox"
                        checked={showMultipleStreams}
                        onChange={(event) => changeMultipleStreams(event.target.checked)}
                        disabled={saving}
                      />
                      <span>
                        <span className="block text-xs font-semibold text-[#F7F4ED]">Multiple streams</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-[#9AA4B2]">
                          Off by default. Turn on to choose a class arm.
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>
              </div>

              {selectedSubject && selectedClass ? (
                <div className="mt-5 border-t border-white/10 pt-5">
                  <div>
                    <h2 className="text-lg font-bold text-[#F7F4ED]">2. Add weekly lesson time</h2>
                    <p className="mt-1 text-xs leading-5 text-[#9AA4B2]">
                      {selectedSubject.label} · {selectedClass.label}. Add one row for every lesson period in the week.
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {periods.map((period, index) => (
                      <div key={period.localId} className="rounded-2xl border border-white/10 bg-[#07111F]/85 p-3 md:p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-[#F7F4ED]">Lesson time {index + 1}</div>
                          {periods.length > 1 ? (
                            <button
                              type="button"
                              className="rounded-lg border border-rose-300/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-100"
                              onClick={() => removePeriod(period.localId)}
                              disabled={saving}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <div>
                            <label className="text-xs font-semibold text-[#C9CDD6]">Day</label>
                            <select
                              className={field}
                              value={period.weekday}
                              onChange={(event) => updatePeriod(period.localId, { weekday: Number(event.target.value) })}
                              disabled={saving}
                            >
                              {DAY_OPTIONS.map((day) => (
                                <option key={day.value} value={day.value}>
                                  {day.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-[#C9CDD6]">Start time</label>
                            <input
                              className={field}
                              type="time"
                              value={period.startTime}
                              onChange={(event) => updatePeriod(period.localId, { startTime: event.target.value })}
                              disabled={saving}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-[#C9CDD6]">End time</label>
                            <input
                              className={field}
                              type="time"
                              value={period.endTime}
                              onChange={(event) => updatePeriod(period.localId, { endTime: event.target.value })}
                              disabled={saving}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      className={outlineBtn + " w-full sm:w-auto"}
                      onClick={() => setPeriods((current) => [...current, newPeriod()])}
                      disabled={saving || periods.length >= 20}
                    >
                      + Add another day/time
                    </button>

                    <button type="button" className={goldBtn + " w-full sm:w-auto"} onClick={() => void save()} disabled={saving}>
                      {saving ? "Saving…" : "Save lesson times"}
                    </button>

                    {savedForSelection.length ? (
                      <button
                        type="button"
                        className="w-full rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-100 sm:w-auto"
                        onClick={() => void clearSaved()}
                        disabled={saving}
                      >
                        Clear saved times
                      </button>
                    ) : null}
                  </div>

                  <p className="mt-3 text-xs leading-5 text-[#8F98A8]">
                    EduLife checks that you are still assigned to this subject/class and blocks overlapping timetable periods before saving.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className={shell}>
        <div className="p-4 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-[#F7F4ED]">Saved weekly timetable</h2>
            <p className="mt-1 text-xs leading-5 text-[#9AA4B2]">Use Edit to return to any subject/class without reloading the page.</p>
          </div>

          {savedGroups.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-[#C9CDD6]">
              No lesson times saved yet. Start with your first subject and class above.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {savedGroups.map((group) => (
                <article key={`${group.subjectKey}:${group.classroomId}`} className="rounded-2xl border border-white/10 bg-[#07111F]/85 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#F7F4ED]">{group.subject}</div>
                      <div className="mt-1 text-sm text-[#C9CDD6]">{group.classroomLabel}</div>
                    </div>
                    <button className={outlineBtn + " px-2.5 py-1.5 text-xs"} onClick={() => editGroup(group)}>
                      Edit
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.entries.map((entry) => (
                      <span key={entry.id} className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-xs font-medium text-sky-100">
                        {periodLabel(entry)}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
