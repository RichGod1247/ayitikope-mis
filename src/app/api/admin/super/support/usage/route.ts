// src/app/api/admin/super/support/usage/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma, SchoolSector, TenantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

type StatusBucketRow = {
  tenantId: string | null;
  status: string;
  _count: { _all: number };
};

type CountRow = {
  tenantId: string | null;
  _count: { _all: number };
};

type MaxCreatedRow = {
  tenantId: string | null;
  _max: { createdAt: Date | null };
};

type MaxDateTaughtRow = {
  tenantId: string | null;
  _max: { dateTaught: Date | null };
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function statusFrom(value: unknown): TenantStatus | "ALL" {
  const s = clean(value).toUpperCase();

  if (s === "PENDING") return TenantStatus.PENDING;
  if (s === "ACTIVE") return TenantStatus.ACTIVE;
  if (s === "SUSPENDED") return TenantStatus.SUSPENDED;
  if (s === "ARCHIVED") return TenantStatus.ARCHIVED;

  return "ALL";
}

function sectorFrom(value: unknown): SchoolSector | "ALL" {
  const s = clean(value).toUpperCase();

  if (s === "PUBLIC") return SchoolSector.PUBLIC;
  if (s === "PRIVATE") return SchoolSector.PRIVATE;

  return "ALL";
}

function windowDaysFrom(value: unknown) {
  const n = Number(value ?? 30);

  if (!Number.isFinite(n)) return 30;
  if (n < 7) return 7;
  if (n > 180) return 180;

  return Math.floor(n);
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function countMap(rows: CountRow[]) {
  const map = new Map<string, number>();

  for (const row of rows) {
    if (!row.tenantId) continue;
    map.set(row.tenantId, row._count._all);
  }

  return map;
}

function maxCreatedMap(rows: MaxCreatedRow[]) {
  const map = new Map<string, Date>();

  for (const row of rows) {
    if (!row.tenantId || !row._max.createdAt) continue;
    map.set(row.tenantId, row._max.createdAt);
  }

  return map;
}

function maxDateTaughtMap(rows: MaxDateTaughtRow[]) {
  const map = new Map<string, Date>();

  for (const row of rows) {
    if (!row.tenantId || !row._max.dateTaught) continue;
    map.set(row.tenantId, row._max.dateTaught);
  }

  return map;
}

function statusBucketMap(rows: StatusBucketRow[]) {
  const map = new Map<string, Record<string, number>>();

  for (const row of rows) {
    if (!row.tenantId) continue;

    const current = map.get(row.tenantId) ?? {};
    current[row.status] = row._count._all;
    map.set(row.tenantId, current);
  }

  return map;
}

function latestDate(values: Array<Date | null | undefined>) {
  const valid = values.filter((value): value is Date => Boolean(value));

  if (!valid.length) return null;

  return valid.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function daysSince(value: Date | null, now: Date) {
  if (!value) return null;
  return Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000));
}

function riskLevel(score: number) {
  if (score >= 80) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const status = statusFrom(req.nextUrl.searchParams.get("status") || "ALL");
  const sector = sectorFrom(req.nextUrl.searchParams.get("sector") || "ALL");
  const q = clean(req.nextUrl.searchParams.get("q"));
  const windowDays = windowDaysFrom(req.nextUrl.searchParams.get("windowDays"));

  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const where: Prisma.TenantWhereInput = {};

  if (status !== "ALL") where.status = status;
  if (sector !== "ALL") where.schoolSector = sector;

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { schoolCode: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { emisCode: { contains: q, mode: "insensitive" } },
      { contactEmail: { contains: q, mode: "insensitive" } },
      { contactPhoneNorm: { contains: q, mode: "insensitive" } },
      { district: { contains: q, mode: "insensitive" } },
      { circuit: { contains: q, mode: "insensitive" } },
      { region: { contains: q, mode: "insensitive" } },
    ];
  }

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      schoolCode: true,
      slug: true,
      status: true,
      schoolSector: true,
      emisCode: true,
      contactEmail: true,
      contactPhoneNorm: true,
      region: true,
      district: true,
      circuit: true,
      createdAt: true,
      updatedAt: true,
      zone: {
        select: {
          id: true,
          name: true,
          zoneType: { select: { name: true, level: true } },
          parentZone: { select: { id: true, name: true } },
        },
      },
      _count: {
        select: {
          memberships: true,
          students: true,
          teacherProfiles: true,
          AttendanceSession: true,
          lessonNotes: true,
          lessonDeliveries: true,
          assessmentItems: true,
          feeInvoices: true,
          financeOutboxEvents: true,
          paymentProviderEvents: true,
          governanceInterventions: true,
        },
      },
    },
  });

  const tenantIds = tenants.map((tenant) => tenant.id);

  if (!tenantIds.length) {
    return json({
      ok: true,
      windowDays,
      generatedAt: now.toISOString(),
      summary: {
        tenants: 0,
        activeTenants: 0,
        schoolsWithCriticalRisk: 0,
        schoolsWithHighRisk: 0,
        failedOutboxEvents: 0,
        failedProviderEvents: 0,
      },
      items: [],
    });
  }

  const [
    attendanceRows,
    lessonNoteRows,
    lessonDeliveryRows,
    assessmentRows,
    auditRows,
    smsRows,
    feeInvoiceRows,
    financeOutboxRows,
    providerEventRows,
    governanceCaseRows,
    attendanceLatestRows,
    lessonNoteLatestRows,
    lessonDeliveryLatestRows,
    assessmentLatestRows,
    auditLatestRows,
    smsLatestRows,
    feeInvoiceLatestRows,
  ] = await Promise.all([
    prisma.attendanceSession.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.lessonNote.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.lessonDelivery.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, dateTaught: { gte: since } },
      _count: { _all: true },
    }),

    prisma.assessmentItem.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.auditLog.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.smsLog.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.feeInvoice.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: {
        totalBilledPesewas: true,
        totalPaidPesewas: true,
        balancePesewas: true,
      },
    }),

    prisma.financeOutboxEvent.groupBy({
      by: ["tenantId", "status"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.paymentProviderEvent.groupBy({
      by: ["tenantId", "processingStatus"],
      where: { tenantId: { in: tenantIds }, receivedAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.governanceInterventionCase.groupBy({
      by: ["tenantId", "status"],
      where: { tenantId: { in: tenantIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.attendanceSession.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds } },
      _max: { createdAt: true },
    }),

    prisma.lessonNote.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds } },
      _max: { createdAt: true },
    }),

    prisma.lessonDelivery.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds } },
      _max: { dateTaught: true },
    }),

    prisma.assessmentItem.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds } },
      _max: { createdAt: true },
    }),

    prisma.auditLog.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds } },
      _max: { createdAt: true },
    }),

    prisma.smsLog.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds } },
      _max: { createdAt: true },
    }),

    prisma.feeInvoice.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds } },
      _max: { createdAt: true },
    }),
  ]);

  const attendanceCount = countMap(attendanceRows);
  const lessonNoteCount = countMap(lessonNoteRows);
  const lessonDeliveryCount = countMap(lessonDeliveryRows);
  const assessmentCount = countMap(assessmentRows);
  const auditCount = countMap(auditRows);
  const smsCount = countMap(smsRows);

  const outboxByTenant = statusBucketMap(
    financeOutboxRows.map((row) => ({
      tenantId: row.tenantId,
      status: String(row.status),
      _count: row._count,
    }))
  );

  const providerByTenant = statusBucketMap(
    providerEventRows.map((row) => ({
      tenantId: row.tenantId,
      status: String(row.processingStatus),
      _count: row._count,
    }))
  );

  const governanceByTenant = statusBucketMap(
    governanceCaseRows.map((row) => ({
      tenantId: row.tenantId,
      status: String(row.status),
      _count: row._count,
    }))
  );

  const attendanceLatest = maxCreatedMap(attendanceLatestRows);
  const lessonNoteLatest = maxCreatedMap(lessonNoteLatestRows);
  const lessonDeliveryLatest = maxDateTaughtMap(lessonDeliveryLatestRows);
  const assessmentLatest = maxCreatedMap(assessmentLatestRows);
  const auditLatest = maxCreatedMap(auditLatestRows);
  const smsLatest = maxCreatedMap(smsLatestRows);
  const feeInvoiceLatest = maxCreatedMap(feeInvoiceLatestRows);

  const financeByTenant = new Map<
    string,
    {
      invoiceCount: number;
      billedPesewas: number;
      paidPesewas: number;
      balancePesewas: number;
    }
  >();

  for (const row of feeInvoiceRows) {
    financeByTenant.set(row.tenantId, {
      invoiceCount: row._count._all,
      billedPesewas: row._sum.totalBilledPesewas ?? 0,
      paidPesewas: row._sum.totalPaidPesewas ?? 0,
      balancePesewas: row._sum.balancePesewas ?? 0,
    });
  }

  const items = tenants.map((tenant) => {
    const outbox = outboxByTenant.get(tenant.id) ?? {};
    const provider = providerByTenant.get(tenant.id) ?? {};
    const governanceCases = governanceByTenant.get(tenant.id) ?? {};
    const finance = financeByTenant.get(tenant.id) ?? {
      invoiceCount: 0,
      billedPesewas: 0,
      paidPesewas: 0,
      balancePesewas: 0,
    };

    const latestActivity = latestDate([
      attendanceLatest.get(tenant.id),
      lessonNoteLatest.get(tenant.id),
      lessonDeliveryLatest.get(tenant.id),
      assessmentLatest.get(tenant.id),
      auditLatest.get(tenant.id),
      smsLatest.get(tenant.id),
      feeInvoiceLatest.get(tenant.id),
      tenant.updatedAt,
    ]);

    const inactiveDays = daysSince(latestActivity, now);

    const periodAttendance = attendanceCount.get(tenant.id) ?? 0;
    const periodLessonNotes = lessonNoteCount.get(tenant.id) ?? 0;
    const periodLessonDeliveries = lessonDeliveryCount.get(tenant.id) ?? 0;
    const periodAssessments = assessmentCount.get(tenant.id) ?? 0;
    const failedOutbox = (outbox.FAILED ?? 0) + (outbox.DEAD ?? 0);
    const failedProviderEvents = provider.FAILED ?? 0;
    const openGovernanceCases =
      (governanceCases.OPEN ?? 0) +
      (governanceCases.IN_PROGRESS ?? 0) +
      (governanceCases.ESCALATED ?? 0);

    const flags: string[] = [];
    let riskScore = 0;

    if (tenant.status !== "ACTIVE") {
      riskScore += 35;
      flags.push(`Tenant is ${tenant.status}.`);
    }

    if (inactiveDays === null || inactiveDays > 14) {
      riskScore += 20;
      flags.push("No recent platform activity.");
    }

    if (periodAttendance === 0) {
      riskScore += 15;
      flags.push(`No attendance sessions in the last ${windowDays} days.`);
    }

    if (periodLessonNotes === 0) {
      riskScore += 10;
      flags.push(`No lesson notes in the last ${windowDays} days.`);
    }

    if (periodLessonDeliveries === 0) {
      riskScore += 10;
      flags.push(`No lesson delivery evidence in the last ${windowDays} days.`);
    }

    if (periodAssessments === 0) {
      riskScore += 10;
      flags.push(`No assessment items in the last ${windowDays} days.`);
    }

    if (failedOutbox > 0) {
      riskScore += 20;
      flags.push(`${failedOutbox} failed/dead finance outbox event(s).`);
    }

    if (failedProviderEvents > 0) {
      riskScore += 20;
      flags.push(`${failedProviderEvents} failed provider event(s).`);
    }

    if (openGovernanceCases > 0) {
      riskScore += 10;
      flags.push(`${openGovernanceCases} open governance case(s).`);
    }

    riskScore = Math.min(100, riskScore);

    return {
      id: tenant.id,
      name: tenant.name,
      schoolCode: tenant.schoolCode,
      slug: tenant.slug,
      status: tenant.status,
      schoolSector: tenant.schoolSector,
      emisCode: tenant.emisCode,
      contactEmail: tenant.contactEmail,
      contactPhoneNorm: tenant.contactPhoneNorm,
      region: tenant.region,
      district: tenant.district,
      circuit: tenant.circuit,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      zone: tenant.zone,
      allTime: {
        memberships: tenant._count.memberships,
        students: tenant._count.students,
        teachers: tenant._count.teacherProfiles,
        attendanceSessions: tenant._count.AttendanceSession,
        lessonNotes: tenant._count.lessonNotes,
        lessonDeliveries: tenant._count.lessonDeliveries,
        assessmentItems: tenant._count.assessmentItems,
        feeInvoices: tenant._count.feeInvoices,
        financeOutboxEvents: tenant._count.financeOutboxEvents,
        paymentProviderEvents: tenant._count.paymentProviderEvents,
        governanceCases: tenant._count.governanceInterventions,
      },
      period: {
        attendanceSessions: periodAttendance,
        lessonNotes: periodLessonNotes,
        lessonDeliveries: periodLessonDeliveries,
        assessmentItems: periodAssessments,
        auditEvents: auditCount.get(tenant.id) ?? 0,
        smsLogs: smsCount.get(tenant.id) ?? 0,
        feeInvoices: finance.invoiceCount,
        financeBilledPesewas: finance.billedPesewas,
        financePaidPesewas: finance.paidPesewas,
        financeBalancePesewas: finance.balancePesewas,
        financeOutbox: outbox,
        providerEvents: provider,
        governanceCases,
      },
      latest: {
        activityAt: iso(latestActivity),
        attendanceAt: iso(attendanceLatest.get(tenant.id)),
        lessonNoteAt: iso(lessonNoteLatest.get(tenant.id)),
        lessonDeliveryAt: iso(lessonDeliveryLatest.get(tenant.id)),
        assessmentAt: iso(assessmentLatest.get(tenant.id)),
        auditAt: iso(auditLatest.get(tenant.id)),
        smsAt: iso(smsLatest.get(tenant.id)),
        feeInvoiceAt: iso(feeInvoiceLatest.get(tenant.id)),
      },
      risk: {
        score: riskScore,
        level: riskLevel(riskScore),
        flags,
      },
    };
  });

  const summary = items.reduce(
    (acc, item) => {
      acc.tenants += 1;
      if (item.status === "ACTIVE") acc.activeTenants += 1;
      if (item.risk.level === "CRITICAL") acc.schoolsWithCriticalRisk += 1;
      if (item.risk.level === "HIGH") acc.schoolsWithHighRisk += 1;
      acc.failedOutboxEvents +=
        (item.period.financeOutbox.FAILED ?? 0) + (item.period.financeOutbox.DEAD ?? 0);
      acc.failedProviderEvents += item.period.providerEvents.FAILED ?? 0;
      return acc;
    },
    {
      tenants: 0,
      activeTenants: 0,
      schoolsWithCriticalRisk: 0,
      schoolsWithHighRisk: 0,
      failedOutboxEvents: 0,
      failedProviderEvents: 0,
    }
  );

  return json({
    ok: true,
    windowDays,
    generatedAt: now.toISOString(),
    summary,
    items: items.sort((a, b) => b.risk.score - a.risk.score || a.name.localeCompare(b.name)),
  });
}