//src/lib/governance/noticeAttachments.ts
import "server-only";

import {
  GovernanceOfficialNoticeAttachmentScanStatus,
  GovernanceOfficialNoticeAttachmentStatus,
  Prisma,
  TenantStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GovernanceScope } from "@/lib/governance/scope";
import {
  buildPrivateR2ObjectKey,
  createPrivateR2UploadUrl,
  deletePrivateR2Object,
  headPrivateR2Object,
} from "@/lib/storage/privateR2";

export const GOVERNANCE_NOTICE_ATTACHMENT_POLICY = {
  maxFilesPerDraft: 3,
  maxFileBytes: 10 * 1024 * 1024,
  maxCombinedBytes: 20 * 1024 * 1024,
  uploadUrlExpiresInSeconds: 15 * 60,
} as const;

type AllowedExtension =
  | "pdf"
  | "doc"
  | "docx"
  | "ppt"
  | "pptx"
  | "xls"
  | "xlsx";

type AllowedTypeDefinition = {
  canonicalMimeType: string;
  acceptedDeclaredMimeTypes: readonly string[];
};

const ALLOWED_TYPES: Record<AllowedExtension, AllowedTypeDefinition> = {
  pdf: {
    canonicalMimeType: "application/pdf",
    acceptedDeclaredMimeTypes: [
      "application/pdf",
      "application/octet-stream",
    ],
  },
  doc: {
    canonicalMimeType: "application/msword",
    acceptedDeclaredMimeTypes: [
      "application/msword",
      "application/octet-stream",
    ],
  },
  docx: {
    canonicalMimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    acceptedDeclaredMimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
      "application/octet-stream",
    ],
  },
  ppt: {
    canonicalMimeType: "application/vnd.ms-powerpoint",
    acceptedDeclaredMimeTypes: [
      "application/vnd.ms-powerpoint",
      "application/octet-stream",
    ],
  },
  pptx: {
    canonicalMimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    acceptedDeclaredMimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
      "application/octet-stream",
    ],
  },
  xls: {
    canonicalMimeType: "application/vnd.ms-excel",
    acceptedDeclaredMimeTypes: [
      "application/vnd.ms-excel",
      "application/octet-stream",
    ],
  },
  xlsx: {
    canonicalMimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    acceptedDeclaredMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/octet-stream",
    ],
  },
};

const ACTIVE_DRAFT_STATUSES = [
  GovernanceOfficialNoticeAttachmentStatus.PENDING_UPLOAD,
  GovernanceOfficialNoticeAttachmentStatus.UPLOADED,
  GovernanceOfficialNoticeAttachmentStatus.READY,
] as const;

const attachmentSelect = {
  id: true,
  noticeId: true,
  tenantId: true,
  zoneId: true,
  uploadedByUserId: true,
  originalFilename: true,
  displayFilename: true,
  extension: true,
  mimeType: true,
  sizeBytes: true,
  storageProvider: true,
  objectKey: true,
  etag: true,
  sha256Hash: true,
  uploadIdempotencyKey: true,
  status: true,
  scanStatus: true,
  confidential: true,
  recipientVisible: true,
  uploadedAt: true,
  verifiedAt: true,
  sealedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  deletedAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GovernanceOfficialNoticeAttachmentSelect;

export class GovernanceNoticeAttachmentError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

type InitializeAttachmentInput = {
  tenantId?: unknown;
  zoneId?: unknown;
  draftKey?: unknown;
  originalFilename?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  uploadIdempotencyKey?: unknown;
  confidential?: unknown;
};

type VerifyAttachmentInput = {
  attachmentId?: unknown;
};

type DeleteAttachmentInput = {
  attachmentId?: unknown;
};

type AttachmentScope = {
  tenantId: string | null;
  zoneId: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function upper(value: unknown) {
  return clean(value).toUpperCase();
}

function boolish(value: unknown, fallback = false) {
  const valueUpper = upper(value);

  if (!valueUpper) return fallback;
  return valueUpper === "1" || valueUpper === "TRUE" || valueUpper === "YES";
}

function intOrNull(value: unknown) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;
  return Math.trunc(number);
}

function jsonObject(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function metadataObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeDraftKey(value: unknown) {
  const draftKey = clean(value);

  if (
    draftKey.length < 8 ||
    draftKey.length > 120 ||
    !/^[A-Za-z0-9:_-]+$/.test(draftKey)
  ) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "INVALID_ATTACHMENT_DRAFT_KEY",
    );
  }

  return draftKey;
}

function normalizeUploadIdempotencyKey(value: unknown) {
  const idempotencyKey = clean(value);

  if (
    idempotencyKey.length < 12 ||
    idempotencyKey.length > 180 ||
    !/^[A-Za-z0-9:_-]+$/.test(idempotencyKey)
  ) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "INVALID_ATTACHMENT_UPLOAD_IDEMPOTENCY_KEY",
    );
  }

  return idempotencyKey;
}

function sanitizeFilename(value: unknown) {
  const raw = clean(value)
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw || raw.length > 255) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "INVALID_ATTACHMENT_FILENAME",
    );
  }

  return raw;
}

function extensionFromFilename(filename: string): AllowedExtension {
  const dotIndex = filename.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_EXTENSION_REQUIRED",
    );
  }

  const extension = filename.slice(dotIndex + 1).toLowerCase();

  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, extension)) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_TYPE_NOT_ALLOWED",
    );
  }

  return extension as AllowedExtension;
}

function normalizeDeclaredMimeType(value: unknown) {
  return clean(value).toLowerCase().split(";")[0]?.trim() ?? "";
}

function validateFileMetadata(input: InitializeAttachmentInput) {
  const filename = sanitizeFilename(input.originalFilename);
  const extension = extensionFromFilename(filename);
  const typeDefinition = ALLOWED_TYPES[extension];

  const sizeBytes = intOrNull(input.sizeBytes);

  if (!sizeBytes || sizeBytes <= 0) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_SIZE_INVALID",
    );
  }

  if (sizeBytes > GOVERNANCE_NOTICE_ATTACHMENT_POLICY.maxFileBytes) {
    throw new GovernanceNoticeAttachmentError(
      413,
      "ATTACHMENT_EXCEEDS_10_MB",
    );
  }

  const declaredMimeType = normalizeDeclaredMimeType(input.mimeType);

  if (
    declaredMimeType &&
    !typeDefinition.acceptedDeclaredMimeTypes.includes(declaredMimeType)
  ) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_MIME_TYPE_MISMATCH",
    );
  }

  return {
    filename,
    extension,
    sizeBytes,
    declaredMimeType: declaredMimeType || null,
    canonicalMimeType: typeDefinition.canonicalMimeType,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function serializeAttachment(
  row: Prisma.GovernanceOfficialNoticeAttachmentGetPayload<{
    select: typeof attachmentSelect;
  }>,
) {
  return {
    ...row,
    sizeBytes: Number(row.sizeBytes),
  };
}

function assertTenantInScope(scope: GovernanceScope, tenantId: string) {
  if (scope.isSuperAdmin) return;

  if (!scope.tenantIds.includes(tenantId)) {
    throw new GovernanceNoticeAttachmentError(
      403,
      "ATTACHMENT_TENANT_OUT_OF_SCOPE",
    );
  }
}

function assertZoneInScope(scope: GovernanceScope, zoneId: string) {
  if (scope.isSuperAdmin) return;

  if (!scope.zoneIds.includes(zoneId)) {
    throw new GovernanceNoticeAttachmentError(
      403,
      "ATTACHMENT_ZONE_OUT_OF_SCOPE",
    );
  }
}

async function resolveAttachmentScope(
  scope: GovernanceScope,
  input: InitializeAttachmentInput,
): Promise<AttachmentScope> {
  const tenantId = clean(input.tenantId);
  const requestedZoneId = clean(input.zoneId);

  if (!tenantId && !requestedZoneId) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_SCOPE_REQUIRED",
    );
  }

  if (tenantId) {
    assertTenantInScope(scope, tenantId);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        zoneId: true,
        status: true,
      },
    });

    if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
      throw new GovernanceNoticeAttachmentError(
        404,
        "ATTACHMENT_SCHOOL_NOT_FOUND_OR_INACTIVE",
      );
    }

    if (requestedZoneId && tenant.zoneId !== requestedZoneId) {
      throw new GovernanceNoticeAttachmentError(
        400,
        "ATTACHMENT_SCHOOL_ZONE_MISMATCH",
      );
    }

    if (tenant.zoneId) {
      assertZoneInScope(scope, tenant.zoneId);
    }

    return {
      tenantId: tenant.id,
      zoneId: tenant.zoneId ?? null,
    };
  }

  assertZoneInScope(scope, requestedZoneId);

  const zone = await prisma.adminZone.findUnique({
    where: { id: requestedZoneId },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!zone || !zone.isActive) {
    throw new GovernanceNoticeAttachmentError(
      404,
      "ATTACHMENT_ZONE_NOT_FOUND_OR_INACTIVE",
    );
  }

  return {
    tenantId: null,
    zoneId: zone.id,
  };
}

function assertAttachmentRowInScope(
  scope: GovernanceScope,
  row: {
    tenantId: string | null;
    zoneId: string | null;
  },
) {
  if (scope.isSuperAdmin) return;

  const tenantAllowed =
    !!row.tenantId && scope.tenantIds.includes(row.tenantId);
  const zoneAllowed = !!row.zoneId && scope.zoneIds.includes(row.zoneId);

  if (!tenantAllowed && !zoneAllowed) {
    throw new GovernanceNoticeAttachmentError(
      403,
      "ATTACHMENT_OUT_OF_GOVERNANCE_SCOPE",
    );
  }
}

async function activeDraftAttachments(args: {
  actorUserId: string;
  draftKey: string;
}) {
  const rows = await prisma.governanceOfficialNoticeAttachment.findMany({
    where: {
      uploadedByUserId: args.actorUserId,
      noticeId: null,
      status: {
        in: [...ACTIVE_DRAFT_STATUSES],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: attachmentSelect,
  });

  return rows.filter((row) => {
    const metadata = metadataObject(row.metadata);
    return clean(metadata.draftKey) === args.draftKey;
  });
}

function existingUploadMatches(args: {
  existing: Prisma.GovernanceOfficialNoticeAttachmentGetPayload<{
    select: typeof attachmentSelect;
  }>;
  draftKey: string;
  filename: string;
  extension: AllowedExtension;
  sizeBytes: number;
  canonicalMimeType: string;
  scope: AttachmentScope;
}) {
  const metadata = metadataObject(args.existing.metadata);

  return (
    clean(metadata.draftKey) === args.draftKey &&
    args.existing.originalFilename === args.filename &&
    args.existing.extension === args.extension &&
    Number(args.existing.sizeBytes) === args.sizeBytes &&
    args.existing.mimeType === args.canonicalMimeType &&
    args.existing.tenantId === args.scope.tenantId &&
    args.existing.zoneId === args.scope.zoneId
  );
}

async function signedUploadResponse(
  row: Prisma.GovernanceOfficialNoticeAttachmentGetPayload<{
    select: typeof attachmentSelect;
  }>,
  reused: boolean,
) {
  if (
    row.status !==
    GovernanceOfficialNoticeAttachmentStatus.PENDING_UPLOAD
  ) {
    return {
      attachment: serializeAttachment(row),
      reused,
      uploadRequired: false,
      upload: null,
    };
  }

  const upload = await createPrivateR2UploadUrl({
    key: row.objectKey,
    contentType: row.mimeType,
    expiresInSeconds:
      GOVERNANCE_NOTICE_ATTACHMENT_POLICY.uploadUrlExpiresInSeconds,
  });

  return {
    attachment: serializeAttachment(row),
    reused,
    uploadRequired: true,
    upload,
  };
}

export function governanceNoticeAttachmentAllowedTypes() {
  return Object.entries(ALLOWED_TYPES).map(([extension, definition]) => ({
    extension,
    mimeType: definition.canonicalMimeType,
  }));
}

export async function initializeGovernanceNoticeAttachment(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: InitializeAttachmentInput;
}) {
  const draftKey = normalizeDraftKey(args.input.draftKey);
  const uploadIdempotencyKey = normalizeUploadIdempotencyKey(
    args.input.uploadIdempotencyKey,
  );
  const file = validateFileMetadata(args.input);
  const attachmentScope = await resolveAttachmentScope(
    args.scope,
    args.input,
  );

  const existing =
    await prisma.governanceOfficialNoticeAttachment.findFirst({
      where: {
        uploadedByUserId: args.actorUserId,
        uploadIdempotencyKey,
      },
      select: attachmentSelect,
    });

  if (existing) {
    assertAttachmentRowInScope(args.scope, existing);

    if (
      !existingUploadMatches({
        existing,
        draftKey,
        filename: file.filename,
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        canonicalMimeType: file.canonicalMimeType,
        scope: attachmentScope,
      })
    ) {
      throw new GovernanceNoticeAttachmentError(
        409,
        "ATTACHMENT_UPLOAD_IDEMPOTENCY_CONFLICT",
      );
    }

    if (
      existing.status ===
        GovernanceOfficialNoticeAttachmentStatus.REJECTED ||
      existing.status ===
        GovernanceOfficialNoticeAttachmentStatus.DELETED ||
      existing.status ===
        GovernanceOfficialNoticeAttachmentStatus.SEALED ||
      existing.noticeId
    ) {
      throw new GovernanceNoticeAttachmentError(
        409,
        "ATTACHMENT_UPLOAD_CANNOT_BE_REUSED",
      );
    }

    return signedUploadResponse(existing, true);
  }

  const active = await activeDraftAttachments({
    actorUserId: args.actorUserId,
    draftKey,
  });

  if (
    active.length >=
    GOVERNANCE_NOTICE_ATTACHMENT_POLICY.maxFilesPerDraft
  ) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_DRAFT_FILE_LIMIT_REACHED",
    );
  }

  const currentCombinedBytes = active.reduce(
    (total, row) => total + Number(row.sizeBytes),
    0,
  );

  if (
    currentCombinedBytes + file.sizeBytes >
    GOVERNANCE_NOTICE_ATTACHMENT_POLICY.maxCombinedBytes
  ) {
    throw new GovernanceNoticeAttachmentError(
      413,
      "ATTACHMENT_DRAFT_EXCEEDS_20_MB",
    );
  }

  const objectKey = buildPrivateR2ObjectKey({
    prefix: "governance-notices",
    extension: file.extension,
  });

  try {
    const created =
      await prisma.governanceOfficialNoticeAttachment.create({
        data: {
          noticeId: null,
          tenantId: attachmentScope.tenantId,
          zoneId: attachmentScope.zoneId,
          uploadedByUserId: args.actorUserId,
          originalFilename: file.filename,
          displayFilename: file.filename,
          extension: file.extension,
          mimeType: file.canonicalMimeType,
          sizeBytes: BigInt(file.sizeBytes),
          storageProvider: "R2",
          objectKey,
          uploadIdempotencyKey,
          status:
            GovernanceOfficialNoticeAttachmentStatus.PENDING_UPLOAD,
          scanStatus:
            GovernanceOfficialNoticeAttachmentScanStatus.PENDING,
          confidential: boolish(args.input.confidential, true),
          recipientVisible: true,
          metadata: jsonObject({
            draftKey,
            declaredMimeType: file.declaredMimeType,
            canonicalMimeType: file.canonicalMimeType,
            policyVersion: "A16.3-v1",
            maxFileBytes:
              GOVERNANCE_NOTICE_ATTACHMENT_POLICY.maxFileBytes,
            maxFilesPerDraft:
              GOVERNANCE_NOTICE_ATTACHMENT_POLICY.maxFilesPerDraft,
            maxCombinedBytes:
              GOVERNANCE_NOTICE_ATTACHMENT_POLICY.maxCombinedBytes,
            uploadInitializedAt: new Date().toISOString(),
          }),
        },
        select: attachmentSelect,
      });

    return signedUploadResponse(created, false);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced =
        await prisma.governanceOfficialNoticeAttachment.findFirst({
          where: {
            uploadedByUserId: args.actorUserId,
            uploadIdempotencyKey,
          },
          select: attachmentSelect,
        });

      if (
        raced &&
        existingUploadMatches({
          existing: raced,
          draftKey,
          filename: file.filename,
          extension: file.extension,
          sizeBytes: file.sizeBytes,
          canonicalMimeType: file.canonicalMimeType,
          scope: attachmentScope,
        })
      ) {
        return signedUploadResponse(raced, true);
      }
    }

    throw error;
  }
}

async function rejectUploadedAttachment(args: {
  attachmentId: string;
  objectKey: string;
  reason: string;
  currentMetadata: Prisma.JsonValue;
}) {
  try {
    await deletePrivateR2Object(args.objectKey);
  } catch {
    // The DB rejection remains authoritative even when object cleanup must retry.
  }

  await prisma.governanceOfficialNoticeAttachment.update({
    where: { id: args.attachmentId },
    data: {
      status: GovernanceOfficialNoticeAttachmentStatus.REJECTED,
      scanStatus:
        GovernanceOfficialNoticeAttachmentScanStatus.FAILED,
      rejectedAt: new Date(),
      rejectionReason: args.reason,
      metadata: jsonObject({
        ...metadataObject(args.currentMetadata),
        rejectedAt: new Date().toISOString(),
        rejectionReason: args.reason,
        objectCleanupAttempted: true,
      }),
    },
  });
}

export async function verifyGovernanceNoticeAttachmentUpload(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: VerifyAttachmentInput;
}) {
  const attachmentId = clean(args.input.attachmentId);

  if (!attachmentId) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_ID_REQUIRED",
    );
  }

  const row =
    await prisma.governanceOfficialNoticeAttachment.findUnique({
      where: { id: attachmentId },
      select: attachmentSelect,
    });

  if (!row) {
    throw new GovernanceNoticeAttachmentError(
      404,
      "ATTACHMENT_NOT_FOUND",
    );
  }

  if (row.uploadedByUserId !== args.actorUserId) {
    throw new GovernanceNoticeAttachmentError(
      403,
      "ATTACHMENT_UPLOAD_OWNER_MISMATCH",
    );
  }

  assertAttachmentRowInScope(args.scope, row);

  if (row.noticeId || row.status === GovernanceOfficialNoticeAttachmentStatus.SEALED) {
    throw new GovernanceNoticeAttachmentError(
      409,
      "SEALED_ATTACHMENT_CANNOT_BE_VERIFIED_AGAIN",
    );
  }

  if (
    row.status === GovernanceOfficialNoticeAttachmentStatus.REJECTED ||
    row.status === GovernanceOfficialNoticeAttachmentStatus.DELETED
  ) {
    throw new GovernanceNoticeAttachmentError(
      409,
      "ATTACHMENT_IS_NOT_ACTIVE",
    );
  }

  if (
    row.status === GovernanceOfficialNoticeAttachmentStatus.UPLOADED ||
    row.status === GovernanceOfficialNoticeAttachmentStatus.READY
  ) {
    return {
      attachment: serializeAttachment(row),
      reused: true,
      securityInspectionRequired:
        row.status !==
          GovernanceOfficialNoticeAttachmentStatus.READY ||
        row.scanStatus !==
          GovernanceOfficialNoticeAttachmentScanStatus.CLEAN,
    };
  }

  let head;

  try {
    head = await headPrivateR2Object(row.objectKey);
  } catch {
    throw new GovernanceNoticeAttachmentError(
      404,
      "ATTACHMENT_OBJECT_NOT_FOUND_IN_PRIVATE_STORAGE",
    );
  }

  const expectedSize = Number(row.sizeBytes);

  if (
    head.contentLength === null ||
    head.contentLength !== expectedSize
  ) {
    await rejectUploadedAttachment({
      attachmentId: row.id,
      objectKey: row.objectKey,
      reason: "UPLOADED_OBJECT_SIZE_MISMATCH",
      currentMetadata: row.metadata,
    });

    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_UPLOADED_SIZE_MISMATCH",
    );
  }

  const storedContentType = clean(head.contentType).toLowerCase();

  if (!storedContentType || storedContentType !== row.mimeType.toLowerCase()) {
    await rejectUploadedAttachment({
      attachmentId: row.id,
      objectKey: row.objectKey,
      reason: "UPLOADED_OBJECT_CONTENT_TYPE_MISMATCH",
      currentMetadata: row.metadata,
    });

    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_UPLOADED_MIME_MISMATCH",
    );
  }

  const now = new Date();

  const updated =
    await prisma.governanceOfficialNoticeAttachment.update({
      where: { id: row.id },
      data: {
        status: GovernanceOfficialNoticeAttachmentStatus.UPLOADED,
        scanStatus:
          GovernanceOfficialNoticeAttachmentScanStatus.PENDING,
        uploadedAt: row.uploadedAt ?? now,
        etag: head.etag,
        metadata: jsonObject({
          ...metadataObject(row.metadata),
          storageVerifiedAt: now.toISOString(),
          storageContentLength: head.contentLength,
          storageContentType: head.contentType,
          storageLastModified:
            head.lastModified?.toISOString() ?? null,
          securityInspectionRequired: true,
        }),
      },
      select: attachmentSelect,
    });

  return {
    attachment: serializeAttachment(updated),
    reused: false,
    securityInspectionRequired: true,
  };
}

export async function deleteGovernanceNoticeAttachmentDraft(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: DeleteAttachmentInput;
}) {
  const attachmentId = clean(args.input.attachmentId);

  if (!attachmentId) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_ID_REQUIRED",
    );
  }

  const row =
    await prisma.governanceOfficialNoticeAttachment.findUnique({
      where: { id: attachmentId },
      select: attachmentSelect,
    });

  if (!row) {
    throw new GovernanceNoticeAttachmentError(
      404,
      "ATTACHMENT_NOT_FOUND",
    );
  }

  if (row.uploadedByUserId !== args.actorUserId) {
    throw new GovernanceNoticeAttachmentError(
      403,
      "ATTACHMENT_UPLOAD_OWNER_MISMATCH",
    );
  }

  assertAttachmentRowInScope(args.scope, row);

  if (
    row.noticeId ||
    row.status === GovernanceOfficialNoticeAttachmentStatus.SEALED
  ) {
    throw new GovernanceNoticeAttachmentError(
      409,
      "SEALED_ATTACHMENT_CANNOT_BE_DELETED",
    );
  }

  if (
    row.status === GovernanceOfficialNoticeAttachmentStatus.DELETED
  ) {
    return {
      attachment: serializeAttachment(row),
      reused: true,
    };
  }

  try {
    await deletePrivateR2Object(row.objectKey);
  } catch {
    throw new GovernanceNoticeAttachmentError(
      502,
      "FAILED_TO_DELETE_PRIVATE_ATTACHMENT_OBJECT",
    );
  }

  const now = new Date();

  const updated =
    await prisma.governanceOfficialNoticeAttachment.update({
      where: { id: row.id },
      data: {
        status: GovernanceOfficialNoticeAttachmentStatus.DELETED,
        deletedAt: now,
        metadata: jsonObject({
          ...metadataObject(row.metadata),
          deletedAt: now.toISOString(),
          deletedByUserId: args.actorUserId,
        }),
      },
      select: attachmentSelect,
    });

  return {
    attachment: serializeAttachment(updated),
    reused: false,
  };
}

export async function listGovernanceNoticeDraftAttachments(args: {
  scope: GovernanceScope;
  actorUserId: string;
  draftKey: unknown;
}) {
  const draftKey = normalizeDraftKey(args.draftKey);

  const rows = await activeDraftAttachments({
    actorUserId: args.actorUserId,
    draftKey,
  });

  const visible = rows.filter((row) => {
    try {
      assertAttachmentRowInScope(args.scope, row);
      return true;
    } catch {
      return false;
    }
  });

  const totalBytes = visible.reduce(
    (total, row) => total + Number(row.sizeBytes),
    0,
  );

  return {
    draftKey,
    items: visible.map(serializeAttachment),
    count: visible.length,
    totalBytes,
    limits: GOVERNANCE_NOTICE_ATTACHMENT_POLICY,
  };
}
