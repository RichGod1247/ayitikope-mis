// src/lib/governance/notices.ts
import { createHash } from "crypto";
import {
  GovernanceInterventionEventType,
  GovernanceInterventionPriority,
  GovernanceOfficialNoticeChannel,
  GovernanceOfficialNoticeDeliveryStatus,
  GovernanceOfficialNoticeRecipientType,
  GovernanceOfficialNoticeStatus,
  GovernanceOfficerRole,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GovernanceScope } from "@/lib/governance/scope";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { sendEmail } from "@/lib/email/sendEmail";
import { writeAuditLog } from "@/lib/audit";

export class GovernanceNoticeError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

type ExplicitRecipientInput = {
  recipientUserId?: unknown;
  recipientType?: unknown;
  tenantId?: unknown;
  displayName?: unknown;
  roleLabel?: unknown;
  phone?: unknown;
  email?: unknown;
  metadata?: unknown;
};

type SendNoticeInput = {
  caseId?: unknown;
  tenantId?: unknown;
  zoneId?: unknown;
  title?: unknown;
  body?: unknown;
  priority?: unknown;
  channels?: unknown;
  targetRoles?: unknown;
  recipients?: unknown;
  metadata?: unknown;

  /**
   * Prevents duplicate SMS/email dispatch for the same official notice intent.
   * Used by SISSO/Director dashboards.
   */
  idempotencyKey?: unknown;

  /**
   * Reserved for future reminder/escalation flows.
   * Normal official notice sends should NOT set this.
   */
  allowDuplicate?: unknown;
};

type InboxInput = {
  take?: unknown;
  unreadOnly?: unknown;
  unacknowledgedOnly?: unknown;
};

type AcknowledgeInput = {
  recipientId?: unknown;
  noticeId?: unknown;
  note?: unknown;
};

type RespondNoticeInput = {
  recipientId?: unknown;
  noticeId?: unknown;
  responseBody?: unknown;
  metadata?: unknown;
};

type NoticeTarget = {
  caseId: string | null;
  tenantId: string | null;
  zoneId: string | null;
  label: string;
};

type NormalizedRecipient = {
  recipientUserId: string | null;
  tenantId: string | null;
  recipientType: GovernanceOfficialNoticeRecipientType;
  displayName: string | null;
  roleLabel: string | null;
  phone: string | null;
  email: string | null;
  metadata: Prisma.InputJsonValue;
};

const NOTICE_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
};

const MAX_NOTICE_TAKE = 100;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function upper(value: unknown) {
  return clean(value).toUpperCase();
}

function normKey(value: unknown) {
  return upper(value).replace(/[^A-Z0-9]/g, "");
}

function boolish(value: unknown) {
  const v = upper(value);
  return v === "1" || v === "TRUE" || v === "YES";
}

function intOrNull(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function jsonValue(value: unknown, fallback: unknown): Prisma.InputJsonValue {
  try {
    const safe = value === undefined ? fallback : value;
    return JSON.parse(JSON.stringify(safe)) as Prisma.InputJsonValue;
  } catch {
    return JSON.parse(JSON.stringify(fallback)) as Prisma.InputJsonValue;
  }
}

function jsonObject(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return jsonValue({}, {});
  }

  return jsonValue(value, {});
}

function jsonArray(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value)) return jsonValue([], []);
  return jsonValue(value, []);
}

function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function metadataIdempotencyKey(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return clean((value as Record<string, unknown>).idempotencyKey);
}

function normalizeIntentText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildNoticeIdempotencyKey(args: {
  input: SendNoticeInput;
  target: NoticeTarget;
  recipients: NormalizedRecipient[];
  channels: GovernanceOfficialNoticeChannel[];
  title: string;
  body: string;
  priority: GovernanceInterventionPriority;
}) {
  const explicit = clean(args.input.idempotencyKey);
  if (explicit) return explicit;

  const metadata = inputObject(args.input.metadata);
  const metadataKey = clean(metadata.idempotencyKey);
  if (metadataKey) return metadataKey;

  const payload = {
    version: "governance-official-notice-v1",
    caseId: args.target.caseId,
    tenantId: args.target.tenantId,
    zoneId: args.target.zoneId,
    title: normalizeIntentText(args.title),
    body: normalizeIntentText(args.body),
    priority: args.priority,
    channels: args.channels.map(String).sort(),
    targetRoles: targetRolesArray(args.input.targetRoles).map(normKey).sort(),
    recipients: args.recipients.map((r) => recipientKey(r)).sort(),
  };

  return `gov-notice:${sha256(stableStringify(payload))}`;
}

function normalizePriority(value: unknown): GovernanceInterventionPriority {
  const v = upper(value);

  if (v === GovernanceInterventionPriority.LOW) return GovernanceInterventionPriority.LOW;
  if (v === GovernanceInterventionPriority.HIGH) return GovernanceInterventionPriority.HIGH;
  if (v === GovernanceInterventionPriority.CRITICAL) {
    return GovernanceInterventionPriority.CRITICAL;
  }

  return GovernanceInterventionPriority.MEDIUM;
}

function normalizeRecipientType(value: unknown): GovernanceOfficialNoticeRecipientType {
  const v = upper(value);
  const allowed = Object.values(GovernanceOfficialNoticeRecipientType) as string[];

  if (allowed.includes(v)) return v as GovernanceOfficialNoticeRecipientType;
  return GovernanceOfficialNoticeRecipientType.CUSTOM;
}

function normalizeChannels(value: unknown): GovernanceOfficialNoticeChannel[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const allowed = Object.values(GovernanceOfficialNoticeChannel) as string[];
  const out = new Set<GovernanceOfficialNoticeChannel>();

  for (const item of raw) {
    const v = upper(item);
    if (allowed.includes(v)) out.add(v as GovernanceOfficialNoticeChannel);
  }

  if (!out.size) out.add(GovernanceOfficialNoticeChannel.IN_APP);

  return Array.from(out);
}

function targetRolesArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => upper(v)).filter(Boolean);
}

function smsSafe(value: unknown) {
  return clean(value)
    .replace(/[·•]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function displayName(u: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const name = clean(u.name);
  if (name) return name;

  const full = `${clean(u.firstName)} ${clean(u.lastName)}`.trim();
  if (full) return full;

  return clean(u.email) || "Recipient";
}

function recipientKey(r: NormalizedRecipient) {
  if (r.recipientUserId) return `user:${r.recipientUserId}`;
  if (r.email) return `email:${r.email.toLowerCase()}`;
  if (r.phone) return `phone:${r.phone.replace(/[^\d+]/g, "")}`;
  return `custom:${normKey(r.displayName)}:${normKey(r.roleLabel)}`;
}

function assertTenantInScope(scope: GovernanceScope, tenantId: string) {
  if (scope.isSuperAdmin) return;

  if (!scope.tenantIds.includes(tenantId)) {
    throw new GovernanceNoticeError(403, "TENANT_OUT_OF_GOVERNANCE_SCOPE");
  }
}

function assertZoneInScope(scope: GovernanceScope, zoneId: string) {
  if (scope.isSuperAdmin) return;

  if (!scope.zoneIds.includes(zoneId)) {
    throw new GovernanceNoticeError(403, "ZONE_OUT_OF_GOVERNANCE_SCOPE");
  }
}

function scopedCaseWhere(
  scope: GovernanceScope
): Prisma.GovernanceInterventionCaseWhereInput {
  if (scope.isSuperAdmin) return {};

  return {
    OR: [
      {
        tenantId: {
          in: scope.tenantIds.length ? scope.tenantIds : ["__none__"],
        },
      },
      {
        zoneId: {
          in: scope.zoneIds.length ? scope.zoneIds : ["__none__"],
        },
      },
    ],
  };
}

async function resolveNoticeTarget(
  scope: GovernanceScope,
  input: SendNoticeInput
): Promise<NoticeTarget> {
  const caseId = clean(input.caseId);
  const tenantId = clean(input.tenantId);
  const zoneId = clean(input.zoneId);

  if (caseId) {
    const row = await prisma.governanceInterventionCase.findFirst({
      where: {
        id: caseId,
        ...scopedCaseWhere(scope),
      },
      select: {
        id: true,
        tenantId: true,
        zoneId: true,
        title: true,
        tenant: {
          select: { name: true, schoolCode: true },
        },
        zone: {
          select: {
            name: true,
            zoneType: { select: { name: true, level: true } },
          },
        },
      },
    });

    if (!row) {
      throw new GovernanceNoticeError(404, "INTERVENTION_CASE_NOT_FOUND");
    }

    const schoolLabel = row.tenant
      ? `${row.tenant.name}${row.tenant.schoolCode ? ` (${row.tenant.schoolCode})` : ""}`
      : "";

    const zoneLabel = row.zone
      ? `${row.zone.name} ${row.zone.zoneType.name}`
      : "";

    return {
      caseId: row.id,
      tenantId: row.tenantId ?? null,
      zoneId: row.zoneId ?? null,
      label: schoolLabel || zoneLabel || row.title,
    };
  }

  if (tenantId) {
    assertTenantInScope(scope, tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, schoolCode: true, zoneId: true },
    });

    if (!tenant) throw new GovernanceNoticeError(404, "SCHOOL_NOT_FOUND");

    return {
      caseId: null,
      tenantId: tenant.id,
      zoneId: tenant.zoneId ?? null,
      label: `${tenant.name}${tenant.schoolCode ? ` (${tenant.schoolCode})` : ""}`,
    };
  }

  if (zoneId) {
    assertZoneInScope(scope, zoneId);

    const zone = await prisma.adminZone.findUnique({
      where: { id: zoneId },
      select: {
        id: true,
        name: true,
        isActive: true,
        zoneType: { select: { name: true, level: true } },
      },
    });

    if (!zone || !zone.isActive) {
      throw new GovernanceNoticeError(404, "ZONE_NOT_FOUND");
    }

    return {
      caseId: null,
      tenantId: null,
      zoneId: zone.id,
      label: `${zone.name} ${zone.zoneType.name}`,
    };
  }

  throw new GovernanceNoticeError(400, "NOTICE_TARGET_REQUIRED");
}

function schoolRoleAllowed(roleName: string, requestedRoles: string[]) {
  const role = normKey(roleName);
  const requested = requestedRoles.map(normKey);

  if (!requested.length) {
    return role === "HEADTEACHER" || role === "HEADMASTER";
  }

  const expanded = new Set<string>();

  for (const r of requested) {
    if (r === "HEADTEACHER" || r === "HEADMASTER") {
      expanded.add("HEADTEACHER");
      expanded.add("HEADMASTER");
    }

    if (r === "SCHOOLADMIN" || r === "ADMIN") {
      expanded.add("SCHOOLADMIN");
      expanded.add("ADMIN");
      expanded.add("SUPERADMIN");
    }

    if (r === "TEACHER") expanded.add("TEACHER");

    if (r === "ALLSCHOOLSTAFF" || r === "STAFF") {
      expanded.add("HEADTEACHER");
      expanded.add("HEADMASTER");
      expanded.add("SCHOOLADMIN");
      expanded.add("ADMIN");
      expanded.add("TEACHER");
    }
  }

  return expanded.has(role);
}

function governanceRoleAllowed(role: string, requestedRoles: string[]) {
  const v = upper(role);
  const requested = requestedRoles.map(upper);

  if (!requested.length) return false;

  if (requested.includes("GOVERNANCE_OFFICERS")) return true;

  const allowed = Object.values(GovernanceOfficerRole) as string[];
  return allowed.includes(v) && requested.includes(v);
}

async function explicitRecipients(input: SendNoticeInput): Promise<NormalizedRecipient[]> {
  const raw = Array.isArray(input.recipients) ? input.recipients : [];

  const items = raw
    .filter((r): r is ExplicitRecipientInput => !!r && typeof r === "object")
    .map((r) => ({
      recipientUserId: clean(r.recipientUserId) || null,
      tenantId: clean(r.tenantId) || null,
      recipientType: normalizeRecipientType(r.recipientType),
      displayName: clean(r.displayName) || null,
      roleLabel: clean(r.roleLabel) || null,
      phone: clean(r.phone) || null,
      email: clean(r.email) || null,
      metadata: jsonObject(r.metadata),
    }));

  const userIds = Array.from(
    new Set(items.map((r) => r.recipientUserId).filter(Boolean) as string[])
  );

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      })
    : [];

  const userMap = new Map(users.map((u) => [u.id, u]));

  return items.map((r) => {
    const user = r.recipientUserId ? userMap.get(r.recipientUserId) : null;

    return {
      ...r,
      displayName: r.displayName || (user ? displayName(user) : null),
      email: r.email || user?.email || null,
      phone: r.phone || user?.phone || null,
    };
  });
}

async function schoolRoleRecipients(
  target: NoticeTarget,
  requestedRoles: string[]
): Promise<NormalizedRecipient[]> {
  if (!target.tenantId) return [];

  const memberships = await prisma.membership.findMany({
    where: {
      tenantId: target.tenantId,
      status: "ACTIVE",
    },
    select: {
      tenantId: true,
      role: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships
    .filter((m) => schoolRoleAllowed(m.role?.name ?? "", requestedRoles))
    .map((m): NormalizedRecipient => {
      const roleName = clean(m.role?.name) || "School staff";

      return {
        recipientUserId: m.user.id,
        tenantId: m.tenantId,
        recipientType:
          normKey(roleName) === "TEACHER"
            ? GovernanceOfficialNoticeRecipientType.TEACHER
            : normKey(roleName) === "HEADTEACHER" || normKey(roleName) === "HEADMASTER"
              ? GovernanceOfficialNoticeRecipientType.HEADTEACHER
              : GovernanceOfficialNoticeRecipientType.SCHOOL_ADMIN,
        displayName: displayName(m.user),
        roleLabel: roleName,
        phone: m.user.phone ?? null,
        email: m.user.email ?? null,
        metadata: jsonObject({
          source: "membership-role",
          roleName,
        }),
      };
    });
}

async function governanceOfficerRecipients(
  target: NoticeTarget,
  requestedRoles: string[]
): Promise<NormalizedRecipient[]> {
  if (!target.zoneId) return [];

  const shouldLoad = requestedRoles.some((r) => {
    const v = upper(r);
    return (
      v === "GOVERNANCE_OFFICERS" ||
      (Object.values(GovernanceOfficerRole) as string[]).includes(v)
    );
  });

  if (!shouldLoad) return [];

  const assignments = await prisma.governanceOfficerAssignment.findMany({
    where: {
      zoneId: target.zoneId,
      status: "ACTIVE",
      revokedAt: null,
    },
    select: {
      role: true,
      phone: true,
      title: true,
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      zone: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return assignments
    .filter((a) => governanceRoleAllowed(String(a.role), requestedRoles))
    .map((a): NormalizedRecipient => ({
      recipientUserId: a.user.id,
      tenantId: null,
      recipientType: GovernanceOfficialNoticeRecipientType.GOVERNANCE_OFFICER,
      displayName: displayName(a.user),
      roleLabel: clean(a.title) || String(a.role),
      phone: clean(a.phone) || a.user.phone || null,
      email: a.user.email ?? null,
      metadata: jsonObject({
        source: "governance-assignment",
        role: String(a.role),
        zoneName: a.zone.name,
      }),
    }));
}

async function resolveRecipients(
  target: NoticeTarget,
  input: SendNoticeInput
): Promise<NormalizedRecipient[]> {
  const explicit = await explicitRecipients(input);
  const requestedRoles = targetRolesArray(input.targetRoles);

  const schoolRoles =
    requestedRoles.length || target.tenantId
      ? await schoolRoleRecipients(target, requestedRoles)
      : [];

  const governanceRoles =
    requestedRoles.length && target.zoneId
      ? await governanceOfficerRecipients(target, requestedRoles)
      : [];

  const merged = [...explicit, ...schoolRoles, ...governanceRoles];

  const deduped = new Map<string, NormalizedRecipient>();
  for (const r of merged) {
    const key = recipientKey(r);
    if (!deduped.has(key)) deduped.set(key, r);
  }

  const recipients = Array.from(deduped.values());

  if (!recipients.length) {
    throw new GovernanceNoticeError(400, "NO_NOTICE_RECIPIENTS");
  }

  return recipients;
}

function buildAudienceSummary(recipients: NormalizedRecipient[]) {
  const counts = new Map<string, number>();

  for (const r of recipients) {
    const label = r.roleLabel || r.recipientType;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => `${label}: ${count}`)
    .join("; ");
}

function deliveryToAddress(
  channel: GovernanceOfficialNoticeChannel,
  recipient: NormalizedRecipient
) {
  if (channel === GovernanceOfficialNoticeChannel.SMS) return recipient.phone;
  if (channel === GovernanceOfficialNoticeChannel.EMAIL) return recipient.email;
  return null;
}

function initialDeliveryStatus(
  channel: GovernanceOfficialNoticeChannel,
  recipient: NormalizedRecipient
) {
  if (channel === GovernanceOfficialNoticeChannel.IN_APP) {
    return GovernanceOfficialNoticeDeliveryStatus.SENT;
  }

  if (channel === GovernanceOfficialNoticeChannel.SMS && !recipient.phone) {
    return GovernanceOfficialNoticeDeliveryStatus.SKIPPED;
  }

  if (channel === GovernanceOfficialNoticeChannel.EMAIL && !recipient.email) {
    return GovernanceOfficialNoticeDeliveryStatus.SKIPPED;
  }

  return GovernanceOfficialNoticeDeliveryStatus.PENDING;
}

function initialDeliveryDescription(
  channel: GovernanceOfficialNoticeChannel,
  recipient: NormalizedRecipient
) {
  if (channel === GovernanceOfficialNoticeChannel.IN_APP) return "IN_APP_VISIBLE";
  if (channel === GovernanceOfficialNoticeChannel.SMS && !recipient.phone) return "NO_PHONE";
  if (channel === GovernanceOfficialNoticeChannel.EMAIL && !recipient.email) return "NO_EMAIL";
  return null;
}

function buildSmsBody(args: { noticeId: string; title: string; body: string }) {
  const ref = args.noticeId.slice(-8).toUpperCase();
  return truncate(
    smsSafe(`EduLife OS Official Notice: ${args.title}. ${args.body} Ref: ${ref}`),
    480
  );
}

function buildEmailText(args: {
  noticeId: string;
  title: string;
  body: string;
  senderName?: string | null;
}) {
  const ref = args.noticeId.slice(-8).toUpperCase();

  return [
    "EduLife OS Official Governance Notice",
    "",
    `Title: ${args.title}`,
    "",
    args.body,
    "",
    `Reference: ${ref}`,
    args.senderName ? `Sent by: ${args.senderName}` : "",
    "",
    "Please sign in to EduLife OS to read and acknowledge this notice where required.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const noticeSelect = {
  id: true,
  caseId: true,
  tenantId: true,
  zoneId: true,
  senderUserId: true,
  title: true,
  body: true,
  priority: true,
  status: true,
  channels: true,
  audienceSummary: true,
  metadata: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
  sender: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  case: {
    select: {
      id: true,
      title: true,
      status: true,
      tenantId: true,
      zoneId: true,
    },
  },
  tenant: {
    select: {
      id: true,
      name: true,
      schoolCode: true,
    },
  },
  zone: {
    select: {
      id: true,
      name: true,
      zoneType: {
        select: {
          name: true,
          level: true,
        },
      },
    },
  },
  recipients: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      tenantId: true,
      recipientUserId: true,
      recipientType: true,
      displayName: true,
      roleLabel: true,
      phone: true,
      email: true,
      inAppVisible: true,
      readAt: true,
      acknowledgedAt: true,
      acknowledgeNote: true,
      respondedAt: true,
      createdAt: true,
      deliveries: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          channel: true,
          status: true,
          toAddress: true,
          provider: true,
          providerMessageId: true,
          providerStatus: true,
          providerStatusDescription: true,
          attempts: true,
          lastError: true,
          lastAttemptAt: true,
          sentAt: true,
          deliveredAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.GovernanceOfficialNoticeSelect;

async function refreshNoticeStatus(noticeId: string) {
  const deliveries = await prisma.governanceOfficialNoticeDelivery.findMany({
    where: { noticeId },
    select: { status: true },
  });

  const hasPending = deliveries.some(
    (d) => d.status === GovernanceOfficialNoticeDeliveryStatus.PENDING
  );

  const sentCount = deliveries.filter(
    (d) => d.status === GovernanceOfficialNoticeDeliveryStatus.SENT
  ).length;

  const failedOrSkippedCount = deliveries.filter(
    (d) =>
      d.status === GovernanceOfficialNoticeDeliveryStatus.FAILED ||
      d.status === GovernanceOfficialNoticeDeliveryStatus.SKIPPED
  ).length;

  let nextStatus: GovernanceOfficialNoticeStatus =
    GovernanceOfficialNoticeStatus.QUEUED;

  if (!hasPending) {
    if (sentCount > 0 && failedOrSkippedCount > 0) {
      nextStatus = GovernanceOfficialNoticeStatus.PARTIALLY_FAILED;
    } else if (sentCount > 0) {
      nextStatus = GovernanceOfficialNoticeStatus.SENT;
    } else {
      nextStatus = GovernanceOfficialNoticeStatus.FAILED;
    }
  }

  const updateData: Prisma.GovernanceOfficialNoticeUpdateInput = {
    status: nextStatus,
  };

  if (
    nextStatus === GovernanceOfficialNoticeStatus.SENT ||
    nextStatus === GovernanceOfficialNoticeStatus.PARTIALLY_FAILED
  ) {
    updateData.sentAt = new Date();
  }

  await prisma.governanceOfficialNotice.update({
    where: { id: noticeId },
    data: updateData,
  });
}

async function dispatchNoticeDeliveries(noticeId: string, actorUserId: string) {
  const pending = await prisma.governanceOfficialNoticeDelivery.findMany({
    where: {
      noticeId,
      status: GovernanceOfficialNoticeDeliveryStatus.PENDING,
    },
    select: {
      id: true,
      channel: true,
      toAddress: true,
      notice: {
        select: {
          id: true,
          title: true,
          body: true,
          tenantId: true,
          sender: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      recipient: {
        select: {
          id: true,
          tenantId: true,
          displayName: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  for (const delivery of pending) {
    const now = new Date();

    if (delivery.channel === GovernanceOfficialNoticeChannel.SMS) {
      try {
        const result = await sendViaHubtel({
          to: delivery.toAddress ?? "",
          body: buildSmsBody({
            noticeId: delivery.notice.id,
            title: delivery.notice.title,
            body: delivery.notice.body,
          }),
          tenantId: delivery.recipient.tenantId ?? delivery.notice.tenantId ?? undefined,
          actorId: actorUserId,
          meta: {
            source: "governance-official-notice",
            noticeId: delivery.notice.id,
            recipientId: delivery.recipient.id,
            deliveryId: delivery.id,
          },
        });

        await prisma.governanceOfficialNoticeDelivery.update({
          where: { id: delivery.id },
          data: {
            status: result.ok
              ? GovernanceOfficialNoticeDeliveryStatus.SENT
              : GovernanceOfficialNoticeDeliveryStatus.FAILED,
            provider: "HUBTEL",
            providerMessageId: result.providerMessageId ?? null,
            providerStatus:
              typeof result.providerStatus === "number"
                ? result.providerStatus
                : result.httpStatus ?? null,
            providerStatusDescription: result.providerStatusDescription ?? null,
            providerRaw: jsonValue(result.providerResponse ?? {}, {}),
            attempts: { increment: 1 },
            lastError: result.ok ? null : result.error ?? "SMS_NOT_ACCEPTED",
            lastAttemptAt: now,
            sentAt: result.ok ? now : null,
          },
        });
      } catch (err) {
        await prisma.governanceOfficialNoticeDelivery.update({
          where: { id: delivery.id },
          data: {
            status: GovernanceOfficialNoticeDeliveryStatus.FAILED,
            provider: "HUBTEL",
            attempts: { increment: 1 },
            lastError: err instanceof Error ? err.message : String(err),
            lastAttemptAt: now,
            providerStatusDescription: "SMS_SEND_FAILED",
            providerRaw: jsonObject({
              error: err instanceof Error ? err.message : String(err),
            }),
          },
        });
      }
    }

    if (delivery.channel === GovernanceOfficialNoticeChannel.EMAIL) {
      try {
        const result = await sendEmail({
          to: delivery.toAddress ?? "",
          subject: `EduLife OS Official Notice: ${delivery.notice.title}`,
          text: buildEmailText({
            noticeId: delivery.notice.id,
            title: delivery.notice.title,
            body: delivery.notice.body,
            senderName: delivery.notice.sender?.name ?? delivery.notice.sender?.email ?? null,
          }),
          meta: {
            source: "governance-official-notice",
            noticeId: delivery.notice.id,
            recipientId: delivery.recipient.id,
            deliveryId: delivery.id,
          },
        });

        await prisma.governanceOfficialNoticeDelivery.update({
          where: { id: delivery.id },
          data: {
            status: result.ok
              ? GovernanceOfficialNoticeDeliveryStatus.SENT
              : GovernanceOfficialNoticeDeliveryStatus.FAILED,
            provider: result.provider,
            providerRaw: jsonValue(result.providerResponse ?? {}, {}),
            attempts: { increment: 1 },
            lastError: result.ok ? null : result.error ?? "EMAIL_NOT_ACCEPTED",
            lastAttemptAt: now,
            sentAt: result.ok ? now : null,
            providerStatusDescription: result.ok ? "EMAIL_SENT" : result.error ?? "EMAIL_FAILED",
          },
        });
      } catch (err) {
        await prisma.governanceOfficialNoticeDelivery.update({
          where: { id: delivery.id },
          data: {
            status: GovernanceOfficialNoticeDeliveryStatus.FAILED,
            provider: "RESEND",
            attempts: { increment: 1 },
            lastError: err instanceof Error ? err.message : String(err),
            lastAttemptAt: now,
            providerStatusDescription: "EMAIL_SEND_FAILED",
            providerRaw: jsonObject({
              error: err instanceof Error ? err.message : String(err),
            }),
          },
        });
      }
    }
  }

  await refreshNoticeStatus(noticeId);
}

export async function sendGovernanceOfficialNotice(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: SendNoticeInput;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const { scope, actorUserId, input } = args;

  const target = await resolveNoticeTarget(scope, input);
  const recipients = await resolveRecipients(target, input);
  const channels = normalizeChannels(input.channels);

  const title = clean(input.title);
  const body = clean(input.body);
  const priority = normalizePriority(input.priority);

  if (title.length < 6) {
    throw new GovernanceNoticeError(400, "NOTICE_TITLE_TOO_SHORT");
  }

  if (body.length < 10) {
    throw new GovernanceNoticeError(400, "NOTICE_BODY_TOO_SHORT");
  }

  const audienceSummary = buildAudienceSummary(recipients);
  const allowDuplicate = boolish(input.allowDuplicate);

  const metadataInput = inputObject(input.metadata);
  const idempotencyKey = buildNoticeIdempotencyKey({
    input,
    target,
    recipients,
    channels,
    title,
    body,
    priority,
  });

  const txResult = await prisma.$transaction(async (tx) => {
    // Bank-grade no-schema concurrency guard:
    // prevents two near-simultaneous requests with the same key from both dispatching SMS/email.
    await tx.$queryRaw`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;

    if (!allowDuplicate) {
      const candidates = await tx.governanceOfficialNotice.findMany({
        where: {
          caseId: target.caseId,
          tenantId: target.tenantId,
          zoneId: target.zoneId,
          title,
          body,
          audienceSummary,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: noticeSelect,
      });

      const existing = candidates.find(
        (notice) => metadataIdempotencyKey(notice.metadata) === idempotencyKey
      );

      if (existing) {
        return {
          reused: true,
          noticeId: existing.id,
          notice: existing,
        };
      }
    }

    const notice = await tx.governanceOfficialNotice.create({
      data: {
        caseId: target.caseId,
        tenantId: target.tenantId,
        zoneId: target.zoneId,
        senderUserId: actorUserId,
        title,
        body,
        priority,
        status: GovernanceOfficialNoticeStatus.QUEUED,
        channels: jsonArray(channels),
        audienceSummary,
        metadata: jsonObject({
          ...metadataInput,
          targetLabel: target.label,
          idempotencyKey,
          idempotencyScope: "sendGovernanceOfficialNotice:v1",
          allowDuplicate,
        }),
      },
      select: { id: true },
    });

    for (const recipient of recipients) {
      const row = await tx.governanceOfficialNoticeRecipient.create({
        data: {
          noticeId: notice.id,
          tenantId: recipient.tenantId,
          recipientUserId: recipient.recipientUserId,
          recipientType: recipient.recipientType,
          displayName: recipient.displayName,
          roleLabel: recipient.roleLabel,
          phone: recipient.phone,
          email: recipient.email,
          inAppVisible: channels.includes(GovernanceOfficialNoticeChannel.IN_APP),
          metadata: recipient.metadata,
        },
        select: { id: true },
      });

      for (const channel of channels) {
        const status = initialDeliveryStatus(channel, recipient);
        const description = initialDeliveryDescription(channel, recipient);
        const now = new Date();

        await tx.governanceOfficialNoticeDelivery.create({
          data: {
            noticeId: notice.id,
            recipientId: row.id,
            channel,
            status,
            toAddress: deliveryToAddress(channel, recipient),
            provider: channel === GovernanceOfficialNoticeChannel.IN_APP ? "EDULIFE_OS" : null,
            providerStatusDescription: description,
            attempts: channel === GovernanceOfficialNoticeChannel.IN_APP ? 1 : 0,
            lastAttemptAt: channel === GovernanceOfficialNoticeChannel.IN_APP ? now : null,
            sentAt: channel === GovernanceOfficialNoticeChannel.IN_APP ? now : null,
            providerRaw: jsonObject({
              source: "governance-official-notice",
              initialStatus: status,
              description,
              idempotencyKey,
            }),
          },
        });
      }
    }

    if (target.caseId) {
      await tx.governanceInterventionEvent.create({
        data: {
          caseId: target.caseId,
          actorUserId,
          eventType: GovernanceInterventionEventType.NOTICE_SENT,
          note: `Official notice sent: ${title}`,
          metadata: jsonObject({
            noticeId: notice.id,
            channels,
            recipientCount: recipients.length,
            audienceSummary,
            idempotencyKey,
          }),
        },
      });
    }

    return {
      reused: false,
      noticeId: notice.id,
      notice: null,
    };
  }, NOTICE_TX_OPTIONS);

  if (txResult.reused) {
    await writeAuditLog({
      action: "GOVERNANCE_OFFICIAL_NOTICE_SEND_DEDUPED",
      tenantId: target.tenantId ?? undefined,
      userId: actorUserId,
      resource: "GovernanceOfficialNotice",
      resourceId: txResult.noticeId,
      ip: args.ip,
      userAgent: args.userAgent,
      metadata: {
        caseId: target.caseId,
        zoneId: target.zoneId,
        channels,
        recipientCount: recipients.length,
        audienceSummary,
        idempotencyKey,
        duplicateSafe: true,
        message: "Duplicate official notice send suppressed; no SMS/email dispatched.",
      },
    });

    return {
      ...txResult.notice,
      reused: true,
      duplicateSafe: true,
      idempotencyKey,
    };
  }

  await dispatchNoticeDeliveries(txResult.noticeId, actorUserId);

  await writeAuditLog({
    action: "GOVERNANCE_OFFICIAL_NOTICE_SENT",
    tenantId: target.tenantId ?? undefined,
    userId: actorUserId,
    resource: "GovernanceOfficialNotice",
    resourceId: txResult.noticeId,
    ip: args.ip,
    userAgent: args.userAgent,
    metadata: {
      caseId: target.caseId,
      zoneId: target.zoneId,
      channels,
      recipientCount: recipients.length,
      audienceSummary,
      idempotencyKey,
    },
  });

  const fresh = await prisma.governanceOfficialNotice.findUniqueOrThrow({
    where: { id: txResult.noticeId },
    select: noticeSelect,
  });

  return {
    ...fresh,
    reused: false,
    duplicateSafe: true,
    idempotencyKey,
  };
}

export async function listGovernanceNoticeInbox(args: {
  actorUserId: string;
  input: InboxInput;
}) {
  const takeRaw = intOrNull(args.input.take);
  const take = clamp(takeRaw ?? 50, 1, MAX_NOTICE_TAKE);

  const where: Prisma.GovernanceOfficialNoticeRecipientWhereInput = {
    recipientUserId: args.actorUserId,
    inAppVisible: true,
  };

  if (boolish(args.input.unreadOnly)) {
    where.readAt = null;
  }

  if (boolish(args.input.unacknowledgedOnly)) {
    where.acknowledgedAt = null;
  }

  return prisma.governanceOfficialNoticeRecipient.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      tenantId: true,
      recipientType: true,
      displayName: true,
      roleLabel: true,
      readAt: true,
      acknowledgedAt: true,
      acknowledgeNote: true,
      respondedAt: true,
      responseBody: true,
      createdAt: true,
      notice: {
        select: {
          id: true,
          caseId: true,
          tenantId: true,
          zoneId: true,
          title: true,
          body: true,
          priority: true,
          status: true,
          channels: true,
          audienceSummary: true,
          sentAt: true,
          createdAt: true,
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          case: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
              schoolCode: true,
            },
          },
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: {
                select: {
                  name: true,
                  level: true,
                },
              },
            },
          },
        },
      },
      deliveries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          channel: true,
          status: true,
          toAddress: true,
          provider: true,
          providerMessageId: true,
          providerStatus: true,
          providerStatusDescription: true,
          attempts: true,
          lastError: true,
          lastAttemptAt: true,
          sentAt: true,
          deliveredAt: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function acknowledgeGovernanceNotice(args: {
  actorUserId: string;
  input: AcknowledgeInput;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const recipientId = clean(args.input.recipientId);
  const noticeId = clean(args.input.noticeId);
  const note = clean(args.input.note);

  if (!recipientId && !noticeId) {
    throw new GovernanceNoticeError(400, "RECIPIENT_ID_OR_NOTICE_ID_REQUIRED");
  }

  const recipient = await prisma.governanceOfficialNoticeRecipient.findFirst({
    where: {
      recipientUserId: args.actorUserId,
      inAppVisible: true,
      ...(recipientId ? { id: recipientId } : { noticeId }),
    },
    select: {
      id: true,
      noticeId: true,
      tenantId: true,
      readAt: true,
      acknowledgedAt: true,
    },
  });

  if (!recipient) {
    throw new GovernanceNoticeError(404, "NOTICE_RECIPIENT_NOT_FOUND");
  }

  const now = new Date();

  const updated = await prisma.governanceOfficialNoticeRecipient.update({
    where: { id: recipient.id },
    data: {
      readAt: recipient.readAt ?? now,
      acknowledgedAt: recipient.acknowledgedAt ?? now,
      acknowledgeNote: note || null,
    },
    select: {
      id: true,
      tenantId: true,
      recipientType: true,
      displayName: true,
      roleLabel: true,
      readAt: true,
      acknowledgedAt: true,
      acknowledgeNote: true,
      notice: {
        select: {
          id: true,
          title: true,
          status: true,
          caseId: true,
          senderUserId: true,
        },
      },
      deliveries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          channel: true,
          status: true,
          provider: true,
          providerStatusDescription: true,
          sentAt: true,
        },
      },
    },
  });

  await writeAuditLog({
    action: "GOVERNANCE_OFFICIAL_NOTICE_ACKNOWLEDGED",
    tenantId: recipient.tenantId ?? undefined,
    userId: args.actorUserId,
    resource: "GovernanceOfficialNoticeRecipient",
    resourceId: recipient.id,
    ip: args.ip,
    userAgent: args.userAgent,
    metadata: {
      noticeId: recipient.noticeId,
      note: note || null,
    },
  });

  return updated;
}

export async function respondGovernanceNotice(args: {
  actorUserId: string;
  input: RespondNoticeInput;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const recipientId = clean(args.input.recipientId);
  const noticeId = clean(args.input.noticeId);
  const responseBody = clean(args.input.responseBody);

  if (!recipientId && !noticeId) {
    throw new GovernanceNoticeError(400, "RECIPIENT_ID_OR_NOTICE_ID_REQUIRED");
  }

  if (responseBody.length < 20) {
    throw new GovernanceNoticeError(400, "RESPONSE_BODY_TOO_SHORT");
  }

  const recipient = await prisma.governanceOfficialNoticeRecipient.findFirst({
    where: {
      recipientUserId: args.actorUserId,
      inAppVisible: true,
      ...(recipientId ? { id: recipientId } : { noticeId }),
    },
    select: {
      id: true,
      noticeId: true,
      tenantId: true,
      readAt: true,
      acknowledgedAt: true,
      respondedAt: true,
      notice: {
        select: {
          id: true,
          title: true,
          caseId: true,
          tenantId: true,
          zoneId: true,
        },
      },
    },
  });

  if (!recipient) {
    throw new GovernanceNoticeError(404, "NOTICE_RECIPIENT_NOT_FOUND");
  }

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.governanceOfficialNoticeRecipient.update({
      where: { id: recipient.id },
      data: {
        readAt: recipient.readAt ?? now,
        acknowledgedAt: recipient.acknowledgedAt ?? now,
        ...(recipient.acknowledgedAt
          ? {}
          : {
              acknowledgeNote:
                "Corrective response submitted; acknowledgement captured automatically.",
            }),
        respondedAt: now,
        responseBody,
      },
      select: {
        id: true,
        tenantId: true,
        recipientType: true,
        displayName: true,
        roleLabel: true,
        readAt: true,
        acknowledgedAt: true,
        acknowledgeNote: true,
        respondedAt: true,
        responseBody: true,
        notice: {
          select: {
            id: true,
            title: true,
            status: true,
            caseId: true,
            senderUserId: true,
          },
        },
        deliveries: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            channel: true,
            status: true,
            provider: true,
            providerStatusDescription: true,
            sentAt: true,
          },
        },
      },
    });

    if (recipient.notice.caseId) {
      await tx.governanceInterventionEvent.create({
        data: {
          caseId: recipient.notice.caseId,
          actorUserId: args.actorUserId,
          eventType: GovernanceInterventionEventType.COMMENT,
          note: `Corrective response submitted for official notice: ${recipient.notice.title}`,
          metadata: jsonObject({
            source: "governance-notice-response",
            noticeId: recipient.noticeId,
            recipientId: recipient.id,
            respondedAt: now.toISOString(),
            responseBody,
            extra: args.input.metadata,
          }),
        },
      });
    }

    return row;
  }, NOTICE_TX_OPTIONS);

  await writeAuditLog({
    action: "GOVERNANCE_OFFICIAL_NOTICE_RESPONDED",
    tenantId: recipient.tenantId ?? recipient.notice.tenantId ?? undefined,
    userId: args.actorUserId,
    resource: "GovernanceOfficialNoticeRecipient",
    resourceId: recipient.id,
    ip: args.ip,
    userAgent: args.userAgent,
    metadata: {
      noticeId: recipient.noticeId,
      caseId: recipient.notice.caseId,
      responseBody,
    },
  });

  return updated;
}

type SentNoticeMode = "mine" | "jurisdiction";

type SentNoticeInput = {
  caseId?: unknown;
  take?: unknown;
  mode?: unknown;
};

function normalizeSentNoticeMode(value: unknown): SentNoticeMode {
  const v = upper(value);
  return v === "JURISDICTION" ? "jurisdiction" : "mine";
}

function scopedNoticeWhere(scope: GovernanceScope): Prisma.GovernanceOfficialNoticeWhereInput {
  if (scope.isSuperAdmin) return {};

  return {
    OR: [
      {
        tenantId: {
          in: scope.tenantIds.length ? scope.tenantIds : ["__none__"],
        },
      },
      {
        zoneId: {
          in: scope.zoneIds.length ? scope.zoneIds : ["__none__"],
        },
      },
    ],
  };
}

export async function getGovernanceNoticeInboxSummary(args: {
  actorUserId: string;
}) {
  const where: Prisma.GovernanceOfficialNoticeRecipientWhereInput = {
    recipientUserId: args.actorUserId,
    inAppVisible: true,
  };

  const [total, unread, unacknowledged, latest] = await prisma.$transaction([
    prisma.governanceOfficialNoticeRecipient.count({
      where,
    }),

    prisma.governanceOfficialNoticeRecipient.count({
      where: {
        ...where,
        readAt: null,
      },
    }),

    prisma.governanceOfficialNoticeRecipient.count({
      where: {
        ...where,
        acknowledgedAt: null,
      },
    }),

    prisma.governanceOfficialNoticeRecipient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        readAt: true,
        acknowledgedAt: true,
        createdAt: true,
        notice: {
          select: {
            id: true,
            title: true,
            priority: true,
            status: true,
            sentAt: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            tenant: {
              select: {
                id: true,
                name: true,
                schoolCode: true,
              },
            },
            zone: {
              select: {
                id: true,
                name: true,
                zoneType: {
                  select: {
                    name: true,
                    level: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    total,
    unread,
    unacknowledged,
    acknowledged: Math.max(0, total - unacknowledged),
    latest,
  };
}

export async function listGovernanceSentNoticeAccountability(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: SentNoticeInput;
}) {
  const takeRaw = intOrNull(args.input.take);
  const take = clamp(takeRaw ?? 25, 1, MAX_NOTICE_TAKE);
  const caseId = clean(args.input.caseId);
  const mode = normalizeSentNoticeMode(args.input.mode);

  const andWhere: Prisma.GovernanceOfficialNoticeWhereInput[] = [
    scopedNoticeWhere(args.scope),
  ];

  // Default behavior remains "mine" to preserve existing B.5C.2 proof.
  // Jurisdiction mode allows officers to see notices inside their authorized scope.
  if (mode === "mine") {
    andWhere.push({ senderUserId: args.actorUserId });
  }

  if (caseId) {
    andWhere.push({ caseId });
  }

  const rows = await prisma.governanceOfficialNotice.findMany({
    where: {
      AND: andWhere,
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      caseId: true,
      tenantId: true,
      zoneId: true,
      senderUserId: true,
      title: true,
      body: true,
      priority: true,
      status: true,
      channels: true,
      audienceSummary: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      case: {
        select: {
          id: true,
          title: true,
          status: true,
          tenantId: true,
          zoneId: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
        },
      },
      zone: {
        select: {
          id: true,
          name: true,
          zoneType: {
            select: {
              name: true,
              level: true,
            },
          },
        },
      },
      recipients: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          recipientUserId: true,
          recipientType: true,
          displayName: true,
          roleLabel: true,
          phone: true,
          email: true,
          inAppVisible: true,
          readAt: true,
          acknowledgedAt: true,
acknowledgeNote: true,
respondedAt: true,
responseBody: true,
createdAt: true,
          deliveries: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              channel: true,
              status: true,
              toAddress: true,
              provider: true,
              attempts: true,
              lastError: true,
              sentAt: true,
              deliveredAt: true,
              createdAt: true,
            },
          },
        },
      },
      deliveries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          channel: true,
          status: true,
          provider: true,
          attempts: true,
          lastError: true,
          sentAt: true,
          deliveredAt: true,
          createdAt: true,
        },
      },
    },
  });

  return rows.map((row) => {
    const totalRecipients = row.recipients.length;
    const readRecipients = row.recipients.filter((r) => Boolean(r.readAt)).length;
    const acknowledgedRecipients = row.recipients.filter((r) =>
      Boolean(r.acknowledgedAt)
    ).length;

    const deliverySummary = row.deliveries.reduce<
      Record<
        string,
        {
          total: number;
          sent: number;
          failed: number;
          skipped: number;
          pending: number;
        }
      >
    >((acc, delivery) => {
      const channel = String(delivery.channel);
      const status = String(delivery.status).toUpperCase();

      if (!acc[channel]) {
        acc[channel] = {
          total: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          pending: 0,
        };
      }

      acc[channel].total += 1;

      if (status === "SENT") acc[channel].sent += 1;
      else if (status === "FAILED") acc[channel].failed += 1;
      else if (status === "SKIPPED") acc[channel].skipped += 1;
      else acc[channel].pending += 1;

      return acc;
    }, {});

    return {
      ...row,
      accountability: {
        mode,
        totalRecipients,
        readRecipients,
        unreadRecipients: Math.max(0, totalRecipients - readRecipients),
        acknowledgedRecipients,
        unacknowledgedRecipients: Math.max(
          0,
          totalRecipients - acknowledgedRecipients
        ),
        acknowledgementRate:
          totalRecipients > 0
            ? Math.round((acknowledgedRecipients / totalRecipients) * 100)
            : null,
        deliverySummary,
      },
    };
  });
}