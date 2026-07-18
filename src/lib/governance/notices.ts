// src/lib/governance/notices.ts
import { createHash } from "crypto";
import {
  GovernanceInterventionEventType,
  GovernanceInterventionPriority,
  GovernanceOfficialNoticeAttachmentMalwareScanStatus,
  GovernanceOfficialNoticeAttachmentScanStatus,
  GovernanceOfficialNoticeAttachmentStatus,
  GovernanceOfficialNoticeAudienceMode,
  GovernanceOfficialNoticeChannel,
  GovernanceOfficialNoticeDeliveryStatus,
  GovernanceOfficialNoticeRecipientType,
  GovernanceOfficialNoticeStatus,
  GovernanceOfficerRole,
  Prisma,
  SchoolSector,
  TenantStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GovernanceScope } from "@/lib/governance/scope";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { sendEmail } from "@/lib/email/sendEmail";
import { writeAuditLog } from "@/lib/audit";
import {
  GovernanceNoticeRecipientSelectionError,
  resolveGovernanceSelectedRecipients,
  type ResolvedGovernanceSelectedRecipient,
} from "@/lib/governance/noticeRecipientSelection";

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

  /**
   * Server-verifiable membership/assignment references returned by the
   * authorized recipient search and preview endpoints.
   */
  selectionIds?: unknown;

  /**
   * Private attachment records initialized, uploaded, verified, and inspected
   * through the governance attachment API. Browser-supplied object keys or
   * storage URLs are never accepted here.
   */
  attachmentIds?: unknown;

  metadata?: unknown;

  /**
   * DB-backed duplicate protection.
   * Normal SISSO/Director official intervention notices must reuse this key.
   */
  idempotencyKey?: unknown;

  /**
   * Human-readable category for analytics and indexes.
   */
  idempotencyScope?: unknown;

  /**
   * Reserved for intentional reminder/escalation flows.
   * Normal official notice sends should not set this.
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

type ResolvedNoticeAttachment = {
  id: string;
  noticeId: string | null;
  tenantId: string | null;
  zoneId: string | null;
  uploadedByUserId: string;
  displayFilename: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string;
  confidential: boolean;
  recipientVisible: boolean;
  status: GovernanceOfficialNoticeAttachmentStatus;
  scanStatus: GovernanceOfficialNoticeAttachmentScanStatus;
};

type ResolvedNoticeAttachmentSet = {
  items: ResolvedNoticeAttachment[];
  sealedNoticeId: string | null;
};

type NoticeSectorTarget = "PUBLIC" | "PRIVATE" | "ALL_AUTHORIZED";

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

function normalizeNoticeSectorTarget(input: SendNoticeInput): NoticeSectorTarget {
  const metadata = inputObject(input.metadata);

  const raw = upper(
    metadata.governanceSectorTarget ??
      metadata.schoolSectorTarget ??
      metadata.sectorTarget
  );

  if (raw === "PRIVATE") return "PRIVATE";
  if (raw === "PUBLIC") return "PUBLIC";
  if (raw === "ALL" || raw === "ALL_AUTHORIZED" || raw === "AUTHORIZED") {
    return "ALL_AUTHORIZED";
  }

  // Bank-grade default:
  // Ordinary official command must not silently include private schools.
  return isOfficialCommunicationInput(input) ? "PUBLIC" : "ALL_AUTHORIZED";
}

function noticeSectorAllowsTenant(
  tenantSector: SchoolSector | null | undefined,
  sectorTarget: NoticeSectorTarget
) {
  if (sectorTarget === "ALL_AUTHORIZED") return true;
  if (sectorTarget === "PUBLIC") return tenantSector === SchoolSector.PUBLIC;
  if (sectorTarget === "PRIVATE") return tenantSector === SchoolSector.PRIVATE;
  return false;
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

function normalizeIntentText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeNoticeIdempotencyScope(value: unknown) {
  const v = upper(value);
  if (v) return v.slice(0, 80);
  return "OFFICIAL_INTERVENTION_NOTICE";
}

function buildNoticeIdempotencyKey(args: {
  input: SendNoticeInput;
  target: NoticeTarget;
  recipients: NormalizedRecipient[];
  attachments: ResolvedNoticeAttachment[];
  channels: GovernanceOfficialNoticeChannel[];
  title: string;
  body: string;
  priority: GovernanceInterventionPriority;
}) {
  const explicit = clean(args.input.idempotencyKey);
  if (explicit) return explicit.slice(0, 220);

  const metadata = inputObject(args.input.metadata);
  const metadataKey = clean(metadata.idempotencyKey);
  if (metadataKey) return metadataKey.slice(0, 220);

  const roles = targetRolesArray(args.input.targetRoles).map(normKey).sort();

  // For ordinary official intervention notices, caseId gives the strongest operational lock:
  // one official HEADTEACHER intervention notice per case.
  if (
    args.target.caseId &&
    roles.includes("HEADTEACHER") &&
    normalizeIntentText(args.title).startsWith("official intervention notice:")
  ) {
    return `governance-notice:case:${args.target.caseId}:official-intervention:HEADTEACHER:v1`.slice(
      0,
      220
    );
  }

  const audienceMode = noticeAudienceMode(args.input);

  const payload = {
    version:
      audienceMode === GovernanceOfficialNoticeAudienceMode.INDIVIDUALS
        ? "governance-official-notice-v2"
        : "governance-official-notice-v1",
    caseId: args.target.caseId,
    tenantId: args.target.tenantId,
    zoneId: args.target.zoneId,
    title: normalizeIntentText(args.title),
    body: normalizeIntentText(args.body),
    priority: args.priority,
    channels: args.channels.map(String).sort(),
    ...(audienceMode ===
    GovernanceOfficialNoticeAudienceMode.INDIVIDUALS
      ? { audienceMode }
      : {}),
    targetRoles: roles,
    recipients: args.recipients.map((r) => recipientKey(r)).sort(),
    attachments: noticeAttachmentManifest(args.attachments),
  };

  return `gov-notice:${sha256(stableStringify(payload))}`.slice(0, 220);
}

function officialNoticeRefFromId(noticeId: string) {
  return `GOV-${noticeId.slice(-8).toUpperCase()}`;
}

function noticeFingerprintVersion(
  audienceMode: GovernanceOfficialNoticeAudienceMode,
  attachmentCount = 0
) {
  if (attachmentCount > 0) {
    return "governance-official-notice-authenticity-v3";
  }

  return audienceMode ===
    GovernanceOfficialNoticeAudienceMode.INDIVIDUALS
    ? "governance-official-notice-authenticity-v2"
    : "governance-official-notice-authenticity-v1";
}

function buildNoticeAuthenticityFingerprint(args: {
  senderUserId: string;
  target: NoticeTarget;
  recipients: NormalizedRecipient[];
  attachments: ResolvedNoticeAttachment[];
  channels: GovernanceOfficialNoticeChannel[];
  title: string;
  body: string;
  priority: GovernanceInterventionPriority;
  audienceMode: GovernanceOfficialNoticeAudienceMode;
}) {
  return sha256(
    stableStringify({
      version: noticeFingerprintVersion(
        args.audienceMode,
        args.attachments.length
      ),
      senderUserId: args.senderUserId,
      caseId: args.target.caseId,
      tenantId: args.target.tenantId,
      zoneId: args.target.zoneId,
      title: normalizeIntentText(args.title),
      body: normalizeIntentText(args.body),
      priority: args.priority,
      ...(args.audienceMode ===
      GovernanceOfficialNoticeAudienceMode.INDIVIDUALS
        ? { audienceMode: args.audienceMode }
        : {}),
      channels: args.channels.map(String).sort(),
      recipients: args.recipients.map((r) => recipientKey(r)).sort(),
      attachments: noticeAttachmentManifest(args.attachments),
    })
  );
}

function metadataStringValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function metadataBooleanValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return (metadata as Record<string, unknown>)[key] === true;
}

type NoticeActionRequirement = {
  noticeKind:
    | "INFORMATION_ONLY"
    | "ACKNOWLEDGEMENT_REQUIRED"
    | "RESPONSE_REQUIRED"
    | "URGENT_DIRECTIVE"
    | "LEGACY_INTERVENTION";
  requiresAcknowledgement: boolean;
  requiresResponse: boolean;
};

function noticeActionRequirement(args: {
  metadata: unknown;
  caseId?: string | null;
  title?: string | null;
}): NoticeActionRequirement {
  const rawKind = upper(metadataStringValue(args.metadata, "noticeKind"));
  const hasAckFlag =
    !!args.metadata &&
    typeof args.metadata === "object" &&
    !Array.isArray(args.metadata) &&
    Object.prototype.hasOwnProperty.call(args.metadata, "requiresAcknowledgement");

  const hasResponseFlag =
    !!args.metadata &&
    typeof args.metadata === "object" &&
    !Array.isArray(args.metadata) &&
    Object.prototype.hasOwnProperty.call(args.metadata, "requiresResponse");

  const ackFlag = metadataBooleanValue(args.metadata, "requiresAcknowledgement");
  const responseFlag = metadataBooleanValue(args.metadata, "requiresResponse");

  if (rawKind === "INFORMATION_ONLY") {
    return {
      noticeKind: "INFORMATION_ONLY",
      requiresAcknowledgement: false,
      requiresResponse: false,
    };
  }

  if (rawKind === "ACKNOWLEDGEMENT_REQUIRED") {
    return {
      noticeKind: "ACKNOWLEDGEMENT_REQUIRED",
      requiresAcknowledgement: true,
      requiresResponse: false,
    };
  }

  if (rawKind === "RESPONSE_REQUIRED") {
    return {
      noticeKind: "RESPONSE_REQUIRED",
      requiresAcknowledgement: true,
      requiresResponse: true,
    };
  }

  if (rawKind === "URGENT_DIRECTIVE") {
    return {
      noticeKind: "URGENT_DIRECTIVE",
      requiresAcknowledgement: true,
      requiresResponse: true,
    };
  }

  if (hasAckFlag || hasResponseFlag) {
    return {
      noticeKind: responseFlag
        ? "RESPONSE_REQUIRED"
        : ackFlag
          ? "ACKNOWLEDGEMENT_REQUIRED"
          : "INFORMATION_ONLY",
      requiresAcknowledgement: ackFlag || responseFlag,
      requiresResponse: responseFlag,
    };
  }

  const title = normalizeIntentText(args.title ?? "");

  if (
    args.caseId ||
    title.startsWith("official intervention notice:") ||
    title.includes("intervention")
  ) {
    return {
      noticeKind: "LEGACY_INTERVENTION",
      requiresAcknowledgement: true,
      requiresResponse: true,
    };
  }

    return {
    noticeKind: "INFORMATION_ONLY",
    requiresAcknowledgement: false,
    requiresResponse: false,
  };
}

function noticePortalActionText(
  requirement: NoticeActionRequirement
) {
  if (requirement.noticeKind === "URGENT_DIRECTIVE") {
    return "view, take urgent action, and respond";
  }

  if (requirement.requiresResponse) {
    return "view and respond";
  }

  if (requirement.requiresAcknowledgement) {
    return "view and acknowledge";
  }

  return "view this official notice";
}

function isUniqueConstraintError(err: unknown) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  );
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

function selectedRecipientIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item)).filter(Boolean);
}

function hasSelectedRecipientInput(input: SendNoticeInput) {
  return selectedRecipientIds(input.selectionIds).length > 0;
}

function noticeAudienceMode(
  input: SendNoticeInput
): GovernanceOfficialNoticeAudienceMode {
  return hasSelectedRecipientInput(input)
    ? GovernanceOfficialNoticeAudienceMode.INDIVIDUALS
    : GovernanceOfficialNoticeAudienceMode.ROLE_SCOPE;
}

function noticeAttachmentIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new GovernanceNoticeError(
      400,
      "NOTICE_ATTACHMENT_IDS_MUST_BE_AN_ARRAY"
    );
  }

  const ids = value.map((item) => clean(item)).filter(Boolean);

  if (ids.length > 3) {
    throw new GovernanceNoticeError(
      400,
      "NOTICE_ATTACHMENT_LIMIT_EXCEEDED"
    );
  }

  if (new Set(ids).size !== ids.length) {
    throw new GovernanceNoticeError(
      409,
      "DUPLICATE_NOTICE_ATTACHMENT_ID"
    );
  }

  return ids;
}

function noticeAttachmentManifest(
  attachments: ResolvedNoticeAttachment[]
) {
  return attachments
    .map((attachment) => ({
      id: attachment.id,
      sha256Hash: attachment.sha256Hash,
      sizeBytes: attachment.sizeBytes,
      mimeType: attachment.mimeType,
      recipientVisible: attachment.recipientVisible,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function noticeAttachmentManifestHash(
  attachments: ResolvedNoticeAttachment[]
) {
  return sha256(
    stableStringify(noticeAttachmentManifest(attachments))
  );
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

function scopeRoleKeys(scope: GovernanceScope) {
  return new Set(scope.assignments.map((a) => upper(a.role)));
}

function isOfficialCommunicationInput(input: SendNoticeInput) {
  const metadata = inputObject(input.metadata);
  const source = upper(metadata.source);
  const noticeIntent = upper(metadata.noticeIntent);
  const idempotencyScope = upper(input.idempotencyScope ?? metadata.idempotencyScope);

  return (
    source === "B7-OFFICIAL-GOVERNANCE-COMMUNICATION" ||
    source === "OFFICIAL-GOVERNANCE-COMMUNICATION" ||
    noticeIntent === "OFFICIAL_COMMUNICATION" ||
    noticeIntent === "GOVERNANCE_OFFICIAL_COMMUNICATION" ||
    idempotencyScope.includes("OFFICIAL_COMMUNICATION")
  );
}

function normalizeB7TargetRole(value: unknown) {
  const role = normKey(value);

  if (role === "SISSOS") return "SISSO";
  if (role === "CIRCUITSUPERVISORS") return "CIRCUITSUPERVISOR";
  if (role === "CIRCUIT_SUPERVISOR") return "CIRCUITSUPERVISOR";
  if (role === "HEADTEACHERS") return "HEADTEACHER";
  if (role === "HEADMASTER") return "HEADTEACHER";
  if (role === "HEADMASTERS") return "HEADTEACHER";
  if (role === "TEACHERS") return "TEACHER";

  return role;
}

function b7RequestedRoleKeys(input: SendNoticeInput) {
  return targetRolesArray(input.targetRoles)
    .map(normalizeB7TargetRole)
    .filter(Boolean);
}

function hasExplicitRecipientInput(input: SendNoticeInput) {
  return Array.isArray(input.recipients) && input.recipients.length > 0;
}

function assertOfficialCommunicationAuthority(args: {
  scope: GovernanceScope;
  input: SendNoticeInput;
}) {
  const { scope, input } = args;

  if (!isOfficialCommunicationInput(input)) return;

  if (hasExplicitRecipientInput(input)) {
    throw new GovernanceNoticeError(
      403,
      "CUSTOM_RECIPIENTS_BLOCKED_FOR_OFFICIAL_COMMUNICATION"
    );
  }

  const roles = b7RequestedRoleKeys(input);
  const selectedMode = hasSelectedRecipientInput(input);

  if (selectedMode && roles.length) {
    throw new GovernanceNoticeError(
      400,
      "NOTICE_AUDIENCE_MODE_CONFLICT"
    );
  }

  const senderRoles = scopeRoleKeys(scope);

  const isDistrictDirector =
    scope.isSuperAdmin || senderRoles.has("DISTRICT_DIRECTOR");

  const isCircuitOfficer =
    scope.isSuperAdmin ||
    senderRoles.has("SISSO") ||
    senderRoles.has("CIRCUIT_SUPERVISOR");

  if (selectedMode) {
    if (isDistrictDirector || isCircuitOfficer) return;

    throw new GovernanceNoticeError(
      403,
      "OFFICIAL_COMMUNICATION_SENDER_FORBIDDEN"
    );
  }

  if (!roles.length) {
    throw new GovernanceNoticeError(
      400,
      "OFFICIAL_COMMUNICATION_TARGET_ROLES_REQUIRED"
    );
  }

  const districtAllowed = new Set([
    "SISSO",
    "CIRCUITSUPERVISOR",
    "HEADTEACHER",
    "TEACHER",
  ]);

  const circuitAllowed = new Set(["HEADTEACHER", "TEACHER"]);

  if (isDistrictDirector) {
    const invalid = roles.find((role) => !districtAllowed.has(role));
    if (invalid) {
      throw new GovernanceNoticeError(
        403,
        "DISTRICT_NOTICE_TARGET_ROLE_FORBIDDEN"
      );
    }

    return;
  }

  if (isCircuitOfficer) {
    const invalid = roles.find((role) => !circuitAllowed.has(role));
    if (invalid) {
      throw new GovernanceNoticeError(
        403,
        "CIRCUIT_NOTICE_TARGET_ROLE_FORBIDDEN"
      );
    }

    return;
  }

  throw new GovernanceNoticeError(
    403,
    "OFFICIAL_COMMUNICATION_SENDER_FORBIDDEN"
  );
}

async function collectNoticeDescendantZoneIds(seedZoneId: string) {
  const seen = new Set([seedZoneId].filter(Boolean));
  let frontier = Array.from(seen);

  for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
    const children = await prisma.adminZone.findMany({
      where: {
        parentZoneId: { in: frontier },
        isActive: true,
      },
      select: { id: true },
    });

    frontier = [];

    for (const child of children) {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        frontier.push(child.id);
      }
    }
  }

  return Array.from(seen);
}

async function noticeTargetZoneIds(target: NoticeTarget, scope: GovernanceScope) {
  if (!target.zoneId) return [];

  const descendants = await collectNoticeDescendantZoneIds(target.zoneId);

  if (scope.isSuperAdmin) return descendants;

  const allowed = new Set(scope.zoneIds);
  return descendants.filter((zoneId) => allowed.has(zoneId));
}

async function noticeTargetTenantIds(
  target: NoticeTarget,
  scope: GovernanceScope,
  sectorTarget: NoticeSectorTarget
) {
  if (target.tenantId) {
    assertTenantInScope(scope, target.tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: target.tenantId },
      select: {
        id: true,
        schoolSector: true,
        status: true,
      },
    });

    if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
      throw new GovernanceNoticeError(404, "SCHOOL_NOT_FOUND_OR_INACTIVE");
    }

    if (!noticeSectorAllowsTenant(tenant.schoolSector, sectorTarget)) {
      throw new GovernanceNoticeError(403, "SCHOOL_SECTOR_NOT_ALLOWED_FOR_NOTICE_TARGET");
    }

    return [tenant.id];
  }

  if (!target.zoneId) return [];

  const zoneIds = await noticeTargetZoneIds(target, scope);
  if (!zoneIds.length) return [];

  const where: Prisma.TenantWhereInput = {
    zoneId: { in: zoneIds },
    status: TenantStatus.ACTIVE,
  };

  if (sectorTarget === "PUBLIC") {
    where.schoolSector = SchoolSector.PUBLIC;
  }

  if (sectorTarget === "PRIVATE") {
    where.schoolSector = SchoolSector.PRIVATE;
  }

  if (!scope.isSuperAdmin) {
    where.id = { in: scope.tenantIds.length ? scope.tenantIds : ["__none__"] };
  }

  const tenants = await prisma.tenant.findMany({
    where,
    select: {
      id: true,
      schoolSector: true,
    },
    orderBy: { name: "asc" },
  });

  return tenants.map((tenant) => tenant.id);
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
  requestedRoles: string[],
  scope: GovernanceScope,
  sectorTarget: NoticeSectorTarget
): Promise<NormalizedRecipient[]> {
  const tenantIds = await noticeTargetTenantIds(target, scope, sectorTarget);
  if (!tenantIds.length) return [];

  const memberships = await prisma.membership.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: "ACTIVE",
    },
    select: {
      tenantId: true,
      role: { select: { name: true } },
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
          schoolSector: true,
          zoneId: true,
        },
      },
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
          tenantId: m.tenant.id,
          schoolName: m.tenant.name,
          schoolCode: m.tenant.schoolCode,
          schoolSector: m.tenant.schoolSector,
          governanceSectorTarget: sectorTarget,
          zoneId: m.tenant.zoneId,
        }),
      };
    });
}

async function governanceOfficerRecipients(
  target: NoticeTarget,
  requestedRoles: string[],
  scope: GovernanceScope
): Promise<NormalizedRecipient[]> {
  if (!target.zoneId) return [];

  const shouldLoad = requestedRoles.some((r) => {
    const v = upper(r);
    const normalized = normalizeB7TargetRole(v);

    return (
      v === "GOVERNANCE_OFFICERS" ||
      normalized === "SISSO" ||
      normalized === "CIRCUITSUPERVISOR" ||
      (Object.values(GovernanceOfficerRole) as string[]).includes(v)
    );
  });

  if (!shouldLoad) return [];

  const zoneIds = await noticeTargetZoneIds(target, scope);
  if (!zoneIds.length) return [];

  const assignments = await prisma.governanceOfficerAssignment.findMany({
    where: {
      zoneId: { in: zoneIds },
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
        zoneId: a.zone.id,
        zoneName: a.zone.name,
        zoneTypeName: a.zone.zoneType.name,
        zoneLevel: a.zone.zoneType.level,
      }),
    }));
}

function selectedRecipientToNormalized(
  recipient: ResolvedGovernanceSelectedRecipient
): NormalizedRecipient {
  return {
    recipientUserId: recipient.recipientUserId,
    tenantId: recipient.tenantId,
    recipientType: recipient.recipientType,
    displayName: recipient.displayName,
    roleLabel: recipient.roleLabel,
    phone: recipient.phone,
    email: recipient.email,
    metadata: recipient.metadata,
  };
}

async function assertSelectedRecipientsWithinTarget(args: {
  scope: GovernanceScope;
  target: NoticeTarget;
  recipients: ResolvedGovernanceSelectedRecipient[];
}) {
  const { scope, target, recipients } = args;

  if (target.tenantId) {
    const outsideSchool = recipients.find(
      (recipient) => recipient.tenantId !== target.tenantId
    );

    if (outsideSchool) {
      throw new GovernanceNoticeError(
        403,
        "SELECTED_RECIPIENT_OUTSIDE_NOTICE_TARGET"
      );
    }

    return;
  }

  if (target.zoneId) {
    const allowedZoneIds = new Set(
      await noticeTargetZoneIds(target, scope)
    );

    const outsideZone = recipients.find((recipient) => {
      const metadata = inputObject(recipient.metadata);
      const recipientZoneId = clean(metadata.zoneId);

      return !recipientZoneId || !allowedZoneIds.has(recipientZoneId);
    });

    if (outsideZone) {
      throw new GovernanceNoticeError(
        403,
        "SELECTED_RECIPIENT_OUTSIDE_NOTICE_TARGET"
      );
    }
  }
}

async function selectedRecipientsForNotice(args: {
  scope: GovernanceScope;
  target: NoticeTarget;
  input: SendNoticeInput;
  sectorTarget: NoticeSectorTarget;
}): Promise<NormalizedRecipient[]> {
  let selected: ResolvedGovernanceSelectedRecipient[];

  try {
    selected = await resolveGovernanceSelectedRecipients({
      scope: args.scope,
      selectionIds: args.input.selectionIds,
      sectorTarget: args.sectorTarget,
    });
  } catch (error) {
    if (error instanceof GovernanceNoticeRecipientSelectionError) {
      throw new GovernanceNoticeError(error.status, error.code);
    }

    throw error;
  }

  await assertSelectedRecipientsWithinTarget({
    scope: args.scope,
    target: args.target,
    recipients: selected,
  });

  return selected.map(selectedRecipientToNormalized);
}

async function resolveRecipients(args: {
  scope: GovernanceScope;
  target: NoticeTarget;
  input: SendNoticeInput;
}): Promise<NormalizedRecipient[]> {
  const { scope, target, input } = args;

  const strictOfficialCommunication = isOfficialCommunicationInput(input);
  const sectorTarget = normalizeNoticeSectorTarget(input);
  const requestedRoles = targetRolesArray(input.targetRoles);
  const selectedMode = hasSelectedRecipientInput(input);

  if (
    selectedMode &&
    (hasExplicitRecipientInput(input) || requestedRoles.length)
  ) {
    throw new GovernanceNoticeError(
      400,
      "NOTICE_AUDIENCE_MODE_CONFLICT"
    );
  }

  const selectedRecipients = selectedMode
    ? await selectedRecipientsForNotice({
        scope,
        target,
        input,
        sectorTarget,
      })
    : [];

  const explicit =
    selectedMode || strictOfficialCommunication
      ? []
      : await explicitRecipients(input);

  const schoolRoles =
    !selectedMode &&
    (requestedRoles.length || target.tenantId || target.zoneId)
      ? await schoolRoleRecipients(
          target,
          requestedRoles,
          scope,
          sectorTarget
        )
      : [];

  const governanceRoles =
    !selectedMode && requestedRoles.length && target.zoneId
      ? await governanceOfficerRecipients(
          target,
          requestedRoles,
          scope
        )
      : [];

  const merged = [
    ...selectedRecipients,
    ...explicit,
    ...schoolRoles,
    ...governanceRoles,
  ];

  const deduped = new Map<string, NormalizedRecipient>();
  for (const recipient of merged) {
    const key = recipientKey(recipient);
    if (!deduped.has(key)) deduped.set(key, recipient);
  }

  const recipients = Array.from(deduped.values());

  if (strictOfficialCommunication) {
    const custom = recipients.find(
      (recipient) =>
        recipient.recipientType ===
          GovernanceOfficialNoticeRecipientType.CUSTOM ||
        !recipient.recipientUserId
    );

    if (custom) {
      throw new GovernanceNoticeError(
        403,
        "CUSTOM_RECIPIENTS_BLOCKED_FOR_OFFICIAL_COMMUNICATION"
      );
    }
  }

  if (!recipients.length) {
    throw new GovernanceNoticeError(400, "NO_NOTICE_RECIPIENTS");
  }

  return recipients;
}

async function resolveNoticeAttachments(args: {
  scope: GovernanceScope;
  target: NoticeTarget;
  actorUserId: string;
  input: SendNoticeInput;
  sectorTarget: NoticeSectorTarget;
}): Promise<ResolvedNoticeAttachmentSet> {
  const ids = noticeAttachmentIds(args.input.attachmentIds);

  if (!ids.length) {
    return { items: [], sealedNoticeId: null };
  }

  const rows =
    await prisma.governanceOfficialNoticeAttachment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        noticeId: true,
        tenantId: true,
        zoneId: true,
        uploadedByUserId: true,
        displayFilename: true,
        extension: true,
        mimeType: true,
        sizeBytes: true,
        sha256Hash: true,
        confidential: true,
        recipientVisible: true,
                status: true,
        scanStatus: true,
        malwareScanStatus: true,
        sealedAt: true,
        rejectedAt: true,
        deletedAt: true,
      },
    });

  if (rows.length !== ids.length) {
    throw new GovernanceNoticeError(
      404,
      "NOTICE_ATTACHMENT_NOT_FOUND"
    );
  }

  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = ids.map((id) => rowMap.get(id));

  if (orderedRows.some((row) => !row)) {
    throw new GovernanceNoticeError(
      404,
      "NOTICE_ATTACHMENT_NOT_FOUND"
    );
  }

  const allowedZoneIds = args.target.zoneId
    ? new Set(
        await noticeTargetZoneIds(args.target, args.scope)
      )
    : new Set<string>();

  const allowedTenantIds = args.target.zoneId
    ? new Set(
        await noticeTargetTenantIds(
          args.target,
          args.scope,
          args.sectorTarget
        )
      )
    : new Set<string>();

  const items: ResolvedNoticeAttachment[] = [];

  for (const row of orderedRows) {
    if (!row) continue;

    if (row.uploadedByUserId !== args.actorUserId) {
      throw new GovernanceNoticeError(
        403,
        "NOTICE_ATTACHMENT_UPLOAD_OWNER_MISMATCH"
      );
    }

    const scopeAllowed =
      args.scope.isSuperAdmin ||
      (Boolean(row.tenantId) &&
        args.scope.tenantIds.includes(row.tenantId as string)) ||
      (Boolean(row.zoneId) &&
        args.scope.zoneIds.includes(row.zoneId as string));

    if (!scopeAllowed) {
      throw new GovernanceNoticeError(
        403,
        "NOTICE_ATTACHMENT_OUT_OF_GOVERNANCE_SCOPE"
      );
    }

    if (args.target.tenantId) {
      if (row.tenantId !== args.target.tenantId) {
        throw new GovernanceNoticeError(
          403,
          "NOTICE_ATTACHMENT_OUTSIDE_NOTICE_TARGET"
        );
      }
    } else if (args.target.zoneId) {
      const insideTarget =
        (Boolean(row.tenantId) &&
          allowedTenantIds.has(row.tenantId as string)) ||
        (Boolean(row.zoneId) &&
          allowedZoneIds.has(row.zoneId as string));

      if (!insideTarget) {
        throw new GovernanceNoticeError(
          403,
          "NOTICE_ATTACHMENT_OUTSIDE_NOTICE_TARGET"
        );
      }
    }

    if (
      row.rejectedAt ||
      row.deletedAt ||
      !clean(row.sha256Hash)
    ) {
      throw new GovernanceNoticeError(
        409,
        "NOTICE_ATTACHMENT_NOT_READY"
      );
    }

        const isReady =
      !row.noticeId &&
      !row.sealedAt &&
      row.status ===
        GovernanceOfficialNoticeAttachmentStatus.READY &&
      row.scanStatus ===
        GovernanceOfficialNoticeAttachmentScanStatus.CLEAN &&
      row.malwareScanStatus ===
        GovernanceOfficialNoticeAttachmentMalwareScanStatus.CLEAN;

        /*
     * SEALED rows are accepted here only so an idempotent retry can resolve
     * the attachment manifest already linked to its existing notice.
     *
     * The existing-notice attachment comparison and sealedNoticeId conflict
     * below prevent the row from being reused for a different notice.
     *
     * Historical sealed rows may truthfully remain malware NOT_SCANNED until
     * the scanner backfill is available.
     */
    const isSealed =
      Boolean(row.noticeId) &&
      Boolean(row.sealedAt) &&
      row.status ===
        GovernanceOfficialNoticeAttachmentStatus.SEALED &&
      row.scanStatus ===
        GovernanceOfficialNoticeAttachmentScanStatus.CLEAN;

    if (!isReady && !isSealed) {
      throw new GovernanceNoticeError(
        409,
        "NOTICE_ATTACHMENT_NOT_READY"
      );
    }

    items.push({
      id: row.id,
      noticeId: row.noticeId,
      tenantId: row.tenantId,
      zoneId: row.zoneId,
      uploadedByUserId: row.uploadedByUserId,
      displayFilename: row.displayFilename,
      extension: row.extension,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      sha256Hash: clean(row.sha256Hash),
      confidential: row.confidential,
      recipientVisible: row.recipientVisible,
      status: row.status,
      scanStatus: row.scanStatus,
    });
  }

  const totalBytes = items.reduce(
    (sum, attachment) => sum + attachment.sizeBytes,
    0
  );

  if (totalBytes > 20 * 1024 * 1024) {
    throw new GovernanceNoticeError(
      400,
      "NOTICE_ATTACHMENT_COMBINED_SIZE_EXCEEDED"
    );
  }

  const sealedNoticeIds = new Set(
    items
      .map((attachment) => attachment.noticeId)
      .filter(Boolean) as string[]
  );

  if (sealedNoticeIds.size > 1) {
    throw new GovernanceNoticeError(
      409,
      "NOTICE_ATTACHMENTS_ALREADY_SEALED_TO_DIFFERENT_NOTICES"
    );
  }

  const sealedCount = items.filter(
    (attachment) =>
      attachment.status ===
      GovernanceOfficialNoticeAttachmentStatus.SEALED
  ).length;

  if (sealedCount > 0 && sealedCount !== items.length) {
    throw new GovernanceNoticeError(
      409,
      "NOTICE_ATTACHMENT_STATE_CONFLICT"
    );
  }

  return {
    items,
    sealedNoticeId:
      sealedNoticeIds.size === 1
        ? Array.from(sealedNoticeIds)[0]
        : null,
  };
}

function assertExistingNoticeAttachmentMatch(args: {
  existing: {
    id: string;
    attachments: Array<{
      id: string;
      sha256Hash: string | null;
    }>;
  };
  attachments: ResolvedNoticeAttachment[];
  sealedNoticeId: string | null;
}) {
  const expected = args.attachments
    .map((attachment) =>
      `${attachment.id}:${attachment.sha256Hash}`
    )
    .sort();

  const actual = args.existing.attachments
    .map((attachment) =>
      `${attachment.id}:${clean(attachment.sha256Hash)}`
    )
    .sort();

  if (stableStringify(expected) !== stableStringify(actual)) {
    throw new GovernanceNoticeError(
      409,
      "IDEMPOTENCY_KEY_ATTACHMENT_MISMATCH"
    );
  }

  if (
    args.sealedNoticeId &&
    args.sealedNoticeId !== args.existing.id
  ) {
    throw new GovernanceNoticeError(
      409,
      "NOTICE_ATTACHMENT_ALREADY_SEALED"
    );
  }
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

function buildSmsBody(args: {
  noticeId: string;
  title: string;
  metadata: unknown;
  caseId?: string | null;
}) {
  const ref = officialNoticeRefFromId(args.noticeId);

  const requirement = noticeActionRequirement({
    metadata: args.metadata,
    caseId: args.caseId,
    title: args.title,
  });

  const actionText = noticePortalActionText(requirement);

  return truncate(
    smsSafe(
      `EduLife OS Official Notice. Ref: ${ref}. Log in to EduLife OS to ${actionText}. Do not rely on WhatsApp copies without this reference.`
    ),
    240
  );
}

function buildEmailText(args: {
  noticeId: string;
  title: string;
  body: string;
  metadata: unknown;
  caseId?: string | null;
  senderName?: string | null;
}) {
  const ref = officialNoticeRefFromId(args.noticeId);

  const requirement = noticeActionRequirement({
    metadata: args.metadata,
    caseId: args.caseId,
    title: args.title,
  });

  const actionText = noticePortalActionText(requirement);

  return [
    "EduLife OS Official Governance Notice",
    "",
    `Reference: ${ref}`,
    args.senderName ? `Verified sender: ${args.senderName}` : "",
    "",
    `Title: ${args.title}`,
    "",
    args.body,
    "",
    "Required action:",
    `Please sign in to EduLife OS to ${actionText}.`,
    "",
    "Security note:",
    "EduLife OS portal is the source of truth for official instructions.",
    "SMS and email are delivery alerts/copies.",
    "Do not rely on WhatsApp screenshots, forwards, or copied text unless the notice exists in EduLife OS with the same reference.",
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
  audienceMode: true,
  audienceSummary: true,
  idempotencyKey: true,
  idempotencyScope: true,
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
  attachments: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      displayFilename: true,
      extension: true,
      mimeType: true,
      sha256Hash: true,
      confidential: true,
      recipientVisible: true,
      status: true,
      scanStatus: true,
      sealedAt: true,
      createdAt: true,
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
      responseBody: true,
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
    caseId: true,
    title: true,
    body: true,
    metadata: true,
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
  metadata: delivery.notice.metadata,
  caseId: delivery.notice.caseId,
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
  metadata: delivery.notice.metadata,
  caseId: delivery.notice.caseId,
  senderName:
    delivery.notice.sender?.name ??
    delivery.notice.sender?.email ??
    null,
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
  const metadataInput = inputObject(input.metadata);
  const sectorTarget = normalizeNoticeSectorTarget(input);
  const audienceMode = noticeAudienceMode(input);

  assertOfficialCommunicationAuthority({
    scope,
    input,
  });

  const recipients = await resolveRecipients({
    scope,
    target,
    input,
  });

  const attachmentSet = await resolveNoticeAttachments({
    scope,
    target,
    actorUserId,
    input,
    sectorTarget,
  });
  const attachments = attachmentSet.items;
  const attachmentManifest =
    noticeAttachmentManifest(attachments);
  const attachmentManifestHash =
    noticeAttachmentManifestHash(attachments);

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

  const idempotencyScope = normalizeNoticeIdempotencyScope(
    input.idempotencyScope ?? metadataInput.idempotencyScope
  );

  const idempotencyKey = allowDuplicate
    ? null
    : buildNoticeIdempotencyKey({
        input,
        target,
        recipients,
        attachments,
        channels,
        title,
        body,
        priority,
      });

  const noticeFingerprint = buildNoticeAuthenticityFingerprint({
    senderUserId: actorUserId,
    target,
    recipients,
    attachments,
    channels,
    title,
    body,
    priority,
    audienceMode,
  });

  if (idempotencyKey) {
    const existing = await prisma.governanceOfficialNotice.findUnique({
      where: { idempotencyKey },
      select: noticeSelect,
    });

    if (existing) {
      assertExistingNoticeAttachmentMatch({
        existing,
        attachments,
        sealedNoticeId: attachmentSet.sealedNoticeId,
      });

      await writeAuditLog({
        action: "GOVERNANCE_OFFICIAL_NOTICE_SEND_DEDUPED",
        tenantId: existing.tenantId ?? target.tenantId ?? undefined,
        userId: actorUserId,
        resource: "GovernanceOfficialNotice",
        resourceId: existing.id,
        ip: args.ip,
        userAgent: args.userAgent,
        metadata: {
          caseId: existing.caseId ?? target.caseId,
          zoneId: existing.zoneId ?? target.zoneId,
          idempotencyKey,
          idempotencyScope,
          audienceMode,
          attachmentCount: attachments.length,
          attachmentManifestHash,
          duplicateSafe: true,
          message: "Duplicate official notice send suppressed before dispatch.",
        },
      });

      return {
        ...existing,
        reused: true,
        duplicateSafe: true,
      };
    }
  }

  if (attachmentSet.sealedNoticeId) {
    throw new GovernanceNoticeError(
      409,
      "NOTICE_ATTACHMENT_ALREADY_SEALED"
    );
  }

  let created: { id: string };

  try {
    created = await prisma.$transaction(async (tx) => {
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
          audienceMode,
          channels: jsonArray(channels),
          audienceSummary,
          idempotencyKey,
          idempotencyScope: idempotencyKey ? idempotencyScope : null,
                    metadata: jsonObject({
            ...metadataInput,
            source: metadataInput.source ?? "governance-official-notice",
            targetLabel: target.label,
            audienceMode,
            selectedRecipientCount:
              audienceMode ===
              GovernanceOfficialNoticeAudienceMode.INDIVIDUALS
                ? recipients.length
                : null,
            senderUserId: actorUserId,
            senderScope: {
              isSuperAdmin: scope.isSuperAdmin,
              assignments: scope.assignments,
              zoneCount: scope.zoneIds.length,
              tenantCount: scope.tenantIds.length,
            },
            officialCommunication: isOfficialCommunicationInput(input),
                        governanceSectorTarget: sectorTarget,
            governanceSectorRule:
              "PUBLIC targets only public schools. PRIVATE targets only private schools. ALL_AUTHORIZED targets all schools already inside the verified governance scope.",
                        noticeKind:
              metadataInput.noticeKind ??
              (isOfficialCommunicationInput(input)
                ? "ACKNOWLEDGEMENT_REQUIRED"
                : target.caseId
                  ? "LEGACY_INTERVENTION"
                  : "INFORMATION_ONLY"),
            requiresAcknowledgement:
              metadataInput.requiresAcknowledgement ??
              Boolean(
                noticeActionRequirement({
                  metadata: metadataInput,
                  caseId: target.caseId,
                  title,
                }).requiresAcknowledgement
              ),
            requiresResponse:
              metadataInput.requiresResponse ??
              Boolean(
                noticeActionRequirement({
                  metadata: metadataInput,
                  caseId: target.caseId,
                  title,
                }).requiresResponse
              ),
            targetRoles: targetRolesArray(input.targetRoles),
            attachmentCount: attachments.length,
            attachmentIds: attachments.map(
              (attachment) => attachment.id
            ),
            attachmentManifest,
            attachmentManifestHash,
            noticeFingerprint,
            fingerprintAlgorithm: "sha256",
            fingerprintVersion:
              noticeFingerprintVersion(
                audienceMode,
                attachments.length
              ),
            officialReferenceRule:
              "Official reference is derived from the final notice id as GOV-{last8}.",
            securityRule:
              "EduLife OS portal is the source of truth. SMS and email are alerts/copies. WhatsApp is not authoritative without a matching EduLife OS notice reference.",
            idempotencyKey,
            idempotencyScope: idempotencyKey ? idempotencyScope : null,
            allowDuplicate,
          }),
        },
        select: { id: true },
      });

      if (attachments.length) {
        const sealedAt = new Date();

        const sealed =
          await tx.governanceOfficialNoticeAttachment.updateMany({
            where: {
              id: {
                in: attachments.map(
                  (attachment) => attachment.id
                ),
              },
              noticeId: null,
              uploadedByUserId: actorUserId,
                            status:
                GovernanceOfficialNoticeAttachmentStatus.READY,
              scanStatus:
                GovernanceOfficialNoticeAttachmentScanStatus.CLEAN,
              malwareScanStatus:
                GovernanceOfficialNoticeAttachmentMalwareScanStatus.CLEAN,
              sealedAt: null,
              rejectedAt: null,
              deletedAt: null,
            },
            data: {
              noticeId: notice.id,
              status:
                GovernanceOfficialNoticeAttachmentStatus.SEALED,
              sealedAt,
            },
          });

        if (sealed.count !== attachments.length) {
          throw new GovernanceNoticeError(
            409,
            "NOTICE_ATTACHMENT_SEAL_CONFLICT"
          );
        }
      }

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
              provider:
                channel === GovernanceOfficialNoticeChannel.IN_APP
                  ? "EDULIFE_OS"
                  : null,
              providerStatusDescription: description,
              attempts: channel === GovernanceOfficialNoticeChannel.IN_APP ? 1 : 0,
              lastAttemptAt:
                channel === GovernanceOfficialNoticeChannel.IN_APP ? now : null,
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
              audienceMode,
              audienceSummary,
              attachmentCount: attachments.length,
              attachmentManifestHash,
              idempotencyKey,
              idempotencyScope: idempotencyKey ? idempotencyScope : null,
            }),
          },
        });
      }

      return notice;
    }, NOTICE_TX_OPTIONS);
  } catch (err) {
    if (idempotencyKey && isUniqueConstraintError(err)) {
      const existing = await prisma.governanceOfficialNotice.findUnique({
        where: { idempotencyKey },
        select: noticeSelect,
      });

      if (existing) {
        assertExistingNoticeAttachmentMatch({
          existing,
          attachments,
          sealedNoticeId: attachmentSet.sealedNoticeId,
        });

        await writeAuditLog({
          action: "GOVERNANCE_OFFICIAL_NOTICE_SEND_DEDUPED_RACE",
          tenantId: existing.tenantId ?? target.tenantId ?? undefined,
          userId: actorUserId,
          resource: "GovernanceOfficialNotice",
          resourceId: existing.id,
          ip: args.ip,
          userAgent: args.userAgent,
          metadata: {
            caseId: existing.caseId ?? target.caseId,
            zoneId: existing.zoneId ?? target.zoneId,
            idempotencyKey,
            idempotencyScope,
            audienceMode,
            attachmentCount: attachments.length,
            attachmentManifestHash,
            duplicateSafe: true,
            message:
              "Duplicate official notice send suppressed by DB unique constraint.",
          },
        });

        return {
          ...existing,
          reused: true,
          duplicateSafe: true,
        };
      }
    }

    throw err;
  }

  await dispatchNoticeDeliveries(created.id, actorUserId);

  await writeAuditLog({
    action: "GOVERNANCE_OFFICIAL_NOTICE_SENT",
    tenantId: target.tenantId ?? undefined,
    userId: actorUserId,
    resource: "GovernanceOfficialNotice",
    resourceId: created.id,
    ip: args.ip,
    userAgent: args.userAgent,
    metadata: {
      caseId: target.caseId,
      zoneId: target.zoneId,
      channels,
      recipientCount: recipients.length,
      audienceMode,
      audienceSummary,
      attachmentCount: attachments.length,
      attachmentIds: attachments.map(
        (attachment) => attachment.id
      ),
      attachmentManifestHash,
      idempotencyKey,
      idempotencyScope: idempotencyKey ? idempotencyScope : null,
      noticeFingerprint,
      governanceSectorTarget: sectorTarget,
      fingerprintAlgorithm: "sha256",
      fingerprintVersion: noticeFingerprintVersion(
        audienceMode,
        attachments.length
      ),
      securityRule:
        "EduLife OS portal is the source of truth. SMS and email are alerts/copies. WhatsApp is not authoritative without a matching EduLife OS notice reference.",
    },
  });

  const fresh = await prisma.governanceOfficialNotice.findUniqueOrThrow({
    where: { id: created.id },
    select: noticeSelect,
  });

  return {
    ...fresh,
    reused: false,
    duplicateSafe: Boolean(idempotencyKey),
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

  const rows = await prisma.governanceOfficialNoticeRecipient.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_NOTICE_TAKE,
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
          audienceMode: true,
          audienceSummary: true,
          idempotencyKey: true,
          idempotencyScope: true,
          metadata: true,
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
          attachments: {
  where: {
    recipientVisible: true,
    status:
      GovernanceOfficialNoticeAttachmentStatus.SEALED,
    scanStatus:
      GovernanceOfficialNoticeAttachmentScanStatus.CLEAN,
    sealedAt: {
      not: null,
    },
    deletedAt: null,
  },
  orderBy: {
    createdAt: "asc",
  },
  select: {
    id: true,
    displayFilename: true,
    extension: true,
    mimeType: true,
    sizeBytes: true,
    sha256Hash: true,
    confidential: true,
    recipientVisible: true,
    status: true,
    scanStatus: true,
    sealedAt: true,
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

  const filtered = boolish(args.input.unacknowledgedOnly)
    ? rows.filter((row) => {
        const requirement = noticeActionRequirement({
          metadata: row.notice.metadata,
          caseId: row.notice.caseId,
          title: row.notice.title,
        });

        return requirement.requiresAcknowledgement && !row.acknowledgedAt;
      })
    : rows;

  return filtered.slice(0, take).map((row) => {
    const requirement = noticeActionRequirement({
      metadata: row.notice.metadata,
      caseId: row.notice.caseId,
      title: row.notice.title,
    });

   return {
  ...row,
  notice: {
    ...row.notice,
    attachments: row.notice.attachments.map(
      (attachment) => ({
        ...attachment,
        sizeBytes: Number(
          attachment.sizeBytes,
        ),
      }),
    ),
  },
  actionRequirement: requirement,
};
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
      notice: {
        select: {
          id: true,
          title: true,
          status: true,
          caseId: true,
          senderUserId: true,
          metadata: true,
        },
      },
    },
  });

  if (!recipient) {
    throw new GovernanceNoticeError(404, "NOTICE_RECIPIENT_NOT_FOUND");
  }

  const requirement = noticeActionRequirement({
    metadata: recipient.notice.metadata,
    caseId: recipient.notice.caseId,
    title: recipient.notice.title,
  });

  const now = new Date();
  const shouldAcknowledge = requirement.requiresAcknowledgement;

  const updated = await prisma.governanceOfficialNoticeRecipient.update({
    where: { id: recipient.id },
    data: {
      readAt: recipient.readAt ?? now,
      ...(shouldAcknowledge
        ? {
            acknowledgedAt: recipient.acknowledgedAt ?? now,
            acknowledgeNote: note || null,
          }
        : {}),
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
          metadata: true,
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
    action: shouldAcknowledge
      ? "GOVERNANCE_OFFICIAL_NOTICE_ACKNOWLEDGED"
      : "GOVERNANCE_OFFICIAL_NOTICE_READ",
    tenantId: recipient.tenantId ?? undefined,
    userId: args.actorUserId,
    resource: "GovernanceOfficialNoticeRecipient",
    resourceId: recipient.id,
    ip: args.ip,
    userAgent: args.userAgent,
    metadata: {
      noticeId: recipient.noticeId,
      note: note || null,
      noticeKind: requirement.noticeKind,
      requiresAcknowledgement: requirement.requiresAcknowledgement,
      requiresResponse: requirement.requiresResponse,
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
          metadata: true,
        },
      },
    },
  });

  if (!recipient) {
    throw new GovernanceNoticeError(404, "NOTICE_RECIPIENT_NOT_FOUND");
  }

  const requirement = noticeActionRequirement({
    metadata: recipient.notice.metadata,
    caseId: recipient.notice.caseId,
    title: recipient.notice.title,
  });

  if (!requirement.requiresResponse) {
    throw new GovernanceNoticeError(400, "NOTICE_RESPONSE_NOT_REQUIRED");
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
                "Response submitted; acknowledgement captured automatically.",
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
            metadata: true,
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
            noticeKind: requirement.noticeKind,
            requiresAcknowledgement: requirement.requiresAcknowledgement,
            requiresResponse: requirement.requiresResponse,
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
      noticeKind: requirement.noticeKind,
      requiresAcknowledgement: requirement.requiresAcknowledgement,
      requiresResponse: requirement.requiresResponse,
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

function governanceScopeHasDistrictCommand(scope: GovernanceScope) {
  if (scope.isSuperAdmin) return true;

  return scope.assignments.some((assignment) => {
    const role = upper(assignment.role);
    const level = Number(assignment.zoneLevel ?? 0);

    return role === "DISTRICT_DIRECTOR" || level >= 2;
  });
}

function governanceScopeHasCircuitCommand(scope: GovernanceScope) {
  if (scope.isSuperAdmin) return true;

  return scope.assignments.some((assignment) => {
    const role = upper(assignment.role);
    const level = Number(assignment.zoneLevel ?? 0);

    return role === "SISSO" || role === "CIRCUIT_SUPERVISOR" || level === 1;
  });
}

function jurisdictionSentNoticeVisibilityWhere(args: {
  scope: GovernanceScope;
  actorUserId: string;
}): Prisma.GovernanceOfficialNoticeWhereInput {
  const { scope, actorUserId } = args;

  if (scope.isSuperAdmin) {
    return {};
  }

  if (governanceScopeHasDistrictCommand(scope)) {
    return {
      OR: [
        {
          senderUserId: actorUserId,
        },
        {
          case: {
            status: "ESCALATED",
          },
        },
      ],
    };
  }

  if (governanceScopeHasCircuitCommand(scope)) {
    return {};
  }

  return {
    senderUserId: actorUserId,
  };
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
            idempotencyKey: true,
            idempotencyScope: true,
            metadata: true,
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
  // Jurisdiction mode is command-level aware:
  // - circuit officers see their authorized circuit notice accountability
  // - district directors see their own sent notices plus escalated case notices only
  //   ordinary SISSO-to-head/teacher internal notices stay inside the circuit
  if (mode === "mine") {
    andWhere.push({ senderUserId: args.actorUserId });
  } else {
    andWhere.push(
      jurisdictionSentNoticeVisibilityWhere({
        scope: args.scope,
        actorUserId: args.actorUserId,
      })
    );
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
      audienceMode: true,
      audienceSummary: true,
      idempotencyKey: true,
      idempotencyScope: true,
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
      attachments: {
  where: {
    status:
      GovernanceOfficialNoticeAttachmentStatus.SEALED,
    scanStatus:
      GovernanceOfficialNoticeAttachmentScanStatus.CLEAN,
    sealedAt: {
      not: null,
    },
    deletedAt: null,
  },
  orderBy: {
    createdAt: "asc",
  },
  select: {
    id: true,
    displayFilename: true,
    extension: true,
    mimeType: true,
    sizeBytes: true,
    sha256Hash: true,
    confidential: true,
    recipientVisible: true,
    status: true,
    scanStatus: true,
    sealedAt: true,
    createdAt: true,
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
  attachments: row.attachments.map(
    (attachment) => ({
      ...attachment,
      sizeBytes: Number(
        attachment.sizeBytes,
      ),
    }),
  ),
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