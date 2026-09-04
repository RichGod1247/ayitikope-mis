import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendEmail";
import { sendSms } from "@/lib/sms";

export const STAFF_ONBOARDING_WELCOME_VERSION =
  "EDULIFE_STAFF_ONBOARDING_WELCOME_V1" as const;

type WelcomeSnapshot = {
  kind: "STAFF_ONBOARDING_WELCOME";
  title: string;
  role: string;
  roleLabel: string;
  schoolName: string;
  greetingName: string;
  inAppBody: string;
  emailSubject: string;
  emailText: string;
  smsText: string;
  essentialAlertsSeparate: true;
};

type WelcomeDeliveryRow = {
  id: string;
  tenantId: string;
  userId: string;
  messageSnapshotJson: unknown;
  emailStatus: string;
  emailAttemptCount: number;
  smsStatus: string;
  smsAttemptCount: number;
  email: string | null;
  phone: string | null;
  phoneNorm: string | null;
};

type WelcomeViewRow = {
  id: string;
  roleSnapshot: string;
  messageVersion: string;
  messageSnapshotJson: unknown;
  inAppSeenAt: Date | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function roleLabel(value: unknown) {
  const role = normalizeRole(value);
  if (role === "HEADTEACHER" || role === "HEADMASTER") return "Headteacher";
  if (role === "TEACHER") return "Teacher";
  return role.split("_").join(" ");
}

function greetingName(input: {
  firstName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  const firstName = clean(input.firstName);
  if (firstName) return firstName;

  const name = clean(input.name);
  if (name) return name.split(/\s+/)[0] ?? name;

  return clean(input.email) || "there";
}

function buildSnapshot(input: {
  role: string;
  schoolName: string;
  firstName?: string | null;
  name?: string | null;
  email?: string | null;
}): WelcomeSnapshot {
  const role = normalizeRole(input.role);
  const label = roleLabel(role);
  const schoolName = clean(input.schoolName);
  const helloName = greetingName(input);
  const title = "Welcome to EduLife OS";
  const inAppBody = `Your ${label} access at ${schoolName} is active. You are ready to begin.`;

  return {
    kind: "STAFF_ONBOARDING_WELCOME",
    title,
    role,
    roleLabel: label,
    schoolName,
    greetingName: helloName,
    inAppBody,
    emailSubject: `${title} — ${schoolName}`,
    emailText:
      `Hello ${helloName},\n\n` +
      `Welcome to EduLife OS. Your ${label} access at ${schoolName} is now active.\n\n` +
      `You can sign in and begin your school work. We are glad to have you with us as EduLife OS helps make teaching, attendance, assessment and accountability clearer and easier.\n`,
    smsText: `Welcome to EduLife OS, ${helloName}. Your ${label} access at ${schoolName} is active. Sign in to begin.`,
    essentialAlertsSeparate: true,
  };
}

function parseSnapshot(value: unknown): WelcomeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const snapshot: WelcomeSnapshot = {
    kind: "STAFF_ONBOARDING_WELCOME",
    title: clean(row.title),
    role: normalizeRole(row.role),
    roleLabel: clean(row.roleLabel),
    schoolName: clean(row.schoolName),
    greetingName: clean(row.greetingName),
    inAppBody: clean(row.inAppBody),
    emailSubject: clean(row.emailSubject),
    emailText: clean(row.emailText),
    smsText: clean(row.smsText),
    essentialAlertsSeparate: true,
  };

  if (
    row.kind !== "STAFF_ONBOARDING_WELCOME" ||
    row.essentialAlertsSeparate !== true ||
    !snapshot.title ||
    !snapshot.role ||
    !snapshot.roleLabel ||
    !snapshot.schoolName ||
    !snapshot.inAppBody ||
    !snapshot.emailSubject ||
    !snapshot.emailText ||
    !snapshot.smsText
  ) {
    return null;
  }

  return snapshot;
}

export async function ensureStaffOnboardingWelcome(input: {
  tx: Prisma.TransactionClient;
  membershipId: string;
}) {
  const membershipId = clean(input.membershipId);
  if (!membershipId) throw new Error("ONBOARDING_WELCOME_MEMBERSHIP_REQUIRED");

  const membership = await input.tx.membership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      status: true,
      role: { select: { name: true } },
      user: {
        select: {
          firstName: true,
          name: true,
          email: true,
        },
      },
      tenant: { select: { name: true, status: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new Error("ONBOARDING_WELCOME_MEMBERSHIP_NOT_ACTIVE");
  }
  if (!membership.tenant || membership.tenant.status !== "ACTIVE") {
    throw new Error("ONBOARDING_WELCOME_TENANT_NOT_ACTIVE");
  }

  const role = normalizeRole(membership.role?.name);
  if (!new Set(["TEACHER", "HEADTEACHER", "HEADMASTER"]).has(role)) {
    throw new Error("ONBOARDING_WELCOME_ROLE_NOT_ALLOWED");
  }

  const snapshot = buildSnapshot({
    role,
    schoolName: membership.tenant.name,
    firstName: membership.user.firstName,
    name: membership.user.name,
    email: membership.user.email,
  });

  await input.tx.$executeRaw(
    Prisma.sql`
      INSERT INTO edulife_os."OnboardingWelcome" (
        "membershipId",
        "messageVersion",
        "messageSnapshotJson"
      )
      VALUES (
        ${membershipId},
        ${STAFF_ONBOARDING_WELCOME_VERSION},
        CAST(${JSON.stringify(snapshot)} AS jsonb)
      )
      ON CONFLICT ON CONSTRAINT "OnboardingWelcome_idempotency_unique"
      DO NOTHING
    `,
  );

  const rows = await input.tx.$queryRaw<Array<{
    id: string;
    membershipId: string;
    messageVersion: string;
  }>>(
    Prisma.sql`
      SELECT
        "id"::text AS "id",
        "membershipId",
        "messageVersion"
      FROM edulife_os."OnboardingWelcome"
      WHERE "membershipId" = ${membershipId}
      LIMIT 1
    `,
  );

  const welcome = rows[0] ?? null;
  if (!welcome) throw new Error("ONBOARDING_WELCOME_PERSISTENCE_FAILED");
  return welcome;
}

type ChannelDelivery = {
  attempted: boolean;
  ok: boolean;
  status: string;
  error?: string;
};

async function markEmailResult(input: {
  welcomeId: string;
  ok: boolean;
  error?: string | null;
}) {
  await prisma.$executeRaw(
    input.ok
      ? Prisma.sql`
          UPDATE edulife_os."OnboardingWelcome"
          SET
            "emailStatus" = 'SENT',
            "emailSentAt" = now(),
            "emailLastError" = NULL,
            "updatedAt" = now()
          WHERE "id" = ${input.welcomeId}::uuid
            AND "emailAttemptCount" > 0
            AND "emailStatus" = 'PENDING'
        `
      : Prisma.sql`
          UPDATE edulife_os."OnboardingWelcome"
          SET
            "emailStatus" = 'FAILED',
            "emailLastError" = ${clean(input.error) || "EMAIL_SEND_FAILED"},
            "updatedAt" = now()
          WHERE "id" = ${input.welcomeId}::uuid
            AND "emailAttemptCount" > 0
            AND "emailStatus" = 'PENDING'
        `,
  );
}

async function markSmsResult(input: {
  welcomeId: string;
  ok: boolean;
  error?: string | null;
}) {
  await prisma.$executeRaw(
    input.ok
      ? Prisma.sql`
          UPDATE edulife_os."OnboardingWelcome"
          SET
            "smsStatus" = 'SENT',
            "smsSentAt" = now(),
            "smsLastError" = NULL,
            "updatedAt" = now()
          WHERE "id" = ${input.welcomeId}::uuid
            AND "smsAttemptCount" > 0
            AND "smsStatus" = 'PENDING'
        `
      : Prisma.sql`
          UPDATE edulife_os."OnboardingWelcome"
          SET
            "smsStatus" = 'FAILED',
            "smsLastError" = ${clean(input.error) || "SMS_SEND_FAILED"},
            "updatedAt" = now()
          WHERE "id" = ${input.welcomeId}::uuid
            AND "smsAttemptCount" > 0
            AND "smsStatus" = 'PENDING'
        `,
  );
}

export async function deliverStaffOnboardingWelcome(input: {
  welcomeId: string;
  actorUserId?: string | null;
}) {
  const welcomeId = clean(input.welcomeId);
  if (!welcomeId) throw new Error("ONBOARDING_WELCOME_ID_REQUIRED");

  const rows = await prisma.$queryRaw<WelcomeDeliveryRow[]>(
    Prisma.sql`
      SELECT
        w."id"::text AS "id",
        w."tenantId",
        w."userId",
        w."messageSnapshotJson",
        w."emailStatus",
        w."emailAttemptCount",
        w."smsStatus",
        w."smsAttemptCount",
        u."email",
        u."phone",
        u."phoneNorm"
      FROM edulife_os."OnboardingWelcome" w
      JOIN edulife_os."User" u ON u."id" = w."userId"
      WHERE w."id" = ${welcomeId}::uuid
      LIMIT 1
    `,
  );

  const welcome = rows[0] ?? null;
  if (!welcome) throw new Error("ONBOARDING_WELCOME_NOT_FOUND");
  const snapshot = parseSnapshot(welcome.messageSnapshotJson);
  if (!snapshot) throw new Error("ONBOARDING_WELCOME_MESSAGE_INVALID");

  let email: ChannelDelivery = {
    attempted: false,
    ok: welcome.emailStatus === "SENT",
    status: welcome.emailStatus,
  };

  const emailClaim = await prisma.$executeRaw(
    Prisma.sql`
      UPDATE edulife_os."OnboardingWelcome"
      SET
        "emailAttemptCount" = "emailAttemptCount" + 1,
        "emailLastAttemptAt" = now(),
        "updatedAt" = now()
      WHERE "id" = ${welcome.id}::uuid
        AND "emailStatus" = 'PENDING'
        AND "emailAttemptCount" = 0
    `,
  );

  if (emailClaim === 1) {
    const to = clean(welcome.email);
    if (!to) {
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE edulife_os."OnboardingWelcome"
          SET
            "emailStatus" = 'SKIPPED',
            "emailLastError" = 'EMAIL_MISSING',
            "updatedAt" = now()
          WHERE "id" = ${welcome.id}::uuid
            AND "emailStatus" = 'PENDING'
        `,
      );
      email = { attempted: true, ok: false, status: "SKIPPED", error: "EMAIL_MISSING" };
    } else {
      const result = await sendEmail({
        to,
        subject: snapshot.emailSubject,
        text: snapshot.emailText,
        idempotencyKey: `staff-onboarding-welcome:${welcome.id}`,
        meta: {
          category: "STAFF_ONBOARDING_WELCOME",
          welcomeId: welcome.id,
          membershipAuthority: true,
          essentialAlertsConsentGranted: false,
        },
      });
      await markEmailResult({ welcomeId: welcome.id, ok: result.ok, error: result.error });
      email = {
        attempted: true,
        ok: result.ok,
        status: result.ok ? "SENT" : "FAILED",
        ...(result.ok ? {} : { error: result.error ?? "EMAIL_SEND_FAILED" }),
      };
    }
  }

  let sms: ChannelDelivery = {
    attempted: false,
    ok: welcome.smsStatus === "SENT",
    status: welcome.smsStatus,
  };

  const smsClaim = await prisma.$executeRaw(
    Prisma.sql`
      UPDATE edulife_os."OnboardingWelcome"
      SET
        "smsAttemptCount" = "smsAttemptCount" + 1,
        "smsLastAttemptAt" = now(),
        "updatedAt" = now()
      WHERE "id" = ${welcome.id}::uuid
        AND "smsStatus" = 'PENDING'
        AND "smsAttemptCount" = 0
    `,
  );

  if (smsClaim === 1) {
    const to = clean(welcome.phoneNorm) || clean(welcome.phone);
    if (!to) {
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE edulife_os."OnboardingWelcome"
          SET
            "smsStatus" = 'SKIPPED',
            "smsLastError" = 'SMS_PHONE_MISSING',
            "updatedAt" = now()
          WHERE "id" = ${welcome.id}::uuid
            AND "smsStatus" = 'PENDING'
        `,
      );
      sms = { attempted: true, ok: false, status: "SKIPPED", error: "SMS_PHONE_MISSING" };
    } else {
      const result = await sendSms({
        tenantId: welcome.tenantId,
        actorId: input.actorUserId ?? welcome.userId,
        to,
        message: snapshot.smsText,
        from: "EDULIFEOS",
        template: "STAFF_ONBOARDING_WELCOME",
        payload: {
          welcomeId: welcome.id,
          category: "STAFF_ONBOARDING_WELCOME",
          essentialAlertsConsentGranted: false,
        },
      });
      await markSmsResult({ welcomeId: welcome.id, ok: Boolean(result.ok), error: result.error });
      sms = {
        attempted: true,
        ok: Boolean(result.ok),
        status: result.ok ? "SENT" : "FAILED",
        ...(result.ok ? {} : { error: result.error ?? "SMS_SEND_FAILED" }),
      };
    }
  }

  return { email, sms };
}

export async function readActiveStaffOnboardingWelcome(input: {
  userId: string;
  tenantId: string;
}) {
  const rows = await prisma.$queryRaw<WelcomeViewRow[]>(
    Prisma.sql`
      SELECT
        "id"::text AS "id",
        "roleSnapshot",
        "messageVersion",
        "messageSnapshotJson",
        "inAppSeenAt"
      FROM edulife_os."OnboardingWelcome"
      WHERE "userId" = ${clean(input.userId)}
        AND "tenantId" = ${clean(input.tenantId)}
        AND "inAppVisibleAt" <= now()
        AND "inAppDismissedAt" IS NULL
      ORDER BY "inAppVisibleAt" DESC
      LIMIT 1
    `,
  );

  const row = rows[0] ?? null;
  if (!row) return null;
  const snapshot = parseSnapshot(row.messageSnapshotJson);
  if (!snapshot) return null;

  return {
    id: row.id,
    title: snapshot.title,
    body: snapshot.inAppBody,
    roleLabel: snapshot.roleLabel,
    schoolName: snapshot.schoolName,
    messageVersion: row.messageVersion,
    seen: Boolean(row.inAppSeenAt),
  };
}

export async function markStaffOnboardingWelcome(input: {
  welcomeId: string;
  userId: string;
  tenantId: string;
  action: "SEEN" | "DISMISS";
}) {
  const welcomeId = clean(input.welcomeId);
  const userId = clean(input.userId);
  const tenantId = clean(input.tenantId);

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    inAppSeenAt: Date | null;
    inAppDismissedAt: Date | null;
  }>>(
    Prisma.sql`
      SELECT
        "id"::text AS "id",
        "inAppSeenAt",
        "inAppDismissedAt"
      FROM edulife_os."OnboardingWelcome"
      WHERE "id" = ${welcomeId}::uuid
        AND "userId" = ${userId}
        AND "tenantId" = ${tenantId}
      LIMIT 1
    `,
  );

  const current = rows[0] ?? null;
  if (!current) return { found: false as const };

  if (input.action === "SEEN") {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE edulife_os."OnboardingWelcome"
        SET
          "inAppSeenAt" = COALESCE("inAppSeenAt", now()),
          "updatedAt" = now()
        WHERE "id" = ${welcomeId}::uuid
          AND "userId" = ${userId}
          AND "tenantId" = ${tenantId}
      `,
    );
    return { found: true as const };
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE edulife_os."OnboardingWelcome"
          SET
            "inAppSeenAt" = COALESCE("inAppSeenAt", now()),
            "updatedAt" = now()
          WHERE "id" = ${welcomeId}::uuid
            AND "userId" = ${userId}
            AND "tenantId" = ${tenantId}
        `,
      );
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE edulife_os."OnboardingWelcome"
          SET
            "inAppDismissedAt" = COALESCE("inAppDismissedAt", now()),
            "updatedAt" = now()
          WHERE "id" = ${welcomeId}::uuid
            AND "userId" = ${userId}
            AND "tenantId" = ${tenantId}
        `,
      );
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  return { found: true as const };
}
