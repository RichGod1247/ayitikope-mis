// src/app/api/governance/appraisals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { TeacherAppraisalStatus } from "@prisma/client";
import {
  CIRCUIT_GOVERNANCE_ROLES,
  DISTRICT_GOVERNANCE_ROLES,
  assertTenantInGovernanceScope,
  requireGovernanceApiContext,
  type GovernanceScope,
} from "@/lib/governance/scope";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SectionKey =
  | "PREPARATION"
  | "LESSON_DELIVERY"
  | "CLASSROOM_CULTURE"
  | "LEARNER_PARTICIPATION"
  | "UNDERSTANDING_STRATEGIES"
  | "EVALUATION_STRATEGIES";

type AppraisalSection = {
  key: SectionKey;
  title: string;
  order: number;
  maxScore: number;
  percentField:
    | "preparationPercent"
    | "lessonDeliveryPercent"
    | "classroomCulturePercent"
    | "learnerParticipationPercent"
    | "understandingStrategiesPercent"
    | "evaluationStrategiesPercent";
  items: Array<{ key: string; label: string; order: number }>;
};

const GOVERNANCE_APPRAISAL_ROLES = [
  ...CIRCUIT_GOVERNANCE_ROLES,
  ...DISTRICT_GOVERNANCE_ROLES,
] as const;

const APPRAISAL_SECTIONS: AppraisalSection[] = [
  {
    key: "PREPARATION",
    title: "Measurement of Preparation of Lesson Plan",
    order: 1,
    maxScore: 35,
    percentField: "preparationPercent",
    items: [
      { key: "1.1", order: 1, label: "Preparation of Scheme of work (vetted and covers the term)" },
      { key: "1.2", order: 2, label: "Preparation of Learner notes (vetted, detailed, appropriate and up-to-date)" },
      { key: "1.3", order: 3, label: "Originality of Learner Notes (No signs of downloaded learner notes)" },
      { key: "1.4", order: 4, label: "Statement of adequate and appropriate core competencies" },
      { key: "1.5", order: 5, label: "Statement of appropriate/relevant TLMs in the lesson plan" },
      { key: "1.6", order: 6, label: "Statement of interactive activities in the lesson plan" },
      { key: "1.7", order: 7, label: "Coherence of stages of learner plan (well-arranged and well-paced)" },
    ],
  },
  {
    key: "LESSON_DELIVERY",
    title: "Measurement of Lesson Delivery/Instruction",
    order: 2,
    maxScore: 25,
    percentField: "lessonDeliveryPercent",
    items: [
      { key: "2.1", order: 1, label: "Articulation of the Performance Indicators (PI) at the beginning of the lesson" },
      { key: "2.2", order: 2, label: "Clarity of explanation of content (logically sequenced, use of illustrations, use of examples to aid understanding)" },
      { key: "2.3", order: 3, label: "Linkage of pupils daily life or cultural orientation to the content of the lesson" },
      { key: "2.4", order: 4, label: "Deployment of TLMs during lesson delivery" },
      { key: "2.5", order: 5, label: "Teacher's confidence level during lesson delivery" },
    ],
  },
  {
    key: "CLASSROOM_CULTURE",
    title: "Measurement of Classroom Culture",
    order: 3,
    maxScore: 25,
    percentField: "classroomCulturePercent",
    items: [
      { key: "3.1", order: 1, label: "The teacher treats all pupils with respect (e.g. teacher does not shout on pupils)" },
      { key: "3.2", order: 2, label: "The teacher uses positive language (e.g. good attempt, well done)" },
      { key: "3.3", order: 3, label: "The teacher rephrases language to promote understanding" },
      { key: "3.4", order: 4, label: "The teacher focuses on expected behaviour and redirects misbehavior" },
      { key: "3.5", order: 5, label: "The teacher recognizes learners with special needs and provides them with relevant support" },
    ],
  },
  {
    key: "LEARNER_PARTICIPATION",
    title: "Measurement of Learners' Participation During Lesson Delivery",
    order: 4,
    maxScore: 30,
    percentField: "learnerParticipationPercent",
    items: [
      { key: "4.1", order: 1, label: "Pupils volunteer to participate in the lesson without the teacher's prompt" },
      { key: "4.2", order: 2, label: "Learners ask questions during lesson" },
      { key: "4.3", order: 3, label: "Learners work collaboratively with each other during lesson" },
      { key: "4.4", order: 4, label: "Learners accept feedback from peers and teachers and work with them" },
      { key: "4.5", order: 5, label: "Learners have adequate learning materials (textbooks, notebooks, exercise books, pens, pencils, etc)" },
      { key: "4.6", order: 6, label: "The teacher provides learners with choices when it comes to activities" },
    ],
  },
  {
    key: "UNDERSTANDING_STRATEGIES",
    title: "Measurement of Strategies to Improve Pupils' Understanding",
    order: 5,
    maxScore: 30,
    percentField: "understandingStrategiesPercent",
    items: [
      { key: "5.1", order: 1, label: "The teacher uses questions, prompts or other strategies to determine pupils' level of understanding" },
      { key: "5.2", order: 2, label: "The teacher distributes questions/learning task to all pupils in the class" },
      { key: "5.3", order: 3, label: "The teacher monitors pupils/students during independent/group work" },
      { key: "5.4", order: 4, label: "The teacher provides positive reinforcement (nodding, good, okay but...)" },
      { key: "5.5", order: 5, label: "The teacher links current lessons to previous lessons or knowledge in other subjects" },
      { key: "5.6", order: 6, label: "The teacher provides guidance to pupils before handing exercises/assignments" },
    ],
  },
  {
    key: "EVALUATION_STRATEGIES",
    title: "Measurement of Evaluation Strategies",
    order: 6,
    maxScore: 25,
    percentField: "evaluationStrategiesPercent",
    items: [
      { key: "6.1", order: 1, label: "Set tasks on relevant performance indicators/core competencies" },
      { key: "6.2", order: 2, label: "Marks learner's work promptly and accurately" },
      { key: "6.3", order: 3, label: "Provides feedback on learners performance (good/poor is not a good feedback)" },
      { key: "6.4", order: 4, label: "Records learner's marks in continuous assessment books/record" },
      { key: "6.5", order: 5, label: "Corrections have been done and marked" },
    ],
  },
];

type ZoneNode = {
  id: string;
  name: string;
  zoneType?: { level: number; name: string } | null;
  parentZone?: ZoneNode | null;
};

type TenantZone = ZoneNode | null;

type SchoolIdentity = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string | null;
  districtId: string | null;
  districtName: string | null;
};

type EvidenceWarning = {
  code: string;
  title: string;
  detail: string;
  severity: "WARNING";
};

type AggregationBucket = {
  finalizedCount: number;
  teacherIds: Set<string>;
  overallScores: number[];
  sectionScores: Record<AppraisalSection["percentField"], number[]>;
  latestFinalizedAt: string | null;
};

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function evidenceWarningsFromMetadata(raw: unknown): EvidenceWarning[] {
  const metadata = asObject(raw);
  const warnings = Array.isArray(metadata.evidenceWarnings) ? metadata.evidenceWarnings : [];

  return warnings
    .map((item) => {
      const o = asObject(item);
      return {
        code: clean(o.code),
        title: clean(o.title),
        detail: clean(o.detail ?? o.message),
        severity: "WARNING" as const,
      };
    })
    .filter((item) => item.code && item.title && item.detail);
}

function isLikelyId(id: string) {
  const v = clean(id);
  return v.length >= 10 && v.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(v);
}

function toIsoOrNull(v: Date | string | null | undefined) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateOnly(v: Date | string | null | undefined) {
  const iso = toIsoOrNull(v);
  return iso ? iso.slice(0, 10) : null;
}

function userName(u: { name?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined) {
  const full = clean(u?.name) || `${clean(u?.firstName)} ${clean(u?.lastName)}`.trim();
  return full || clean(u?.email) || "Unknown user";
}

function classLabel(c: { name?: string | null; grade?: string | null; arm?: string | null } | null | undefined) {
  const name = clean(c?.name);
  const arm = clean(c?.arm);
  const grade = clean(c?.grade);
  return [name || grade, arm].filter(Boolean).join(" ").trim() || null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function avg(values: number[]) {
  if (!values.length) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function emptyBucket(): AggregationBucket {
  return {
    finalizedCount: 0,
    teacherIds: new Set<string>(),
    overallScores: [],
    sectionScores: {
      preparationPercent: [],
      lessonDeliveryPercent: [],
      classroomCulturePercent: [],
      learnerParticipationPercent: [],
      understandingStrategiesPercent: [],
      evaluationStrategiesPercent: [],
    },
    latestFinalizedAt: null,
  };
}

function pushScore(list: number[], value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  list.push(value);
}

function updateLatest(current: string | null, next: Date | string | null | undefined) {
  const iso = toIsoOrNull(next);
  if (!iso) return current;
  if (!current) return iso;
  return new Date(iso).getTime() > new Date(current).getTime() ? iso : current;
}

function bucketSummary(bucket: AggregationBucket) {
  return {
    finalizedCount: bucket.finalizedCount,
    teachersAppraised: bucket.teacherIds.size,
    averageOverall: avg(bucket.overallScores),
    latestFinalizedAt: bucket.latestFinalizedAt,
    sectionAverages: {
      preparation: avg(bucket.sectionScores.preparationPercent),
      lessonDelivery: avg(bucket.sectionScores.lessonDeliveryPercent),
      classroomCulture: avg(bucket.sectionScores.classroomCulturePercent),
      learnerParticipation: avg(bucket.sectionScores.learnerParticipationPercent),
      understandingStrategies: avg(bucket.sectionScores.understandingStrategiesPercent),
      evaluationStrategies: avg(bucket.sectionScores.evaluationStrategiesPercent),
    },
  };
}

function resolveSchoolIdentity(tenant: {
  id: string;
  name: string;
  schoolCode: string | null;
  schoolSector: string;
  zone: TenantZone;
}): SchoolIdentity {
  const zone = tenant.zone;
  const zoneLevel = zone?.zoneType?.level ?? null;
  const parentLevel = zone?.parentZone?.zoneType?.level ?? null;

  const circuit =
    zone && zoneLevel === 1
      ? zone
      : zone?.parentZone && parentLevel === 1
        ? zone.parentZone
        : null;

  const district =
    zone && zoneLevel === 2
      ? zone
      : zone?.parentZone && parentLevel === 2
        ? zone.parentZone
        : null;

  return {
    tenantId: tenant.id,
    schoolName: tenant.name,
    schoolCode: tenant.schoolCode ?? null,
    schoolSector: tenant.schoolSector,
    circuitId: circuit?.id ?? null,
    circuitName: circuit?.name ?? null,
    districtId: district?.id ?? null,
    districtName: district?.name ?? null,
  };
}

function addAppraisalToBucket(
  bucket: AggregationBucket,
  row: {
    teacherUserId: string;
    finalizedAt: Date | null;
    overallPercentage: number | null;
    preparationPercent: number | null;
    lessonDeliveryPercent: number | null;
    classroomCulturePercent: number | null;
    learnerParticipationPercent: number | null;
    understandingStrategiesPercent: number | null;
    evaluationStrategiesPercent: number | null;
  },
) {
  bucket.finalizedCount += 1;
  bucket.teacherIds.add(row.teacherUserId);
  pushScore(bucket.overallScores, row.overallPercentage);

  for (const section of APPRAISAL_SECTIONS) {
    pushScore(bucket.sectionScores[section.percentField], row[section.percentField]);
  }

  bucket.latestFinalizedAt = updateLatest(bucket.latestFinalizedAt, row.finalizedAt);
}

function serializeListAppraisal(row: {
  id: string;
  tenantId: string;
  teacherUserId: string;
  dateObserved: Date;
  subject: string | null;
  classTaught: string | null;
  overallPercentage: number | null;
  finalizedAt: Date | null;
  teacherNameSnapshot: string | null;
  appraiserNameSnapshot: string | null;
  teacher: { name: string | null; firstName: string | null; lastName: string | null; email: string | null };
  classroom: { name: string | null; grade: string | null; arm: string | null } | null;
  tenant: {
    id: string;
    name: string;
    schoolCode: string | null;
    schoolSector: string;
    zone: TenantZone;
  };
}) {
  const school = resolveSchoolIdentity(row.tenant);

  return {
    id: row.id,
    tenantId: row.tenantId,
    teacherUserId: row.teacherUserId,
    teacherName: row.teacherNameSnapshot || userName(row.teacher),
    appraiserName: row.appraiserNameSnapshot || null,
    school,
    classroomName: row.classTaught || classLabel(row.classroom),
    subject: row.subject,
    dateObserved: toDateOnly(row.dateObserved),
    overallPercentage: row.overallPercentage,
    finalizedAt: toIsoOrNull(row.finalizedAt),
  };
}

async function loadFinalizedRowsForScope(scope: GovernanceScope) {
  if (!scope.tenantIds.length) return [];

  return prisma.teacherAppraisal.findMany({
    where: {
      tenantId: { in: scope.tenantIds },
      status: TeacherAppraisalStatus.FINALIZED,
    },
    orderBy: [{ finalizedAt: "desc" }, { updatedAt: "desc" }],
    take: 2500,
    select: {
      id: true,
      tenantId: true,
      teacherUserId: true,
      appraiserUserId: true,
      classroomId: true,
      dateObserved: true,
      subject: true,
      classTaught: true,
      overallPercentage: true,
      preparationPercent: true,
      lessonDeliveryPercent: true,
      classroomCulturePercent: true,
      learnerParticipationPercent: true,
      understandingStrategiesPercent: true,
      evaluationStrategiesPercent: true,
      finalizedAt: true,
      updatedAt: true,
      teacherNameSnapshot: true,
      appraiserNameSnapshot: true,
      teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
      classroom: { select: { name: true, grade: true, arm: true } },
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
          schoolSector: true,
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { level: true, name: true } },
              parentZone: {
                select: {
                  id: true,
                  name: true,
                  zoneType: { select: { level: true, name: true } },
                  parentZone: { select: { id: true, name: true, zoneType: { select: { level: true, name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
}

async function buildOverview(scope: GovernanceScope) {
  const rows = await loadFinalizedRowsForScope(scope);

  const overallBucket = emptyBucket();
  const circuitBuckets = new Map<string, { school: Pick<SchoolIdentity, "circuitId" | "circuitName" | "districtId" | "districtName">; bucket: AggregationBucket; schoolIds: Set<string> }>();
  const schoolBuckets = new Map<string, { school: SchoolIdentity; bucket: AggregationBucket }>();

  for (const row of rows) {
    const school = resolveSchoolIdentity(row.tenant);

    addAppraisalToBucket(overallBucket, row);

    const schoolRow =
      schoolBuckets.get(row.tenantId) ??
      { school, bucket: emptyBucket() };
    addAppraisalToBucket(schoolRow.bucket, row);
    schoolBuckets.set(row.tenantId, schoolRow);

    const circuitKey = school.circuitId || "NO_CIRCUIT";
    const circuitRow =
      circuitBuckets.get(circuitKey) ??
      {
        school: {
          circuitId: school.circuitId,
          circuitName: school.circuitName || "Unassigned Circuit",
          districtId: school.districtId,
          districtName: school.districtName,
        },
        bucket: emptyBucket(),
        schoolIds: new Set<string>(),
      };
    addAppraisalToBucket(circuitRow.bucket, row);
    circuitRow.schoolIds.add(row.tenantId);
    circuitBuckets.set(circuitKey, circuitRow);
  }

  const circuits = [...circuitBuckets.values()]
    .map((row) => ({
      circuitId: row.school.circuitId,
      circuitName: row.school.circuitName,
      districtId: row.school.districtId,
      districtName: row.school.districtName,
      schoolsWithReports: row.schoolIds.size,
      ...bucketSummary(row.bucket),
    }))
    .sort((a, b) => {
      if (b.finalizedCount !== a.finalizedCount) return b.finalizedCount - a.finalizedCount;
      return String(a.circuitName ?? "").localeCompare(String(b.circuitName ?? ""));
    });

  const schools = [...schoolBuckets.values()]
    .map((row) => ({
      ...row.school,
      ...bucketSummary(row.bucket),
    }))
    .sort((a, b) => {
      if (b.finalizedCount !== a.finalizedCount) return b.finalizedCount - a.finalizedCount;
      return a.schoolName.localeCompare(b.schoolName);
    });

  return {
    summary: bucketSummary(overallBucket),
    circuits,
    schools,
    recent: rows.slice(0, 20).map(serializeListAppraisal),
  };
}

async function buildCircuit(scope: GovernanceScope, circuitId: string) {
  const overview = await buildOverview(scope);

  const schools = overview.schools.filter((school) => school.circuitId === circuitId);
  const circuit =
    overview.circuits.find((row) => row.circuitId === circuitId) ??
    null;

  return { circuit, schools };
}

async function buildSchool(scope: GovernanceScope, tenantId: string) {
  assertTenantInGovernanceScope(scope, tenantId);

  const rows = await prisma.teacherAppraisal.findMany({
    where: {
      tenantId,
      status: TeacherAppraisalStatus.FINALIZED,
    },
    orderBy: [{ finalizedAt: "desc" }, { updatedAt: "desc" }],
    take: 500,
    select: {
      id: true,
      tenantId: true,
      teacherUserId: true,
      dateObserved: true,
      subject: true,
      classTaught: true,
      overallPercentage: true,
      finalizedAt: true,
      preparationPercent: true,
      lessonDeliveryPercent: true,
      classroomCulturePercent: true,
      learnerParticipationPercent: true,
      understandingStrategiesPercent: true,
      evaluationStrategiesPercent: true,
      teacherNameSnapshot: true,
      appraiserNameSnapshot: true,
      teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
      classroom: { select: { name: true, grade: true, arm: true } },
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
          schoolSector: true,
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { level: true, name: true } },
              parentZone: {
                select: {
                  id: true,
                  name: true,
                  zoneType: { select: { level: true, name: true } },
                  parentZone: { select: { id: true, name: true, zoneType: { select: { level: true, name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  const teacherBuckets = new Map<string, { teacherUserId: string; teacherName: string; reports: ReturnType<typeof serializeListAppraisal>[]; bucket: AggregationBucket }>();

  for (const row of rows) {
    const existing =
      teacherBuckets.get(row.teacherUserId) ??
      {
        teacherUserId: row.teacherUserId,
        teacherName: row.teacherNameSnapshot || userName(row.teacher),
        reports: [],
        bucket: emptyBucket(),
      };

    addAppraisalToBucket(existing.bucket, row);
    existing.reports.push(serializeListAppraisal(row));
    teacherBuckets.set(row.teacherUserId, existing);
  }

  const school = rows[0]?.tenant ? resolveSchoolIdentity(rows[0].tenant) : null;

  return {
    school,
    teachers: [...teacherBuckets.values()]
      .map((row) => ({
        teacherUserId: row.teacherUserId,
        teacherName: row.teacherName,
        ...bucketSummary(row.bucket),
        latestReport: row.reports[0] ?? null,
        reports: row.reports,
      }))
      .sort((a, b) => {
        if (b.finalizedCount !== a.finalizedCount) return b.finalizedCount - a.finalizedCount;
        return a.teacherName.localeCompare(b.teacherName);
      }),
  };
}

async function buildTeacher(scope: GovernanceScope, tenantId: string, teacherUserId: string) {
  assertTenantInGovernanceScope(scope, tenantId);

  const rows = await prisma.teacherAppraisal.findMany({
    where: {
      tenantId,
      teacherUserId,
      status: TeacherAppraisalStatus.FINALIZED,
    },
    orderBy: [{ finalizedAt: "desc" }, { updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      tenantId: true,
      teacherUserId: true,
      dateObserved: true,
      subject: true,
      classTaught: true,
      overallPercentage: true,
      finalizedAt: true,
      teacherNameSnapshot: true,
      appraiserNameSnapshot: true,
      teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
      classroom: { select: { name: true, grade: true, arm: true } },
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
          schoolSector: true,
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { level: true, name: true } },
              parentZone: {
                select: {
                  id: true,
                  name: true,
                  zoneType: { select: { level: true, name: true } },
                  parentZone: { select: { id: true, name: true, zoneType: { select: { level: true, name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  return {
    teacher: rows[0]
      ? {
          tenantId,
          teacherUserId,
          teacherName: rows[0].teacherNameSnapshot || userName(rows[0].teacher),
          school: resolveSchoolIdentity(rows[0].tenant),
        }
      : { tenantId, teacherUserId, teacherName: null, school: null },
    reports: rows.map(serializeListAppraisal),
  };
}

async function buildReport(scope: GovernanceScope, id: string) {
  if (!scope.tenantIds.length) return null;

  const appraisal = await prisma.teacherAppraisal.findFirst({
    where: {
      id,
      tenantId: { in: scope.tenantIds },
      status: TeacherAppraisalStatus.FINALIZED,
    },
    select: {
      id: true,
      tenantId: true,
      teacherUserId: true,
      appraiserUserId: true,
      finalizedByUserId: true,
      classroomId: true,
      dateObserved: true,
      classTaught: true,
      term: true,
      academicYear: true,
      subject: true,
      subStrand: true,
      durationMinutes: true,
      yearsInService: true,
      yearsInPresentSchool: true,
      teacherNameSnapshot: true,
      schoolNameSnapshot: true,
      circuitSnapshot: true,
      appraiserNameSnapshot: true,
      schemeOfWorkId: true,
      lessonNoteId: true,
      lessonDeliveryId: true,
      evidenceSnapshotJson: true,
      preparationPercent: true,
      lessonDeliveryPercent: true,
      classroomCulturePercent: true,
      learnerParticipationPercent: true,
      understandingStrategiesPercent: true,
      evaluationStrategiesPercent: true,
      overallPercentage: true,
      generalComment: true,
      finalizedAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
      appraiser: { select: { name: true, firstName: true, lastName: true, email: true } },
      finalizedBy: { select: { name: true, firstName: true, lastName: true, email: true } },
      classroom: { select: { name: true, grade: true, arm: true } },
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
          schoolSector: true,
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { level: true, name: true } },
              parentZone: {
                select: {
                  id: true,
                  name: true,
                  zoneType: { select: { level: true, name: true } },
                  parentZone: { select: { id: true, name: true, zoneType: { select: { level: true, name: true } } } },
                },
              },
            },
          },
        },
      },
      schemeOfWork: {
        select: {
          id: true,
          subject: true,
          level: true,
          term: true,
          academicYear: true,
          title: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          approvedAt: true,
          reviewedByUserId: true,
        },
      },
      lessonNote: {
        select: {
          id: true,
          subject: true,
          level: true,
          term: true,
          academicYear: true,
          weekNumber: true,
          lessonTitle: true,
          strand: true,
          substrand: true,
          contentStandard: true,
          indicator: true,
          status: true,
          approvedAt: true,
          reviewedAt: true,
          schemeOfWorkItemId: true,
        },
      },
      lessonDelivery: {
        select: {
          id: true,
          classroomId: true,
          subject: true,
          term: true,
          academicYear: true,
          lessonNoteId: true,
          dateTaught: true,
          contentStandardCode: true,
          indicatorCode: true,
          notes: true,
          assessmentItems: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              maxScore: true,
              _count: { select: { scores: true } },
            },
          },
        },
      },
      scores: {
        orderBy: [{ sectionOrder: "asc" }, { itemOrder: "asc" }],
        select: {
          id: true,
          sectionKey: true,
          sectionTitle: true,
          sectionOrder: true,
          sectionMaxScore: true,
          itemKey: true,
          itemLabel: true,
          itemOrder: true,
          score: true,
          notApplicable: true,
        },
      },
    },
  });

  if (!appraisal) return null;

  assertTenantInGovernanceScope(scope, appraisal.tenantId);

  const sections = APPRAISAL_SECTIONS.map((section) => {
    const rows = appraisal.scores.filter((score) => score.sectionKey === section.key);
    const scoredTotal = rows.reduce((sum, row) => sum + (row.score ?? 0), 0);
    const applicableRows = rows.filter((row) => !row.notApplicable).length;
    const denominator = applicableRows * 5;

    return {
      ...section,
      totalScore: scoredTotal,
      denominator,
      percentage: appraisal[section.percentField],
      rows,
    };
  });

  const school = resolveSchoolIdentity(appraisal.tenant);

  return {
    id: appraisal.id,
    tenantId: appraisal.tenantId,
    teacherUserId: appraisal.teacherUserId,
    appraiserUserId: appraisal.appraiserUserId,
    finalizedByUserId: appraisal.finalizedByUserId,
    school,
    officialHeader: {
      directorate: "Akatsi South Municipal Education Directorate",
      formTitle: "Monitoring and Inspection Sheet (Teachers)",
      teacherName: appraisal.teacherNameSnapshot || userName(appraisal.teacher),
      schoolName: appraisal.schoolNameSnapshot || appraisal.tenant.name,
      circuitName: appraisal.circuitSnapshot || school.circuitName,
      dateObserved: toDateOnly(appraisal.dateObserved),
      classTaught: appraisal.classTaught || classLabel(appraisal.classroom),
      yearsInService: appraisal.yearsInService,
      yearsInPresentSchool: appraisal.yearsInPresentSchool,
      subjectBeingObserved: appraisal.subject,
      subStrand: appraisal.subStrand,
      durationOfLesson: appraisal.durationMinutes,
      appraiserName: appraisal.appraiserNameSnapshot || userName(appraisal.appraiser),
      finalizedByName: userName(appraisal.finalizedBy),
    },
    term: appraisal.term,
    academicYear: appraisal.academicYear,
    percentages: {
      preparation: appraisal.preparationPercent,
      lessonDelivery: appraisal.lessonDeliveryPercent,
      classroomCulture: appraisal.classroomCulturePercent,
      learnerParticipation: appraisal.learnerParticipationPercent,
      understandingStrategies: appraisal.understandingStrategiesPercent,
      evaluationStrategies: appraisal.evaluationStrategiesPercent,
      overall: appraisal.overallPercentage,
    },
    sections,
    generalComment: appraisal.generalComment,
    evidenceWarnings: evidenceWarningsFromMetadata(appraisal.metadata),
    evidence: {
      schemeOfWork: appraisal.schemeOfWork
        ? {
            ...appraisal.schemeOfWork,
            submittedAt: toIsoOrNull(appraisal.schemeOfWork.submittedAt),
            reviewedAt: toIsoOrNull(appraisal.schemeOfWork.reviewedAt),
            approvedAt: toIsoOrNull(appraisal.schemeOfWork.approvedAt),
          }
        : null,
      lessonNote: appraisal.lessonNote
        ? {
            ...appraisal.lessonNote,
            approvedAt: toIsoOrNull(appraisal.lessonNote.approvedAt),
            reviewedAt: toIsoOrNull(appraisal.lessonNote.reviewedAt),
          }
        : null,
      lessonDelivery: appraisal.lessonDelivery
        ? {
            ...appraisal.lessonDelivery,
            dateTaught: toIsoOrNull(appraisal.lessonDelivery.dateTaught),
            assessmentItems: appraisal.lessonDelivery.assessmentItems.map((item) => ({
              id: item.id,
              title: item.title,
              type: item.type,
              status: item.status,
              maxScore: Number(item.maxScore ?? 0),
              scoresCount: item._count.scores,
            })),
          }
        : null,
      snapshot: appraisal.evidenceSnapshotJson,
    },
    finalizedAt: toIsoOrNull(appraisal.finalizedAt),
    createdAt: appraisal.createdAt.toISOString(),
    updatedAt: appraisal.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: GOVERNANCE_APPRAISAL_ROLES,
    allowedZoneLevels: [1, 2],
  });

  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);
  const mode = clean(searchParams.get("mode")) || "overview";

  try {
    if (mode === "rubric") {
      return jsonNoStore({
        ok: true,
        reqId,
        sections: APPRAISAL_SECTIONS,
        scale: {
          na: "N/A",
          1: "Very poor",
          2: "Poor",
          3: "Acceptable",
          4: "Good",
          5: "Very good",
        },
      });
    }

    if (mode === "overview") {
      const overview = await buildOverview(auth.scope);
      return jsonNoStore({ ok: true, reqId, scope: governanceScopeSummary(auth.scope), ...overview });
    }

    if (mode === "circuit") {
      const circuitId = clean(searchParams.get("circuitId"));
      if (!circuitId || !isLikelyId(circuitId)) {
        return jsonNoStore({ ok: false, error: "Invalid circuitId.", reqId }, 400);
      }

      const data = await buildCircuit(auth.scope, circuitId);
      return jsonNoStore({ ok: true, reqId, ...data });
    }

    if (mode === "school") {
      const tenantId = clean(searchParams.get("tenantId"));
      if (!tenantId || !isLikelyId(tenantId)) {
        return jsonNoStore({ ok: false, error: "Invalid tenantId.", reqId }, 400);
      }

      const data = await buildSchool(auth.scope, tenantId);
      return jsonNoStore({ ok: true, reqId, ...data });
    }

    if (mode === "teacher") {
      const tenantId = clean(searchParams.get("tenantId"));
      const teacherUserId = clean(searchParams.get("teacherUserId"));

      if (!tenantId || !isLikelyId(tenantId)) {
        return jsonNoStore({ ok: false, error: "Invalid tenantId.", reqId }, 400);
      }
      if (!teacherUserId || !isLikelyId(teacherUserId)) {
        return jsonNoStore({ ok: false, error: "Invalid teacherUserId.", reqId }, 400);
      }

      const data = await buildTeacher(auth.scope, tenantId, teacherUserId);
      return jsonNoStore({ ok: true, reqId, ...data });
    }

    if (mode === "report") {
      const id = clean(searchParams.get("id"));
      if (!id || !isLikelyId(id)) {
        return jsonNoStore({ ok: false, error: "Invalid appraisal report id.", reqId }, 400);
      }

      const report = await buildReport(auth.scope, id);
      if (!report) {
        return jsonNoStore({ ok: false, error: "Finalized appraisal report not found in your governance scope.", reqId }, 404);
      }

      return jsonNoStore({ ok: true, reqId, report, sections: APPRAISAL_SECTIONS });
    }

    return jsonNoStore({ ok: false, error: "Invalid mode.", reqId }, 400);
  } catch (err) {
    const status = err instanceof Error && (err as Error & { status?: number }).status ? (err as Error & { status?: number }).status : 500;

    if (status === 403) {
      return jsonNoStore({ ok: false, error: "GOVERNANCE_TENANT_FORBIDDEN", reqId }, 403);
    }

    console.error("GOVERNANCE_APPRAISALS_GET_ERROR", { reqId, mode, err });
    return jsonNoStore({ ok: false, error: "Failed to load governance appraisal reports.", reqId }, 500);
  }
}

function governanceScopeSummary(scope: GovernanceScope) {
  return {
    isSuperAdmin: scope.isSuperAdmin,
    assignments: scope.assignments,
    zoneCount: scope.zoneIds.length,
    tenantCount: scope.tenantIds.length,
  };
}
