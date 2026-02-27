// src/app/api/headteacher/signature/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GetResp =
  | {
      ok: true;
      signatureSvg: string | null;
      signatureHash: string | null;
      updatedAt: string | null;
    }
  | { ok: false; error: string };

type PutBody = { signatureSvg?: string | null };

type PutResp =
  | {
      ok: true;
      signatureSvg: string;
      signatureHash: string;
      updatedAt: string;
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

  // basic hardening
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

export async function GET(_req: NextRequest): Promise<NextResponse<GetResp>> {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies GetResp, { status: 401 });

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden (membership inactive)." } satisfies GetResp, { status: 403 });
  }

  try {
    const row = await prisma.headteacherSignature.findUnique({
      where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
      select: { signatureSvg: true, signatureHash: true, updatedAt: true },
    });

    return jsonNoStore({
      ok: true,
      signatureSvg: row?.signatureSvg ?? null,
      signatureHash: row?.signatureHash ?? null,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    } satisfies GetResp);
  } catch (e) {
    console.error("HEADTEACHER_SIGNATURE_GET_ERROR", e);
    return jsonNoStore({ ok: false, error: "Failed to load signature." } satisfies GetResp, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse<PutResp>> {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies PutResp, { status: 401 });

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden (membership inactive)." } satisfies PutResp, { status: 403 });
  }

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return jsonNoStore({ ok: false, error: "Invalid JSON body." } satisfies PutResp, { status: 400 });
  }

  const svg = validateSignatureSvg(body.signatureSvg);
  if (!svg) {
    return jsonNoStore({ ok: false, error: "Invalid signatureSvg (must be SVG)." } satisfies PutResp, { status: 400 });
  }

  const hash = sha256Hex(svg);

  try {
    const row = await prisma.headteacherSignature.upsert({
      where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
      create: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        signatureSvg: svg,
        signatureHash: hash,
      },
      update: {
        signatureSvg: svg,
        signatureHash: hash,
      },
      select: { signatureSvg: true, signatureHash: true, updatedAt: true },
    });

    // (Optional) audit — keep it quiet, don’t break
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "HEADTEACHER_SIGNATURE_UPDATED",
          resource: "HeadteacherSignature",
          resourceId: ctx.userId,
          metadata: { signatureHash: hash },
        },
      });
    } catch {}

    return jsonNoStore({
      ok: true,
      signatureSvg: row.signatureSvg,
      signatureHash: row.signatureHash,
      updatedAt: row.updatedAt.toISOString(),
    } satisfies PutResp);
  } catch (e) {
    console.error("HEADTEACHER_SIGNATURE_PUT_ERROR", e);
    return jsonNoStore({ ok: false, error: "Failed to save signature." } satisfies PutResp, { status: 500 });
  }
}

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET or PUT." } satisfies PutResp, { status: 405 });
}