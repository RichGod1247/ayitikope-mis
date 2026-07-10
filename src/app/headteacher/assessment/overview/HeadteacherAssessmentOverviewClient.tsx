// src/app/headteacher/assessment/overview/HeadteacherAssessmentOverviewClient.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AssessmentBroadsheetPanel from "@/components/teacher/AssessmentBroadsheetPanel";

type ClassBandSummary = {
  grade: number;
  label: string;
  minPercent: number;
  maxPercent: number;
  learnersCount: number;
};

type ClassOverview = {
  classroomId: string;
  classroomName: string;
  grade?: string | null;
  arm?: string | null;
  learnersCount: number;
  itemsCount: number;
  averagePercent: number | null;
  draftItemsCount: number;
  publishedItemsCount: number;
  lockedItemsCount: number;
};

type HeadteacherAssessmentOverviewResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    term: string;
    academicYear: string;
  };
  classes: ClassOverview[];
};

type RemarkSummaryResponse = {
  ok: boolean;
  context: {
    classroomId: string;
    term: string;
    academicYear: string;
  };
  totalLearnersEvaluated: number;
  bands: ClassBandSummary[];
};

type GovernanceOk = {
  ok: true;
  scope: {
    tenantId: string;
    term: string;
    academicYear: string;
    start: string;
    end: string;
  };
  metrics: {
    attendance: {
      totalSessions: number;
      closedSessions: number;
      certifiedSessions: number;
      pendingCertification: number;
      notifiedSessions: number;
      attendanceCertificationRate: number | null;
      notifyRate: number | null;
      avgCertifyDelayHrs: number | null;
      avgNotifyDelayHrs: number | null;
    };
    pipeline: {
      approvedNotesCount: number;
      deliveredLessonsCount: number;
      deliveryCoveragePercent: number | null;
      totalAssessmentsCount: number;
      linkedAssessmentsCount: number;
      assessmentLinkCoveragePercent: number | null;
      scoredAssessmentsCount: number;
      scoringCoveragePercent: number | null;
    };
    headteacherScore: number;
  };
  anomalies: {
    approvedNotDelivered: Array<{
      id: string;
      subject: string;
      lessonTitle: string | null;
      approvedAt: string | null;
      classroomId: string | null;
      teacherUserId: string;
    }>;
    deliveredNotAssessed: Array<{
      id: string;
      subject: string;
      indicatorCode: string | null;
      dateTaught: string | null;
      classroomId: string;
      teacherUserId: string;
    }>;
    assessedNotLinked: Array<{
      id: string;
      subject: string;
      title: string;
      date: string | null;
      classroomId: string;
    }>;
  };
  actions: Array<{
    code: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
    because: string[];
    message: string;
  }>;
};

type GovernanceResp = GovernanceOk | { ok: false; error: string };

type SbaClassScope = {
  classroomId: string;
  classLabel: string;
  grade?: string | null;
  arm?: string | null;
  stageBucket?: string | null;
  subjects: string[];
};

type SbaTeacherScope = {
  userId: string;
  name: string;
  email: string;
  classes: SbaClassScope[];
};

type SbaBucket = {
  key: "EXERCISE" | "CLASS_TEST" | "HOMEWORK" | string;
  label: string;
  count: number;
  scoredCount: number;
  averagePercent: number | null;
};

type SbaOutputOk = {
  ok: true;
  term: string;
  academicYear: string;
  teacher: SbaTeacherScope;
  classroom: { classroomId: string; classLabel: string };
  subject: string;
  workOutput: {
    itemCount: number;
    learnerCount: number;
    scoredEntries: number;
    buckets: SbaBucket[];
  };
  items: Array<{
    id: string;
    title: string;
    type: string;
    maxScore: number;
    status: string;
    scoresCount: number;
  }>;
  broadsheet: {
    subject: string;
    readiness: { status: string; score: number; blockedReasons?: string[] };
    rows: Array<{
      studentId: string;
      name: string;
      totalPercent: number | null;
      grade: string | null;
      gradeLabel?: string | null;
      remark?: string | null;
      position?: number | null;
      complete?: boolean;
    }>;
  };
};

type SbaRosterResp =
  | { ok: true; term: string; academicYear: string; teachers: SbaTeacherScope[] }
  | { ok: false; error: string };

type SbaOutputResp = SbaOutputOk | { ok: false; error: string };

type StreamMode = "single" | "multi";
type AssessmentSpine = "sba" | "mock";

const DEFAULT_TERM = "1st Term";
const DEFAULT_YEAR = "2025/2026";

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0";
  return value.toLocaleString("en-US");
}

function bandOrder(band: ClassBandSummary): number {
  if (typeof band.grade === "number") return band.grade;
  return 100 - (band.minPercent ?? 0);
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

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

function getStageBucketForClassroom(
  c: Pick<ClassOverview, "grade" | "classroomName">
) {
  return normalizeStageBucket(c.grade) ?? normalizeStageBucket(c.classroomName);
}

function hasDuplicateStageBuckets(list: ClassOverview[]) {
  const seen = new Set<string>();
  for (const c of list) {
    const bucket = getStageBucketForClassroom(c);
    if (!bucket) continue;
    if (seen.has(bucket)) return true;
    seen.add(bucket);
  }
  return false;
}

function fullClassLabel(c: ClassOverview) {
  const name = cleanStr(c.classroomName);
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (name && grade) {
    const same = name.toUpperCase() === grade.toUpperCase();
    if (same) return `${name}${arm ? ` ${arm}` : ""}`;
    return `${name} (${grade}${arm ? ` ${arm}` : ""})`;
  }

  if (name) return `${name}${arm ? ` ${arm}` : ""}`;
  if (grade) return `${grade}${arm ? ` ${arm}` : ""}`;

  return "Class";
}

function singleStreamLabel(c: ClassOverview) {
  return getStageBucketForClassroom(c) || fullClassLabel(c);
}

function pickSingleStreamRepresentative(
  group: ClassOverview[],
  preferredClassroomId: string | null
) {
  const preferred =
    group.find((x) => x.classroomId === preferredClassroomId) ?? null;

  if (preferred && !cleanStr(preferred.arm)) {
    return preferred;
  }

  const armLess = group
    .filter((x) => !cleanStr(x.arm))
    .sort((a, b) => fullClassLabel(a).localeCompare(fullClassLabel(b)));

  if (armLess.length > 0) {
    return armLess[0];
  }

  return (
    preferred ??
    [...group].sort((a, b) =>
      fullClassLabel(a).localeCompare(fullClassLabel(b))
    )[0]
  );
}

function buildSingleStreamClasses(
  list: ClassOverview[],
  preferredClassroomId: string | null
): ClassOverview[] {
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

  const grouped = new Map<string, ClassOverview[]>();
  const others: ClassOverview[] = [];

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

  const picked: ClassOverview[] = [];

  for (const bucket of orderedBuckets) {
    const group = grouped.get(bucket) ?? [];
    if (!group.length) continue;
    picked.push(pickSingleStreamRepresentative(group, preferredClassroomId));
  }

  return [
    ...picked,
    ...others.sort((a, b) => fullClassLabel(a).localeCompare(fullClassLabel(b))),
  ];
}


function getStageBucketForSbaClass(c: SbaClassScope) {
  return (
    normalizeStageBucket(c.stageBucket) ??
    normalizeStageBucket(c.grade) ??
    normalizeStageBucket(c.classLabel)
  );
}

function hasDuplicateSbaStageBuckets(list: SbaClassScope[]) {
  const seen = new Set<string>();
  for (const c of list) {
    const bucket = getStageBucketForSbaClass(c);
    if (!bucket) continue;
    if (seen.has(bucket)) return true;
    seen.add(bucket);
  }
  return false;
}

function singleSbaClassLabel(c: SbaClassScope) {
  return getStageBucketForSbaClass(c) || c.classLabel;
}

function pickSingleSbaRepresentative(
  group: SbaClassScope[],
  preferredClassroomId: string | null
) {
  const preferred = group.find((x) => x.classroomId === preferredClassroomId) ?? null;

  if (preferred && !cleanStr(preferred.arm)) return preferred;

  const armLess = group
    .filter((x) => !cleanStr(x.arm))
    .sort((a, b) => a.classLabel.localeCompare(b.classLabel));

  if (armLess.length > 0) return armLess[0];

  return preferred ?? [...group].sort((a, b) => a.classLabel.localeCompare(b.classLabel))[0];
}

function buildSingleStreamSbaClasses(
  list: SbaClassScope[],
  preferredClassroomId: string | null
): SbaClassScope[] {
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

  const grouped = new Map<string, SbaClassScope[]>();
  const others: SbaClassScope[] = [];

  for (const c of list) {
    const bucket = getStageBucketForSbaClass(c);
    if (!bucket) {
      others.push(c);
      continue;
    }

    const arr = grouped.get(bucket) ?? [];
    arr.push(c);
    grouped.set(bucket, arr);
  }

  const picked: SbaClassScope[] = [];

  for (const bucket of orderedBuckets) {
    const group = grouped.get(bucket) ?? [];
    if (!group.length) continue;
    picked.push(pickSingleSbaRepresentative(group, preferredClassroomId));
  }

  return [
    ...picked,
    ...others.sort((a, b) => a.classLabel.localeCompare(b.classLabel)),
  ];
}

function pickDefaultSbaClass(
  teacher: SbaTeacherScope | null,
  mode: StreamMode,
  preferredClassroomId: string | null
) {
  if (!teacher) return null;
  const options =
    mode === "multi"
      ? teacher.classes
      : buildSingleStreamSbaClasses(teacher.classes, preferredClassroomId);
  return options.find((c) => c.classroomId === preferredClassroomId) ?? options[0] ?? null;
}

function pctLabel(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.max(0, Math.min(100, v)).toFixed(1)}%`;
}

function priorityChip(priority: "HIGH" | "MEDIUM" | "LOW") {
  const cls =
    priority === "HIGH"
      ? "border-rose-300/25 bg-rose-400/12 text-rose-100"
      : priority === "MEDIUM"
      ? "border-amber-300/25 bg-amber-400/12 text-amber-100"
      : "border-white/10 bg-white/5 text-[#DDE3ED]";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${cls}`}
    >
      {priority}
    </span>
  );
}

function pill(text: string, tone: "rose" | "amber" | "slate") {
  const cls =
    tone === "rose"
      ? "border-rose-300/25 bg-rose-400/12 text-rose-100"
      : tone === "amber"
      ? "border-amber-300/25 bg-amber-400/12 text-amber-100"
      : "border-white/10 bg-white/5 text-[#DDE3ED]";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${cls}`}>
      {text}
    </span>
  );
}

const HeadteacherAssessmentOverviewClient: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTerm = searchParams.get("term") || DEFAULT_TERM;
  const initialYear = searchParams.get("academicYear") || DEFAULT_YEAR;

  const [term, setTerm] = useState(initialTerm);
  const [academicYear, setAcademicYear] = useState(initialYear);

  const [overview, setOverview] = useState<HeadteacherAssessmentOverviewResponse | null>(null);
  const [governance, setGovernance] = useState<GovernanceResp | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [govError, setGovError] = useState<string | null>(null);

  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);

  const [remarkBandsByClassroom, setRemarkBandsByClassroom] = useState<Record<string, ClassBandSummary[]>>({});
  const [remarkLoadingClassId, setRemarkLoadingClassId] = useState<string | null>(null);
  const [remarkError, setRemarkError] = useState<string | null>(null);

  const [streamMode, setStreamMode] = useState<StreamMode>("single");
  const [selectedSpine, setSelectedSpine] = useState<AssessmentSpine>("sba");
  const [showGovernancePanel, setShowGovernancePanel] = useState(false);
  const [showRemarkBandPanel, setShowRemarkBandPanel] = useState(false);
  const [showSbaPanel, setShowSbaPanel] = useState(false);
  const [sbaTeachers, setSbaTeachers] = useState<SbaTeacherScope[]>([]);
  const [sbaTeacherUserId, setSbaTeacherUserId] = useState("");
  const [sbaClassroomId, setSbaClassroomId] = useState("");
  const [sbaSubject, setSbaSubject] = useState("");
  const [sbaLoading, setSbaLoading] = useState(false);
  const [sbaOutputLoading, setSbaOutputLoading] = useState(false);
  const [sbaError, setSbaError] = useState<string | null>(null);
  const [sbaOutput, setSbaOutput] = useState<SbaOutputOk | null>(null);
  const [showSbaBroadsheet, setShowSbaBroadsheet] = useState(false);
  const [sbaStreamMode, setSbaStreamMode] = useState<StreamMode>("single");

  const classes: ClassOverview[] = overview?.classes ?? [];
  const governanceOk = governance && (governance as any).ok === true;

  const canToggleMultiStream = useMemo(() => hasDuplicateStageBuckets(classes), [classes]);

  const visibleClasses = useMemo(() => {
    if (!canToggleMultiStream) return classes;
    if (streamMode === "multi") return classes;
    return buildSingleStreamClasses(classes, selectedClassroomId);
  }, [classes, canToggleMultiStream, streamMode, selectedClassroomId]);

  const selectedClass = useMemo(() => {
    if (!visibleClasses.length && !classes.length) return null;

    if (selectedClassroomId) {
      const foundInVisible = visibleClasses.find((c) => c.classroomId === selectedClassroomId);
      if (foundInVisible) return foundInVisible;

      const foundInAll = classes.find((c) => c.classroomId === selectedClassroomId);
      if (foundInAll) return foundInAll;
    }

    return visibleClasses[0] ?? classes[0] ?? null;
  }, [visibleClasses, classes, selectedClassroomId]);

  const selectedSbaTeacher = useMemo(
    () => sbaTeachers.find((teacher) => teacher.userId === sbaTeacherUserId) ?? null,
    [sbaTeachers, sbaTeacherUserId]
  );

  const canToggleSbaMultiStream = useMemo(
    () => hasDuplicateSbaStageBuckets(selectedSbaTeacher?.classes ?? []),
    [selectedSbaTeacher]
  );

  const sbaClassOptions = useMemo(() => {
    const list = selectedSbaTeacher?.classes ?? [];
    if (!list.length) return [];
    if (!canToggleSbaMultiStream || sbaStreamMode === "multi") return list;
    return buildSingleStreamSbaClasses(list, sbaClassroomId);
  }, [selectedSbaTeacher, canToggleSbaMultiStream, sbaStreamMode, sbaClassroomId]);

  const selectedSbaClass = useMemo(
    () => selectedSbaTeacher?.classes.find((c) => c.classroomId === sbaClassroomId) ?? null,
    [selectedSbaTeacher, sbaClassroomId]
  );

  const selectedSbaSubjects = selectedSbaClass?.subjects ?? [];
  const canLoadSbaOutput = !!sbaTeacherUserId && !!sbaClassroomId && !!sbaSubject;

  function applySbaDefaults(teachers: SbaTeacherScope[]) {
    const teacher = teachers.find((t) => t.userId === sbaTeacherUserId) ?? teachers[0] ?? null;
    const cls = pickDefaultSbaClass(teacher, sbaStreamMode, sbaClassroomId);
    const subject = cls?.subjects.find((x) => x === sbaSubject) ?? cls?.subjects[0] ?? "";

    setSbaTeacherUserId(teacher?.userId ?? "");
    setSbaClassroomId(cls?.classroomId ?? "");
    setSbaSubject(subject);
  }

  async function loadSbaRoster(termValue: string, yearValue: string) {
    setSbaLoading(true);
    setSbaError(null);

    try {
      const params = new URLSearchParams({ term: termValue, academicYear: yearValue });
      const res = await fetch(`/api/headteacher/assessment/sba/work-output?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await safeJson<SbaRosterResp>(res);

      if (!res.ok || !json?.ok) {
        const err = json && "error" in json ? json.error : "Failed to load SBA teacher list.";
        setSbaTeachers([]);
        setSbaError(err);
        return;
      }

      setSbaTeachers(json.teachers);
      applySbaDefaults(json.teachers);
    } catch {
      setSbaTeachers([]);
      setSbaError("Network error while loading SBA teacher list.");
    } finally {
      setSbaLoading(false);
    }
  }

  async function loadSbaWorkOutput(options?: { showBroadsheet?: boolean }) {
    if (!canLoadSbaOutput) return;

    setSbaOutputLoading(true);
    setSbaError(null);

    try {
      const params = new URLSearchParams({
        term,
        academicYear,
        teacherUserId: sbaTeacherUserId,
        classroomId: sbaClassroomId,
        subject: sbaSubject,
      });

      const res = await fetch(`/api/headteacher/assessment/sba/work-output?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await safeJson<SbaOutputResp>(res);

      if (!res.ok || !json?.ok) {
        const err = json && "error" in json ? json.error : "Failed to load teacher work output.";
        setSbaOutput(null);
        setSbaError(err);
        return;
      }

      setSbaOutput(json);
      if (options?.showBroadsheet) setShowSbaBroadsheet(true);
    } catch {
      setSbaOutput(null);
      setSbaError("Network error while loading teacher work output.");
    } finally {
      setSbaOutputLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (term) params.set("term", term);
    if (academicYear) params.set("academicYear", academicYear);
    router.replace(`/headteacher/assessment/overview?${params.toString()}`);
  }, [term, academicYear, router]);

  useEffect(() => {
    if (!visibleClasses.length) {
      if (selectedClassroomId) setSelectedClassroomId(null);
      return;
    }

    if (visibleClasses.some((c) => c.classroomId === selectedClassroomId)) return;

    const current = classes.find((c) => c.classroomId === selectedClassroomId);
    const currentBucket = current ? getStageBucketForClassroom(current) : null;

    if (currentBucket) {
      const sameBucketVisible = visibleClasses.find(
        (c) => getStageBucketForClassroom(c) === currentBucket
      );
      if (sameBucketVisible) {
        setSelectedClassroomId(sameBucketVisible.classroomId);
        return;
      }
    }

    setSelectedClassroomId(visibleClasses[0].classroomId);
  }, [visibleClasses, classes, selectedClassroomId]);

  async function loadRemarkSummaryForClass(classroomId: string, termValue: string, yearValue: string) {
    if (!classroomId) return;

    setRemarkError(null);
    setRemarkLoadingClassId(classroomId);

    try {
      const params = new URLSearchParams({
        classroomId,
        term: termValue,
        academicYear: yearValue,
      });

      const res = await fetch(`/api/teacher/assessment/remark-summary?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await safeJson<RemarkSummaryResponse>(res);

      if (!res.ok || !data?.ok) {
        setRemarkError("Failed to load remark-band summary for this class.");
        setRemarkBandsByClassroom((prev) => ({ ...prev, [classroomId]: [] }));
        return;
      }

      setRemarkBandsByClassroom((prev) => ({
        ...prev,
        [classroomId]: Array.isArray(data.bands) ? data.bands : [],
      }));
    } catch {
      setRemarkError("Network error while loading remark-band summary.");
      setRemarkBandsByClassroom((prev) => ({ ...prev, [classroomId]: [] }));
    } finally {
      setRemarkLoadingClassId(null);
    }
  }

  async function loadOverviewAndGovernance(termValue: string, yearValue: string) {
    setLoading(true);
    setLoadError(null);

    try {
      setRemarkBandsByClassroom({});

      const params = new URLSearchParams({ term: termValue, academicYear: yearValue });
      const oRes = await fetch(`/api/headteacher/assessment/overview?${params.toString()}`, {
        cache: "no-store",
      });
      const oJson = await safeJson<HeadteacherAssessmentOverviewResponse>(oRes);

      if (!oRes.ok || !oJson?.ok) {
        setLoadError("Unexpected server error while loading overview.");
        setOverview(null);
      } else {
        setOverview(oJson);

        const nextSelected =
          oJson.classes.find((c) => c.classroomId === selectedClassroomId)?.classroomId ??
          oJson.classes[0]?.classroomId ??
          null;

        setSelectedClassroomId(nextSelected);
      }
    } catch {
      setLoadError("Network error while loading overview data.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadGovernance(termValue: string, yearValue: string) {
    setGovError(null);

    try {
      const params = new URLSearchParams({ term: termValue, academicYear: yearValue });
      const gRes = await fetch(`/api/headteacher/insights/governance?${params.toString()}`, {
        cache: "no-store",
      });
      const gJson = await safeJson<GovernanceResp>(gRes);

      if (!gRes.ok || !gJson || (gJson as any).ok === false) {
        const err = (gJson as any)?.error || `Failed to load governance (HTTP ${gRes.status}).`;
        setGovError(err);
        setGovernance(gJson ?? { ok: false, error: err });
      } else {
        setGovernance(gJson);
      }
    } catch {
      setGovError("Network error while loading governance.");
      setGovernance({ ok: false, error: "Network error while loading governance." });
    }
  }

  useEffect(() => {
    void loadOverviewAndGovernance(term, academicYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, academicYear]);

  useEffect(() => {
    setSbaOutput(null);
    setShowSbaBroadsheet(false);
    if (showSbaPanel) void loadSbaRoster(term, academicYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, academicYear]);

  useEffect(() => {
    if (!showRemarkBandPanel) return;
    if (!selectedClassroomId) return;
    if (remarkBandsByClassroom[selectedClassroomId]) return;
    void loadRemarkSummaryForClass(selectedClassroomId, term, academicYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRemarkBandPanel, selectedClassroomId, term, academicYear]);

  const totalClasses = classes.length;

  const totalLearners = useMemo(
    () => classes.reduce((sum, c) => sum + (c.learnersCount || 0), 0),
    [classes]
  );

  const totalItems = useMemo(
    () => classes.reduce((sum, c) => sum + (c.itemsCount || 0), 0),
    [classes]
  );

  const averageAcrossSchool = useMemo(() => {
    const vals = classes
      .map((c) => c.averagePercent)
      .filter((v): v is number => typeof v === "number");
    if (!vals.length) return null;
    return vals.reduce((acc, v) => acc + v, 0) / vals.length;
  }, [classes]);

  const selectedBands: ClassBandSummary[] = useMemo(() => {
    if (!selectedClassroomId) return [];
    return remarkBandsByClassroom[selectedClassroomId] ?? [];
  }, [selectedClassroomId, remarkBandsByClassroom]);

  const isRemarkLoading = selectedClass && remarkLoadingClassId === selectedClass.classroomId;

  const classReportHref = selectedClass
    ? `/headteacher/reports?classroomId=${encodeURIComponent(selectedClass.classroomId)}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`
    : "/headteacher/reports";

  const perClassGov = useMemo(() => {
    const map: Record<
      string,
      { approvedNotDelivered: number; deliveredNotAssessed: number; assessedNotLinked: number; total: number }
    > = {};

    if (!governanceOk) return map;
    const g = governance as GovernanceOk;

    for (const a of g.anomalies.approvedNotDelivered) {
      const cid = cleanStr(a.classroomId);
      if (!cid) continue;
      if (!map[cid]) map[cid] = { approvedNotDelivered: 0, deliveredNotAssessed: 0, assessedNotLinked: 0, total: 0 };
      map[cid].approvedNotDelivered += 1;
      map[cid].total += 1;
    }

    for (const d of g.anomalies.deliveredNotAssessed) {
      const cid = cleanStr(d.classroomId);
      if (!cid) continue;
      if (!map[cid]) map[cid] = { approvedNotDelivered: 0, deliveredNotAssessed: 0, assessedNotLinked: 0, total: 0 };
      map[cid].deliveredNotAssessed += 1;
      map[cid].total += 1;
    }

    for (const x of g.anomalies.assessedNotLinked) {
      const cid = cleanStr(x.classroomId);
      if (!cid) continue;
      if (!map[cid]) map[cid] = { approvedNotDelivered: 0, deliveredNotAssessed: 0, assessedNotLinked: 0, total: 0 };
      map[cid].assessedNotLinked += 1;
      map[cid].total += 1;
    }

    return map;
  }, [governanceOk, governance]);

  const selectedGovCounts = useMemo(() => {
    const cid = selectedClass?.classroomId ?? "";
    if (!cid) return null;
    return perClassGov[cid] ?? { approvedNotDelivered: 0, deliveredNotAssessed: 0, assessedNotLinked: 0, total: 0 };
  }, [perClassGov, selectedClass?.classroomId]);

  const selectedGovLists = useMemo(() => {
    if (!governanceOk || !selectedClass?.classroomId) {
      return { approvedNotDelivered: [], deliveredNotAssessed: [], assessedNotLinked: [] };
    }
    const g = governance as GovernanceOk;
    const cid = selectedClass.classroomId;

    return {
      approvedNotDelivered: g.anomalies.approvedNotDelivered.filter((x) => x.classroomId === cid).slice(0, 5),
      deliveredNotAssessed: g.anomalies.deliveredNotAssessed.filter((x) => x.classroomId === cid).slice(0, 5),
      assessedNotLinked: g.anomalies.assessedNotLinked.filter((x) => x.classroomId === cid).slice(0, 5),
    };
  }, [governanceOk, governance, selectedClass?.classroomId]);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] px-5 py-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:px-6 md:py-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
              Headteacher • Student Assessment Insights
            </div>
            <div className="text-lg font-semibold text-[#F7F4ED] md:text-2xl">
              SBA and Mock evidence for school improvement
            </div>
            <div className="max-w-3xl text-[12px] leading-6 text-[#C9CDD6]">
              Review term SBA evidence and BECE Mock readiness without mixing their records.
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-[#9AA4B2]">Term</label>
              <select
                className="rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[11px] text-[#F7F4ED] focus:border-[#D4AF37]/40 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              >
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-[#9AA4B2]">Academic Year</label>
              <input
                className="w-32 rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[11px] text-[#F7F4ED] placeholder:text-[#7E8796] focus:border-[#D4AF37]/40 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025/2026"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                void loadOverviewAndGovernance(term, academicYear);
                if (showGovernancePanel) void loadGovernance(term, academicYear);
              }}
              disabled={loading}
              className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-60"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-[11px] text-emerald-100">
        Assessment data here is for <span className="font-semibold">improvement</span>, not for humiliating teachers or learners.
        Parent-facing release stays separate and should be used only for end-of-term exam results for now.
      </div>

<div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setSelectedSpine("sba");
            setShowSbaPanel(true);
            if (!sbaTeachers.length) void loadSbaRoster(term, academicYear);
          }}
          className={[
            "rounded-[24px] border p-4 text-left shadow-[0_14px_42px_rgba(0,0,0,0.18)] transition",
            selectedSpine === "sba"
              ? "border-emerald-300/30 bg-emerald-400/12"
              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[#F7F4ED]">SBA</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                Standards Based Assessment
              </div>
            </div>
            <span className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-3 py-1 text-[10px] font-semibold text-emerald-100">
              {showSbaPanel ? "Open" : "Choose"}
            </span>
          </div>
          <p className="mt-3 text-[12px] leading-6 text-[#C9CDD6]">
            Review class assessment evidence, averages, and readiness for the selected term.
          </p>
        </button>

        <Link
          href="/headteacher/assessment/mock"
          className="rounded-[24px] border border-cyan-300/20 bg-cyan-400/10 p-4 text-left shadow-[0_14px_42px_rgba(0,0,0,0.18)] transition hover:bg-cyan-400/14"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-[#F7F4ED]">BECE Mock</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                Readiness
              </div>
            </div>
            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/12 px-3 py-1 text-[10px] font-semibold text-cyan-100">
              Open
            </span>
          </div>
          <p className="mt-3 text-[12px] leading-6 text-[#C9CDD6]">
            Track Mock completion, missing subjects, aggregates, and rescue signals.
          </p>
        </Link>
      </div>

            {showSbaPanel ? (
        <SbaWorkOutputPanel
          term={term}
          academicYear={academicYear}
          teachers={sbaTeachers}
          selectedTeacher={selectedSbaTeacher}
          selectedClass={selectedSbaClass}
          classOptions={sbaClassOptions}
          selectedSubjects={selectedSbaSubjects}
          streamMode={sbaStreamMode}
          canToggleMultiStream={canToggleSbaMultiStream}
          teacherUserId={sbaTeacherUserId}
          classroomId={sbaClassroomId}
          subject={sbaSubject}
          loadingRoster={sbaLoading}
          loadingOutput={sbaOutputLoading}
          error={sbaError}
          output={sbaOutput}
          showBroadsheet={showSbaBroadsheet}
          canLoadOutput={canLoadSbaOutput}
          onRefreshRoster={() => void loadSbaRoster(term, academicYear)}
          onClose={() => setShowSbaPanel(false)}
          onTeacherChange={(userId) => {
            const teacher = sbaTeachers.find((t) => t.userId === userId) ?? null;
            const cls = pickDefaultSbaClass(teacher, sbaStreamMode, null);

            setSbaTeacherUserId(userId);
            setSbaClassroomId(cls?.classroomId ?? "");
            setSbaSubject(cls?.subjects[0] ?? "");
            setSbaOutput(null);
            setShowSbaBroadsheet(false);
          }}
          onClassChange={(classroomId) => {
            const cls =
              selectedSbaTeacher?.classes.find((c) => c.classroomId === classroomId) ??
              null;

            setSbaClassroomId(classroomId);
            setSbaSubject(cls?.subjects[0] ?? "");
            setSbaOutput(null);
            setShowSbaBroadsheet(false);
          }}
          onStreamModeChange={(mode) => {
            setSbaStreamMode(mode);

            const cls = pickDefaultSbaClass(
              selectedSbaTeacher,
              mode,
              sbaClassroomId
            );

            setSbaClassroomId(cls?.classroomId ?? "");
            setSbaSubject(
              cls?.subjects.find((x) => x === sbaSubject) ?? cls?.subjects[0] ?? ""
            );
            setSbaOutput(null);
            setShowSbaBroadsheet(false);
          }}
          onSubjectChange={(nextSubject) => {
            setSbaSubject(nextSubject);
            setSbaOutput(null);
            setShowSbaBroadsheet(false);
          }}
          onLoadOutput={() => void loadSbaWorkOutput()}
          onToggleBroadsheet={() => {
            if (!sbaOutput) {
              void loadSbaWorkOutput({ showBroadsheet: true });
              return;
            }

            setShowSbaBroadsheet((prev) => !prev);
          }}
        />
      ) : null}

      {loadError && (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-xs text-rose-100">
          {loadError}
        </div>
      )}

      {showGovernancePanel && govError && !loadError ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 px-4 py-3 text-xs text-amber-100">
          Governance: {govError}
        </div>
      ) : null}

      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_14px_42px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[#F7F4ED]">Governance chain check</div>
            <div className="mt-1 text-[11px] text-[#C9CDD6]">
              Optional: open only when you need delivery, linking, and scoring discipline checks.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !showGovernancePanel;
              setShowGovernancePanel(next);
              if (next && !governance) void loadGovernance(term, academicYear);
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
          >
            {showGovernancePanel ? "Hide chain check" : "Show chain check"}
          </button>
        </div>
      </div>

      {showGovernancePanel ? (
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
              Governance copilot
            </div>
            <div className="mt-1 text-sm font-semibold text-[#F7F4ED]">
              Chain discipline: approved note → delivered lesson → linked assessment → scored assessment
            </div>
            <div className="mt-1 text-[11px] text-[#C9CDD6]">
              {governanceOk
                ? `${(governance as GovernanceOk).scope.start} to ${(governance as GovernanceOk).scope.end}`
                : "Loading governance…"}
            </div>
          </div>

          {governanceOk ? (
            <div className="rounded-full border border-cyan-300/20 bg-cyan-400/12 px-3 py-1 text-[11px] font-semibold text-cyan-100">
              Headteacher score: {pctLabel((governance as GovernanceOk).metrics.headteacherScore)}
            </div>
          ) : (
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-[#DDE3ED]">
              Score: —
            </div>
          )}
        </div>

        {governanceOk ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MiniStat
                title="Attendance certify"
                value={pctLabel((governance as GovernanceOk).metrics.attendance.attendanceCertificationRate)}
                sub={`${(governance as GovernanceOk).metrics.attendance.pendingCertification} pending`}
              />
              <MiniStat
                title="Notify rate"
                value={pctLabel((governance as GovernanceOk).metrics.attendance.notifyRate)}
                sub={`Avg notify delay ${(governance as GovernanceOk).metrics.attendance.avgNotifyDelayHrs ?? "—"}h`}
              />
              <MiniStat
                title="Delivery coverage"
                value={pctLabel((governance as GovernanceOk).metrics.pipeline.deliveryCoveragePercent)}
                sub={`${(governance as GovernanceOk).metrics.pipeline.deliveredLessonsCount} delivered`}
              />
              <MiniStat
                title="Assessment linking"
                value={pctLabel((governance as GovernanceOk).metrics.pipeline.assessmentLinkCoveragePercent)}
                sub={`${(governance as GovernanceOk).metrics.pipeline.linkedAssessmentsCount} linked`}
              />
              <MiniStat
                title="Scoring coverage"
                value={pctLabel((governance as GovernanceOk).metrics.pipeline.scoringCoveragePercent)}
                sub={`${(governance as GovernanceOk).metrics.pipeline.scoredAssessmentsCount} scored`}
              />
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-[11px] font-semibold text-[#F7F4ED]">Priority actions</div>
              {(governance as GovernanceOk).actions.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {(governance as GovernanceOk).actions.slice(0, 6).map((a) => (
                    <div key={a.code} className="rounded-2xl border border-white/10 bg-[#0C1730]/78 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-[#F7F4ED]">{a.code}</div>
                        {priorityChip(a.priority)}
                      </div>
                      <div className="mt-1 text-[11px] text-[#C9CDD6]">{a.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-3 text-[11px] text-emerald-100">
                  Governance is stable in this window. Keep discipline consistent.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3 text-[11px] text-[#C9CDD6]">
            {!governance ? "Loading…" : (governance as any).ok === false ? (governance as any).error : "Loading…"}
          </div>
        )}
      </div>

      ) : null}

      {!loading && !loadError && !classes.length && (
        <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.04] px-4 py-6 text-center text-xs text-[#C9CDD6]">
          No assessment overview data yet for this term.
        </div>
      )}

      {classes.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Classes reporting" value={formatNumber(totalClasses)} />
            <MetricCard label="Learners covered" value={formatNumber(totalLearners)} />
            <MetricCard label="Assessment items" value={formatNumber(totalItems)} />
            <MetricCard label="Schoolwide average" value={formatPercent(averageAcrossSchool)} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[#F7F4ED]">Classes</h2>
                    <p className="text-[11px] text-[#C9CDD6]">Default view is single-stream to reduce noise.</p>
                  </div>

                  {canToggleMultiStream ? (
                    <label className="inline-flex items-center gap-2 text-[11px] text-[#C9CDD6]">
                      <input
                        type="checkbox"
                        checked={streamMode === "multi"}
                        onChange={(e) => setStreamMode(e.target.checked ? "multi" : "single")}
                      />
                      Show multistream
                    </label>
                  ) : null}
                </div>

                <div className="mt-3 max-h-[420px] overflow-auto">
                  <ul className="space-y-2">
                    {visibleClasses.map((cls) => {
                      const isSelected = selectedClass?.classroomId === cls.classroomId;
                      const g = perClassGov[cls.classroomId];
                      const hasIssues = !!g && g.total > 0;

                      return (
                        <li key={cls.classroomId}>
                          <button
                            type="button"
                            onClick={() => setSelectedClassroomId(cls.classroomId)}
                            className={[
                              "w-full rounded-2xl border px-3 py-3 text-left transition",
                              isSelected
                                ? "border-cyan-300/25 bg-cyan-400/12"
                                : "border-white/10 bg-[#0C1730]/78 hover:border-cyan-300/20 hover:bg-white/[0.06]",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-[#F7F4ED]">
                                  {streamMode === "single" ? singleStreamLabel(cls) : fullClassLabel(cls)}
                                </div>

                                <div className="mt-1 text-[11px] text-[#C9CDD6]">
                                  Learners: {formatNumber(cls.learnersCount)} • Items: {formatNumber(cls.itemsCount)}
                                </div>

                                {hasIssues ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {pill(`Approved→No delivery: ${g.approvedNotDelivered}`, g.approvedNotDelivered ? "amber" : "slate")}
                                    {pill(`Delivered→No assessment: ${g.deliveredNotAssessed}`, g.deliveredNotAssessed ? "amber" : "slate")}
                                    {pill(`Assessed→No link: ${g.assessedNotLinked}`, g.assessedNotLinked ? "amber" : "slate")}
                                  </div>
                                ) : null}
                              </div>

                              <div className="text-right">
                                <div className="text-sm font-semibold text-[#F7F4ED]">
                                  {formatPercent(cls.averagePercent)}
                                </div>
                                <div className="text-[10px] text-[#8F98A8]">Avg</div>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {!selectedClass ? (
                <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 text-center text-sm text-[#C9CDD6] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                  Select a class to inspect its performance health.
                </div>
              ) : (
                <>
                  <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-lg font-semibold text-[#F7F4ED]">{fullClassLabel(selectedClass)}</div>
                        <div className="mt-1 text-[12px] text-[#C9CDD6]">
                          Learners: <span className="font-semibold text-[#F7F4ED]">{formatNumber(selectedClass.learnersCount)}</span> • Items:{" "}
                          <span className="font-semibold text-[#F7F4ED]">{formatNumber(selectedClass.itemsCount)}</span> • Average:{" "}
                          <span className="font-semibold text-[#F7F4ED]">{formatPercent(selectedClass.averagePercent)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={classReportHref}
                          className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-2 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/18"
                        >
                          Open class term report
                        </Link>

                        <Link
                          href="/headteacher/reports/student-report"
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
                        >
                          Open learner report
                        </Link>

                        <button
                          type="button"
                          onClick={() => {
                            setShowGovernancePanel(true);
                            if (!governance) void loadGovernance(term, academicYear);
                          }}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
                        >
                          Chain checks
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const next = !showRemarkBandPanel;
                            setShowRemarkBandPanel(next);
                            if (next && selectedClass) {
                              void loadRemarkSummaryForClass(selectedClass.classroomId, term, academicYear);
                            }
                          }}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
                        >
                          {showRemarkBandPanel ? "Hide bands" : "Remark bands"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {showGovernancePanel ? (
                  <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#F7F4ED]">Governance anomalies (this class)</div>
                        <div className="mt-1 text-[11px] text-[#C9CDD6]">
                          These issues block accurate analytics and parent trust. Fix the chain, then performance numbers become meaningful.
                        </div>
                      </div>
                      {selectedGovCounts ? (
                        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-[#DDE3ED]">
                          Total: {selectedGovCounts.total}
                        </div>
                      ) : null}
                    </div>

                    {!governanceOk ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[11px] text-[#C9CDD6]">
                        Governance data not available.
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <MiniStat
                            title="Approved → Not delivered"
                            value={String(selectedGovCounts?.approvedNotDelivered ?? 0)}
                            sub="Approved lesson notes missing delivery proof"
                          />
                          <MiniStat
                            title="Delivered → Not assessed"
                            value={String(selectedGovCounts?.deliveredNotAssessed ?? 0)}
                            sub="Delivered lessons with no assessment items"
                          />
                          <MiniStat
                            title="Assessed → Not linked"
                            value={String(selectedGovCounts?.assessedNotLinked ?? 0)}
                            sub="Assessment items missing lesson linkage"
                          />
                        </div>

                        {(selectedGovCounts?.total ?? 0) > 0 ? (
                          <div className="space-y-3">
                            {selectedGovLists.approvedNotDelivered.length ? (
                              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 p-3">
                                <div className="text-[11px] font-semibold text-amber-100">
                                  Approved notes not delivered (sample)
                                </div>
                                <ul className="mt-2 space-y-1 text-[11px] text-amber-50">
                                  {selectedGovLists.approvedNotDelivered.map((x) => (
                                    <li key={x.id}>
                                      • {x.subject} — {x.lessonTitle ?? "Lesson"}{" "}
                                      <span className="text-amber-100/75">
                                        ({x.approvedAt ? x.approvedAt.slice(0, 10) : "no date"})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {selectedGovLists.deliveredNotAssessed.length ? (
                              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 p-3">
                                <div className="text-[11px] font-semibold text-amber-100">
                                  Delivered lessons not assessed (sample)
                                </div>
                                <ul className="mt-2 space-y-1 text-[11px] text-amber-50">
                                  {selectedGovLists.deliveredNotAssessed.map((x) => (
                                    <li key={x.id}>
                                      • {x.subject} — {x.indicatorCode ?? "No indicator"}{" "}
                                      <span className="text-amber-100/75">
                                        ({x.dateTaught ? x.dateTaught.slice(0, 10) : "no date"})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {selectedGovLists.assessedNotLinked.length ? (
                              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 p-3">
                                <div className="text-[11px] font-semibold text-amber-100">
                                  Assessed items not linked (sample)
                                </div>
                                <ul className="mt-2 space-y-1 text-[11px] text-amber-50">
                                  {selectedGovLists.assessedNotLinked.map((x) => (
                                    <li key={x.id}>
                                      • {x.subject} — {x.title}{" "}
                                      <span className="text-amber-100/75">
                                        ({x.date ? x.date.slice(0, 10) : "no date"})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-3 text-[11px] text-emerald-100">
                            No anomalies detected for this class in the current governance window.
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  ) : null}

                  {showRemarkBandPanel ? (
                  <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                    <h3 className="text-sm font-semibold text-[#F7F4ED]">Learner distribution by remark band</h3>

                    <div className="mt-3">
                      {isRemarkLoading ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[11px] text-[#C9CDD6]">
                          Loading remark summary for this class…
                        </div>
                      ) : selectedBands.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.04] px-3 py-3 text-[11px] text-[#C9CDD6]">
                          No remark summary data yet for this class.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {remarkError && (
                            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-[11px] text-rose-100">
                              {remarkError}
                            </div>
                          )}

                          <div className="grid gap-2 md:grid-cols-2">
                            {selectedBands
                              .slice()
                              .sort((a, b) => bandOrder(a) - bandOrder(b))
                              .map((band) => (
                                <div
                                  key={band.grade}
                                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0C1730]/78 px-3 py-2 text-[11px]"
                                >
                                  <div>
                                    <div className="font-semibold text-[#F7F4ED]">{band.label}</div>
                                    <div className="text-[10px] text-[#8F98A8]">
                                      {band.minPercent}–{band.maxPercent}%
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-semibold text-[#F7F4ED]">
                                      {formatNumber(band.learnersCount)}
                                    </div>
                                    <div className="text-[10px] text-[#8F98A8]">learners</div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};


function SbaWorkOutputPanel(props: {
  term: string;
  academicYear: string;
  teachers: SbaTeacherScope[];
  selectedTeacher: SbaTeacherScope | null;
  selectedClass: SbaClassScope | null;
  classOptions: SbaClassScope[];
  selectedSubjects: string[];
  streamMode: StreamMode;
  canToggleMultiStream: boolean;
  teacherUserId: string;
  classroomId: string;
  subject: string;
  loadingRoster: boolean;
  loadingOutput: boolean;
  error: string | null;
  output: SbaOutputOk | null;
  showBroadsheet: boolean;
  canLoadOutput: boolean;
  onRefreshRoster: () => void;
  onClose: () => void;
  onTeacherChange: (userId: string) => void;
  onClassChange: (classroomId: string) => void;
  onStreamModeChange: (mode: StreamMode) => void;
  onSubjectChange: (subject: string) => void;
  onLoadOutput: () => void;
  onToggleBroadsheet: () => void;
}) {
const buckets = props.output?.workOutput.buckets ?? [];

  return (
    <section className="rounded-[28px] border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(255,255,255,0.035))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
            SBA teacher work output
          </div>
          <h2 className="mt-1 text-base font-semibold text-[#F7F4ED]">
            Select teacher, class, and subject
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-6 text-[#C9CDD6]">
            Shows exercises, class tests, homework, and the matching broadsheet in simple evidence form.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onRefreshRoster}
            disabled={props.loadingRoster}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-60"
          >
            {props.loadingRoster ? "Loading…" : "Refresh teachers"}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-[#C9CDD6] transition hover:bg-white/10"
          >
            Hide SBA
          </button>
        </div>
      </div>

      {props.error ? (
        <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/12 px-3 py-3 text-[11px] text-amber-100">
          {props.error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA4B2]">Teacher</span>
          <select
            value={props.teacherUserId}
            onChange={(e) => props.onTeacherChange(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] focus:border-emerald-300/35 focus:outline-none focus:ring-2 focus:ring-emerald-300/15"
          >
            <option value="">Choose teacher</option>
            {props.teachers.map((teacher) => (
              <option key={teacher.userId} value={teacher.userId}>
                {teacher.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA4B2]">
            <span>Class</span>
            {props.canToggleMultiStream ? (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal text-[10px] text-[#C9CDD6]">
                <input
                  type="checkbox"
                  checked={props.streamMode === "multi"}
                  onChange={(e) => props.onStreamModeChange(e.target.checked ? "multi" : "single")}
                />
                Multi-stream
              </span>
            ) : null}
          </span>
          <select
            value={props.classroomId}
            onChange={(e) => props.onClassChange(e.target.value)}
            disabled={!props.selectedTeacher}
            className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] focus:border-emerald-300/35 focus:outline-none focus:ring-2 focus:ring-emerald-300/15 disabled:opacity-55"
          >
            <option value="">Choose class</option>
            {props.classOptions.map((cls) => (
              <option key={cls.classroomId} value={cls.classroomId}>
                {props.streamMode === "single" ? singleSbaClassLabel(cls) : cls.classLabel}
              </option>
            ))}
          </select>
          {props.canToggleMultiStream && props.streamMode === "single" ? (
            <span className="block text-[10px] text-[#8F98A8]">Single-stream view. Turn on multi-stream only when needed.</span>
          ) : null}
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA4B2]">Subject</span>
          <select
            value={props.subject}
            onChange={(e) => props.onSubjectChange(e.target.value)}
            disabled={!props.selectedClass}
            className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] focus:border-emerald-300/35 focus:outline-none focus:ring-2 focus:ring-emerald-300/15 disabled:opacity-55"
          >
            <option value="">Choose subject</option>
            {props.selectedSubjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={props.onLoadOutput}
          disabled={!props.canLoadOutput || props.loadingOutput}
          className="rounded-xl border border-emerald-300/25 bg-emerald-400/12 px-4 py-2 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {props.loadingOutput ? "Loading work…" : "Work Output"}
        </button>
        <button
          type="button"
          onClick={props.onToggleBroadsheet}
          disabled={!props.canLoadOutput || props.loadingOutput}
          className="rounded-xl border border-cyan-300/25 bg-cyan-400/12 px-4 py-2 text-[12px] font-semibold text-cyan-100 transition hover:bg-cyan-400/18 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {props.showBroadsheet ? "Hide Broadsheet" : "Assessment Broadsheet"}
        </button>
      </div>

      {props.output ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {buckets.map((bucket) => (
              <div key={bucket.key} className="rounded-[22px] border border-white/10 bg-[#0C1730]/78 p-3">
                <div className="text-[11px] font-semibold text-[#F7F4ED]">{bucket.label}</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-semibold text-[#F7F4ED]">{formatNumber(bucket.count)}</div>
<div className="text-[10px] text-[#8F98A8]">items</div>
<div className="mt-1 text-[10px] text-[#8F98A8]">
  {formatNumber(bucket.scoredCount)} scores
</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-100">{formatPercent(bucket.averagePercent)}</div>
                    <div className="text-[10px] text-[#8F98A8]">score avg</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-[11px] leading-6 text-[#C9CDD6]">
  {props.output.teacher.name} • {props.output.classroom.classLabel} • {props.output.subject} — {formatNumber(props.output.workOutput.itemCount)} items, {formatNumber(props.output.workOutput.scoredEntries)} score entries.
  <div className="mt-1 text-[#8F98A8]">
    Work Output uses raw score averages. Broadsheet uses official weighted SBA policy.
  </div>
</div>

          {props.showBroadsheet ? (
  <div className="mt-2">
    <AssessmentBroadsheetPanel
  classroomId={props.classroomId}
  term={props.term}
  academicYear={props.academicYear}
  subjectOptions={
    props.subject
      ? [props.subject]
      : props.selectedSubjects.length
        ? props.selectedSubjects
        : []
  }
  currentSubject={props.subject}
  minimal
/>
  </div>
) : null}
        </div>
      ) : props.loadingRoster ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-[11px] text-[#C9CDD6]">
          Loading teacher assignments…
        </div>
      ) : props.teachers.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-white/[0.04] px-3 py-3 text-[11px] text-[#C9CDD6]">
          No teacher assessment assignments found for this term yet.
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0C1730]/78 px-4 py-4 shadow-[0_12px_36px_rgba(0,0,0,0.16)]">
      <div className="text-[11px] font-medium text-[#8F98A8]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[#F7F4ED]">{value}</div>
    </div>
  );
}

function MiniStat(props: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0C1730]/78 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.16)]">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#E8C96A]">
        {props.title}
      </div>
      <div className="mt-2 text-xl font-semibold text-[#F7F4ED]">{props.value}</div>
      {props.sub ? <div className="mt-1 text-[11px] text-[#C9CDD6]">{props.sub}</div> : null}
    </div>
  );
}

export default HeadteacherAssessmentOverviewClient;