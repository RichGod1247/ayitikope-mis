// src/app/api/admissions/scholarships/apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const VALID_LEVELS = new Set(["KG", "Lower Primary", "Upper Primary", "JHS"]);
const VALID_TYPES = new Set(["Merit", "Need-Based", "STEM", "Sports/Arts"]);

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const studentName = String(body.studentName ?? "").trim();
  const dateOfBirth = String(body.dateOfBirth ?? "").trim();
  const level = String(body.level ?? "").trim();
  const scholarshipType = String(body.scholarshipType ?? "").trim();
  const guardianName = String(body.guardianName ?? "").trim();
  const guardianPhoneRaw = String(body.guardianPhone ?? "").trim();
  const whatsappRaw = String(body.whatsappNumber ?? "").trim();
  const achievements = String(body.achievements ?? "").trim() || null;
  const needStatement = String(body.needStatement ?? "").trim() || null;
  const schoolCode = String(body.schoolCode ?? "").trim() || null;

  if (!studentName) return json(400, { ok: false, error: "Student name is required" });
  if (!level || !VALID_LEVELS.has(level)) return json(400, { ok: false, error: "Valid level is required" });
  if (!scholarshipType || !VALID_TYPES.has(scholarshipType)) return json(400, { ok: false, error: "Valid scholarship type is required" });
  if (!guardianName) return json(400, { ok: false, error: "Guardian name is required" });
  if (!guardianPhoneRaw) return json(400, { ok: false, error: "Guardian phone is required" });

  const guardianPhone = normalizeGhPhoneE164(guardianPhoneRaw);
  if (!guardianPhone) {
    return json(400, { ok: false, error: "Guardian phone must be a valid Ghana number (e.g. 024...)" });
  }

  const whatsappNumber = whatsappRaw ? (normalizeGhPhoneE164(whatsappRaw) ?? whatsappRaw) : null;

  let dateOfBirthParsed: Date | null = null;
  if (dateOfBirth) {
    const d = new Date(dateOfBirth);
    if (!isNaN(d.getTime())) dateOfBirthParsed = d;
  }

  // Resolve tenant
  let tenantId: string;
  try {
    const where = schoolCode
      ? { schoolCode, status: "ACTIVE" as const }
      : { status: "ACTIVE" as const };

    const tenant = await prisma.tenant.findFirst({ where, select: { id: true } });
    if (!tenant) return json(404, { ok: false, error: "School not found" });
    tenantId = tenant.id;
  } catch {
    return json(500, { ok: false, error: "Could not resolve school" });
  }

  try {
    const application = await prisma.scholarshipApplication.create({
      data: {
        tenantId,
        studentName,
        dateOfBirth: dateOfBirthParsed,
        level,
        scholarshipType,
        guardianName,
        guardianPhone,
        whatsappNumber,
        achievements,
        needStatement,
      },
      select: { id: true, submittedAt: true },
    });

    return json(201, { ok: true, id: application.id, submittedAt: application.submittedAt });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { ok: false, error: `Submission failed: ${msg}` });
  }
}
