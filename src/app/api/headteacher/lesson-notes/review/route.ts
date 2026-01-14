// src/app/api/headteacher/lesson-notes/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const dynamic = "force-dynamic";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ReviewBody = {
  lessonNoteId?: string;
  action?: "APPROVE" | "REJECT";
  comment?: string | null;

  // optimistic concurrency guard (client sends note.updatedAt)
  ifMatchUpdatedAt?: string | null;

  // legacy fields (ignored completely)
  tenantId?: string;
  headteacherUserId?: string | null;
};

type ReviewResponse =
  | {
      ok: true;
      item: {
        id: string;
        status: LessonNoteStatus;
        headteacherComment: string | null;
        headteacherUserId: string | null;
        reviewedAt: string | null;
        approvedAt: string | null;
        rejectedAt: string | null;
        updatedAt: string;
      };
    }
  | { ok: false; error: string };

function jsonNoStore(payload: any, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function isLikelyId(id: string) {
  return /^[a-zA-Z0-9_-]{5,80}$/.test(id);
}

function cleanComment(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function parseIfMatchUpdatedAt(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

function getRequestIp(req: NextRequest): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? null;

  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();

  return null;
}

async function writeAudit(params: {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        metadata: params.metadata ?? {},
      },
    });
  } catch {
    // Audit must never break the primary action.
  }
}

export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." } satisfies ReviewResponse, { status: 405 });
}

export async function POST(req: NextRequest): Promise<NextResponse<ReviewResponse>> {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) {
    return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies ReviewResponse, { status: 401 });
  }

  let body: ReviewBody;
  try {
    body = (await req.json()) as ReviewBody;
  } catch {
    return jsonNoStore({ ok: false, error: "Invalid JSON body." } satisfies ReviewResponse, { status: 400 });
  }

  const lessonNoteId = typeof body.lessonNoteId === "string" ? body.lessonNoteId.trim() : "";
  const action = body.action;
  const comment = cleanComment(body.comment);
  const ifMatch = parseIfMatchUpdatedAt(body.ifMatchUpdatedAt);

  if (!lessonNoteId || !isLikelyId(lessonNoteId)) {
    return jsonNoStore({ ok: false, error: "Missing or invalid lessonNoteId." } satisfies ReviewResponse, { status: 400 });
  }
  if (action !== "APPROVE" && action !== "REJECT") {
    return jsonNoStore({ ok: false, error: 'action must be either "APPROVE" or "REJECT".' } satisfies ReviewResponse, {
      status: 400,
    });
  }
  if (action === "REJECT" && !comment) {
    return jsonNoStore(
      { ok: false, error: "A comment is required when returning a lesson note to the teacher." } satisfies ReviewResponse,
      { status: 400 }
    );
  }

  const now = new Date();
  const nextStatus: LessonNoteStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

  try {
    const current = await prisma.lessonNote.findFirst({
      where: { id: lessonNoteId, tenantId: ctx.tenantId },
      select: {
        id: true,
        teacherUserId: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!current) {
      return jsonNoStore({ ok: false, error: "Lesson note not found." } satisfies ReviewResponse, { status: 404 });
    }

    // Prevent self-review (hard stop)
    if (current.teacherUserId === ctx.userId) {
      return jsonNoStore({ ok: false, error: "Forbidden." } satisfies ReviewResponse, { status: 403 });
    }

    // Strict state machine (bank-grade): only SUBMITTED can be reviewed
    if ((current.status as LessonNoteStatus) !== "SUBMITTED") {
      return jsonNoStore(
        { ok: false, error: "Only submitted lesson notes can be reviewed." } satisfies ReviewResponse,
        { status: 400 }
      );
    }

    // Concurrency guard
    if (ifMatch && current.updatedAt.getTime() !== ifMatch.getTime()) {
      return jsonNoStore(
        { ok: false, error: "This lesson note changed while you were reviewing it. Refresh and try again." } satisfies ReviewResponse,
        { status: 409 }
      );
    }

    const updateWhere: any = {
      id: lessonNoteId,
      tenantId: ctx.tenantId,
      status: "SUBMITTED",
    };

    if (ifMatch) updateWhere.updatedAt = ifMatch;

    const write = await prisma.lessonNote.updateMany({
      where: updateWhere,
      data: {
        status: nextStatus,
        headteacherComment: comment ?? null,
        headteacherUserId: ctx.userId,
        reviewedAt: now,
        approvedAt: action === "APPROVE" ? now : null,
        rejectedAt: action === "REJECT" ? now : null,
        updatedAt: now,
      },
    });

    if (write.count !== 1) {
      return jsonNoStore(
        { ok: false, error: "Could not save review. Refresh and try again." } satisfies ReviewResponse,
        { status: 409 }
      );
    }

    const updated = await prisma.lessonNote.findFirst({
      where: { id: lessonNoteId, tenantId: ctx.tenantId },
      select: {
        id: true,
        status: true,
        headteacherComment: true,
        headteacherUserId: true,
        reviewedAt: true,
        approvedAt: true,
        rejectedAt: true,
        updatedAt: true,
      },
    });

    if (!updated) {
      return jsonNoStore({ ok: false, error: "Lesson note not found." } satisfies ReviewResponse, { status: 404 });
    }

    await writeAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: action === "APPROVE" ? "LESSON_NOTE_APPROVED" : "LESSON_NOTE_RETURNED",
      resource: "LessonNote",
      resourceId: updated.id,
      ip: getRequestIp(req),
      userAgent: req.headers.get("user-agent"),
      metadata: {
        fromStatus: "SUBMITTED",
        toStatus: updated.status,
      },
    });

    return jsonNoStore({
      ok: true,
      item: {
        id: updated.id,
        status: updated.status as LessonNoteStatus,
        headteacherComment: updated.headteacherComment,
        headteacherUserId: updated.headteacherUserId,
        reviewedAt: toIso(updated.reviewedAt),
        approvedAt: toIso(updated.approvedAt),
        rejectedAt: toIso(updated.rejectedAt),
        updatedAt: updated.updatedAt.toISOString(),
      },
    } satisfies ReviewResponse);
  } catch (err) {
    console.error("HEADTEACHER_LESSON_NOTE_REVIEW_ERROR", err);
    return jsonNoStore(
      { ok: false, error: "Could not update lesson note status. Please try again." } satisfies ReviewResponse,
      { status: 500 }
    );
  }
}
