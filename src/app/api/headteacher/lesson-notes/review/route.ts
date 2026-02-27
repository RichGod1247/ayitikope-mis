// src/app/api/headteacher/lesson-notes/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ReviewBody = {
  lessonNoteId?: string;
  action?: "APPROVE" | "REJECT";
  comment?: string | null;

  // optional now: if omitted, server will use saved signature
  signatureSvg?: string | null;

  ifMatchUpdatedAt?: string | null;

  // legacy ignored
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

function clean(v: unknown) {
  return String(v ?? "").trim();
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

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function validateSignatureSvg(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const svg = raw.trim();
  if (!svg) return null;
  if (svg.length > 200_000) return null;

  const lower = svg.toLowerCase();
  if (!lower.startsWith("<svg")) return null;

  if (
    lower.includes("<script") ||
    lower.includes("javascript:") ||
    lower.includes("onload=") ||
    lower.includes("onerror=")
  ) {
    return null;
  }

  return svg;
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
    // never break primary action
  }
}

export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." } satisfies ReviewResponse, { status: 405 });
}

export async function POST(req: NextRequest): Promise<NextResponse<ReviewResponse>> {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies ReviewResponse, { status: 401 });

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden (membership inactive)." } satisfies ReviewResponse, { status: 403 });
  }

  let body: ReviewBody;
  try {
    body = (await req.json()) as ReviewBody;
  } catch {
    return jsonNoStore({ ok: false, error: "Invalid JSON body." } satisfies ReviewResponse, { status: 400 });
  }

  const lessonNoteId = clean(body.lessonNoteId);
  const action = body.action;
  const comment = cleanComment(body.comment);
  const ifMatch = parseIfMatchUpdatedAt(body.ifMatchUpdatedAt);

  if (!lessonNoteId || !isLikelyId(lessonNoteId)) {
    return jsonNoStore({ ok: false, error: "Missing or invalid lessonNoteId." } satisfies ReviewResponse, { status: 400 });
  }
  if (action !== "APPROVE" && action !== "REJECT") {
    return jsonNoStore({ ok: false, error: 'action must be either "APPROVE" or "REJECT".' } satisfies ReviewResponse, { status: 400 });
  }
  if (action === "REJECT" && !comment) {
    return jsonNoStore(
      { ok: false, error: "A comment is required when returning a lesson note to the teacher." } satisfies ReviewResponse,
      { status: 400 }
    );
  }

  const now = new Date();
  const nextStatus: LessonNoteStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

  // If approving: signature can come from request OR from stored profile signature
  const providedSig = action === "APPROVE" ? validateSignatureSvg(body.signatureSvg) : null;

  try {
    const ip = getRequestIp(req);
    const userAgent = req.headers.get("user-agent");

    // Load current note first (same as before)
    const current = await prisma.lessonNote.findFirst({
      where: { id: lessonNoteId, tenantId: ctx.tenantId },
      select: {
        id: true,
        tenantId: true,
        teacherUserId: true,
        status: true,
        updatedAt: true,

        subject: true,
        term: true,
        academicYear: true,
        weekNumber: true,
        strand: true,
        substrand: true,
        contentStandard: true,
        indicator: true,
        lessonTitle: true,
        objectives: true,
        priorKnowledge: true,
        introduction: true,
        lessonDevelopment: true,
        conclusion: true,
        assessment: true,
        homework: true,
        teachingLearningResources: true,
        differentiationNotes: true,
        reflectionNotes: true,
      },
    });

    if (!current) return jsonNoStore({ ok: false, error: "Lesson note not found." } satisfies ReviewResponse, { status: 404 });

    if (current.teacherUserId === ctx.userId) {
      return jsonNoStore({ ok: false, error: "Forbidden." } satisfies ReviewResponse, { status: 403 });
    }

    if ((current.status as LessonNoteStatus) !== "SUBMITTED") {
      return jsonNoStore({ ok: false, error: "Only submitted lesson notes can be reviewed." } satisfies ReviewResponse, { status: 400 });
    }

    if (ifMatch && current.updatedAt.getTime() !== ifMatch.getTime()) {
      return jsonNoStore(
        { ok: false, error: "This lesson note changed while you were reviewing it. Refresh and try again." } satisfies ReviewResponse,
        { status: 409 }
      );
    }

    // Determine signature to use for approval
    let signatureSvgToUse: string | null = providedSig;
    let signatureSource: "PROVIDED" | "STORED" | "NONE" = providedSig ? "PROVIDED" : "NONE";
    let hadStoredBefore = false;

    if (action === "APPROVE" && !signatureSvgToUse) {
      const stored = await prisma.headteacherSignature.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
        select: { signatureSvg: true },
      });

      if (stored?.signatureSvg) {
        hadStoredBefore = true;
        signatureSvgToUse = stored.signatureSvg;
        signatureSource = "STORED";
      }
    }

    if (action === "APPROVE" && !signatureSvgToUse) {
      return jsonNoStore(
        { ok: false, error: "No saved signature found. Please set your signature once, then approve." } satisfies ReviewResponse,
        { status: 400 }
      );
    }

    // Build approval proof if approving
    let approvalSnapshotJson: any = null;
    let approvalSnapshotHash: string | null = null;
    let approvalSignatureHash: string | null = null;

    if (action === "APPROVE" && signatureSvgToUse) {
      approvalSignatureHash = sha256Hex(signatureSvgToUse);

      approvalSnapshotJson = {
        version: 1,
        lessonNoteId: current.id,
        tenantId: current.tenantId,
        teacherUserId: current.teacherUserId,
        headteacherUserId: ctx.userId,
        approvedAt: now.toISOString(),
        comment: comment ?? null,
        signatureHash: approvalSignatureHash,
        signatureSource,
        content: {
          subject: current.subject,
          term: current.term,
          academicYear: current.academicYear,
          weekNumber: current.weekNumber,
          strand: current.strand,
          substrand: current.substrand,
          contentStandard: current.contentStandard,
          indicator: current.indicator,
          lessonTitle: current.lessonTitle,
          objectives: current.objectives,
          priorKnowledge: current.priorKnowledge,
          introduction: current.introduction,
          lessonDevelopment: current.lessonDevelopment,
          conclusion: current.conclusion,
          assessment: current.assessment,
          homework: current.homework,
          teachingLearningResources: current.teachingLearningResources,
          differentiationNotes: current.differentiationNotes,
          reflectionNotes: current.reflectionNotes,
        },
      };

      approvalSnapshotHash = sha256Hex(JSON.stringify(approvalSnapshotJson));
    }

    const updateWhere: any = { id: lessonNoteId, tenantId: ctx.tenantId, status: "SUBMITTED" };
    if (ifMatch) updateWhere.updatedAt = ifMatch;

    // Transaction: write review + (optionally) store signature once
    const txResult = await prisma.$transaction(async (tx) => {
      const write = await tx.lessonNote.updateMany({
        where: updateWhere,
        data: {
          status: nextStatus,
          headteacherComment: comment ?? null,
          headteacherUserId: ctx.userId,
          reviewedAt: now,
          approvedAt: action === "APPROVE" ? now : null,
          rejectedAt: action === "REJECT" ? now : null,
          updatedAt: now,

          approvalSnapshotJson: action === "APPROVE" ? approvalSnapshotJson : null,
          approvalSnapshotHash: action === "APPROVE" ? approvalSnapshotHash : null,
          approvalSnapshotVersion: 1,

          approvalSignatureSvg: action === "APPROVE" ? signatureSvgToUse : null,
          approvalSignatureHash: action === "APPROVE" ? approvalSignatureHash : null,
          approvalSignatureCapturedAt: action === "APPROVE" ? now : null,
        },
      });

      if (write.count !== 1) {
        return { ok: false as const, code: 409 as const, error: "Could not save review. Refresh and try again." };
      }

      // Store signature once:
      // - if they provided a signature now, OR
      // - if they had no stored signature yet (first-time approval)
      if (action === "APPROVE" && signatureSvgToUse && (signatureSource === "PROVIDED" || !hadStoredBefore)) {
        const hash = sha256Hex(signatureSvgToUse);
        await tx.headteacherSignature.upsert({
          where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
          create: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            signatureSvg: signatureSvgToUse,
            signatureHash: hash,
          },
          update: {
            signatureSvg: signatureSvgToUse,
            signatureHash: hash,
          },
        });
      }

      const updated = await tx.lessonNote.findFirst({
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
        return { ok: false as const, code: 404 as const, error: "Lesson note not found." };
      }

      return { ok: true as const, updated };
    });

    if (!txResult.ok) {
      return jsonNoStore({ ok: false, error: txResult.error } satisfies ReviewResponse, { status: txResult.code });
    }

    await writeAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: action === "APPROVE" ? "LESSON_NOTE_APPROVED" : "LESSON_NOTE_RETURNED",
      resource: "LessonNote",
      resourceId: txResult.updated.id,
      ip,
      userAgent,
      metadata: {
        fromStatus: "SUBMITTED",
        toStatus: txResult.updated.status,
        signatureSource: action === "APPROVE" ? signatureSource : null,
      },
    });

    return jsonNoStore({
      ok: true,
      item: {
        id: txResult.updated.id,
        status: txResult.updated.status as LessonNoteStatus,
        headteacherComment: txResult.updated.headteacherComment,
        headteacherUserId: txResult.updated.headteacherUserId,
        reviewedAt: toIso(txResult.updated.reviewedAt),
        approvedAt: toIso(txResult.updated.approvedAt),
        rejectedAt: toIso(txResult.updated.rejectedAt),
        updatedAt: txResult.updated.updatedAt.toISOString(),
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