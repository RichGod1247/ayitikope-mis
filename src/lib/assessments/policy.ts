// src/lib/assessments/policy.ts
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const GradeBandSchema = z.object({
  grade: z.number().int().min(1).max(9),
  label: z.string().min(1),
  minPercent: z.number().min(0).max(100),
  maxPercent: z.number().min(0).max(100),
});

export const AssessmentTypeSchema = z.object({
  code: z.string().min(1), // e.g. "CLASS_TEST"
  label: z.string().min(1), // e.g. "Class Test"
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
    types: [
      { code: "CLASS_TEST", label: "Class Test" },
      { code: "HOMEWORK", label: "Homework" },
      { code: "PROJECT", label: "Project" },
      { code: "QUIZ", label: "Quiz" },
      { code: "EXAM", label: "Exam" },
      { code: "OTHER", label: "Other" },
    ],
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

function toPlainObject(v: unknown): Record<string, any> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as any;
  return {};
}

export async function getTenantAssessmentPolicy(tenantId: string): Promise<AssessmentPolicyV1> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settingsJson: true },
  });

  const settings = toPlainObject(t?.settingsJson);
  const raw = settings.assessmentPolicy;

  const parsed = AssessmentPolicyV1Schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  return defaultAssessmentPolicy();
}

export async function setTenantAssessmentPolicy(tenantId: string, policy: AssessmentPolicyV1) {
  const parsed = AssessmentPolicyV1Schema.parse(policy);

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settingsJson: true },
  });

  const settings = toPlainObject(t?.settingsJson);
  const next = { ...settings, assessmentPolicy: parsed };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settingsJson: next },
  });

  return parsed;
}

export function normalizeTypeCode(input: string) {
  return String(input || "").trim().toUpperCase();
}

export function isAllowedType(policy: AssessmentPolicyV1, type: string) {
  const code = normalizeTypeCode(type);
  return policy.types.some((t) => normalizeTypeCode(t.code) === code);
}

export function bandForPercent(policy: AssessmentPolicyV1, pct: number) {
  const v = Number(pct);
  if (!Number.isFinite(v)) return policy.gradeBands[policy.gradeBands.length - 1];

  const band =
    policy.gradeBands.find((b) => v >= b.minPercent && v <= b.maxPercent) ??
    (v > 100 ? policy.gradeBands[0] : policy.gradeBands[policy.gradeBands.length - 1]);

  return band;
}