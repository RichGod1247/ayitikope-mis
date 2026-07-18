//src/lib/governance/noticeAttachmentInspection.ts
import "server-only";

import { createHash } from "crypto";
import {
  GovernanceOfficialNoticeAttachmentMalwareScanStatus,
  GovernanceOfficialNoticeAttachmentScanStatus,
  GovernanceOfficialNoticeAttachmentStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GovernanceScope } from "@/lib/governance/scope";
import {
  GOVERNANCE_NOTICE_ATTACHMENT_POLICY,
  GovernanceNoticeAttachmentError,
} from "@/lib/governance/noticeAttachments";
import {
  deletePrivateR2Object,
  readPrivateR2ObjectBytes,
} from "@/lib/storage/privateR2";

const INSPECTION_ENGINE = "EDULIFE_DOCUMENT_INSPECTOR_V1";

type InspectionInput = {
  attachmentId?: unknown;
};

type InspectionResult = {
  format:
    | "PDF"
    | "WORD_OOXML"
    | "POWERPOINT_OOXML"
    | "EXCEL_OOXML"
    | "WORD_OLE"
    | "POWERPOINT_OLE"
    | "EXCEL_OLE";
  container: "PDF" | "ZIP" | "OLE";
  activeContentDetected: false;
  notes: string[];
};

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
    malwareScanStatus: true,
  malwareScanEngine: true,
  malwareSignatureVersion: true,
  malwareScanQueuedAt: true,
  malwareScanStartedAt: true,
  malwareScannedAt: true,
  malwareScanAttempts: true,
  malwareScanNextAttemptAt: true,
  malwareScanLastError: true,
  malwareDetectedThreat: true,
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

function clean(value: unknown) {
  return String(value ?? "").trim();
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

function assertAttachmentScope(
  scope: GovernanceScope,
  row: {
    tenantId: string | null;
    zoneId: string | null;
  },
) {
  if (scope.isSuperAdmin) return;

  const tenantAllowed =
    Boolean(row.tenantId) &&
    scope.tenantIds.includes(row.tenantId as string);

  const zoneAllowed =
    Boolean(row.zoneId) &&
    scope.zoneIds.includes(row.zoneId as string);

  if (!tenantAllowed && !zoneAllowed) {
    throw new GovernanceNoticeAttachmentError(
      403,
      "ATTACHMENT_OUT_OF_GOVERNANCE_SCOPE",
    );
  }
}

function beginsWith(bytes: Buffer, signature: number[]) {
  if (bytes.length < signature.length) return false;

  return signature.every(
    (value, index) => bytes[index] === value,
  );
}

function containsAny(haystack: string, needles: string[]) {
  return needles.find((needle) => haystack.includes(needle)) ?? null;
}

function inspectPdf(bytes: Buffer): InspectionResult {
  const headerPosition = bytes.indexOf(Buffer.from("%PDF-", "ascii"));

  if (headerPosition < 0 || headerPosition > 1024) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_PDF_SIGNATURE_INVALID",
    );
  }

  const tail = bytes
    .subarray(Math.max(0, bytes.length - 4096))
    .toString("latin1");

  if (!tail.includes("%%EOF")) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_PDF_EOF_MARKER_MISSING",
    );
  }

  const lower = bytes.toString("latin1").toLowerCase();
  const activeMarker = containsAny(lower, [
    "/javascript",
    "/js",
    "/launch",
    "/embeddedfile",
    "/openaction",
    "/aa",
    "/richmedia",
  ]);

  if (activeMarker) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_ACTIVE_PDF_CONTENT_BLOCKED",
    );
  }

  return {
    format: "PDF",
    container: "PDF",
    activeContentDetected: false,
    notes: [
      "PDF header and EOF markers verified.",
      "Active PDF actions and embedded files were not detected.",
    ],
  };
}

function inspectOoxml(
  bytes: Buffer,
  extension: string,
): InspectionResult {
  const zipSignature =
    beginsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    beginsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    beginsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);

  if (!zipSignature) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_OOXML_ZIP_SIGNATURE_INVALID",
    );
  }

  const lower = bytes.toString("latin1").toLowerCase();

  if (!lower.includes("[content_types].xml")) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_OOXML_CONTENT_TYPES_MISSING",
    );
  }

  const expectedDirectory =
    extension === "docx"
      ? "word/"
      : extension === "pptx"
        ? "ppt/"
        : "xl/";

  if (!lower.includes(expectedDirectory)) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_OOXML_APPLICATION_MISMATCH",
    );
  }

  const blockedMarker = containsAny(lower, [
    "vbaproject.bin",
    "activex/",
    "embeddings/",
    "oleobject",
    "customui/",
  ]);

  if (blockedMarker) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_ACTIVE_OFFICE_CONTENT_BLOCKED",
    );
  }

  return {
    format:
      extension === "docx"
        ? "WORD_OOXML"
        : extension === "pptx"
          ? "POWERPOINT_OOXML"
          : "EXCEL_OOXML",
    container: "ZIP",
    activeContentDetected: false,
    notes: [
      "OOXML ZIP structure verified.",
      `Expected ${expectedDirectory} application directory found.`,
      "Macros, ActiveX, embedded OLE objects, and custom UI content were not detected.",
    ],
  };
}

function inspectLegacyOffice(
  bytes: Buffer,
  extension: string,
): InspectionResult {
  const oleSignature = [
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ];

  if (!beginsWith(bytes, oleSignature)) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_LEGACY_OFFICE_SIGNATURE_INVALID",
    );
  }

  const latin = bytes.toString("latin1").toLowerCase();
  const utf16 = bytes.toString("utf16le").toLowerCase();

  const macroMarker =
    containsAny(latin, [
      "vbaproject",
      "_vba_project",
      "projectwm",
      "macros",
    ]) ||
    containsAny(utf16, [
      "vba",
      "_vba_project",
      "projectwm",
      "macros",
    ]);

  if (macroMarker) {
    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_LEGACY_OFFICE_MACRO_CONTENT_BLOCKED",
    );
  }

  return {
    format:
      extension === "doc"
        ? "WORD_OLE"
        : extension === "ppt"
          ? "POWERPOINT_OLE"
          : "EXCEL_OLE",
    container: "OLE",
    activeContentDetected: false,
    notes: [
      "Legacy Microsoft Compound File signature verified.",
      "Known VBA and macro storage markers were not detected.",
    ],
  };
}

function inspectDocument(
  bytes: Buffer,
  extension: string,
): InspectionResult {
  if (extension === "pdf") return inspectPdf(bytes);

  if (
    extension === "docx" ||
    extension === "pptx" ||
    extension === "xlsx"
  ) {
    return inspectOoxml(bytes, extension);
  }

  if (
    extension === "doc" ||
    extension === "ppt" ||
    extension === "xls"
  ) {
    return inspectLegacyOffice(bytes, extension);
  }

  throw new GovernanceNoticeAttachmentError(
    400,
    "ATTACHMENT_TYPE_NOT_ALLOWED",
  );
}

async function rejectAttachment(args: {
  row: Prisma.GovernanceOfficialNoticeAttachmentGetPayload<{
    select: typeof attachmentSelect;
  }>;
  reason: string;
}) {
  try {
    await deletePrivateR2Object(args.row.objectKey);
  } catch {
    // Database rejection remains authoritative. Object cleanup can be retried.
  }

  const now = new Date();

  await prisma.governanceOfficialNoticeAttachment.update({
    where: { id: args.row.id },
    data: {
            status: GovernanceOfficialNoticeAttachmentStatus.REJECTED,
      scanStatus: GovernanceOfficialNoticeAttachmentScanStatus.FAILED,
      malwareScanStatus:
        GovernanceOfficialNoticeAttachmentMalwareScanStatus.NOT_SCANNED,
      malwareScanEngine: null,
      malwareSignatureVersion: null,
      malwareScanQueuedAt: null,
      malwareScanStartedAt: null,
      malwareScannedAt: null,
      malwareScanAttempts: 0,
      malwareScanNextAttemptAt: null,
      malwareScanLastError: null,
      malwareDetectedThreat: null,
      rejectedAt: now,
      rejectionReason: args.reason,
      metadata: jsonObject({
        ...metadataObject(args.row.metadata),
        inspectionEngine: INSPECTION_ENGINE,
        inspectionRejectedAt: now.toISOString(),
        inspectionFailure: args.reason,
        objectCleanupAttempted: true,
      }),
    },
  });
}

export async function inspectGovernanceNoticeAttachment(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: InspectionInput;
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

  assertAttachmentScope(args.scope, row);

  if (row.noticeId || row.status === GovernanceOfficialNoticeAttachmentStatus.SEALED) {
    throw new GovernanceNoticeAttachmentError(
      409,
      "SEALED_ATTACHMENT_CANNOT_BE_INSPECTED",
    );
  }

    if (
    (row.status === GovernanceOfficialNoticeAttachmentStatus.UPLOADED ||
      row.status === GovernanceOfficialNoticeAttachmentStatus.READY) &&
    row.scanStatus === GovernanceOfficialNoticeAttachmentScanStatus.CLEAN
  ) {
    return {
      attachment: serializeAttachment(row),
      reused: true,
      inspectionEngine: INSPECTION_ENGINE,
      malwareScanRequired:
        row.malwareScanStatus !==
        GovernanceOfficialNoticeAttachmentMalwareScanStatus.CLEAN,
    };
  }

  if (row.status !== GovernanceOfficialNoticeAttachmentStatus.UPLOADED) {
    throw new GovernanceNoticeAttachmentError(
      409,
      "ATTACHMENT_UPLOAD_MUST_BE_VERIFIED_FIRST",
    );
  }

  if (row.scanStatus !== GovernanceOfficialNoticeAttachmentScanStatus.PENDING) {
    throw new GovernanceNoticeAttachmentError(
      409,
      "ATTACHMENT_SECURITY_INSPECTION_NOT_PENDING",
    );
  }

  let object;

  try {
    object = await readPrivateR2ObjectBytes({
      key: row.objectKey,
      maxBytes: GOVERNANCE_NOTICE_ATTACHMENT_POLICY.maxFileBytes,
    });
  } catch {
    throw new GovernanceNoticeAttachmentError(
      502,
      "FAILED_TO_READ_PRIVATE_ATTACHMENT_FOR_INSPECTION",
    );
  }

  const expectedBytes = Number(row.sizeBytes);

  if (
    object.bytes.length !== expectedBytes ||
    object.contentLength !== expectedBytes
  ) {
    await rejectAttachment({
      row,
      reason: "INSPECTION_OBJECT_SIZE_MISMATCH",
    });

    throw new GovernanceNoticeAttachmentError(
      400,
      "ATTACHMENT_INSPECTION_SIZE_MISMATCH",
    );
  }

  let inspection: InspectionResult;

  try {
    inspection = inspectDocument(
      object.bytes,
      row.extension.toLowerCase(),
    );
  } catch (error) {
    const reason =
      error instanceof GovernanceNoticeAttachmentError
        ? error.code
        : "ATTACHMENT_SECURITY_INSPECTION_FAILED";

    await rejectAttachment({ row, reason });

    if (error instanceof GovernanceNoticeAttachmentError) {
      throw error;
    }

    throw new GovernanceNoticeAttachmentError(400, reason);
  }

  const sha256Hash = createHash("sha256")
    .update(object.bytes)
    .digest("hex");

  const now = new Date();

  const updated =
    await prisma.governanceOfficialNoticeAttachment.update({
      where: { id: row.id },
            data: {
        /*
         * Structural inspection alone must never make the attachment sendable.
         * READY is reserved for a future successful malware-engine verdict.
         */
        status: GovernanceOfficialNoticeAttachmentStatus.UPLOADED,
        scanStatus: GovernanceOfficialNoticeAttachmentScanStatus.CLEAN,
        malwareScanStatus:
          GovernanceOfficialNoticeAttachmentMalwareScanStatus.PENDING,
        malwareScanEngine: null,
        malwareSignatureVersion: null,
        malwareScanQueuedAt: now,
        malwareScanStartedAt: null,
        malwareScannedAt: null,
        malwareScanAttempts: 0,
        malwareScanNextAttemptAt: now,
        malwareScanLastError: null,
        malwareDetectedThreat: null,
        verifiedAt: now,
        sha256Hash,
        etag: object.etag ?? row.etag,
        rejectionReason: null,
        metadata: jsonObject({
          ...metadataObject(row.metadata),
          inspectionEngine: INSPECTION_ENGINE,
          inspectionLevel:
            "FILE_SIGNATURE_AND_ACTIVE_CONTENT_SCREEN",
          inspectedAt: now.toISOString(),
          inspectedBytes: object.bytes.length,
          sha256Hash,
          format: inspection.format,
          container: inspection.container,
          activeContentDetected: inspection.activeContentDetected,
          inspectionNotes: inspection.notes,
          externalAntivirusScanner: false,
                    malwareScanRequired: true,
          malwareScanQueuedAt: now.toISOString(),
        }),
      },
      select: attachmentSelect,
    });

    return {
    attachment: serializeAttachment(updated),
    reused: false,
    inspectionEngine: INSPECTION_ENGINE,
    inspection,
    malwareScanRequired: true,
  };
}
