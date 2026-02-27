// src/app/api/consent/optin/student/link/route.ts
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyStudentConsentToken } from "@/lib/consentTokens";
import { StudentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanId(v: unknown) {
  return String(v ?? "").trim();
}

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") || null;
}

function getUa(req: NextRequest) {
  return req.headers.get("user-agent") || null;
}

function pageHtml(opts: {
  title: string;
  bodyHtml: string;
}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;line-height:1.5;margin:0;background:#fafafa;}
    .wrap{max-width:640px;margin:32px auto;padding:0 16px;}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 16px;}
    h1{font-size:18px;margin:0 0 8px}
    p{margin:8px 0;color:#111827}
    .muted{color:#6b7280;font-size:13px}
    .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
    button{cursor:pointer;border-radius:12px;border:1px solid #111827;padding:10px 14px;font-weight:600}
    .primary{background:#111827;color:#fff}
    .outline{background:#fff;color:#111827}
    .danger{background:#fff;color:#991b1b;border-color:#fecaca}
    .kv{margin:10px 0;padding:10px 12px;border-radius:12px;background:#f9fafb;border:1px solid #eee}
    .kv b{display:inline-block;min-width:120px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      ${opts.bodyHtml}
    </div>
    <p class="muted" style="margin-top:12px">
      If you have questions, contact the school office.
    </p>
  </div>
</body>
</html>`;
}

async function resolveStudentIdFromRequest(req: NextRequest): Promise<{ studentId: string } | { error: string; status: number }> {
  const { searchParams } = new URL(req.url);

  const token = cleanId(searchParams.get("token"));
  const tenantIdLegacy = cleanId(searchParams.get("tenantId")); // legacy/back-compat
  const studentIdLegacy = cleanId(searchParams.get("studentId")); // legacy/back-compat

  if (token) {
    const payload = verifyStudentConsentToken(token);
    if (!payload) return { error: "INVALID_OR_EXPIRED_TOKEN", status: 400 };
    return { studentId: payload.sid };
  }

  // Legacy mode (discouraged): require both and enforce match
  if (!tenantIdLegacy || !studentIdLegacy) {
    return { error: "token is required (legacy tenantId+studentId not provided)", status: 400 };
  }

  const student = await prisma.student.findUnique({
    where: { id: studentIdLegacy },
    select: { tenantId: true },
  });

  if (!student) return { error: "Student not found", status: 404 };
  if (student.tenantId !== tenantIdLegacy) return { error: "FORBIDDEN_TENANT_MISMATCH", status: 403 };

  return { studentId: studentIdLegacy };
}

export async function GET(req: NextRequest) {
  const resolved = await resolveStudentIdFromRequest(req);
  if ("error" in resolved) {
    const html = pageHtml({
      title: "Consent link error",
      bodyHtml: `
        <h1>Consent link error</h1>
        <p class="muted">Error: <b>${esc(resolved.error)}</b></p>
      `,
    });
    return new Response(html, {
      status: resolved.status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const student = await prisma.student.findUnique({
    where: { id: resolved.studentId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
      classroom: { select: { name: true } },
    },
  });

  if (!student) {
    const html = pageHtml({
      title: "Not found",
      bodyHtml: `<h1>Not found</h1><p class="muted">Student not found.</p>`,
    });
    return new Response(html, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (student.status === StudentStatus.ARCHIVED) {
    const html = pageHtml({
      title: "Unavailable",
      bodyHtml: `<h1>Unavailable</h1><p class="muted">This learner record is archived.</p>`,
    });
    return new Response(html, {
      status: 409,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: student.tenantId },
    select: { name: true },
  });

  const schoolName = tenant?.name ?? "Your School";
  const childName = `${student.lastName ?? ""} ${student.firstName ?? ""}`.trim() || "the learner";
  const guardian = student.guardianName ?? "Parent/Guardian";

  const already = student.guardianSmsOptIn && !!student.healthConsentAt;

  const { searchParams } = new URL(req.url);
  const token = cleanId(searchParams.get("token"));

  const html = pageHtml({
    title: "Confirm consent",
    bodyHtml: `
      <h1>Parent/Guardian consent</h1>
      <p>Dear <b>${esc(guardian)}</b>,</p>
      <p>
        ${esc(schoolName)} is requesting your consent to:
        <br/>• send important SMS updates about <b>${esc(childName)}</b>
        <br/>• record and use basic daily health checks (temperature/symptoms) for school safety
      </p>

      <div class="kv">
        <div><b>Learner:</b> ${esc(childName)}</div>
        <div><b>Class:</b> ${esc(student.classroom?.name ?? "—")}</div>
        <div><b>Status:</b> ${already ? "Already confirmed" : "Not yet confirmed"}</div>
      </div>

      ${
        already
          ? `<p class="muted">Consent is already confirmed. You may close this page.</p>`
          : `
        <form method="post" action="">
          ${token ? `<input type="hidden" name="token" value="${esc(token)}" />` : ""}
          <div class="row">
            <button class="primary" type="submit">I Agree — Confirm</button>
          </div>
        </form>
        <p class="muted" style="margin-top:10px">
          By confirming, you allow the school to send SMS updates and to record basic health checks for safety.
        </p>
      `
      }
    `,
  });

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  // Support token in either query (?token=) or form body (hidden input)
  const url = new URL(req.url);
  let token = cleanId(url.searchParams.get("token"));

  if (!token) {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      token = cleanId(form?.get("token"));
    }
  }

  if (!token) {
    const html = pageHtml({
      title: "Consent link error",
      bodyHtml: `<h1>Consent link error</h1><p class="muted">Missing token.</p>`,
    });
    return new Response(html, {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const payload = verifyStudentConsentToken(token);
  if (!payload) {
    const html = pageHtml({
      title: "Consent link error",
      bodyHtml: `<h1>Consent link error</h1><p class="muted">Invalid or expired token.</p>`,
    });
    return new Response(html, {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const student = await prisma.student.findUnique({
    where: { id: payload.sid },
    select: {
      id: true,
      tenantId: true,
      status: true,
      firstName: true,
      lastName: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
    },
  });

  if (!student) {
    const html = pageHtml({
      title: "Not found",
      bodyHtml: `<h1>Not found</h1><p class="muted">Student not found.</p>`,
    });
    return new Response(html, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (student.status === StudentStatus.ARCHIVED) {
    const html = pageHtml({
      title: "Unavailable",
      bodyHtml: `<h1>Unavailable</h1><p class="muted">This learner record is archived.</p>`,
    });
    return new Response(html, {
      status: 409,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const before = { guardianSmsOptIn: student.guardianSmsOptIn, healthConsentAt: student.healthConsentAt };

  const updated = await prisma.student.update({
    where: { id: student.id },
    data: {
      guardianSmsOptIn: true,
      healthConsentAt: student.healthConsentAt ?? new Date(),
    },
    select: { id: true, tenantId: true, guardianSmsOptIn: true, healthConsentAt: true, firstName: true, lastName: true },
  });

  // Best-effort audit (public: no userId)
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: updated.tenantId,
        userId: null,
        action: "CONSENT_STUDENT_OPTIN_PUBLIC",
        resource: "STUDENT",
        resourceId: updated.id,
        metadata: {
          via: "public_link_confirm",
          ip: getIp(req),
          ua: getUa(req),
          before: {
            guardianSmsOptIn: before.guardianSmsOptIn,
            healthConsentAt: before.healthConsentAt ? new Date(before.healthConsentAt).toISOString() : null,
          },
          after: {
            guardianSmsOptIn: updated.guardianSmsOptIn,
            healthConsentAt: updated.healthConsentAt ? updated.healthConsentAt.toISOString() : null,
          },
        } as any,
      },
    });
  } catch {}

  const childName = `${updated.lastName ?? ""} ${updated.firstName ?? ""}`.trim();

  const html = pageHtml({
    title: "Consent confirmed",
    bodyHtml: `
      <h1>Thank you!</h1>
      <p>Consent & SMS updates are now enabled for <b>${esc(childName)}</b>.</p>
      <p class="muted">You may close this page.</p>
    `,
  });

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}