// src/lib/assessments/workOutput.ts

export const WORK_OUTPUT_TYPE_ORDER = [
  "EXERCISE",
  "HOMEWORK",
  "QUIZ",
  "CLASS_TEST",
  "GROUP_WORK",
  "PROJECT",
  "PRACTICAL",
  "EXAM",
  "OTHER",
] as const;

export type WorkOutputTypeKey = (typeof WORK_OUTPUT_TYPE_ORDER)[number];

export type WorkOutputScoreInput = {
  studentId: string;
  score: number;
};

export type WorkOutputItemInput = {
  id: string;
  title: string;
  type: string;
  maxScore: number;
  date?: Date | string | null;
  createdAt?: Date | string | null;
  lessonDeliveryId?: string | null;
  scores: WorkOutputScoreInput[];
};

export type WorkOutputDeliveryInput = {
  id: string;
  subject: string;
  dateTaught: Date | string;
  lessonNoteId?: string | null;
  lessonTitle?: string | null;
  items: WorkOutputItemInput[];
};

export type WorkOutputStudentInput = {
  id: string;
  name: string;
};

export type WorkOutputTypeCount = {
  key: WorkOutputTypeKey;
  label: string;
  count: number;
  scoredItemCount: number;
  scoredEntries: number;
};

export type WorkOutputItemSummary = {
  id: string;
  title: string;
  type: WorkOutputTypeKey;
  typeLabel: string;
  maxScore: number;
  date: string | null;
  scoresCount: number;
  classAveragePercent: number | null;
};

export type WorkOutputProgressPoint = {
  itemId: string;
  title: string;
  type: WorkOutputTypeKey;
  typeLabel: string;
  date: string | null;
  score: number;
  maxScore: number;
  percent: number | null;
};

export type WorkOutputLearnerProgression = {
  studentId: string;
  name: string;
  points: WorkOutputProgressPoint[];
  firstPercent: number | null;
  latestPercent: number | null;
  changePercent: number | null;
  trend: "IMPROVED" | "UNCHANGED" | "DECLINED" | "INSUFFICIENT_DATA";
};

export type WorkOutputProgression = {
  assessmentCount: number;
  learnersTracked: number;
  learnersWithRepeatedPractice: number;
  averageFirstPercent: number | null;
  averageLatestPercent: number | null;
  averageChangePercent: number | null;
  learners: WorkOutputLearnerProgression[];
};

export type WorkOutputCountSummary = {
  itemCount: number;
  scoredItemCount: number;
  scoredEntries: number;
  typeCounts: WorkOutputTypeCount[];
};

export type WorkOutputLessonSummary = WorkOutputCountSummary & {
  lessonDeliveryId: string;
  lessonNoteId: string | null;
  lessonTitle: string | null;
  subject: string;
  dateTaught: string;
  items: WorkOutputItemSummary[];
  progression: WorkOutputProgression;
};

export type WorkOutputSnapshot = {
  term: WorkOutputCountSummary;
  lesson: WorkOutputLessonSummary | null;
  legacyUnlinked: WorkOutputCountSummary;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function round1(value: number) {
  return Number(value.toFixed(1));
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return date.toISOString();
}

function itemTime(item: WorkOutputItemInput) {
  const value = item.date ?? item.createdAt ?? null;
  const iso = toIso(value);
  const time = iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function normalizePercent(score: number, maxScore: number) {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return null;
  }

  return round1((score / maxScore) * 100);
}

export function normalizeWorkOutputType(value: unknown): WorkOutputTypeKey {
  const normalized = clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const compact = normalized.replace(/_/g, "");

  if (WORK_OUTPUT_TYPE_ORDER.includes(normalized as WorkOutputTypeKey)) {
    return normalized as WorkOutputTypeKey;
  }

  if (
    normalized.includes("EXERCISE") ||
    normalized.includes("CLASSWORK") ||
    normalized.includes("CLASS_WORK") ||
    normalized.includes("CLASS_ACTIVITY") ||
    compact === "CW" ||
    compact === "EX"
  ) {
    return "EXERCISE";
  }

  if (
    normalized.includes("HOMEWORK") ||
    normalized.includes("ASSIGNMENT") ||
    compact === "HW"
  ) {
    return "HOMEWORK";
  }

  if (normalized.includes("QUIZ")) {
    return "QUIZ";
  }

  if (
    normalized.includes("CLASS_TEST") ||
    (normalized.includes("CLASS") && normalized.includes("TEST")) ||
    normalized === "TEST" ||
    /^CT[0-9]*$/.test(compact)
  ) {
    return "CLASS_TEST";
  }

  if (
    normalized.includes("GROUP_WORK") ||
    (normalized.includes("GROUP") && normalized.includes("WORK"))
  ) {
    return "GROUP_WORK";
  }

  if (normalized.includes("PROJECT")) {
    return "PROJECT";
  }

  if (normalized.includes("PRACTICAL")) {
    return "PRACTICAL";
  }

  if (normalized.includes("EXAM")) {
    return "EXAM";
  }

  return "OTHER";
}

export function workOutputTypeLabel(key: WorkOutputTypeKey) {
  if (key === "EXERCISE") return "Exercises";
  if (key === "HOMEWORK") return "Homework";
  if (key === "QUIZ") return "Quizzes";
  if (key === "CLASS_TEST") return "Class Tests";
  if (key === "GROUP_WORK") return "Group Work";
  if (key === "PROJECT") return "Projects";
  if (key === "PRACTICAL") return "Practicals";
  if (key === "EXAM") return "Exams";
  return "Other";
}

function buildTypeCounts(items: WorkOutputItemInput[]): WorkOutputTypeCount[] {
  return WORK_OUTPUT_TYPE_ORDER.map((key) => {
    const typedItems = items.filter(
      (item) => normalizeWorkOutputType(item.type) === key
    );

    return {
      key,
      label: workOutputTypeLabel(key),
      count: typedItems.length,
      scoredItemCount: typedItems.filter((item) => item.scores.length > 0).length,
      scoredEntries: typedItems.reduce(
        (sum, item) => sum + item.scores.length,
        0
      ),
    };
  });
}

function buildCountSummary(items: WorkOutputItemInput[]): WorkOutputCountSummary {
  return {
    itemCount: items.length,
    scoredItemCount: items.filter((item) => item.scores.length > 0).length,
    scoredEntries: items.reduce((sum, item) => sum + item.scores.length, 0),
    typeCounts: buildTypeCounts(items),
  };
}

function buildItemSummary(item: WorkOutputItemInput): WorkOutputItemSummary {
  const maxScore = Number(item.maxScore ?? 0);
  const validScores = item.scores
    .map((score) => Number(score.score))
    .filter((score) => Number.isFinite(score));

  const classAveragePercent =
    maxScore > 0 && validScores.length > 0
      ? round1(
          (validScores.reduce((sum, score) => sum + score, 0) /
            (maxScore * validScores.length)) *
            100
        )
      : null;

  const type = normalizeWorkOutputType(item.type);

  return {
    id: item.id,
    title: item.title,
    type,
    typeLabel: workOutputTypeLabel(type),
    maxScore,
    date: toIso(item.date ?? item.createdAt ?? null),
    scoresCount: item.scores.length,
    classAveragePercent,
  };
}

function buildProgression(args: {
  items: WorkOutputItemInput[];
  students: WorkOutputStudentInput[];
}): WorkOutputProgression {
  const orderedItems = [...args.items].sort((a, b) => {
    const byTime = itemTime(a) - itemTime(b);
    if (byTime !== 0) return byTime;
    return clean(a.title).localeCompare(clean(b.title));
  });

  const scoreMaps = new Map<string, Map<string, WorkOutputScoreInput>>();
  for (const item of orderedItems) {
    scoreMaps.set(
      item.id,
      new Map(item.scores.map((score) => [score.studentId, score]))
    );
  }

  const learners = args.students.map((student) => {
    const points: WorkOutputProgressPoint[] = [];

    for (const item of orderedItems) {
      const score = scoreMaps.get(item.id)?.get(student.id);
      if (!score) continue;

      const type = normalizeWorkOutputType(item.type);
      const maxScore = Number(item.maxScore ?? 0);
      const numericScore = Number(score.score ?? 0);

      points.push({
        itemId: item.id,
        title: item.title,
        type,
        typeLabel: workOutputTypeLabel(type),
        date: toIso(item.date ?? item.createdAt ?? null),
        score: numericScore,
        maxScore,
        percent: normalizePercent(numericScore, maxScore),
      });
    }

    const validPercents = points
      .map((point) => point.percent)
      .filter((value): value is number => typeof value === "number");

    const firstPercent = validPercents[0] ?? null;
    const latestPercent =
      validPercents.length > 0
        ? validPercents[validPercents.length - 1]
        : null;

    const changePercent =
      validPercents.length >= 2 &&
      firstPercent != null &&
      latestPercent != null
        ? round1(latestPercent - firstPercent)
        : null;

    let trend: WorkOutputLearnerProgression["trend"] = "INSUFFICIENT_DATA";
    if (changePercent != null) {
      if (changePercent > 0) trend = "IMPROVED";
      else if (changePercent < 0) trend = "DECLINED";
      else trend = "UNCHANGED";
    }

    return {
      studentId: student.id,
      name: student.name,
      points,
      firstPercent,
      latestPercent,
      changePercent,
      trend,
    };
  });

  const tracked = learners.filter((learner) => learner.points.length > 0);
  const repeated = learners.filter(
    (learner) =>
      learner.points.filter((point) => point.percent != null).length >= 2 &&
      learner.firstPercent != null &&
      learner.latestPercent != null &&
      learner.changePercent != null
  );

  const averageFirstPercent =
    repeated.length > 0
      ? round1(
          repeated.reduce(
            (sum, learner) => sum + (learner.firstPercent ?? 0),
            0
          ) / repeated.length
        )
      : null;

  const averageLatestPercent =
    repeated.length > 0
      ? round1(
          repeated.reduce(
            (sum, learner) => sum + (learner.latestPercent ?? 0),
            0
          ) / repeated.length
        )
      : null;

  const averageChangePercent =
    repeated.length > 0
      ? round1(
          repeated.reduce(
            (sum, learner) => sum + (learner.changePercent ?? 0),
            0
          ) / repeated.length
        )
      : null;

  return {
    assessmentCount: orderedItems.length,
    learnersTracked: tracked.length,
    learnersWithRepeatedPractice: repeated.length,
    averageFirstPercent,
    averageLatestPercent,
    averageChangePercent,
    learners,
  };
}

export function buildWorkOutputSnapshot(args: {
  deliveries: WorkOutputDeliveryInput[];
  legacyUnlinkedItems?: WorkOutputItemInput[];
  students: WorkOutputStudentInput[];
  lessonDeliveryId?: string | null;
}): WorkOutputSnapshot {
  const linkedItems = args.deliveries.flatMap((delivery) => delivery.items);
  const legacyUnlinkedItems = args.legacyUnlinkedItems ?? [];
  const requestedLessonDeliveryId = clean(args.lessonDeliveryId);

  const lessonDelivery = requestedLessonDeliveryId
    ? args.deliveries.find((delivery) => delivery.id === requestedLessonDeliveryId) ??
      null
    : null;

  const lesson = lessonDelivery
    ? {
        ...buildCountSummary(lessonDelivery.items),
        lessonDeliveryId: lessonDelivery.id,
        lessonNoteId: lessonDelivery.lessonNoteId ?? null,
        lessonTitle: lessonDelivery.lessonTitle ?? null,
        subject: lessonDelivery.subject,
        dateTaught: toIso(lessonDelivery.dateTaught) ?? "",
        items: [...lessonDelivery.items]
          .sort((a, b) => {
            const byTime = itemTime(a) - itemTime(b);
            if (byTime !== 0) return byTime;
            return clean(a.title).localeCompare(clean(b.title));
          })
          .map(buildItemSummary),
        progression: buildProgression({
          items: lessonDelivery.items,
          students: args.students,
        }),
      }
    : null;

  return {
    term: buildCountSummary(linkedItems),
    lesson,
    legacyUnlinked: buildCountSummary(legacyUnlinkedItems),
  };
}
