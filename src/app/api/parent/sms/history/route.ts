// src/app/api/parent/sms/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
}

function phoneMatches(a: string, b: string) {
  const A = normalisePhone(a);
  const B = normalisePhone(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
}

function clampInt(n: any, min: number, max: number, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(Math.trunc(v), min), max);
}

const ADMINISH = new Set(["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER"]);

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";
  const userPhone = normalisePhone(u?.phone ?? u?.phoneNumber ?? u?.guardianPhone ?? "");

  if (!session || !userId) {
    return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  }
  if (!tenantId) {
    return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return {
    ok: true as const,
    userId,
    tenantId,
    userPhone,
    roleName: String(membership.role?.name ?? "").trim(),
  };
}

async function safeFindMany(model: any, argsPrimary: any, argsFallback: any) {
  try {
    return await model.findMany(argsPrimary);
  } catch {
    try {
      return await model.findMany(argsFallback);
    } catch {
      return [];
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const safe = await getSafeTenantCtx();
    if (!safe.ok) {
      return NextResponse.json(
        { ok: false, error: safe.error },
        { status: safe.status, headers: { "cache-control": "no-store" } }
      );
    }

    // 🔒 Role gate (Roadmap #1)
    const isParent = safe.roleName === "PARENT";
    const isAdminish = ADMINISH.has(safe.roleName);

    if (!isParent && !isAdminish) {
      // TEACHER and others are blocked
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const { searchParams } = new URL(req.url);

    // Backward-compat only: tenantId must match session tenant.
    const tenantIdParam = String(searchParams.get("tenantId") || "").trim();
    if (tenantIdParam && tenantIdParam !== safe.tenantId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden (tenant mismatch)." },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const limit = clampInt(searchParams.get("limit"), 1, 100, 20);

    // guardianPhone rules:
    // - PARENT: use session phone ONLY (param may exist but must match)
    // - ADMINISH: must provide guardianPhone param for support view
    const guardianPhoneParam = normalisePhone(searchParams.get("guardianPhone"));

    let guardianPhone = "";

    if (isParent) {
      if (!safe.userPhone) {
        return NextResponse.json(
          { ok: false, error: "PARENT_PHONE_MISSING_IN_SESSION" },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }
      if (guardianPhoneParam && !phoneMatches(guardianPhoneParam, safe.userPhone)) {
        return NextResponse.json(
          { ok: false, error: "Forbidden (guardianPhone mismatch)." },
          { status: 403, headers: { "cache-control": "no-store" } }
        );
      }
      guardianPhone = safe.userPhone;
    } else {
      if (!guardianPhoneParam) {
        return NextResponse.json(
          { ok: false, error: "guardianPhone is required for admin support view." },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }
      guardianPhone = guardianPhoneParam;
    }

    const client = prisma as any;

    let smsLogRows: any[] = [];
    let smsAuditRows: any[] = [];

    // 1) Try SmsLog (tenant-scoped)
    try {
      if (client.smsLog) {
        smsLogRows = await safeFindMany(
          client.smsLog,
          { where: { tenantId: safe.tenantId }, take: 250, orderBy: { createdAt: "desc" } },
          { where: { tenantId: safe.tenantId }, take: 250 }
        );
      }
    } catch (err) {
      console.error("[PARENT_SMS_HISTORY] smsLog query failed", err);
    }

    // 2) Try SMS audit model variants (tenant-scoped)
    const auditModelCandidates = ["sMSSendAudit", "smsSendAudit", "smsSendAuditLog", "smsAudit"];
    for (const m of auditModelCandidates) {
      try {
        if (client[m]) {
          smsAuditRows = await safeFindMany(
            client[m],
            { where: { tenantId: safe.tenantId }, take: 250, orderBy: { createdAt: "desc" } },
            { where: { tenantId: safe.tenantId }, take: 250 }
          );
          break;
        }
      } catch (err) {
        console.error(`[PARENT_SMS_HISTORY] ${m} query failed`, err);
      }
    }

    function getRowPhone(row: any): string {
      const candidate =
        row.guardianPhone ||
        row.to ||
        row.phone ||
        row.recipient ||
        row.msisdn ||
        row.destination ||
        "";
      return normalisePhone(String(candidate));
    }

    function getRowMessage(row: any): string {
      return String(row.message || row.body || row.content || row.text || row.smsText || "");
    }

    function getRowDate(row: any): Date {
      const candidate = row.createdAt || row.sentAt || row.timestamp || row.loggedAt || row.queuedAt || null;
      if (!candidate) return new Date(0);
      const d = new Date(candidate);
      return isNaN(d.getTime()) ? new Date(0) : d;
    }

    function getRowStatus(row: any): string {
      return String(row.status || row.deliveryStatus || row.state || row.result || "");
    }

    function getRowChannel(row: any): string {
      return String(row.channel || row.provider || row.gateway || row.route || "SMS");
    }

    function sanitizeRow(row: any) {
      const allow = [
        "id",
        "providerMessageId",
        "messageId",
        "status",
        "deliveryStatus",
        "createdAt",
        "sentAt",
        "to",
        "phone",
        "recipient",
        "msisdn",
        "channel",
        "provider",
        "gateway",
        "brand",
      ];
      const out: Record<string, any> = {};
      for (const k of allow) {
        if (row && Object.prototype.hasOwnProperty.call(row, k)) out[k] = row[k];
      }
      return out;
    }

    type SimpleSmsRecord = {
      id: string;
      source: "SmsLog" | "SMSSendAudit";
      phone: string;
      message: string;
      status: string;
      channel: string;
      createdAt: string;
      meta?: Record<string, any>;
    };

    const guardianNorm = normalisePhone(guardianPhone);

    const matchesGuardian = (rowPhoneNorm: string) => {
      if (!rowPhoneNorm || !guardianNorm) return false;
      return rowPhoneNorm.endsWith(guardianNorm) || guardianNorm.endsWith(rowPhoneNorm);
    };

    const records: SimpleSmsRecord[] = [];

    for (const row of smsLogRows) {
      const phoneNorm = getRowPhone(row);
      if (!matchesGuardian(phoneNorm)) continue;

      records.push({
        id: String(row.id ?? `log_${records.length}`),
        source: "SmsLog",
        phone: phoneNorm,
        message: getRowMessage(row),
        status: getRowStatus(row),
        channel: getRowChannel(row),
        createdAt: getRowDate(row).toISOString(),
        meta: sanitizeRow(row),
      });
    }

    for (const row of smsAuditRows) {
      const phoneNorm = getRowPhone(row);
      if (!matchesGuardian(phoneNorm)) continue;

      records.push({
        id: String(row.id ?? `audit_${records.length}`),
        source: "SMSSendAudit",
        phone: phoneNorm,
        message: getRowMessage(row),
        status: getRowStatus(row),
        channel: getRowChannel(row),
        createdAt: getRowDate(row).toISOString(),
        meta: sanitizeRow(row),
      });
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json(
      {
        ok: true,
        tenantId: safe.tenantId,
        guardianPhone,
        count: records.slice(0, limit).length,
        records: records.slice(0, limit),
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("[PARENT_SMS_HISTORY_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load parent SMS history." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
