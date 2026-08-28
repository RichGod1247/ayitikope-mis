import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  attendanceTermLabel,
  normalizeAttendanceTermNumber,
  toISODateOnly,
} from "@/lib/attendanceAcademicCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"] as const;
const MAX_BODY_BYTES = 16 * 1024;
const LEGACY_IGNORED_KEYS = [
  "attendanceStartTime",
  "attendanceEndTime",
  "lateCutoffMinutes",
  "feverThreshold",
] as const;

const ALLOWED_KEYS = new Set([
  "currentAcademicYear",
  "currentTerm",
  "term1Start",
  "term1End",
  "term2Start",
  "term2End",
  "term3Start",
  "term3End",
  ...LEGACY_IGNORED_KEYS,
]);

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function parseISODateOnly(v: unknown): Date | null {
  const s = cleanStr(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("INVALID_DATE");

  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new Error("INVALID_DATE");
  }
  return d;
}

function assertRange(a: Date | null, b: Date | null, label: string) {
  if (!!a !== !!b) throw new Error(`INCOMPLETE_RANGE:${label}`);
  if (a && b && a.getTime() > b.getTime()) throw new Error(`BAD_RANGE:${label}`);
}

function assertTermOrder(term1End: Date | null, term2Start: Date | null, term2End: Date | null, term3Start: Date | null) {
  if (term1End && term2Start && term1End.getTime() >= term2Start.getTime()) {
    throw new Error("TERM_OVERLAP:TERM1_TERM2");
  }
  if (term2End && term3Start && term2End.getTime() >= term3Start.getTime()) {
    throw new Error("TERM_OVERLAP:TERM2_TERM3");
  }
}

function isAcademicComplete(data: {
  currentAcademicYear: string | null;
  currentTerm: string | null;
  term1Start: Date | null;
  term1End: Date | null;
  term2Start: Date | null;
  term2End: Date | null;
  term3Start: Date | null;
  term3End: Date | null;
}) {
  return (
    !!data.currentAcademicYear &&
    !!data.currentTerm &&
    !!data.term1Start &&
    !!data.term1End &&
    !!data.term2Start &&
    !!data.term2End &&
    !!data.term3Start &&
    !!data.term3End
  );
}

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function userAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

function snapshot(row: {
  currentAcademicYear: string | null;
  currentTerm: string | null;
  term1Start: Date | null;
  term1End: Date | null;
  term2Start: Date | null;
  term2End: Date | null;
  term3Start: Date | null;
  term3End: Date | null;
}) {
  return {
    currentAcademicYear: row.currentAcademicYear,
    currentTerm: row.currentTerm,
    term1Start: toISODateOnly(row.term1Start),
    term1End: toISODateOnly(row.term1End),
    term2Start: toISODateOnly(row.term2Start),
    term2End: toISODateOnly(row.term2End),
    term3Start: toISODateOnly(row.term3Start),
    term3End: toISODateOnly(row.term3End),
  };
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: [...ALLOWED_ROLES],
  });
  if (!auth.ok) return auth.res;

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "REQUEST_TOO_LARGE" }, 413);
  }

  try {
    const tenantId = auth.ctx.tenantId;
    const rawText = await req.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
      return json({ ok: false, error: "REQUEST_TOO_LARGE" }, 413);
    }

    const body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ ok: false, error: "INVALID_BODY" }, 400);
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_KEYS.has(key)) {
        return json({ ok: false, error: `UNEXPECTED_FIELD:${key}` }, 400);
      }
    }

    const academicYear = cleanStr(body.currentAcademicYear);
    if (academicYear.length > 40) {
      return json({ ok: false, error: "Academic year is too long." }, 400);
    }

    const termNumber = normalizeAttendanceTermNumber(body.currentTerm);
    const currentTerm = termNumber ? attendanceTermLabel(termNumber) : null;
    if (cleanStr(body.currentTerm) && !currentTerm) {
      return json({ ok: false, error: "Choose 1st Term, 2nd Term, or 3rd Term." }, 400);
    }

    const data = {
      currentAcademicYear: academicYear || null,
      currentTerm,
      term1Start: parseISODateOnly(body.term1Start),
      term1End: parseISODateOnly(body.term1End),
      term2Start: parseISODateOnly(body.term2Start),
      term2End: parseISODateOnly(body.term2End),
      term3Start: parseISODateOnly(body.term3Start),
      term3End: parseISODateOnly(body.term3End),
    };

    assertRange(data.term1Start, data.term1End, "TERM1");
    assertRange(data.term2Start, data.term2End, "TERM2");
    assertRange(data.term3Start, data.term3End, "TERM3");
    assertTermOrder(data.term1End, data.term2Start, data.term2End, data.term3Start);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (!tenant) return json({ ok: false, error: "TENANT_NOT_FOUND" }, 404);
    if (tenant.status !== "ACTIVE") return json({ ok: false, error: "TENANT_NOT_ACTIVE" }, 409);

    const result = await prisma.$transaction(
      async (tx) => {
        const previous = await tx.tenantSettings.findUnique({
          where: { tenantId },
          select: {
            currentAcademicYear: true,
            currentTerm: true,
            term1Start: true,
            term1End: true,
            term2Start: true,
            term2End: true,
            term3Start: true,
            term3End: true,
            setupCompletedAt: true,
          },
        });

        const completeNow = isAcademicComplete(data);
        const setupCompletedAt = previous?.setupCompletedAt ?? (completeNow ? new Date() : null);
        const before = previous
          ? snapshot(previous)
          : {
              currentAcademicYear: null,
              currentTerm: null,
              term1Start: null,
              term1End: null,
              term2Start: null,
              term2End: null,
              term3Start: null,
              term3End: null,
            };
        const after = snapshot(data);
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        const completionChanged = !previous?.setupCompletedAt && !!setupCompletedAt;

        if (changed || completionChanged || !previous) {
          await tx.tenantSettings.upsert({
            where: { tenantId },
            create: { tenantId, ...data, setupCompletedAt },
            update: { ...data, setupCompletedAt },
          });
        }

        if (changed) {
          await tx.auditLog.create({
            data: {
              tenantId,
              userId: auth.ctx.userId,
              action: "ACADEMIC_CALENDAR_SETTINGS_UPDATED",
              resource: "TenantSettings",
              resourceId: tenantId,
              ip: clientIp(req),
              userAgent: userAgent(req),
              metadata: {
                policy: "ATTENDANCE_ACADEMIC_CALENDAR_V1",
                actorRole: auth.ctx.roleName ?? null,
                previous: before,
                next: after,
              } satisfies Prisma.JsonObject,
            },
          });
        }

        return { setupCompletedAt, changed };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return json(
      {
        ok: true,
        setupComplete: !!result.setupCompletedAt,
        setupCompletedAt: result.setupCompletedAt?.toISOString?.() ?? null,
        changed: result.changed,
        // Backward compatibility for older setup clients.
        completedAt: result.setupCompletedAt?.toISOString?.() ?? null,
      },
      200,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";

    if (message === "INVALID_DATE") {
      return json({ ok: false, error: "Use valid calendar dates." }, 400);
    }
    if (message.startsWith("INCOMPLETE_RANGE:")) {
      return json({ ok: false, error: `Enter both start and end dates for ${message.replace("INCOMPLETE_RANGE:", "")}.` }, 400);
    }
    if (message.startsWith("BAD_RANGE:")) {
      return json({ ok: false, error: `Invalid date range: ${message.replace("BAD_RANGE:", "")}` }, 400);
    }
    if (message.startsWith("TERM_OVERLAP:")) {
      return json({ ok: false, error: "Term date ranges must not overlap." }, 400);
    }
    if (err instanceof SyntaxError) {
      return json({ ok: false, error: "INVALID_JSON" }, 400);
    }

    console.error("admin/setup/save error:", err);
    return json({ ok: false, error: "FAILED_TO_SAVE_SETUP" }, 500);
  }
}
