// src/app/api/parent/sms/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Utility: normalise a phone number by stripping non-digits.
 * We use this to loosely match guardianPhone against logs.
 */
function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Parent SMS history endpoint
 *
 * GET /api/parent/sms/history?tenantId=...&guardianPhone=...&limit=20
 *
 * - tenantId: required
 * - guardianPhone: required (will be normalised for matching)
 * - limit: optional, defaults to 20, max 100
 *
 * For now, we:
 *  - Try to read from SmsLog (if it exists).
 *  - Optionally try from SMSSendAudit (if it exists).
 *  - Filter in JS by guardianPhone (defensive: we don’t assume exact column names).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = searchParams.get("tenantId");
    const guardianPhone = searchParams.get("guardianPhone");
    const limitRaw = searchParams.get("limit");

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!guardianPhone) {
      return NextResponse.json(
        { ok: false, error: "guardianPhone is required." },
        { status: 400 }
      );
    }

    const limit = Math.min(
      Math.max(Number(limitRaw) || 20, 1),
      100
    );
    const guardianNorm = normalisePhone(guardianPhone);

    // Use prisma loosely as any to avoid TS complaints about models/fields
    const client = prisma as any;

    let smsLogRows: any[] = [];
    let smsAuditRows: any[] = [];

    // 1) Try SmsLog
    try {
      smsLogRows = await client.smsLog.findMany({
        where: { tenantId },
        // keep it very generic to avoid "unknown field" issues
        take: 200,
      });
    } catch (err) {
      console.error("[PARENT_SMS_HISTORY] smsLog query failed", err);
    }

    // 2) Try SMSSendAudit (if defined)
    try {
      if (client.sMSSendAudit) {
        smsAuditRows = await client.sMSSendAudit.findMany({
          where: { tenantId },
          take: 200,
        });
      }
    } catch (err) {
      console.error(
        "[PARENT_SMS_HISTORY] sMSSendAudit query failed",
        err
      );
    }

    // Helper: extract a normalised phone from a row (best-effort)
    function getRowPhone(row: any): string {
      const candidate =
        row.guardianPhone ||
        row.to ||
        row.phone ||
        row.recipient ||
        row.msisdn ||
        "";
      return normalisePhone(String(candidate));
    }

    // Helper: get message text from a row (best-effort)
    function getRowMessage(row: any): string {
      return (
        row.message ||
        row.body ||
        row.content ||
        row.text ||
        row.smsText ||
        ""
      );
    }

    // Helper: get created timestamp as Date (best-effort)
    function getRowDate(row: any): Date {
      const candidate =
        row.createdAt ||
        row.sentAt ||
        row.timestamp ||
        row.loggedAt ||
        null;

      if (!candidate) return new Date(0);
      try {
        return new Date(candidate);
      } catch {
        return new Date(0);
      }
    }

    // Helper: get status string (best-effort)
    function getRowStatus(row: any): string {
      return (
        row.status ||
        row.deliveryStatus ||
        row.state ||
        row.result ||
        ""
      );
    }

    // Helper: get channel/type (best-effort)
    function getRowChannel(row: any): string {
      return (
        row.channel ||
        row.provider ||
        row.gateway ||
        row.route ||
        "SMS"
      );
    }

    // Merge, filter and normalise records
    type SimpleSmsRecord = {
      id: string;
      source: "SmsLog" | "SMSSendAudit";
      phone: string;
      message: string;
      status: string;
      channel: string;
      createdAt: string; // ISO string
      raw: any;
    };

    const records: SimpleSmsRecord[] = [];

    for (const row of smsLogRows) {
      const phoneNorm = getRowPhone(row);
      if (!phoneNorm) continue;
      if (!phoneNorm.endsWith(guardianNorm)) continue;

      records.push({
        id: String(row.id ?? `log_${records.length}`),
        source: "SmsLog",
        phone: phoneNorm,
        message: getRowMessage(row),
        status: getRowStatus(row),
        channel: getRowChannel(row),
        createdAt: getRowDate(row).toISOString(),
        raw: row,
      });
    }

    for (const row of smsAuditRows) {
      const phoneNorm = getRowPhone(row);
      if (!phoneNorm) continue;
      if (!phoneNorm.endsWith(guardianNorm)) continue;

      records.push({
        id: String(row.id ?? `audit_${records.length}`),
        source: "SMSSendAudit",
        phone: phoneNorm,
        message: getRowMessage(row),
        status: getRowStatus(row),
        channel: getRowChannel(row),
        createdAt: getRowDate(row).toISOString(),
        raw: row,
      });
    }

    // Sort by createdAt desc
    records.sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return bt - at;
    });

    const limited = records.slice(0, limit);

    return NextResponse.json({
      ok: true,
      tenantId,
      guardianPhone,
      count: limited.length,
      records: limited,
    });
  } catch (err: any) {
    console.error("[PARENT_SMS_HISTORY_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load parent SMS history.",
      },
      { status: 500 }
    );
  }
}
