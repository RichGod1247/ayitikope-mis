// src/components/HeadteacherResultsReleaseClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Classroom = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

type Props = {
  classrooms: Classroom[];
  defaultTerm: string;
  defaultAcademicYear: string;
};

type ReleaseRecord = {
  releasedAt: string;
  readinessStatus?: string;
  readinessScore?: number;
  releaseMode?: string | null;
  releaseSnapshotHash?: string | null;
};

type SuppressedRelease = ReleaseRecord & {
  scope?: string | null;
  scopeKey?: string | null;
  classroomId?: string | null;
  reason?: string | null;
};

type ReleaseStatusResp =
  | {
      ok: true;
      term: string;
      academicYear: string;
      school: ReleaseRecord | null;
      classroomReleaseMap: Record<string, ReleaseRecord>;
      suppressedReleases?: SuppressedRelease[];
    }
  | { ok: false; error: string; role?: string; path?: string };

type ReadinessStatus = "READY" | "BLOCKED" | string;

type SubjectReadiness = {
  subject: string;
  readinessStatus: ReadinessStatus;
  readinessScore: number;
  learnerCount: number;
  componentCount: number;
  requiredComponentCount: number;
  totalRequiredCells: number;
  missingRequiredCells: number;
  missingOptionalCells: number;
  completedLearnersCount: number;
  incompleteLearnersCount: number;
  averagePercent: number | null;
  itemsCount: number;
  draftItemsCount: number;
  publishedItemsCount: number;
  lockedItemsCount: number;
  blockedReasons: string[];
};

type ClassReadiness = {
  classroomId: string;
  classroomName: string;
  grade: string | null;
  arm: string | null;
  releaseApplicable: boolean;
  setupOnly: boolean;
  setupReason: string | null;
  learnersCount: number;
  itemsCount: number;
  averagePercent: number | null;
  draftItemsCount: number;
  publishedItemsCount: number;
  lockedItemsCount: number;
  readinessStatus: ReadinessStatus;
  readinessScore: number;
  subjectsCount: number;
  readySubjectsCount: number;
  blockedSubjectsCount: number;
  totalRequiredCells: number;
  missingRequiredCells: number;
  missingOptionalCells: number;
  completedLearnerSubjectRows: number;
  incompleteLearnerSubjectRows: number;
  blockedReasons: string[];
  subjectReadiness: SubjectReadiness[];
};

type SchoolReadiness = {
  status: ReadinessStatus;
  score: number;
  classesCount: number;
  releaseApplicableClassesCount: number;
  setupOnlyClassesCount: number;
  readyClassesCount: number;
  blockedClassesCount: number;
  learnersCount: number;
  subjectsCount: number;
  totalRequiredCells: number;
  missingRequiredCells: number;
  blockedReasons: string[];
};

type ReadinessResp =
  | {
      ok: true;
      context: { tenantId: string; term: string; academicYear: string };
      readiness: SchoolReadiness;
      classes: ClassReadiness[];
      setupOnlyClasses: ClassReadiness[];
    }
  | { ok: false; error: string; details?: unknown };

type NotifyStatus = {
  ok: boolean;
  error?: string;
  job?: unknown;
  remaining?: number;
  batch?: { sent: number; failed: number };
  done?: boolean;
};

type ReleaseMutationResp = {
  ok?: boolean;
  error?: string;
  message?: string;
  blockedReasons?: string[];
  readiness?: { blockedReasons?: string[] };
};

type StreamMode = "single" | "multi";
type BusyState = "status" | "release" | "unrelease" | "notify" | null;

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeStageBucket(raw: unknown): string | null {
  const compact = cleanStr(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;

  let m =
    compact.match(/^KG([12])(?:[A-Z].*)?$/) ||
    compact.match(/^KINDERGARTEN([12])(?:[A-Z].*)?$/);
  if (m) return `KG ${m[1]}`;

  m = compact.match(/^(PRIMARY|PRI|P)([1-6])(?:[A-Z].*)?$/);
  if (m) return `PRIMARY ${m[2]}`;

  m = compact.match(/^(BASIC|B)([1-9])(?:[A-Z].*)?$/);
  if (m) {
    const n = Number(m[2]);
    if (n >= 1 && n <= 6) return `PRIMARY ${n}`;
    if (n === 7) return "JHS 1";
    if (n === 8) return "JHS 2";
    if (n === 9) return "JHS 3";
  }

  m = compact.match(/^JHS([1-3])(?:[A-Z].*)?$/);
  if (m) return `JHS ${m[1]}`;

  return null;
}

function getStageBucketForClassroom(c: Classroom) {
  return normalizeStageBucket(c.grade) ?? normalizeStageBucket(c.name);
}

function hasDuplicateStageBuckets(list: Classroom[]) {
  const seen = new Set<string>();
  for (const c of list) {
    const bucket = getStageBucketForClassroom(c);
    if (!bucket) continue;
    if (seen.has(bucket)) return true;
    seen.add(bucket);
  }
  return false;
}

function fullClassLabel(c: Classroom) {
  const name = cleanStr(c.name);
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (grade) return `${name}${grade ? ` (${grade}${arm ? ` ${arm}` : ""})` : ""}`;
  return name || "Class";
}

function singleStreamLabel(c: Classroom) {
  return getStageBucketForClassroom(c) || fullClassLabel(c);
}

function chooseRepresentativeClass(
  group: Classroom[],
  preferredClassroomId: string | null
) {
  return (
    group.find((x) => x.id === preferredClassroomId) ??
    group.find((x) => !cleanStr(x.arm)) ??
    group[0]
  );
}

function buildSingleStreamClassrooms(
  list: Classroom[],
  preferredClassroomId: string | null
): Classroom[] {
  const orderedBuckets = [
    "KG 1",
    "KG 2",
    "PRIMARY 1",
    "PRIMARY 2",
    "PRIMARY 3",
    "PRIMARY 4",
    "PRIMARY 5",
    "PRIMARY 6",
    "JHS 1",
    "JHS 2",
    "JHS 3",
  ] as const;

  const grouped = new Map<string, Classroom[]>();
  const others: Classroom[] = [];

  for (const c of list) {
    const bucket = getStageBucketForClassroom(c);
    if (!bucket) {
      others.push(c);
      continue;
    }

    const arr = grouped.get(bucket) ?? [];
    arr.push(c);
    grouped.set(bucket, arr);
  }

  const picked: Classroom[] = [];

  for (const bucket of orderedBuckets) {
    const group = grouped.get(bucket) ?? [];
    if (!group.length) continue;
    picked.push(chooseRepresentativeClass(group, preferredClassroomId));
  }

  return [...picked, ...others];
}

function classFromReadiness(c: ClassReadiness): Classroom {
  return {
    id: c.classroomId,
    name: c.classroomName,
    grade: c.grade,
    arm: c.arm,
  };
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusBadgeClass(status: string | null | undefined) {
  const s = cleanStr(status).toUpperCase();
  if (s === "READY" || s === "OVERRIDE") {
    return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  }
  if (s === "BLOCKED") {
    return "border-rose-300/20 bg-rose-400/12 text-rose-100";
  }
  return "border-white/10 bg-white/5 text-[#C9CDD6]";
}

function shortHash(hash: string | null | undefined) {
  const h = cleanStr(hash);
  if (!h) return "—";
  if (h.length <= 16) return h;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function releaseErrorMessage(statusCode: number, payload: ReleaseMutationResp | null) {
  const code = cleanStr(payload?.error) || `HTTP ${statusCode}`;
  if (statusCode === 409 || code === "RELEASE_BLOCKED_BY_READINESS") {
    return "Release blocked by assessment readiness. Fix the blockers below, then refresh and try again.";
  }
  return payload?.message || code || "Release failed.";
}

function releaseErrorReasons(payload: ReleaseMutationResp | null) {
  const direct = Array.isArray(payload?.blockedReasons) ? payload.blockedReasons : [];
  const nested = Array.isArray(payload?.readiness?.blockedReasons)
    ? payload.readiness.blockedReasons
    : [];

  return [...direct, ...nested].map(cleanStr).filter(Boolean).slice(0, 10);
}

export default function HeadteacherResultsReleaseClient({
  classrooms,
  defaultTerm,
  defaultAcademicYear,
}: Props) {
  const [term, setTerm] = useState(defaultTerm);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);

  const [scope, setScope] = useState<"SCHOOL" | "CLASSROOM">("SCHOOL");
  const [classroomId, setClassroomId] = useState<string>(classrooms[0]?.id ?? "");
  const [streamMode, setStreamMode] = useState<StreamMode>("single");

  const [status, setStatus] = useState<ReleaseStatusResp | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResp | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);

  const [batchSize, setBatchSize] = useState<number>(25);
  const [notify, setNotify] = useState<NotifyStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionReasons, setActionReasons] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const releaseClassrooms = useMemo(() => {
    if (readiness?.ok === true) return readiness.classes.map(classFromReadiness);
    return classrooms;
  }, [readiness, classrooms]);

  const canToggleMultiStream = useMemo(() => {
    return hasDuplicateStageBuckets(releaseClassrooms);
  }, [releaseClassrooms]);

  const visibleClassrooms = useMemo(() => {
    if (!canToggleMultiStream) return releaseClassrooms;
    if (streamMode === "multi") return releaseClassrooms;
    return buildSingleStreamClassrooms(releaseClassrooms, classroomId || null);
  }, [releaseClassrooms, canToggleMultiStream, streamMode, classroomId]);

  useEffect(() => {
    if (!visibleClassrooms.length) {
      if (classroomId) setClassroomId("");
      return;
    }

    if (visibleClassrooms.some((c) => c.id === classroomId)) return;

    const current = releaseClassrooms.find((c) => c.id === classroomId);
    const currentBucket = current ? getStageBucketForClassroom(current) : null;

    if (currentBucket) {
      const sameBucketVisible = visibleClassrooms.find(
        (c) => getStageBucketForClassroom(c) === currentBucket
      );
      if (sameBucketVisible) {
        setClassroomId(sameBucketVisible.id);
        return;
      }
    }

    setClassroomId(visibleClassrooms[0].id);
  }, [visibleClassrooms, releaseClassrooms, classroomId]);

  async function loadDashboard() {
    setBusy("status");
    setActionError(null);
    setActionReasons([]);
    setActionMessage(null);

    try {
      const qs = new URLSearchParams({ term, academicYear });

      const [statusRes, readinessRes] = await Promise.all([
        fetch(`/api/headteacher/results/release/status?${qs.toString()}`, {
          cache: "no-store",
        }),
        fetch(`/api/headteacher/assessment/overview?${qs.toString()}`, {
          cache: "no-store",
        }),
      ]);

      const statusJson =
        (await safeJson<ReleaseStatusResp>(statusRes)) ??
        ({ ok: false, error: "Invalid release-status JSON" } as ReleaseStatusResp);

      const readinessJson =
        (await safeJson<ReadinessResp>(readinessRes)) ??
        ({ ok: false, error: "Invalid readiness JSON" } as ReadinessResp);

      setStatus(statusJson);
      setReadiness(readinessJson);

      if (!statusRes.ok && statusJson.ok !== true) {
        setActionError(statusJson.error || "Failed to load release status.");
      } else if (!readinessRes.ok && readinessJson.ok !== true) {
        setActionError(readinessJson.error || "Failed to load assessment readiness.");
      }
    } catch (err) {
      console.error("[HeadteacherResultsReleaseClient.loadDashboard]", err);
      setStatus({ ok: false, error: "Failed to load release status." });
      setReadiness({ ok: false, error: "Failed to load assessment readiness." });
      setActionError("Failed to load release dashboard. Check your connection and refresh.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, academicYear]);

  const schoolReadiness = readiness?.ok === true ? readiness.readiness : null;

  const selectedClassReadiness = useMemo(() => {
    if (readiness?.ok !== true || !classroomId) return null;
    return readiness.classes.find((c) => c.classroomId === classroomId) ?? null;
  }, [readiness, classroomId]);

  const selectedReadinessStatus =
    scope === "SCHOOL"
      ? schoolReadiness?.status ?? null
      : selectedClassReadiness?.readinessStatus ?? null;

  const selectedReadinessScore =
    scope === "SCHOOL"
      ? schoolReadiness?.score ?? null
      : selectedClassReadiness?.readinessScore ?? null;

  const selectedBlockedReasons = useMemo(() => {
    if (scope === "SCHOOL") return schoolReadiness?.blockedReasons ?? [];
    if (selectedClassReadiness?.blockedReasons?.length) {
      return selectedClassReadiness.blockedReasons;
    }
    return (
      selectedClassReadiness?.subjectReadiness
        ?.flatMap((s) => s.blockedReasons.map((reason) => `${s.subject}: ${reason}`))
        .slice(0, 10) ?? []
    );
  }, [scope, schoolReadiness, selectedClassReadiness]);

  const selectedRelease = useMemo(() => {
    if (!status || status.ok !== true) return null;
    if (scope === "SCHOOL") return status.school;
    return status.school ?? status.classroomReleaseMap?.[classroomId] ?? null;
  }, [status, scope, classroomId]);

  const releaseSource = useMemo(() => {
    if (!status || status.ok !== true || !selectedRelease) return null;
    if (scope === "SCHOOL") return "school-wide";
    if (status.school) return "school-wide";
    return "class-specific";
  }, [status, scope, selectedRelease]);

  const isReleased = !!selectedRelease;
  const readinessIsLoaded = readiness !== null;
  const readinessFailed = readiness?.ok === false;
  const canRelease = selectedReadinessStatus === "READY";

  const releaseDisabledReason = useMemo(() => {
    if (!readinessIsLoaded) return "Checking readiness before release.";
    if (readinessFailed) return "Readiness could not be loaded. Fail closed.";
    if (scope === "CLASSROOM" && !classroomId) {
      return "Select a release-applicable class first.";
    }
    if (scope === "CLASSROOM" && !selectedClassReadiness) {
      return "Selected class is not release-applicable for this term/year.";
    }
    if (!canRelease) return "Assessment readiness is blocked.";
    return null;
  }, [
    readinessIsLoaded,
    readinessFailed,
    scope,
    classroomId,
    selectedClassReadiness,
    canRelease,
  ]);

  async function doRelease() {
    setNotify(null);
    setActionMessage(null);
    setActionReasons([]);

    if (releaseDisabledReason) {
      setActionError(releaseDisabledReason);
      setActionReasons(selectedBlockedReasons.slice(0, 10));
      return;
    }

    setBusy("release");
    setActionError(null);

    try {
      const res = await fetch("/api/headteacher/results/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          term,
          academicYear,
          classroomId: scope === "CLASSROOM" ? classroomId : null,
        }),
      });

      const json = await safeJson<ReleaseMutationResp>(res);
      if (!res.ok || !json?.ok) {
        setActionError(releaseErrorMessage(res.status, json));
        setActionReasons(releaseErrorReasons(json));
        await loadDashboard();
        return;
      }

      setActionMessage("Parent result access is now evidence-backed and released.");
      await loadDashboard();
    } finally {
      setBusy(null);
    }
  }

  async function doUnrelease() {
    setBusy("unrelease");
    setNotify(null);
    setActionError(null);
    setActionMessage(null);
    setActionReasons([]);

    try {
      const res = await fetch("/api/headteacher/results/release", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          term,
          academicYear,
          classroomId: scope === "CLASSROOM" ? classroomId : null,
        }),
      });

      const json = await safeJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !json?.ok) {
        setActionError(json?.error || `Unrelease failed (HTTP ${res.status})`);
        return;
      }

      setActionMessage("Parent result access has been turned off for the selected scope.");
      await loadDashboard();
    } finally {
      setBusy(null);
    }
  }

  async function sendNextBatch() {
    setNotify(null);
    setActionError(null);
    setActionMessage(null);

    if (!isReleased) {
      setActionError("Release must be ON before notifying parents.");
      return;
    }

    setBusy("notify");

    try {
      const res = await fetch("/api/headteacher/results/release/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          term,
          academicYear,
          classroomId: scope === "CLASSROOM" ? classroomId : null,
          batchSize,
        }),
      });

      const json =
        (await safeJson<NotifyStatus>(res)) ??
        ({ ok: false, error: "Invalid JSON from server" } as NotifyStatus);

      setNotify(json);

      if (!res.ok || !json.ok) {
        setActionError(json.error || `Notify failed (HTTP ${res.status})`);
      }
    } finally {
      setBusy(null);
    }
  }

  const readinessBannerStatus =
    schoolReadiness?.status ?? (readinessFailed ? "ERROR" : "CHECKING");
  const suppressedCount =
    status?.ok === true ? status.suppressedReleases?.length ?? 0 : 0;
  const overviewRows = readiness?.ok === true ? readiness.classes : [];

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#F7F4ED]">
              Parent result release
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] text-[#C9CDD6]">
              This page now checks assessment readiness before release. The backend remains
              the final authority; the UI simply exposes the evidence before the click.
            </p>
          </div>

          <a
            href="/headteacher/assessment/overview"
            className="inline-flex w-fit items-center rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/16"
          >
            Fix assessment blockers →
          </a>
        </div>

        <div
          className={`rounded-2xl border px-4 py-3 ${statusBadgeClass(
            readinessBannerStatus
          )}`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
                Release readiness
              </div>
              <div className="mt-1 text-lg font-semibold">
                {readinessBannerStatus === "CHECKING"
                  ? "Checking…"
                  : readinessBannerStatus === "ERROR"
                    ? "Readiness unavailable"
                    : readinessBannerStatus}
              </div>
              <p className="mt-1 max-w-2xl text-[11px] opacity-90">
                {readinessFailed
                  ? readiness.error
                  : schoolReadiness?.status === "READY"
                    ? "All release-applicable classes currently pass the assessment readiness gate."
                    : "Release is blocked until the missing assessment evidence below is fixed."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                <div className="opacity-75">Score</div>
                <div className="text-base font-semibold">{schoolReadiness?.score ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                <div className="opacity-75">Release classes</div>
                <div className="text-base font-semibold">
                  {schoolReadiness?.releaseApplicableClassesCount ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                <div className="opacity-75">Setup-only</div>
                <div className="text-base font-semibold">
                  {schoolReadiness?.setupOnlyClassesCount ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                <div className="opacity-75">Blocked</div>
                <div className="text-base font-semibold">
                  {schoolReadiness?.blockedClassesCount ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {schoolReadiness?.blockedReasons?.length ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
              <div className="text-[11px] font-semibold">Top blockers</div>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] opacity-90">
                {schoolReadiness.blockedReasons.slice(0, 6).map((reason, idx) => (
                  <li key={`${reason}-${idx}`}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#C9CDD6]">
              Term
            </label>
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
            >
              <option value="1st Term">1st Term</option>
              <option value="2nd Term">2nd Term</option>
              <option value="3rd Term">3rd Term</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#C9CDD6]">
              Academic year
            </label>
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
              placeholder="e.g. 2025/2026"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={busy === "status"}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
            >
              {busy === "status" ? "Refreshing…" : "Refresh readiness"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 px-3 py-3 text-[11px] text-[#C9CDD6]">
          <div className="font-semibold text-[#F7F4ED]">Scope</div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScope("SCHOOL")}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold border ${
                scope === "SCHOOL"
                  ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                  : "border-white/10 bg-white/5 text-[#D7DCE5]"
              }`}
            >
              Whole school
            </button>

            <button
              type="button"
              onClick={() => setScope("CLASSROOM")}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold border ${
                scope === "CLASSROOM"
                  ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                  : "border-white/10 bg-white/5 text-[#D7DCE5]"
              }`}
            >
              Per class
            </button>
          </div>

          {scope === "CLASSROOM" ? (
            <div className="mt-3 space-y-2">
              {visibleClassrooms.length ? (
                <select
                  value={classroomId}
                  onChange={(e) => setClassroomId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#05070B] px-3 py-2 text-[11px] text-[#F7F4ED]"
                >
                  {visibleClassrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {streamMode === "single"
                        ? singleStreamLabel(c)
                        : fullClassLabel(c)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-rose-100">
                  No release-applicable class found for this term/year.
                </div>
              )}

              {canToggleMultiStream ? (
                <label className="inline-flex items-center gap-2 text-[11px] text-[#AEB6C4]">
                  <input
                    type="checkbox"
                    checked={streamMode === "multi"}
                    onChange={(e) =>
                      setStreamMode(e.target.checked ? "multi" : "single")
                    }
                  />
                  Show multistream classes
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(
                  selectedReadinessStatus
                )}`}
              >
                {selectedReadinessStatus ?? "NOT CHECKED"}
              </span>
              <span>Selected scope readiness score: {selectedReadinessScore ?? "—"}</span>
              {releaseDisabledReason ? (
                <span className="font-semibold text-rose-200">
                  {releaseDisabledReason}
                </span>
              ) : (
                <span className="font-semibold text-emerald-100">
                  Ready for evidence-backed release.
                </span>
              )}
            </div>

            {selectedBlockedReasons.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-rose-100">
                {selectedBlockedReasons.slice(0, 6).map((reason, idx) => (
                  <li key={`${reason}-${idx}`}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void doRelease()}
            disabled={busy === "release" || !!releaseDisabledReason}
            title={releaseDisabledReason ?? undefined}
            className="rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-[11px] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy === "release"
              ? "Releasing…"
              : isReleased
                ? "Refresh release evidence"
                : "Release parent access"}
          </button>

          <button
            type="button"
            onClick={() => void doUnrelease()}
            disabled={busy === "unrelease" || !isReleased}
            className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-4 py-2 text-[11px] font-semibold text-rose-100 hover:bg-rose-400/16 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy === "unrelease" ? "Turning off…" : "Turn release off"}
          </button>

          <span className="text-[11px] text-[#C9CDD6]">
            Status:{" "}
            <span
              className={`font-semibold ${
                isReleased ? "text-emerald-100" : "text-[#F7F4ED]"
              }`}
            >
              {isReleased ? `Released (${releaseSource})` : "Not released"}
            </span>{" "}
            for <span className="font-semibold text-[#F7F4ED]">{term}</span> ·{" "}
            <span className="font-semibold text-[#F7F4ED]">{academicYear}</span>
          </span>
        </div>

        {selectedRelease ? (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-[11px] text-emerald-100">
            Evidence-backed release: {formatDateTime(selectedRelease.releasedAt)} ·{" "}
            Readiness: {selectedRelease.readinessStatus ?? "—"} · Score:{" "}
            {selectedRelease.readinessScore ?? "—"} · Hash:{" "}
            <span className="font-mono">{shortHash(selectedRelease.releaseSnapshotHash)}</span>
          </div>
        ) : null}

        {suppressedCount ? (
          <div className="rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-[11px] text-amber-100">
            {suppressedCount} old release row{suppressedCount === 1 ? "" : "s"} hidden
            because the row is not evidence-backed. This protects parents from unsafe
            legacy results.
          </div>
        ) : null}

        {actionError ? (
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-[11px] text-rose-100">
            <div className="font-semibold">{actionError}</div>
            {actionReasons.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {actionReasons.map((reason, idx) => (
                  <li key={`${reason}-${idx}`}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {actionMessage ? (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-[11px] font-semibold text-emerald-100">
            {actionMessage}
          </div>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl space-y-2">
        <div>
          <p className="text-sm font-semibold text-[#F7F4ED]">
            Notify parents by SMS (batched)
          </p>
          <p className="max-w-2xl text-[11px] text-[#C9CDD6]">
            Sends to guardians with{" "}
            <span className="font-semibold text-[#F7F4ED]">SMS consent = true</span>.
            One batch per click keeps delivery safer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-[#C9CDD6]">Batch size</label>
          <input
            type="number"
            value={batchSize}
            onChange={(e) =>
              setBatchSize(Math.max(5, Math.min(60, Number(e.target.value || 25))))
            }
            className="w-24 rounded-lg border border-white/10 bg-[#07111F] px-3 py-1.5 text-[11px] text-[#F7F4ED]"
          />

          <button
            type="button"
            onClick={() => void sendNextBatch()}
            disabled={busy === "notify" || !isReleased}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#F7F4ED] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy === "notify" ? "Sending…" : "Send next batch"}
          </button>

          {!isReleased ? (
            <span className="text-[11px] text-rose-200">
              Release must be ON before notifying.
            </span>
          ) : null}
        </div>

        {notify?.ok ? (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-[11px] text-emerald-100">
            <div className="font-semibold">Batch result</div>
            <div className="mt-1">
              Sent: <span className="font-semibold">{notify.batch?.sent ?? 0}</span> ·
              Failed: <span className="font-semibold"> {notify.batch?.failed ?? 0}</span>{" "}
              · Remaining:{" "}
              <span className="font-semibold"> {notify.remaining ?? "—"}</span>
            </div>
            {notify.done ? <div className="mt-1 font-semibold">Done ✅</div> : null}
          </div>
        ) : notify?.error ? (
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-[11px] text-rose-100">
            {notify.error}
          </div>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#F7F4ED]">
              Release overview (release-applicable classes)
            </p>
            <p className="mt-1 text-[11px] text-[#C9CDD6]">
              Empty setup-only seeded classes are excluded from release readiness and do not
              block release.
            </p>
          </div>

          {readiness?.ok === true && readiness.setupOnlyClasses.length ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-[#C9CDD6]">
              Setup-only classes hidden from release: {readiness.setupOnlyClasses.length}
            </div>
          ) : null}
        </div>

        {!readiness ? (
          <p className="mt-2 text-[11px] text-[#C9CDD6]">Loading…</p>
        ) : readiness.ok !== true ? (
          <p className="mt-2 text-[11px] text-rose-200">
            {readiness.error || "Failed to load readiness."}
          </p>
        ) : !overviewRows.length ? (
          <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-[11px] text-rose-100">
            No release-applicable classes found. Add active learners or assessment activity
            before releasing reports.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Class
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Readiness
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Score
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Missing cells
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Released?
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Top blocker
                  </th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.map((c, idx) => {
                  const zebra = idx % 2 === 1 ? "bg-white/[0.03]" : "bg-transparent";
                  const classRelease =
                    status?.ok === true
                      ? status.school ?? status.classroomReleaseMap?.[c.classroomId] ?? null
                      : null;
                  const releasedBySchool = status?.ok === true && !!status.school;

                  return (
                    <tr key={c.classroomId} className={zebra}>
                      <td className="px-2 py-2 font-semibold text-[#F7F4ED]">
                        {streamMode === "single"
                          ? singleStreamLabel(classFromReadiness(c))
                          : fullClassLabel(classFromReadiness(c))}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(
                            c.readinessStatus
                          )}`}
                        >
                          {c.readinessStatus}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[#C9CDD6]">{c.readinessScore}</td>
                      <td className="px-2 py-2 text-[#C9CDD6]">
                        {c.missingRequiredCells} / {c.totalRequiredCells}
                      </td>
                      <td className="px-2 py-2 text-[#C9CDD6]">
                        {classRelease
                          ? releasedBySchool
                            ? "Yes — school-wide"
                            : "Yes — class"
                          : "No"}
                      </td>
                      <td className="max-w-[360px] px-2 py-2 text-[#AEB6C4]">
                        {c.blockedReasons[0] ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}