// src/app/api/tenant/enroll/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { SchoolSector, type Prisma } from "@prisma/client";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";



function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function randomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function onlinePaymentPreference(v: unknown): "YES" | "NO" {
  return cleanStr(v).toUpperCase() === "YES" ? "YES" : "NO";
}

function schoolSectorFrom(value: unknown): SchoolSector {
  const v = cleanStr(value).toUpperCase();
  return v === "PRIVATE" ? SchoolSector.PRIVATE : SchoolSector.PUBLIC;
}

function officialIdentifierLabel(sector: SchoolSector) {
  return sector === SchoolSector.PRIVATE
    ? "EMIS / NaSIA / official registration code"
    : "EMIS code";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const inviteToken = cleanStr(body.inviteToken);
    if (!inviteToken) {
      return NextResponse.json(
        { ok: false, error: "INVITE_TOKEN_REQUIRED" },
        { status: 400 }
      );
    }

    const tokenHash = sha256Hex(inviteToken);
    const now = new Date();

    const invite = await prisma.tenantBootstrapInvite.findFirst({
      where: { tokenHash, expiresAt: { gt: now }, usedAt: null },
      select: {
        id: true,
        schoolName: true,
        contactEmail: true,
        contactPhone: true,
        contactPhoneNorm: true,
        reservedSlug: true,
        reservedSchoolCode: true,
        schoolSector: true,
        expiresAt: true,
      },
    });

    if (!invite) {
      return NextResponse.json(
        { ok: false, error: "INVALID_OR_EXPIRED_INVITE" },
        { status: 404 }
      );
    }

    const tenantName = cleanStr(
      body.tenantName || body.schoolName || invite.schoolName
    );
    const email = cleanEmail(body.email);
    const password = cleanStr(body.password);
    const onlinePaymentsPreference = onlinePaymentPreference(
      body.onlinePaymentsPreference
    );

    const schoolSector = schoolSectorFrom(
      body.schoolSector || invite.schoolSector
    );

    if (!tenantName) {
      return NextResponse.json(
        { ok: false, error: "School name is required." },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Valid email is required." },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (email !== cleanEmail(invite.contactEmail)) {
      return NextResponse.json(
        {
          ok: false,
          error: "EMAIL_MUST_MATCH_INVITE",
          message: "Use the same email that received the invite.",
        },
        { status: 400 }
      );
    }

    const emisCode = cleanStr(body.emisCode).toUpperCase();

    if (!emisCode) {
      return NextResponse.json(
        {
          ok: false,
          error: "OFFICIAL_SCHOOL_IDENTIFIER_REQUIRED",
          message: `${officialIdentifierLabel(schoolSector)} is required.`,
        },
        { status: 400 }
      );
    }
    const gpsAddress = cleanStr(body.gpsAddress) || null;
    const district = cleanStr(body.district) || null;
    const circuit = cleanStr(body.circuit) || null;
    const region = cleanStr(body.region) || null;

    const firstName = cleanStr(body.firstName) || null;
    const lastName = cleanStr(body.lastName) || null;
    const fullName =
      cleanStr(body.name) || [firstName, lastName].filter(Boolean).join(" ") || null;

    const adminPhoneRaw = cleanStr(body.phone);
    const adminPhoneNorm = adminPhoneRaw
      ? normalizeGhPhoneE164(adminPhoneRaw)
      : null;

    if (adminPhoneRaw && !adminPhoneNorm) {
      return NextResponse.json(
        { ok: false, error: "BAD_PHONE" },
        { status: 400 }
      );
    }

    const preferredSlug =
      cleanStr(body.slug) ||
      slugify(tenantName) ||
      `school-${randomCode(6).toLowerCase()}`;

    const slug = invite.reservedSlug || preferredSlug;

    const passwordHash = await bcrypt.hash(password, 10);

    const submittedAtIso = new Date().toISOString();

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const existing = await tx.user.findUnique({ where: { email } });

        if (existing) {
          throw Object.assign(new Error("Email already exists."), {
            code: "EMAIL_EXISTS",
          });
        }

        const tenant = await tx.tenant.create({
          data: {
            name: tenantName,
            slug,
            schoolCode: invite.reservedSchoolCode,
            status: "PENDING",
            schoolSector,

            emisCode,
            gpsAddress,
            district,
            circuit,
            region,

            contactEmail: invite.contactEmail,
            contactPhone: invite.contactPhone || null,
            contactPhoneNorm: invite.contactPhoneNorm || null,

            timezone: "Africa/Accra",
            locale: "en",
            settingsJson: {
              bootstrapInviteId: invite.id,
              bootstrapSubmittedAt: submittedAtIso,
              schoolSector,
              bootstrapApprovalRequired: true,
              finance: {
                onlineFeePaymentsPreference: onlinePaymentsPreference,
                onlineFeePaymentsStatus:
                  onlinePaymentsPreference === "YES"
                    ? "INTERESTED"
                    : "NOT_REQUESTED",
                capturedAt: submittedAtIso,
                capturedFrom: "tenant_enrollment",
              },
            },
          },
          select: {
            id: true,
            slug: true,
            schoolCode: true,
            status: true,
            schoolSector: true,
          },
        });

        await tx.tenantSettings.create({
          data: { tenantId: tenant.id },
        });

        const role = await tx.role.upsert({
          where: {
            tenantId_name: {
              tenantId: tenant.id,
              name: "SCHOOL_ADMIN",
            },
          },
          update: {},
          create: {
            tenantId: tenant.id,
            name: "SCHOOL_ADMIN",
            description: "School administrator",
          },
          select: { id: true },
        });

        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            name: fullName,
            firstName,
            lastName,
            phone: adminPhoneRaw || null,
            phoneNorm: adminPhoneNorm || null,
            timezone: "Africa/Accra",
            locale: "en",
            smsOptIn: true,
          },
          select: { id: true },
        });

        await tx.membership.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            roleId: role.id,
            status: "ACTIVE",
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { lastActiveTenant: { connect: { id: tenant.id } } },
        });

        await tx.tenantBootstrapInvite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: new Date(), usedTenantId: tenant.id },
        });

        return {
          tenantId: tenant.id,
          userId: user.id,
          slug: tenant.slug,
          schoolCode: tenant.schoolCode,
          status: tenant.status,
          schoolSector: tenant.schoolSector,
        };
      },
      { maxWait: 10_000, timeout: 30_000 }
    );

    return NextResponse.json({
      ok: true,
      tenantId: result.tenantId,
      userId: result.userId,
      slug: result.slug,
      schoolCode: result.schoolCode,
      status: result.status,
      schoolSector: result.schoolSector,
      approvalRequired: true,
      portalUrl: "/pending",
      next: "/auth/signin",
    });
  } catch (err: unknown) {
    const e = err as { code?: unknown };

    if (e?.code === "EMAIL_EXISTS") {
      return NextResponse.json(
        { ok: false, error: "Email already exists." },
        { status: 409 }
      );
    }

    if (String(e?.code) === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Duplicate value. Try again." },
        { status: 409 }
      );
    }

    console.error("TENANT_ENROLL_ERROR", err);

    return NextResponse.json(
      { ok: false, error: "Server error." },
      { status: 500 }
    );
  }
}