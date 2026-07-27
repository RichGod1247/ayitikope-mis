"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";

type ScoreDraft = {
  score: number | null;
  notApplicable: boolean;
};

type WorkspaceItem = {
  itemKey: string;
  label: string;
  order: number;
  maxScore: number;
  score: number | null;
  notApplicable: boolean;
  answered: boolean;
};

type WorkspaceSection = {
  sectionKey: string;
  title: string;
  description: string | null;
  order: number;
  maxScore: number;
  items: WorkspaceItem[];
};

type Workspace = {
  assessment: {
    assessmentId: string;
    cycleId: string;
    revision: number;
    status: string;
    dateObserved: string;
    canEdit: boolean;
    canFinalize: boolean;
    progress: {
      totalSections: number;
      completedSections: number;
      totalItems: number;
      answeredItems: number;
      notApplicableItems: number;
      completionPercentage: number;
      missingItemKeys: string[];
    };
  };
  lifecycle: {
    state: string;
    label: string;
    description: string;
    readOnly: boolean;
    canEdit: boolean;
    canCreateRevision: boolean;
    returnReason: string | null;
  };
  visit: {
    targetName: string | null;
    schoolName: string;
    circuitName: string;
    districtName: string;
    dateObserved: string;
    assessorRole: string;
  };
  sections: WorkspaceSection[];
};

type ApiFailure = {
  ok?: false;
  error?: string;
};

type ClientProps = {
  initialAssessmentId: string;
  initialCycleId: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function answerKey(sectionKey: string, itemKey: string) {
  return `${sectionKey}::${itemKey}`;
}

function messageFromFailure(value: unknown) {
  const failure = value as ApiFailure;
  return failure?.error || "The request could not be completed. Please try again.";
}

export default function HeadteacherSupervisoryAssessmentClient({
  initialAssessmentId,
  initialCycleId,
}: ClientProps) {
  const router = useRouter();
  const [assessmentId, setAssessmentId] = useState(initialAssessmentId);
  const [cycleId] = useState(initialCycleId);
  const [dateObserved, setDateObserved] = useState(today());
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [answers, setAnswers] = useState<Record<string, ScoreDraft>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as
        | { ok: true; workspace: Workspace }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body));
      }
      setWorkspace(body.workspace);
      const nextAnswers: Record<string, ScoreDraft> = {};
      for (const section of body.workspace.sections) {
        for (const item of section.items) {
          if (item.answered) {
            nextAnswers[answerKey(section.sectionKey, item.itemKey)] = {
              score: item.score,
              notApplicable: item.notApplicable,
            };
          }
        }
      }
      setAnswers(nextAnswers);
      setSectionIndex(0);
      setItemIndex(0);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The assessment could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (assessmentId) {
      void loadWorkspace(assessmentId);
    }
  }, [assessmentId, loadWorkspace]);

  const currentSection = workspace?.sections[sectionIndex] ?? null;
  const currentItem = currentSection?.items[itemIndex] ?? null;
  const currentAnswer =
    currentSection && currentItem
      ? answers[answerKey(currentSection.sectionKey, currentItem.itemKey)]
      : undefined;

  const answeredInCurrentSection = useMemo(() => {
    if (!currentSection) return 0;
    return currentSection.items.filter(
      (item) => answers[answerKey(currentSection.sectionKey, item.itemKey)],
    ).length;
  }, [answers, currentSection]);

  function chooseScore(score: number | null, notApplicable: boolean) {
    if (!currentSection || !currentItem || workspace?.assessment.canEdit !== true) {
      return;
    }
    setAnswers((previous) => ({
      ...previous,
      [answerKey(currentSection.sectionKey, currentItem.itemKey)]: {
        score,
        notApplicable,
      },
    }));
    setNotice("");
  }

  async function createDraft() {
    if (!cycleId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/governance/appraisals/headteacher-supervisory",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cycleId, dateObserved }),
        },
      );
      const body = (await response.json()) as
        | { ok: true; result: { assessment: { id: string } } }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body));
      }
      const nextId = body.result.assessment.id;
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The assessment draft could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentSection() {
    if (!workspace || !currentSection || !assessmentId) return;
    const scores = currentSection.items.flatMap((item) => {
      const answer = answers[answerKey(currentSection.sectionKey, item.itemKey)];
      return answer
        ? [
            {
              itemKey: item.itemKey,
              score: answer.notApplicable ? null : answer.score,
              notApplicable: answer.notApplicable,
            },
          ]
        : [];
    });
    if (scores.length === 0) {
      setError("Answer at least one question in this section before saving.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(assessmentId)}/section`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionKey: currentSection.sectionKey,
            scores,
          }),
        },
      );
      const body = (await response.json()) as
        | { ok: true; result: { outcome: string } }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body));
      }
      setNotice(
        body.result.outcome === "UNCHANGED"
          ? "This section was already saved."
          : "Section saved on the server.",
      );
      const savedSectionIndex = sectionIndex;
      const savedItemIndex = itemIndex;
      await loadWorkspace(assessmentId);
      setSectionIndex(savedSectionIndex);
      setItemIndex(savedItemIndex);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The section could not be saved. Your answers remain on this screen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function finalizeAssessment() {
    if (!workspace || !assessmentId || workspace.assessment.canFinalize !== true) {
      return;
    }
    const confirmed = window.confirm(
      "Submit this supervisory assessment? You cannot edit the submitted version.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(assessmentId)}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmFinalization: true }),
        },
      );
      const body = (await response.json()) as
        | { ok: true; result: { outcome: string } }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body));
      }
      setNotice("Assessment submitted and locked for review.");
      await loadWorkspace(assessmentId);
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : "The assessment could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createRevision() {
    if (!workspace || !assessmentId || !workspace.lifecycle.canCreateRevision) {
      return;
    }
    const confirmed = window.confirm(
      "Create a correction copy? The returned version will remain preserved as history.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/governance/appraisals/headteacher-supervisory/${encodeURIComponent(assessmentId)}/revision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmRevision: true }),
        },
      );
      const body = (await response.json()) as
        | { ok: true; result: { revision: { id: string } } }
        | ApiFailure;
      if (!response.ok || body.ok !== true) {
        throw new Error(messageFromFailure(body));
      }
      const nextId = body.result.revision.id;
      setAssessmentId(nextId);
      router.replace(
        `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(nextId)}`,
      );
      setNotice("Correction copy created. Review and resubmit it.");
    } catch (revisionError) {
      setError(
        revisionError instanceof Error
          ? revisionError.message
          : "The correction copy could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!assessmentId && !cycleId) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl bg-slate-50 px-4 py-6 text-slate-900">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wide text-indigo-700">
            Headteacher supervisory assessment
          </p>
          <h1 className="mt-2 text-2xl font-black">Open this form from an appraisal record</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Select a Headteacher appraisal inside your governance workspace, then choose
            “Conduct supervisory assessment.” This prevents assessment of the wrong school.
          </p>
        </section>
      </main>
    );
  }

  if (!assessmentId) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl bg-slate-50 px-4 py-6 text-slate-900">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wide text-indigo-700">
            Start supervisory visit record
          </p>
          <h1 className="mt-2 text-2xl font-black">Confirm the observation date</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            The school, Headteacher, assessor authority and instrument version will be
            frozen when the draft is created.
          </p>
          <label className="mt-6 block text-sm font-bold" htmlFor="dateObserved">
            Date observed
          </label>
          <input
            id="dateObserved"
            type="date"
            value={dateObserved}
            max={today()}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDateObserved(event.target.value)
            }
            className="mt-2 min-h-12 w-full rounded-2xl border border-slate-300 px-4 text-lg"
          />
          {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-red-800">{error}</p> : null}
          <button
            type="button"
            disabled={busy || !dateObserved}
            onClick={() => void createDraft()}
            className="mt-6 min-h-14 w-full rounded-2xl bg-indigo-700 px-5 text-lg font-black text-white disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create assessment draft"}
          </button>
        </section>
      </main>
    );
  }

  if (!workspace || !currentSection || !currentItem) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl bg-slate-50 px-4 py-6 text-slate-900">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black">Headteacher supervisory assessment</h1>
          <p className="mt-4 text-slate-600">{busy ? "Loading assessment…" : error || "Assessment unavailable."}</p>
          <button
            type="button"
            onClick={() => void loadWorkspace(assessmentId)}
            className="mt-6 min-h-12 rounded-2xl border border-slate-300 px-5 font-bold"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  const stableWorkspace = workspace;
  const stableSection = currentSection;
  const editable = workspace.assessment.canEdit === true;
  const isFirstItem = sectionIndex === 0 && itemIndex === 0;
  const isLastItem =
    sectionIndex === workspace.sections.length - 1 &&
    itemIndex === currentSection.items.length - 1;

  function previousQuestion() {
    if (itemIndex > 0) {
      setItemIndex(itemIndex - 1);
    } else if (sectionIndex > 0) {
      const previousSection = stableWorkspace.sections[sectionIndex - 1];
      setSectionIndex(sectionIndex - 1);
      setItemIndex(previousSection.items.length - 1);
    }
  }

  function nextQuestion() {
    if (itemIndex < stableSection.items.length - 1) {
      setItemIndex(itemIndex + 1);
    } else if (sectionIndex < stableWorkspace.sections.length - 1) {
      setSectionIndex(sectionIndex + 1);
      setItemIndex(0);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-slate-50 px-4 py-5 text-slate-900">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-indigo-700">
          Headteacher supervisory assessment
        </p>
        <h1 className="mt-2 text-2xl font-black">
          {workspace.visit.targetName || "Headteacher"}
        </h1>
        <p className="mt-1 font-semibold text-slate-700">{workspace.visit.schoolName}</p>
        <p className="mt-1 text-sm text-slate-500">
          {workspace.visit.circuitName} · {workspace.visit.districtName}
        </p>
        <div className="mt-4 rounded-2xl bg-slate-100 p-4">
          <p className="font-black">{workspace.lifecycle.label}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {workspace.lifecycle.description}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Visit: {workspace.visit.dateObserved} · Revision {workspace.assessment.revision}
          </p>
        </div>
        {workspace.lifecycle.returnReason ? (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-black text-amber-900">Reason returned</p>
            <p className="mt-1 leading-6 text-amber-900">
              {workspace.lifecycle.returnReason}
            </p>
          </div>
        ) : null}
      </header>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-600">
          <span>
            Section {sectionIndex + 1} of {workspace.sections.length}
          </span>
          <span>
            Question {itemIndex + 1} of {currentSection.items.length}
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-700"
            style={{ width: `${workspace.assessment.progress.completionPercentage}%` }}
          />
        </div>
        <h2 className="mt-5 text-xl font-black">{currentSection.title}</h2>
        {currentSection.description ? (
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {currentSection.description}
          </p>
        ) : null}
        <article className="mt-5 rounded-3xl border-2 border-slate-200 p-5">
          <p className="text-lg font-bold leading-7">{currentItem.label}</p>
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[1, 2, 3, 4, 5].map((score) => {
              const selected =
                currentAnswer?.notApplicable !== true &&
                currentAnswer?.score === score;
              return (
                <button
                  key={score}
                  type="button"
                  disabled={!editable || busy}
                  aria-pressed={selected}
                  onClick={() => chooseScore(score, false)}
                  className={`min-h-14 rounded-2xl border-2 text-lg font-black ${
                    selected
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-900"
                  } disabled:opacity-60`}
                >
                  {score}
                </button>
              );
            })}
            <button
              type="button"
              disabled={!editable || busy}
              aria-pressed={currentAnswer?.notApplicable === true}
              onClick={() => chooseScore(null, true)}
              className={`min-h-14 rounded-2xl border-2 px-2 font-black ${
                currentAnswer?.notApplicable === true
                  ? "border-indigo-700 bg-indigo-700 text-white"
                  : "border-slate-300 bg-white text-slate-900"
              } disabled:opacity-60`}
            >
              N/A
            </button>
          </div>
        </article>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isFirstItem || busy}
            onClick={previousQuestion}
            className="min-h-12 rounded-2xl border border-slate-300 px-4 font-bold disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={isLastItem || busy}
            onClick={nextQuestion}
            className="min-h-12 rounded-2xl border border-slate-300 px-4 font-bold disabled:opacity-40"
          >
            Next
          </button>
        </div>

        {editable ? (
          <button
            type="button"
            disabled={busy || answeredInCurrentSection === 0}
            onClick={() => void saveCurrentSection()}
            className="mt-4 min-h-14 w-full rounded-2xl bg-slate-900 px-5 text-lg font-black text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : `Save this section (${answeredInCurrentSection}/${currentSection.items.length})`}
          </button>
        ) : null}

        {workspace.assessment.canFinalize ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void finalizeAssessment()}
            className="mt-4 min-h-14 w-full rounded-2xl bg-emerald-700 px-5 text-lg font-black text-white disabled:opacity-50"
          >
            Submit completed assessment
          </button>
        ) : null}

        {workspace.lifecycle.canCreateRevision ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void createRevision()}
            className="mt-4 min-h-14 w-full rounded-2xl bg-amber-600 px-5 text-lg font-black text-white disabled:opacity-50"
          >
            Create correction copy
          </button>
        ) : null}

        {notice ? (
          <p className="mt-4 rounded-2xl bg-emerald-50 p-3 font-semibold text-emerald-900">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-2xl bg-red-50 p-3 font-semibold text-red-800">
            {error}
          </p>
        ) : null}
        <p className="mt-5 text-sm leading-6 text-slate-500">
          Answers are saved only when you press “Save this section.” There is no
          background polling or browser-storage copy.
        </p>
      </section>
    </main>
  );
}
