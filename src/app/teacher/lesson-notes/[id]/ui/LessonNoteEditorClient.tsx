// src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type Unit = {
  id: string;
  indicatorCode: string | null;
  indicator: string;
  contentStandardCode: string | null;
  contentStandard: string;
  strandCode: string | null;
  strand: string;
  substrandCode: string | null;
  substrand: string;
  weekNumber: number;
  term: string;
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

async function apiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store", credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function safeStr(v: any) {
  return typeof v === "string" ? v : "";
}

export default function LessonNoteEditorClient({ id }: { id: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  // Curriculum unit picker
  const [unitOpen, setUnitOpen] = useState(false);
  const [unitQ, setUnitQ] = useState("");
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitErr, setUnitErr] = useState<string | null>(null);

  // AI coach
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiFields, setAiFields] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<{ ok: true; item: LessonNote }>(`/api/teachers/lesson-notes/item/${id}`);
      setNote(data.item);

      setLessonTitle(safeStr(data.item.lessonTitle) || `${data.item.subject} — Week ${data.item.weekNumber ?? ""}`.trim());
      setObjectives(safeStr(data.item.objectives));
      setTlr(safeStr(data.item.teachingLearningResources));
      setIntro(safeStr(data.item.introduction));
      setDev(safeStr(data.item.lessonDevelopment));
      setConcl(safeStr(data.item.conclusion));
      setAssessment(safeStr(data.item.assessment));
      setHomework(safeStr(data.item.homework));
      setDiff(safeStr(data.item.differentiationNotes));
      setRefl(safeStr(data.item.reflectionNotes));
    } catch (e: any) {
      setErr(e?.message || "Failed to load lesson note.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const context = useMemo(() => {
    if (!note) return "";
    return `${note.subject} • ${note.level ?? ""} • ${note.term} • ${note.academicYear} • Week ${note.weekNumber ?? "—"}`.replace(/\s+/g, " ").trim();
  }, [note]);

  async function saveDraft() {
    if (!note) return;
    setSaving(true);
    try {
      const resp = await apiJson<{ ok: true; item: LessonNote }>(`/api/teachers/lesson-notes/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonNoteId: note.id,
          lessonTitle,
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
      alert("Saved.");
    } catch (e: any) {
      alert(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!note) return;
    const yes = window.confirm("Submit this lesson note for review? You won’t be able to edit while submitted.");
    if (!yes) return;

    try {
      await apiJson<{ ok: true }>(`/api/teachers/lesson-notes/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonNoteId: note.id }),
      });
      await load();
      alert("Submitted.");
    } catch (e: any) {
      alert(e?.message || "Submit failed.");
    }
  }

  async function loadUnits() {
    if (!note) return;
    setUnitsLoading(true);
    setUnitErr(null);
    try {
      const sp = new URLSearchParams();
      sp.set("phase", note.phase ?? "");
      sp.set("level", note.level ?? "");
      sp.set("subject", note.subject ?? "");
      sp.set("term", note.term ?? "");
      sp.set("weekNumber", String(note.weekNumber ?? ""));
      if (unitQ.trim()) sp.set("q", unitQ.trim());
      sp.set("take", "80");

      const data = await apiJson<{ ok: true; items: Unit[] }>(`/api/teachers/curriculum/units/list?${sp.toString()}`);
      setUnits(data.items ?? []);
    } catch (e: any) {
      setUnitErr(e?.message || "Failed to load units.");
    } finally {
      setUnitsLoading(false);
    }
  }

  async function pickUnit(unitId: string) {
    if (!note) return;

    try {
      const resp = await apiJson<{ ok: true; item: LessonNote }>(`/api/teachers/lesson-notes/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonNoteId: note.id,
          curriculumUnitId: unitId,
          // keep draft
          status: "DRAFT",
        }),
      });
      setNote(resp.item);
      // After unit is linked, reload editable slice fields from server
      await load();
      setUnitOpen(false);
    } catch (e: any) {
      alert(e?.message || "Failed to link unit.");
    }
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
    } catch (e: any) {
      setAiErr(e?.message || "AI support failed.");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiToEmptyOnly() {
    if (!aiFields) return;

    if (!lessonTitle.trim() && aiFields.lessonTitle) setLessonTitle(aiFields.lessonTitle);
    if (!objectives.trim() && aiFields.objectives) setObjectives(aiFields.objectives);
    if (!tlr.trim() && aiFields.teachingLearningResources) setTlr(aiFields.teachingLearningResources);
    if (!intro.trim() && aiFields.introduction) setIntro(aiFields.introduction);
    if (!dev.trim() && aiFields.lessonDevelopment) setDev(aiFields.lessonDevelopment);
    if (!concl.trim() && aiFields.conclusion) setConcl(aiFields.conclusion);
    if (!assessment.trim() && aiFields.assessment) setAssessment(aiFields.assessment);
    if (!homework.trim() && aiFields.homework) setHomework(aiFields.homework);
    if (!diff.trim() && aiFields.differentiationNotes) setDiff(aiFields.differentiationNotes);
    if (!refl.trim() && aiFields.reflectionNotes) setRefl(aiFields.reflectionNotes);

    alert("Applied AI fields to empty sections only.");
  }

  if (loading) return <div className="p-6 text-sm opacity-80">Loading…</div>;
  if (err) return <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded">{err}</div>;
  if (!note) return <div className="p-6 text-sm opacity-80">Not found.</div>;

  const locked = note.status === "SUBMITTED" || note.status === "APPROVED";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Lesson Note Editor</h1>
          <p className="text-sm opacity-80">{context}</p>
          {note.headteacherComment ? (
            <div className="mt-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded p-3">
              <div className="font-medium">Headteacher comment</div>
              <div className="mt-1">{note.headteacherComment}</div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button className="px-3 py-2 rounded-md border text-sm" onClick={() => router.push("/teacher/lesson-notes")}>
            Back
          </button>
          <button className="px-3 py-2 rounded-md border text-sm" onClick={() => router.push(`/teacher/lesson-notes/${note.id}/print`)}>
            Print
          </button>
          <button
            className="px-3 py-2 rounded-md border text-sm"
            disabled={locked || saving}
            onClick={saveDraft}
            title={locked ? "Locked while submitted/approved." : ""}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            className="px-3 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
            disabled={locked}
            onClick={submit}
            title={locked ? "Locked while submitted/approved." : ""}
          >
            Submit
          </button>
        </div>
      </div>

      <div className="mt-4 border rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium">NaCCA Link (required before submit)</div>
            <div className="text-xs opacity-70">
              Curriculum unit drives strand/sub-strand/content standard/indicator and prevents spoofing.
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="px-3 py-2 rounded-md border text-sm"
              disabled={locked}
              onClick={() => {
                setUnitOpen(true);
                setTimeout(() => loadUnits(), 0);
              }}
            >
              {note.curriculumUnitId ? "Change unit" : "Link unit"}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="border rounded p-3">
            <div className="text-xs opacity-70">Strand</div>
            <div className="mt-1">{note.strand || "—"}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs opacity-70">Sub-strand</div>
            <div className="mt-1">{note.substrand || "—"}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs opacity-70">Content standard</div>
            <div className="mt-1">{note.contentStandard || "—"}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs opacity-70">Indicator</div>
            <div className="mt-1">{note.indicator || "—"}</div>
          </div>
        </div>

        {unitOpen ? (
          <div className="mt-4 border rounded-lg p-3 bg-gray-50">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-sm">Pick curriculum unit</div>
              <button className="px-2 py-1 rounded border text-sm" onClick={() => setUnitOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-2 flex gap-2 flex-wrap">
              <input
                className="border rounded-md p-2 text-sm flex-1 min-w-[240px]"
                placeholder="Search indicator code / text..."
                value={unitQ}
                onChange={(e) => setUnitQ(e.target.value)}
              />
              <button className="px-3 py-2 rounded-md border text-sm" onClick={loadUnits}>
                Search
              </button>
            </div>

            {unitErr && <div className="mt-2 text-sm text-red-700">{unitErr}</div>}
            {unitsLoading ? (
              <div className="mt-2 text-sm opacity-80">Loading units…</div>
            ) : (
              <div className="mt-3 max-h-[360px] overflow-auto border rounded bg-white">
                {units.length === 0 ? (
                  <div className="p-3 text-sm opacity-80">No units found for this week.</div>
                ) : (
                  <ul className="divide-y">
                    {units.map((u) => (
                      <li key={u.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="text-sm">
                          <div className="font-medium">
                            {u.indicatorCode ? `${u.indicatorCode} — ` : ""}{u.indicator}
                          </div>
                          <div className="text-xs opacity-70 mt-1">
                            {u.strandCode ? `${u.strandCode} — ` : ""}{u.strand} •{" "}
                            {u.substrandCode ? `${u.substrandCode} — ` : ""}{u.substrand} •{" "}
                            {u.contentStandardCode ? `${u.contentStandardCode} — ` : ""}{u.contentStandard}
                          </div>
                        </div>
                        <button
                          className="px-3 py-2 rounded-md border text-sm"
                          disabled={locked}
                          onClick={() => pickUnit(u.id)}
                        >
                          Select
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="font-medium">Lesson fields</div>
            <div className="text-xs opacity-70">{locked ? "Locked while submitted/approved." : "Editable"}</div>
          </div>

          <div className="mt-3 grid gap-3">
            <Field label="Lesson title" value={lessonTitle} onChange={setLessonTitle} disabled={locked} rows={2} />
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
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="font-medium">AI Co-Tutor (rule-based for now)</div>
              <div className="text-xs opacity-70">
                Use it to draft fast, then you refine. It will not bypass submission rules.
              </div>
            </div>

            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-md border text-sm" disabled={aiLoading} onClick={() => runAi("QUICK")}>
                Quick
              </button>
              <button className="px-3 py-2 rounded-md border text-sm" disabled={aiLoading} onClick={() => runAi("FULL")}>
                Full
              </button>
            </div>
          </div>

          {aiErr && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{aiErr}</div>}

          {aiLoading ? (
            <div className="mt-3 text-sm opacity-80">Generating…</div>
          ) : aiSuggestion ? (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Suggestion</div>
                <button className="px-3 py-2 rounded-md border text-sm" onClick={applyAiToEmptyOnly}>
                  Apply to empty only
                </button>
              </div>
              <textarea className="mt-2 w-full border rounded-md p-2 text-xs h-[420px]" readOnly value={aiSuggestion} />
              <div className="mt-2 text-xs opacity-70">
                Tip: Link the NaCCA unit first. AI becomes more grounded when indicator is present.
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm opacity-80">
              Run AI after linking a NaCCA unit. Otherwise it’s forced to guess.
            </div>
          )}
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
}) {
  return (
    <div>
      <label className="text-xs opacity-70">{props.label}</label>
      <textarea
        className="mt-1 w-full border rounded-md p-2 text-sm disabled:bg-gray-100"
        rows={props.rows ?? 4}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={!!props.disabled}
      />
    </div>
  );
}
