// src/lib/assessments/policy.ts
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ASSESSMENT_CATEGORIES,
  isAssessmentCategoryCode,
  normalizeAssessmentCategory,
} from "@/lib/assessments/categories";

type ClassroomLike = {
  id?: string;
  name?: string | null;
  grade?: string | null;
  arm?: string | null;
};

/**
 * =========================
 * Legacy public contract
 * =========================
 *
 * These exports are retained so existing admin/report routes do not break.
 */

export const GradeBandSchema = z.object({
  grade: z.number().int().min(1).max(9),
  label: z.string().min(1),
  minPercent: z.number().min(0).max(100),
  maxPercent: z.number().min(0).max(100),
});

export const AssessmentTypeSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
});

export const AssessmentPolicyV1Schema = z.object({
  version: z.literal(1),
  types: z.array(AssessmentTypeSchema).min(1),
  gradeBands: z.array(GradeBandSchema).min(1),
});

export type AssessmentPolicyV1 = z.infer<typeof AssessmentPolicyV1Schema>;
export type GradeBand = z.infer<typeof GradeBandSchema>;

export function defaultAssessmentPolicy(): AssessmentPolicyV1 {
  return {
    version: 1,
    types: ASSESSMENT_CATEGORIES.map((category) => ({
  code: category.code,
  label: category.label,
})),
    gradeBands: [
      { grade: 1, label: "Excellent", minPercent: 90, maxPercent: 100 },
      { grade: 2, label: "Very Good", minPercent: 80, maxPercent: 89 },
      { grade: 3, label: "Good", minPercent: 70, maxPercent: 79 },
      { grade: 4, label: "High Average", minPercent: 60, maxPercent: 69 },
      { grade: 5, label: "Average", minPercent: 55, maxPercent: 59 },
      { grade: 6, label: "Low Average", minPercent: 50, maxPercent: 54 },
      { grade: 7, label: "Low", minPercent: 40, maxPercent: 49 },
      { grade: 8, label: "Lower", minPercent: 35, maxPercent: 39 },
      { grade: 9, label: "Lowest / Fail", minPercent: 0, maxPercent: 34 },
    ],
  };
}

function toPlainObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export function normalizeTypeCode(input: unknown) {
  return normalizeAssessmentCategory(input);
}

/**
 * Legacy getter.
 *
 * Keep this original shape because existing admin routes imported it before
 * the new DB-backed assessment spine was introduced.
 */
export async function getTenantAssessmentPolicy(
  tenantId: string
): Promise<AssessmentPolicyV1> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settingsJson: true },
  });

  const settings = toPlainObject(tenant?.settingsJson);
  const raw = settings.assessmentPolicy;

  const parsed = AssessmentPolicyV1Schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  return defaultAssessmentPolicy();
}

type ComponentKindCode =
  | "EXERCISE"
  | "HOMEWORK"
  | "QUIZ"
  | "CLASS_TEST"
  | "GROUP_WORK"
  | "PROJECT"
  | "PRACTICAL"
  | "EXAM"
  | "OTHER";

function componentKindFromCode(raw: unknown): ComponentKindCode {
  const code = normalizeTypeCode(raw);
  return isAssessmentCategoryCode(code) ? code : "OTHER";
}

function fallbackComponentForLegacyType(code: string) {
  const normalized = normalizeTypeCode(code);

const defaults: Record<
  string,
  {
    label: string;
    maxScore: number;
    weightPercent: number;
    orderIndex: number;
    required: boolean;
  }
> = {
  EXERCISE: {
    label: "Exercise",
    maxScore: 20,
    weightPercent: 6,
    orderIndex: 10,
    required: true,
  },
  HOMEWORK: {
    label: "Homework",
    maxScore: 20,
    weightPercent: 6,
    orderIndex: 20,
    required: true,
  },
  QUIZ: {
    label: "Quiz",
    maxScore: 20,
    weightPercent: 0,
    orderIndex: 25,
    required: false,
  },
  CLASS_TEST: {
    label: "Class Test",
    maxScore: 30,
    weightPercent: 9,
    orderIndex: 30,
    required: true,
  },
  PROJECT: {
    label: "Project",
    maxScore: 30,
    weightPercent: 9,
    orderIndex: 40,
    required: false,
  },
  GROUP_WORK: {
    label: "Group Work",
    maxScore: 30,
    weightPercent: 0,
    orderIndex: 45,
    required: false,
  },
  PRACTICAL: {
    label: "Practical",
    maxScore: 30,
    weightPercent: 0,
    orderIndex: 55,
    required: false,
  },
  EXAM: {
    label: "Exam",
    maxScore: 100,
    weightPercent: 70,
    orderIndex: 60,
    required: true,
  },
  OTHER: {
    label: "Other",
    maxScore: 100,
    weightPercent: 0,
    orderIndex: 90,
    required: false,
  },
};

  return defaults[normalized] ?? {
    label: normalized
      .toLowerCase()
      .split("_")
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" "),
    maxScore: 100,
    weightPercent: 0,
    orderIndex: 90,
    required: false,
  };
}

/**
 * Legacy setter.
 *
 * It keeps the original behavior by storing policy in Tenant.settingsJson,
 * but also mirrors it into the new DB policy tables as CUSTOM so the new
 * broadsheet engine can consume school-level custom policy.
 */
export async function setTenantAssessmentPolicy(
  tenantId: string,
  policy: AssessmentPolicyV1,
  createdByUserId?: string | null
): Promise<AssessmentPolicyV1> {
  const parsed = AssessmentPolicyV1Schema.parse(policy);

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settingsJson: true },
    });

    const settings = toPlainObject(tenant?.settingsJson);
    const nextSettings = { ...settings, assessmentPolicy: parsed };

    await tx.tenant.update({
      where: { id: tenantId },
      data: { settingsJson: nextSettings },
    });

    const existing = await tx.assessmentPolicy.findFirst({
      where: {
        tenantId,
        levelBand: "CUSTOM",
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });

    const dbPolicy = existing
      ? await tx.assessmentPolicy.update({
          where: { id: existing.id },
          data: {
            name: "School Custom Assessment Policy",
            description:
              "School-level assessment policy mirrored from the legacy admin assessment settings.",
            countryCode: "GH",
            framework: "GES_BASIC_SCHOOL",
            levelBand: "CUSTOM",
            phase: null,
            level: null,
            status: "ACTIVE",
            isDefault: false,
            version: { increment: 1 },
            metadata: {
              source: "TENANT_SETTINGS_ASSESSMENT_POLICY",
              legacyVersion: parsed.version,
            },
            ...(createdByUserId ? { createdByUserId } : {}),
          },
          select: { id: true },
        })
      : await tx.assessmentPolicy.create({
          data: {
            tenantId,
            name: "School Custom Assessment Policy",
            description:
              "School-level assessment policy mirrored from the legacy admin assessment settings.",
            countryCode: "GH",
            framework: "GES_BASIC_SCHOOL",
            levelBand: "CUSTOM",
            phase: null,
            level: null,
            status: "ACTIVE",
            isDefault: false,
            version: 1,
            metadata: {
              source: "TENANT_SETTINGS_ASSESSMENT_POLICY",
              legacyVersion: parsed.version,
            },
            createdByUserId: createdByUserId || null,
          },
          select: { id: true },
        });

    await tx.assessmentPolicyComponent.deleteMany({
      where: { policyId: dbPolicy.id },
    });

    await tx.assessmentGradeScale.deleteMany({
      where: { policyId: dbPolicy.id },
    });

    await tx.assessmentPolicyComponent.createMany({
      data: parsed.types.map((type, index) => {
        const code = normalizeTypeCode(type.code);
        const fallback = fallbackComponentForLegacyType(code);

        return {
          policyId: dbPolicy.id,
          tenantId,
          code,
          label: type.label || fallback.label,
          kind: componentKindFromCode(code),
          maxScore: fallback.maxScore,
          weightPercent: fallback.weightPercent,
          orderIndex: fallback.orderIndex || (index + 1) * 10,
          required: fallback.required,
          metadata: {
            source: "LEGACY_POLICY_TYPE",
          },
        };
      }),
    });

    await tx.assessmentGradeScale.createMany({
      data: parsed.gradeBands.map((band, index) => ({
        policyId: dbPolicy.id,
        tenantId,
        grade: String(band.grade),
        minPercent: band.minPercent,
        maxPercent: band.maxPercent,
        label: band.label,
        remark: band.label,
        reportPhrase: null,
        orderIndex: (index + 1) * 10,
      })),
    });
  });

  return parsed;
}

/**
 * This supports both the old V1 policy shape and the new Lite policy shape.
 */
export function isAllowedType(
  policy: AssessmentPolicyV1 | AssessmentPolicyLite,
  type: unknown
) {
  const code = normalizeTypeCode(type);

  if ("components" in policy) {
    return policy.types.some((t) => normalizeTypeCode(t) === code);
  }

  return policy.types.some((t) => normalizeTypeCode(t.code) === code);
}

export function bandForPercent(policy: AssessmentPolicyV1, pct: number) {
  const v = Number(pct);

  if (!Number.isFinite(v)) {
    return policy.gradeBands[policy.gradeBands.length - 1];
  }

  const band =
    policy.gradeBands.find((b) => v >= b.minPercent && v <= b.maxPercent) ??
    (v > 100
      ? policy.gradeBands[0]
      : policy.gradeBands[policy.gradeBands.length - 1]);

  return band;
}

/**
 * =========================
 * New DB-backed policy spine
 * =========================
 *
 * New assessment/broadsheet code should use getTenantAssessmentPolicyLite().
 */

export type AssessmentPolicyComponentLite = {
  id: string | null;
  policyId: string | null;
  code: string;
  label: string;
  kind: string;
  maxScore: number;
  weightPercent: number;
  orderIndex: number;
  required: boolean;
};

export type AssessmentGradeScaleLite = {
  grade: string;
  minPercent: number;
  maxPercent: number;
  label: string;
  remark: string;
  reportPhrase: string | null;
  orderIndex: number;
};

export type AssessmentPolicyLite = {
  id: string | null;
  name: string;
  levelBand: "KG" | "PRIMARY" | "JHS" | "SHS" | "CUSTOM";
  types: string[];
  components: AssessmentPolicyComponentLite[];
  gradeScale: AssessmentGradeScaleLite[];
};

function normalizeSchoolLevel(raw: unknown): string {
  const s = clean(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return "";

  let m =
    s.match(/^KG\s*([12])$/) ||
    s.match(/^KG([12])$/) ||
    s.match(/^K\.?G\.?\s*([12])$/);
  if (m) return `KG${m[1]}`;

  m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);
  if (m) return `JHS ${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/) ||
    s.match(/^BS\s*([7-9])$/) ||
    s.match(/^BS([7-9])$/);
  if (m) {
    const n = Number(m[1]);
    return `JHS ${n - 6}`;
  }

  m =
    s.match(/^BASIC\s*([1-6])$/) ||
    s.match(/^BASIC([1-6])$/) ||
    s.match(/^B\s*([1-6])$/) ||
    s.match(/^B([1-6])$/) ||
    s.match(/^PRIMARY\s*([1-6])$/) ||
    s.match(/^PRIMARY([1-6])$/) ||
    s.match(/^P\s*([1-6])$/) ||
    s.match(/^P([1-6])$/);
  if (m) return `Basic ${m[1]}`;

  return clean(raw);
}

function inferLevelBand(
  classroom?: ClassroomLike | null
): AssessmentPolicyLite["levelBand"] {
  const level = normalizeSchoolLevel(classroom?.grade || classroom?.name);

  if (/^KG[12]$/.test(level)) return "KG";
  if (/^Basic [1-6]$/.test(level)) return "PRIMARY";
  if (/^JHS [1-3]$/.test(level)) return "JHS";

  return "PRIMARY";
}

function fallbackPolicy(
  levelBand: AssessmentPolicyLite["levelBand"]
): AssessmentPolicyLite {
  const components: AssessmentPolicyComponentLite[] = [
    {
      id: null,
      policyId: null,
      code: "EXERCISE",
      label: "Exercise",
      kind: "EXERCISE",
      maxScore: 20,
      weightPercent: 6,
      orderIndex: 10,
      required: true,
    },
    {
      id: null,
      policyId: null,
      code: "HOMEWORK",
      label: "Homework",
      kind: "HOMEWORK",
      maxScore: 20,
      weightPercent: 6,
      orderIndex: 20,
      required: true,
    },
    {
      id: null,
      policyId: null,
      code: "CLASS_TEST",
      label: "Class Test",
      kind: "CLASS_TEST",
      maxScore: 30,
      weightPercent: 9,
      orderIndex: 30,
      required: true,
    },
    {
      id: null,
      policyId: null,
      code: "PROJECT",
      label: "Project",
      kind: "PROJECT",
      maxScore: 30,
      weightPercent: 9,
      orderIndex: 40,
      required: false,
    },
    {
      id: null,
      policyId: null,
      code: "EXAM",
      label: "Exam",
      kind: "EXAM",
      maxScore: 100,
      weightPercent: 70,
      orderIndex: 50,
      required: true,
    },
  ];

  return {
    id: null,
    name: `Fallback ${levelBand} Assessment Policy`,
    levelBand,
    types: [
      "EXERCISE",
      "HOMEWORK",
      "CLASS_TEST",
      "PROJECT",
      "PRACTICAL",
      "QUIZ",
      "EXAM",
      "OTHER",
    ],
    components,
    gradeScale: [
      {
        grade: "HP",
        minPercent: 80,
        maxPercent: 100,
        label: "Highly Proficient",
        remark: "Highly Proficient",
        reportPhrase: null,
        orderIndex: 10,
      },
      {
        grade: "P",
        minPercent: 68,
        maxPercent: 79.999,
        label: "Proficient",
        remark: "Proficient",
        reportPhrase: null,
        orderIndex: 20,
      },
      {
        grade: "AP",
        minPercent: 54,
        maxPercent: 67.999,
        label: "Approaching Proficiency",
        remark: "Approaching Proficiency",
        reportPhrase: null,
        orderIndex: 30,
      },
      {
        grade: "D",
        minPercent: 40,
        maxPercent: 53.999,
        label: "Developing",
        remark: "Developing",
        reportPhrase: null,
        orderIndex: 40,
      },
      {
        grade: "E",
        minPercent: 0,
        maxPercent: 39.999,
        label: "Emerging",
        remark: "Emerging",
        reportPhrase: null,
        orderIndex: 50,
      },
    ],
  };
}

async function findTenantExactPolicy(
  tenantId: string,
  levelBand: AssessmentPolicyLite["levelBand"]
) {
  return prisma.assessmentPolicy.findFirst({
    where: {
      tenantId,
      levelBand,
      status: "ACTIVE",
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      levelBand: true,
      components: {
        orderBy: [{ orderIndex: "asc" }, { label: "asc" }],
        select: {
          id: true,
          policyId: true,
          code: true,
          label: true,
          kind: true,
          maxScore: true,
          weightPercent: true,
          orderIndex: true,
          required: true,
        },
      },
      gradeScales: {
        orderBy: [{ orderIndex: "asc" }],
        select: {
          grade: true,
          minPercent: true,
          maxPercent: true,
          label: true,
          remark: true,
          reportPhrase: true,
          orderIndex: true,
        },
      },
    },
  });
}

async function findTenantCustomPolicy(tenantId: string) {
  return prisma.assessmentPolicy.findFirst({
    where: {
      tenantId,
      levelBand: "CUSTOM",
      status: "ACTIVE",
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      levelBand: true,
      components: {
        orderBy: [{ orderIndex: "asc" }, { label: "asc" }],
        select: {
          id: true,
          policyId: true,
          code: true,
          label: true,
          kind: true,
          maxScore: true,
          weightPercent: true,
          orderIndex: true,
          required: true,
        },
      },
      gradeScales: {
        orderBy: [{ orderIndex: "asc" }],
        select: {
          grade: true,
          minPercent: true,
          maxPercent: true,
          label: true,
          remark: true,
          reportPhrase: true,
          orderIndex: true,
        },
      },
    },
  });
}

async function findGlobalDefaultPolicy(
  levelBand: AssessmentPolicyLite["levelBand"]
) {
  return prisma.assessmentPolicy.findFirst({
    where: {
      tenantId: null,
      levelBand,
      isDefault: true,
      status: "ACTIVE",
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      levelBand: true,
      components: {
        orderBy: [{ orderIndex: "asc" }, { label: "asc" }],
        select: {
          id: true,
          policyId: true,
          code: true,
          label: true,
          kind: true,
          maxScore: true,
          weightPercent: true,
          orderIndex: true,
          required: true,
        },
      },
      gradeScales: {
        orderBy: [{ orderIndex: "asc" }],
        select: {
          grade: true,
          minPercent: true,
          maxPercent: true,
          label: true,
          remark: true,
          reportPhrase: true,
          orderIndex: true,
        },
      },
    },
  });
}

type PolicyQueryResult = NonNullable<
  Awaited<ReturnType<typeof findGlobalDefaultPolicy>>
>;

function toLitePolicy(
  policy: PolicyQueryResult,
  requestedLevelBand: AssessmentPolicyLite["levelBand"]
): AssessmentPolicyLite {
  const components = policy.components.map((c) => ({
    id: c.id,
    policyId: c.policyId,
    code: normalizeTypeCode(c.code),
    label: c.label,
    kind: normalizeTypeCode(c.kind),
    maxScore: Number(c.maxScore ?? 0),
    weightPercent: Number(c.weightPercent ?? 0),
    orderIndex: Number(c.orderIndex ?? 0),
    required: Boolean(c.required),
  }));

  const types = Array.from(
    new Set([
      ...components.map((c) => normalizeTypeCode(c.code)),
      ...components.map((c) => normalizeTypeCode(c.kind)),
      "QUIZ",
      "OTHER",
    ])
  );

  return {
    id: policy.id,
    name: policy.name,
    levelBand:
      policy.levelBand === "CUSTOM"
        ? requestedLevelBand
        : (policy.levelBand as AssessmentPolicyLite["levelBand"]),
    types,
    components,
    gradeScale: policy.gradeScales.map((g) => ({
      grade: g.grade,
      minPercent: Number(g.minPercent),
      maxPercent: Number(g.maxPercent),
      label: g.label,
      remark: g.remark,
      reportPhrase: g.reportPhrase ?? null,
      orderIndex: Number(g.orderIndex ?? 0),
    })),
  };
}

/**
 * New DB-backed getter for broadsheet/report-card upgrade.
 *
 * Priority:
 * 1. Tenant exact level policy
 * 2. Tenant CUSTOM policy
 * 3. Global default exact level policy
 * 4. Code fallback
 */
export async function getTenantAssessmentPolicyLite(
  tenantId: string,
  args?: { classroom?: ClassroomLike | null }
): Promise<AssessmentPolicyLite> {
  const levelBand = inferLevelBand(args?.classroom ?? null);

  const policy =
    (await findTenantExactPolicy(tenantId, levelBand)) ??
    (await findTenantCustomPolicy(tenantId)) ??
    (await findGlobalDefaultPolicy(levelBand));

  if (!policy) return fallbackPolicy(levelBand);

  return toLitePolicy(policy, levelBand);
}

export function findPolicyComponent(
  policy: AssessmentPolicyLite,
  rawTypeOrCode: unknown
): AssessmentPolicyComponentLite | null {
  const type = normalizeTypeCode(rawTypeOrCode);

  return (
    policy.components.find((c) => normalizeTypeCode(c.code) === type) ??
    policy.components.find((c) => normalizeTypeCode(c.kind) === type) ??
    policy.components.find((c) => normalizeTypeCode(c.label) === type) ??
    null
  );
}

export function gradeFromPolicy(
  policy: AssessmentPolicyLite,
  percentage: number | null | undefined
) {
  if (percentage == null || Number.isNaN(percentage)) return null;

  const pct = Number(percentage);

  return (
    policy.gradeScale.find(
      (g) => pct >= Number(g.minPercent) && pct <= Number(g.maxPercent)
    ) ?? null
  );
}