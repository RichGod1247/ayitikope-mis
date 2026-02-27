// src/app/api/teachers/assessments/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

/**
 * Teacher Assessment List API
 *
 * GET /api/teachers/assessments/list?classroomId=...&term=...&academicYear=...&subject=...
 *
 * - tenantId is derived from session (tenantId query is legacy-only and must match session if present)
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireApiUserContext(req, {
      requireTenant: true,
      requireRoleNames: ["SUPERADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "TEACHER"],
    });
    if (!gate.ok) return gate.res;
    const ctx = gate.ctx;

    const { searchParams } = new URL(req.url);

    // Legacy/back-compat tenantId param: allowed ONLY if matches session
    const tenantIdParam = (searchParams.get("tenantId") ?? "").trim();
    if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
      return jsonNoStore({ ok: false, error: "FORBIDDEN_TENANT_MISMATCH" }, { status: 403 });
    }

    const classroomId = (searchParams.get("classroomId") ?? "").trim();
    const term = (searchParams.get("term") ?? "").trim() || null;
    const academicYear = (searchParams.get("academicYear") ?? "").trim() || null;
    const subject = (searchParams.get("subject") ?? "").trim() || null;

    if (!classroomId) {
      return jsonNoStore({ ok: false, error: "classroomId is required." }, { status: 400 });
    }

    const where: any = { tenantId: ctx.tenantId, classroomId };
    if (term) where.term = term;
    if (academicYear) where.academicYear = academicYear;
    if (subject) where.subject = subject;

    const items = await prisma.assessmentItem.findMany({
      where,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: {
        scores: {
          select: { id: true, studentId: true, score: true },
        },
      },
    });

    const mapped = items.map((item) => {
      const scores = item.scores || [];
      const total = scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
      const averageScore = scores.length > 0 ? total / scores.length : null;

      return {
        id: item.id,
        tenantId: item.tenantId,
        classroomId: item.classroomId,
        subject: item.subject,
        term: item.term,
        academicYear: item.academicYear,
        title: item.title,
        description: item.description,
        type: item.type,
        maxScore: item.maxScore,
        weighting: item.weighting,
        date: item.date,
        scoresCount: scores.length,
        averageScore,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return jsonNoStore({
      ok: true,
      filters: {
        tenantId: ctx.tenantId,
        classroomId,
        term,
        academicYear,
        subject,
      },
      count: mapped.length,
      items: mapped,
    });
  } catch (err) {
    console.error("[TEACHER_ASSESSMENTS_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load assessments. Please try again later." }, { status: 500 });
  }
}
