// src/app/api/auth/teacher-signup/route.ts
import { NextResponse } from "next/server";
import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { verifyOnboardingCode } from "@/lib/onboardingCode";
import { extractInviteToken } from "@/lib/inviteToken";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FieldErrors = Record<string, string>;
type TeacherPhase = "KG" | "PRIMARY" | "JHS";
type JhsAssignment = { subject: string; classes: string[] };

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function jsonFail(msg: string, status = 400, fieldErrors?: FieldErrors) {
  return NextResponse.json(
    { ok: false, error: msg, fieldErrors: fieldErrors ?? null },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}
function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}
function cleanPhone(v: unknown) {
  const raw = cleanStr(v).replace(/\s+/g, "");
  let p = raw.replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("0") && p.length === 10) p = `+233${p.slice(1)}`;
  if (p.startsWith("233") && !p.startsWith("+233")) p = `+${p}`;
  return p;
}

function toTitleCase(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeStaffIdNorm(v: string) {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isTeacherPhase(v: string): v is TeacherPhase {
  return v === "KG" || v === "PRIMARY" || v === "JHS";
}

function safeInternalPath(raw: unknown) {
  const fallback = "/teacher-portal";
  const v = cleanStr(raw);
  if (!v) return fallback;

  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;
  if (v.startsWith("/")) return v;

  try {
    const u = new URL(v);
    const path = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    return path || fallback;
  } catch {
    return fallback;
  }
}

function normalizeAssignments(v: unknown): JhsAssignment[] | undefined {
  if (!Array.isArray(v)) return undefined;

  const out: JhsAssignment[] = [];

  for (const row of v) {
    if (!isRecord(row)) continue;

    const subjectRaw = cleanStr(row.subject);
    const subject = subjectRaw ? toTitleCase(subjectRaw) : "";

    const classesRaw = Array.isArray(row.classes) ? row.classes : [];
    const classes = classesRaw
      .map((c) => cleanStr(c).toUpperCase())
      .filter(Boolean);

    if (subject && classes.length > 0) out.push({ subject, classes });
  }

  return out.length ? out : undefined;
}

async function resolveTenantIdOrNull(raw: string | null | undefined) {
  const v = cleanStr(raw);
  if (!v) return null;

  const byId = await prisma.tenant.findFirst({
    where: { id: v },
    select: { id: true },
  });
  if (byId?.id) return byId.id;

  const bySlug = await prisma.tenant.findFirst({
    where: { slug: { equals: v, mode: "insensitive" } },
    select: { id: true },
  });
  return bySlug?.id ?? null;
}

// Tunables
const SIGNUP_WINDOW_SECONDS = Number(process.env.AUTH_SIGNUP_WINDOW_SECONDS || 60 * 60);
const SIGNUP_LIMIT_PER_IP = Number(process.env.AUTH_SIGNUP_LIMIT_PER_IP || 20);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(body)) return jsonFail("Invalid payload.");

  const headers = req.headers;
  const ip = getIpFromHeaders(headers);
  const userAgent = getUserAgentFromHeaders(headers);

  const ipKey = ip ? `signup:ip:${ip}` : null;
  if (ipKey) {
    const lim = await rateLimitCheck({
      action: "AUTH_SIGNUP_FAIL",
      key: ipKey,
      limit: SIGNUP_LIMIT_PER_IP,
      windowSeconds: SIGNUP_WINDOW_SECONDS,
    });
    if (!lim.ok) {
      return jsonFail(`Too many signup attempts. Try again in ${lim.retryAfterSeconds}s.`, 429);
    }
  }

  const fieldErrors: FieldErrors = {};

  const firstName = cleanStr(body.firstName);
  const lastName = cleanStr(body.lastName);
  const staffId = cleanStr(body.staffId);
  const staffIdNorm = normalizeStaffIdNorm(staffId);

  const email = cleanEmail(body.email);
  const password = cleanStr(body.password);

  const inviteTokenRaw = cleanStr(body.inviteToken);
  const inviteToken = inviteTokenRaw ? extractInviteToken(inviteTokenRaw) : null;

  const tenantRaw = cleanStr(body.tenantId || body.tenant || body.school) || null;
  const onboardingCodeRaw = cleanStr(body.onboardingCode);
  const onboardingCode = onboardingCodeRaw ? extractInviteToken(onboardingCodeRaw) : null;

  const phaseRaw = cleanStr(body.phase);
  const phone = cleanPhone(body.phone);

  const classLevel = cleanStr(body.classLevel) || null;
  const jhsAssignments = normalizeAssignments(body.jhsAssignments);

  const additionalDuties: string[] = Array.isArray(body.additionalDuties)
    ? body.additionalDuties.map((x) => cleanStr(x)).filter(Boolean)
    : [];

  const callbackUrl = safeInternalPath(body.redirectTo || body.callbackUrl || "/teacher-portal");

  if (!firstName) fieldErrors.firstName = "First name is required.";
  if (!lastName) fieldErrors.lastName = "Last name is required.";
  if (!staffId) fieldErrors.staffId = "Staff ID is required.";
  if (staffId && !staffIdNorm) fieldErrors.staffId = "Invalid Staff ID format.";
  if (!email) fieldErrors.email = "Email is required.";
  if (!password) fieldErrors.password = "Password is required.";
  if (password && password.length < 8) fieldErrors.password = "Password must be at least 8 characters.";
  if (!phone) fieldErrors.phone = "Phone number is required.";

  if (!isTeacherPhase(phaseRaw)) fieldErrors.phase = "Phase must be KG, PRIMARY, or JHS.";
  const phase: TeacherPhase | null = isTeacherPhase(phaseRaw) ? phaseRaw : null;

  if (phase === "KG" || phase === "PRIMARY") {
    if (!classLevel) fieldErrors.classLevel = "Class level is required for KG/PRIMARY.";
  }
  if (phase === "JHS") {
    if (!jhsAssignments) fieldErrors.jhsAssignments = "Add at least one subject + class list for JHS.";
  }

  const usingInvite = !!inviteToken;
  if (!usingInvite) {
    if (!tenantRaw) fieldErrors.tenantId = "School code (tenant) is required.";
    if (!onboardingCode) fieldErrors.onboardingCode = "Onboarding code is required.";
  } else {
    if (!inviteToken) fieldErrors.inviteToken = "Invite token is required.";
  }

  if (Object.keys(fieldErrors).length) {
    if (ipKey) {
      await rateLimitRecord({
        action: "AUTH_SIGNUP_FAIL",
        key: ipKey,
        ip,
        userAgent,
        metadata: { reason: "VALIDATION", staffId, email },
      });
    }
    return jsonFail("Please correct the highlighted fields.", 400, fieldErrors);
  }

  // Resolve tenant + role
  let resolvedTenantId: string | null = null;
  let resolvedRoleId: string | null = null;
  let usedInviteToken: string | null = null;

  if (inviteToken) {
    usedInviteToken = inviteToken;

    const invite = await prisma.invite.findUnique({
      where: { token: usedInviteToken },
      select: { tenantId: true, roleId: true, email: true, acceptedAt: true, expiresAt: true },
    });

    if (!invite) return jsonFail("Invalid invite link.", 400, { inviteToken: "Invalid invite token." });
    if (invite.acceptedAt) return jsonFail("Invite already used.", 400, { inviteToken: "This invite has already been used." });
    if (invite.expiresAt <= new Date()) return jsonFail("Invite expired.", 400, { inviteToken: "This invite has expired." });
    if (invite.email.toLowerCase().trim() !== email) {
      return jsonFail("Invite email mismatch.", 400, { email: "Email must match the invite email." });
    }

    resolvedTenantId = invite.tenantId;
    resolvedRoleId = invite.roleId;
  } else {
    const tId = await resolveTenantIdOrNull(tenantRaw);
    if (!tId) return jsonFail("Invalid school (tenant).", 400, { tenantId: "School not found." });

    const ok = await verifyOnboardingCode(tId, onboardingCode!);
    if (!ok) {
      if (ipKey) {
        await rateLimitRecord({
          action: "AUTH_SIGNUP_FAIL",
          key: ipKey,
          ip,
          userAgent,
          metadata: { reason: "BAD_ONBOARDING_CODE", tenantId: tId, staffId, email },
        });
      }
      return jsonFail("Invalid onboarding code.", 400, { onboardingCode: "Wrong or expired onboarding code." });
    }

    const teacherRole = await prisma.role.findFirst({
      where: { tenantId: tId, name: "TEACHER" },
      select: { id: true },
    });
    if (!teacherRole) return jsonFail("Teacher role not configured for this school.", 500);

    resolvedTenantId = tId;
    resolvedRoleId = teacherRole.id;
  }

  if (!resolvedTenantId || !resolvedRoleId) return jsonFail("Could not resolve tenant/role.", 500);

  try {
    const result = await prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      // 1) Find or create user by email (global identity)
      let user = await tx.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true },
      });

      if (user) {
        if (user.passwordHash) {
          const ok = await verifyPassword(password, user.passwordHash);
          if (!ok) throw Object.assign(new Error("EXISTING_USER_BAD_PASSWORD"), { code: "EXISTING_USER_BAD_PASSWORD" });
        } else {
          const passwordHash = await hashPassword(password);
          await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            firstName,
            lastName,
            name: `${firstName} ${lastName}`.trim(),
            lastActiveTenantId: resolvedTenantId!,
          },
        });
      } else {
        const passwordHash = await hashPassword(password);
        user = await tx.user.create({
          data: {
            email,
            passwordHash,
            name: `${firstName} ${lastName}`.trim(),
            firstName,
            lastName,
            staffId, // legacy compatibility
            lastActiveTenantId: resolvedTenantId!,
          },
          select: { id: true, email: true, passwordHash: true },
        });
      }

      // 2) Tenant-scoped staffId uniqueness (Membership)
      const existingStaff = await tx.membership.findFirst({
        where: { tenantId: resolvedTenantId!, staffIdNorm },
        select: { id: true },
      });
      if (existingStaff) throw Object.assign(new Error("STAFF_ID_TAKEN"), { code: "STAFF_ID_TAKEN" });

      // 3) One membership per tenant per user
      const existingMembership = await tx.membership.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId: resolvedTenantId! } },
        select: { id: true },
      });
      if (existingMembership) throw Object.assign(new Error("ALREADY_IN_SCHOOL"), { code: "ALREADY_IN_SCHOOL" });

      // 4) Membership create
      await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: resolvedTenantId!,
          roleId: resolvedRoleId!,
          status: "ACTIVE",
          staffId,
          staffIdNorm,
        },
      });

      // 5) TeacherProfile upsert (✅ correct unique input name from your schema)
      const jhsJson = (jhsAssignments ?? []) as unknown as Prisma.InputJsonValue;

      await tx.teacherProfile.upsert({
        where: {
          teacherProfile_tenant_user_unique: {
            tenantId: resolvedTenantId!,
            userId: user.id,
          },
        },
        create: {
          tenant: { connect: { id: resolvedTenantId! } },
          user: { connect: { id: user.id } },
          phone,
          phase: phase!,
          classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
          additionalDuties,
          ...(phase === "JHS" ? { jhsAssignments: jhsJson } : {}),
        },
        update: {
          phone,
          phase: phase!,
          classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
          additionalDuties,
          ...(phase === "JHS" ? { jhsAssignments: jhsJson } : { jhsAssignments: Prisma.DbNull }),
        },
      });

      // 6) Consume invite
      if (usedInviteToken) {
        await tx.invite.update({
          where: { token: usedInviteToken },
          data: { acceptedAt: new Date() },
        });
      }

      // 7) Audit
      await tx.auditLog.create({
        data: {
          tenantId: resolvedTenantId!,
          userId: user.id,
          action: "TEACHER_SIGNUP",
          resource: "User",
          resourceId: user.id,
          ip,
          userAgent,
          metadata: {
            staffId,
            staffIdNorm,
            phase,
            classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
            method: usedInviteToken ? "INVITE" : "ONBOARDING_CODE",
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return { id: user.id };
    });

    const portalUrl = `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    return jsonOk({ ok: true, userId: result.id, tenantId: resolvedTenantId, portalUrl }, 200);
  } catch (e: unknown) {
    const code = isRecord(e) ? cleanStr(e.code || e.message) : "";

    if (ipKey) {
      await rateLimitRecord({
        action: "AUTH_SIGNUP_FAIL",
        key: ipKey,
        ip,
        userAgent,
        metadata: { reason: "SERVER_ERROR", staffId, email, code },
      });
    }

    if (code.includes("EXISTING_USER_BAD_PASSWORD")) {
      return jsonFail(
        "Account already exists. Enter your existing password to add this school.",
        401,
        { password: "Incorrect password for existing account." }
      );
    }
    if (code.includes("STAFF_ID_TAKEN")) {
      return jsonFail("Staff ID is already used in this school.", 409, { staffId: "This Staff ID is already taken in this school." });
    }
    if (code.includes("ALREADY_IN_SCHOOL")) {
      return jsonFail("You already belong to this school.", 409, { tenantId: "Membership already exists for this school." });
    }
    if (isRecord(e) && cleanStr(e.code) === "P2002") {
      return jsonFail("Duplicate detected. Please review your inputs.", 409, {
        staffId: "This Staff ID may already exist in this school.",
        email: "This email may already be registered.",
      });
    }

    const msg = e instanceof Error ? e.message : "Signup failed.";
    return jsonFail(msg, 500);
  }
}
