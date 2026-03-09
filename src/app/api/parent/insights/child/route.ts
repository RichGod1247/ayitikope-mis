// src/app/api/parent/insights/child/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function digitsOnly(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isValidSuffixForLookup(suffix: string) {
  // Bank-grade safety: prevent endsWith("") / very short suffix scans.
  const s = digitsOnly(suffix);
  return s.length >= 7;
}

async function checkReleased(args: {
  tenantId: string;
  classroomId: string | null;
  term: string;
  academicYear: string;
}) {
  const scopeKeys = ["SCHOOL", ...(args.classroomId ? [args.classroomId] : [])];

  const rel = await prisma.resultsRelease.findFirst({
    where: {
      tenantId: args.tenantId,
      term: args.term,
      academicYear: args.academicYear,
      scopeKey: { in: scopeKeys },
    },
    select: { scope: true, scopeKey: true, releasedAt: true },
  });

  return rel
    ? {
        released: true,
        scope: rel.scope as "SCHOOL" | "CLASSROOM",
        scopeKey: rel.scopeKey,
        releasedAt: rel.releasedAt.toISOString(),
      }
    : { released: false as const };
}

export async function GET(req: NextRequest) {
  const gate = requireParentSession(req);
  if (!gate.ok) return gate.res as any;

  const ps = gate.session;

  const { searchParams } = new URL(req.url);
  const studentIdQ = cleanStr(searchParams.get("studentId"));

  // term/year from tenant settings (parent shouldn't guess)
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ps.tenantId },
    select: { currentTerm: true, currentAcademicYear: true, feverThreshold: true },
  });

  const term = settings?.currentTerm || "1st Term";
  const academicYear = settings?.currentAcademicYear || "2025/2026";
  const feverThreshold =
    settings?.feverThreshold != null ? Number(settings.feverThreshold) : 37.5;

  // ----------- Find children (bank-grade) -----------
  const guardianE164 = cleanStr(ps.guardianPhoneE164 ?? "");
  const suf = digitsOnly(ps.guardianSuffix9 ?? "");
  const canUseSuffix = !guardianE164 && isValidSuffixForLookup(suf);

  const whereOr: any[] = [];
  if (guardianE164) {
    // Preferred: exact match (fast if data is normalized)
    whereOr.push({ guardianPhoneNorm: guardianE164 });
  } else if (canUseSuffix) {
    // Fallback: suffix (older data)
    whereOr.push({ guardianPhoneNorm: { endsWith: suf } });
    whereOr.push({ guardianPhone: { endsWith: suf } });
  }

  let children =
    whereOr.length > 0
      ? await prisma.student.findMany({
          where: {
            tenantId: ps.tenantId,
            status: StudentStatus.ACTIVE,
            OR: whereOr,
          },
          select: { id: true, firstName: true, lastName: true, classroomId: true, guardianName: true },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          take: 50,
        })
      : [];

  if (!children.length) {
    return noStore(200, {
      ok: true,
      term,
      academicYear,
      report: { released: false },
      children: [],
      message:
        "No learners were found for this phone number in this school. If this is wrong, ask the school to update the guardian phone on the learner record.",
    });
  }

  const chosen = studentIdQ ? children.find((c) => c.id === studentIdQ) : children[0];

  if (!chosen || !chosen.classroomId) {
    return noStore(200, {
      ok: true,
      term,
      academicYear,
      report: { released: false },
      children: children.map((c) => ({
        id: c.id,
        name: `${cleanStr(c.firstName)} ${cleanStr(c.lastName)}`.trim() || "Learner",
        classroomId: c.classroomId ?? null,
      })),
      message: "No valid classroom found for selected learner.",
    });
  }

  const studentName =
    `${cleanStr(chosen.firstName)} ${cleanStr(chosen.lastName)}`.trim() || "Learner";

  // Attendance & health window (last 30 days)
  const end = new Date();
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const startISO = isoDateOnly(start);
  const endISO = isoDateOnly(end);

  const startTs = new Date(`${startISO}T00:00:00.000Z`);
  const endTs = new Date(`${endISO}T23:59:59.999Z`);

  // Attendance marks
  const marks = await prisma.attendanceMark.findMany({
    where: {
      studentId: chosen.id,
      session: {
        tenantId: ps.tenantId,
        classroomId: chosen.classroomId,
        date: { gte: startTs, lte: endTs },
      },
    },
    select: { status: true },
    take: 50000,
  });

  let present = 0,
    absent = 0,
    late = 0,
    excused = 0;

  for (const m of marks) {
    const st = String(m.status || "").toUpperCase();
    if (st === "PRESENT") present++;
    else if (st === "ABSENT") absent++;
    else if (st === "LATE") late++;
    else if (st === "EXCUSED") excused++;
  }

  const denom = present + absent + late + excused;
  const attended = present + late + excused;
  const attendancePercent =
    denom > 0 ? Number(((attended / denom) * 100).toFixed(1)) : null;

  // Health (StudentHealthDaily.date is @db.Date)
  const healthRows = await prisma.studentHealthDaily.findMany({
    where: {
      tenantId: ps.tenantId,
      studentId: chosen.id,
      date: {
        gte: new Date(startISO), // date-only bound
        lte: new Date(endISO),   // date-only bound
      },
    },
    select: { temperatureC: true, date: true },
    take: 50000,
  });

  let healthRecords = 0,
    feverFlags = 0;

  for (const h of healthRows) {
    healthRecords++;
    const t = h.temperatureC != null ? Number(h.temperatureC) : null;
    if (t != null && Number.isFinite(t) && t >= feverThreshold) feverFlags++;
  }

  // ✅ Release gate for performance/report
  const report = await checkReleased({
    tenantId: ps.tenantId,
    classroomId: chosen.classroomId,
    term,
    academicYear,
  });

  // If not released: lock performance signals entirely (bank-grade)
  if (!report.released) {
    return noStore(200, {
      ok: true,
      term,
      academicYear,
      report: { released: false },
      children: children.map((c) => ({
        id: c.id,
        name: `${cleanStr(c.firstName)} ${cleanStr(c.lastName)}`.trim() || "Learner",
        classroomId: c.classroomId ?? null,
      })),
      selected: { id: chosen.id, name: studentName, classroomId: chosen.classroomId },
      attendance: {
        window: { start: startISO, end: endISO },
        present,
        absent,
        late,
        excused,
        attendancePercent,
      },
      health: {
        window: { start: startISO, end: endISO },
        healthRecords,
        feverFlags,
        feverThreshold,
      },
      performance: {
        overallPercent: null,
        subjects: [],
        expectedAssessmentsCount: 0,
        scoredAssessmentsCount: 0,
        missingAssessmentsCount: 0,
        locked: true,
      },
      insights: {
        strengths: [],
        weaknesses: [],
        improvementFocus:
          "Results are not released yet. Focus now on attendance, sleep, and daily revision routines. When released, use the report to target weak subjects calmly.",
        risks: [
          ...(attendancePercent != null && attendancePercent < 80
            ? [`Low attendance (~${attendancePercent}%).`]
            : []),
          ...(feverFlags >= 2 ? [`Repeated health flags (${feverFlags}).`] : []),
        ],
        locked: true,
      },
      message: "Performance is locked until the headteacher releases results for this term.",
    });
  }

  // ---------------------------
  // Performance (only when released)
  // ---------------------------
  const items = await prisma.assessmentItem.findMany({
    where: {
      tenantId: ps.tenantId,
      classroomId: chosen.classroomId,
      term,
      academicYear,
      status: { in: ["PUBLISHED", "LOCKED"] }, // ✅ exclude DRAFT
    },
    select: { id: true, subject: true, maxScore: true },
    take: 2000,
  });

  const itemIds = items.map((i) => i.id);
  const itemMax = new Map<string, number>();
  const itemSubj = new Map<string, string>();

  for (const it of items) {
    itemMax.set(it.id, Number(it.maxScore ?? 0));
    itemSubj.set(it.id, cleanStr(it.subject) || "Subject");
  }

  const scores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: { itemId: { in: itemIds }, studentId: chosen.id },
        select: { itemId: true, score: true },
        take: 50000,
      })
    : [];

  const scoredSet = new Set(scores.map((s) => s.itemId));
  const expectedAssessmentsCount = itemIds.length;
  const scoredAssessmentsCount = scoredSet.size;
  const missingAssessmentsCount = Math.max(0, expectedAssessmentsCount - scoredAssessmentsCount);

  let sum = 0,
    maxSum = 0;

  const subjAgg = new Map<string, { sum: number; max: number }>();

  for (const s of scores) {
    const m = itemMax.get(s.itemId) ?? 0;
    if (m <= 0) continue;

    const sc = Number(s.score ?? 0);
    sum += sc;
    maxSum += m;

    const subj = itemSubj.get(s.itemId) ?? "Subject";
    const a = subjAgg.get(subj) ?? { sum: 0, max: 0 };
    a.sum += sc;
    a.max += m;
    subjAgg.set(subj, a);
  }

  const overallPercent =
    maxSum > 0 ? Number(((sum / maxSum) * 100).toFixed(1)) : null;

  const subjects = [...subjAgg.entries()]
    .map(([subject, a]) => ({
      subject,
      percent: a.max > 0 ? Number(((a.sum / a.max) * 100).toFixed(1)) : null,
    }))
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));

  const strengths = subjects
    .filter((s) => (s.percent ?? 0) >= 70)
    .slice(0, 2)
    .map((s) => s.subject);

  const weaknesses = subjects
    .filter((s) => (s.percent ?? 0) < 50)
    .slice(0, 2)
    .map((s) => s.subject);

  const insights = {
    strengths,
    weaknesses,
    improvementFocus: weaknesses.length
      ? `Focus first on ${weaknesses[0]} for 2 weeks with short daily practice.`
      : "Strengthen one steady subject into a strong one with consistency.",
    risks: [
      ...(attendancePercent != null && attendancePercent < 80
        ? [`Low attendance (~${attendancePercent}%).`]
        : []),
      ...(feverFlags >= 2 ? [`Repeated health flags (${feverFlags}).`] : []),
      ...(missingAssessmentsCount > 0
        ? [`Missing ${missingAssessmentsCount} assessment(s).`]
        : []),
    ],
  };

  return noStore(200, {
    ok: true,
    term,
    academicYear,
    report,
    children: children.map((c) => ({
      id: c.id,
      name: `${cleanStr(c.firstName)} ${cleanStr(c.lastName)}`.trim() || "Learner",
      classroomId: c.classroomId ?? null,
    })),
    selected: { id: chosen.id, name: studentName, classroomId: chosen.classroomId },
    attendance: {
      window: { start: startISO, end: endISO },
      present,
      absent,
      late,
      excused,
      attendancePercent,
    },
    health: {
      window: { start: startISO, end: endISO },
      healthRecords,
      feverFlags,
      feverThreshold,
    },
    performance: {
      overallPercent,
      subjects,
      expectedAssessmentsCount,
      scoredAssessmentsCount,
      missingAssessmentsCount,
      locked: false,
    },
    insights: { ...insights, locked: false },
  });
}