import { createHash } from "crypto";

import type {
  NativeDocumentContainer,
  NativeDocumentExtension,
  NativeDocumentFormat,
  NativeDocumentIdentityEvidence,
  NativeDocumentScannerFinding,
  NativeDocumentScannerInput,
  NativeDocumentScannerReasonCode,
  NativeDocumentScannerResult,
  NativeDocumentScannerVerdict,
} from "./types";

export const HEHXAGON_DOCUMENT_SECURITY_ENGINE =
  "HEHXAGON_DOCUMENT_SECURITY" as const;

export const HEHXAGON_DOCUMENT_SECURITY_ENGINE_VERSION =
  "0.1.0-m1";

/**
 * This is the embedded M1 identity rule set, not the future M4 threat rule pack.
 */
export const HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION =
  "HDS-M1-IDENTITY-V1";

const MAX_SIGNATURE_PREFIX_BYTES = 1024;

const ALLOWED_MIME_TYPES: Record<
  NativeDocumentExtension,
  readonly string[]
> = {
  pdf: ["application/pdf", "application/octet-stream"],
  doc: ["application/msword", "application/octet-stream"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/octet-stream",
  ],
  ppt: [
    "application/vnd.ms-powerpoint",
    "application/octet-stream",
  ],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/octet-stream",
  ],
  xls: ["application/vnd.ms-excel", "application/octet-stream"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/octet-stream",
  ],
};

const OOXML_EXTENSIONS = new Set<NativeDocumentExtension>([
  "docx",
  "pptx",
  "xlsx",
]);

type SignatureIdentity = {
  container: NativeDocumentContainer;
  format: NativeDocumentFormat;
  signatureKind: NativeDocumentIdentityEvidence["signatureKind"];
};

type StreamReadResult =
  | {
      ok: true;
      bytesScanned: number;
      sha256Hash: string;
      prefix: Buffer;
    }
  | {
      ok: false;
      verdict: "BLOCKED" | "FAILED";
      reasonCode: NativeDocumentScannerReasonCode;
      bytesScanned: number;
    };

function cleanMimeType(value: unknown) {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase()
      .split(";")[0]
      ?.trim() ?? ""
  );
}

function normalizeExtension(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "");
}

function isAllowedExtension(
  value: string,
): value is NativeDocumentExtension {
  return Object.prototype.hasOwnProperty.call(
    ALLOWED_MIME_TYPES,
    value,
  );
}

function filenameExtension(filename: string) {
  const dotIndex = filename.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return null;
  }

  return normalizeExtension(filename.slice(dotIndex + 1));
}

function validateFilename(value: unknown) {
  const filename = String(value ?? "").trim();

  if (
    !filename ||
    filename.length > 255 ||
    /[\\/\u0000-\u001f\u007f]/.test(filename)
  ) {
    return null;
  }

  return filename;
}

function validPositiveSafeInteger(value: unknown) {
  const number = Number(value);

  return (
    Number.isSafeInteger(number) &&
    number > 0
  );
}

function normalizeExpectedSha256(value: unknown) {
  const hash = String(value ?? "")
    .trim()
    .toLowerCase();

  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function beginsWith(bytes: Buffer, signature: readonly number[]) {
  if (bytes.length < signature.length) return false;

  return signature.every(
    (value, index) => bytes[index] === value,
  );
}

function detectSignature(prefix: Buffer): SignatureIdentity {
  if (beginsWith(prefix, [0x4d, 0x5a])) {
    return {
      container: "EXECUTABLE",
      format: "UNKNOWN",
      signatureKind: "PE_EXECUTABLE_SIGNATURE",
    };
  }

  if (beginsWith(prefix, [0x7f, 0x45, 0x4c, 0x46])) {
    return {
      container: "EXECUTABLE",
      format: "UNKNOWN",
      signatureKind: "ELF_EXECUTABLE_SIGNATURE",
    };
  }

  const pdfHeaderPosition = prefix.indexOf(
    Buffer.from("%PDF-", "ascii"),
  );

  if (
    pdfHeaderPosition >= 0 &&
    pdfHeaderPosition <= MAX_SIGNATURE_PREFIX_BYTES - 5
  ) {
    return {
      container: "PDF",
      format: "PDF",
      signatureKind: "PDF_HEADER",
    };
  }

  if (
    beginsWith(prefix, [0x50, 0x4b, 0x03, 0x04]) ||
    beginsWith(prefix, [0x50, 0x4b, 0x05, 0x06]) ||
    beginsWith(prefix, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return {
      container: "ZIP",
      format: "ZIP_CONTAINER",
      signatureKind: "ZIP_SIGNATURE",
    };
  }

  if (
    beginsWith(prefix, [
      0xd0,
      0xcf,
      0x11,
      0xe0,
      0xa1,
      0xb1,
      0x1a,
      0xe1,
    ])
  ) {
    return {
      container: "OLE",
      format: "OLE_COMPOUND_FILE",
      signatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
    };
  }

  return {
    container: "UNKNOWN",
    format: "UNKNOWN",
    signatureKind: "UNKNOWN",
  };
}

function expectedContainerForExtension(
  extension: NativeDocumentExtension,
): NativeDocumentContainer {
  if (extension === "pdf") return "PDF";
  if (OOXML_EXTENSIONS.has(extension)) return "ZIP";
  return "OLE";
}

function blankEvidence(args?: {
  filenameExtension?: string | null;
  declaredExtension?: string | null;
  declaredMimeType?: string | null;
}): NativeDocumentIdentityEvidence {
  return {
    filenameExtension: args?.filenameExtension ?? null,
    declaredExtension: args?.declaredExtension ?? null,
    declaredMimeType: args?.declaredMimeType ?? null,
    detectedContainer: "UNKNOWN",
    detectedFormat: "UNKNOWN",
    signatureKind: "UNKNOWN",
    sizeMatched: false,
    sha256Matched: false,
  };
}

function finding(
  code: NativeDocumentScannerReasonCode,
  severity: NativeDocumentScannerFinding["severity"],
  message: string,
): NativeDocumentScannerFinding {
  return { code, severity, message };
}

function result(args: {
  verdict: NativeDocumentScannerVerdict;
  reasonCodes: NativeDocumentScannerReasonCode[];
  findings: NativeDocumentScannerFinding[];
  bytesScanned: number;
  sha256Hash: string | null;
  identityInspectionComplete: boolean;
  identityEvidence: NativeDocumentIdentityEvidence;
}): NativeDocumentScannerResult {
  return {
    engine: HEHXAGON_DOCUMENT_SECURITY_ENGINE,
    engineVersion: HEHXAGON_DOCUMENT_SECURITY_ENGINE_VERSION,
    rulePackVersion:
      HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION,
    verdict: args.verdict,
    reasonCodes: args.reasonCodes,
    findings: args.findings,
    bytesScanned: args.bytesScanned,
    sha256Hash: args.sha256Hash,
    identityInspectionComplete:
      args.identityInspectionComplete,
    inspectionComplete: false,
    identityEvidence: args.identityEvidence,
  };
}

function blocked(args: {
  code: NativeDocumentScannerReasonCode;
  message: string;
  bytesScanned?: number;
  sha256Hash?: string | null;
  identityInspectionComplete?: boolean;
  evidence: NativeDocumentIdentityEvidence;
}) {
  return result({
    verdict: "BLOCKED",
    reasonCodes: [args.code],
    findings: [finding(args.code, "BLOCK", args.message)],
    bytesScanned: args.bytesScanned ?? 0,
    sha256Hash: args.sha256Hash ?? null,
    identityInspectionComplete:
      args.identityInspectionComplete ?? false,
    identityEvidence: args.evidence,
  });
}

function failed(args: {
  code: NativeDocumentScannerReasonCode;
  message: string;
  bytesScanned?: number;
  evidence: NativeDocumentIdentityEvidence;
}) {
  return result({
    verdict: "FAILED",
    reasonCodes: [args.code],
    findings: [finding(args.code, "ERROR", args.message)],
    bytesScanned: args.bytesScanned ?? 0,
    sha256Hash: null,
    identityInspectionComplete: false,
    identityEvidence: args.evidence,
  });
}

async function readBoundedSource(args: {
  input: NativeDocumentScannerInput;
  expectedSizeBytes: number;
  maxBytes: number;
}): Promise<StreamReadResult> {
  const hash = createHash("sha256");
  const prefix = Buffer.alloc(MAX_SIGNATURE_PREFIX_BYTES);
  let prefixLength = 0;
  let bytesScanned = 0;

  try {
    for await (const rawChunk of args.input.source) {
      if (!(rawChunk instanceof Uint8Array)) {
        return {
          ok: false,
          verdict: "FAILED",
          reasonCode: "SOURCE_CHUNK_INVALID",
          bytesScanned,
        };
      }

      if (rawChunk.byteLength === 0) continue;

      const chunk = Buffer.from(
        rawChunk.buffer,
        rawChunk.byteOffset,
        rawChunk.byteLength,
      );

      bytesScanned += chunk.length;

      if (bytesScanned > args.maxBytes) {
        return {
          ok: false,
          verdict: "FAILED",
          reasonCode: "RESOURCE_LIMIT_EXCEEDED",
          bytesScanned,
        };
      }

      if (bytesScanned > args.expectedSizeBytes) {
        return {
          ok: false,
          verdict: "BLOCKED",
          reasonCode: "SIZE_EXCEEDS_EXPECTED",
          bytesScanned,
        };
      }

      hash.update(chunk);

      if (prefixLength < MAX_SIGNATURE_PREFIX_BYTES) {
        const copyLength = Math.min(
          chunk.length,
          MAX_SIGNATURE_PREFIX_BYTES - prefixLength,
        );

        chunk.copy(prefix, prefixLength, 0, copyLength);
        prefixLength += copyLength;
      }
    }
  } catch {
    return {
      ok: false,
      verdict: "FAILED",
      reasonCode: "SOURCE_READ_FAILED",
      bytesScanned,
    };
  }

  if (bytesScanned === 0) {
    return {
      ok: false,
      verdict: "BLOCKED",
      reasonCode: "EMPTY_SOURCE",
      bytesScanned: 0,
    };
  }

  if (bytesScanned !== args.expectedSizeBytes) {
    return {
      ok: false,
      verdict: "BLOCKED",
      reasonCode: "SIZE_MISMATCH",
      bytesScanned,
    };
  }

  return {
    ok: true,
    bytesScanned,
    sha256Hash: hash.digest("hex"),
    prefix: prefix.subarray(0, prefixLength),
  };
}

/**
 * M1: bounded byte integrity + broad document/container identity.
 *
 * This function intentionally does not parse ZIP members, PDF object graphs,
 * OLE streams, macros, embedded files, JavaScript, relationships, encryption,
 * or exploit patterns. Those capabilities belong to later milestones.
 */
export async function inspectNativeDocumentIdentity(
  input: NativeDocumentScannerInput,
): Promise<NativeDocumentScannerResult> {
  const declaredExtension = normalizeExtension(
    input.declaredExtension,
  );
  const declaredMimeType = cleanMimeType(
    input.declaredMimeType,
  );

  const filename = validateFilename(input.declaredFilename);
  const fromFilename = filename
    ? filenameExtension(filename)
    : null;

  let evidence = blankEvidence({
    filenameExtension: fromFilename,
    declaredExtension: declaredExtension || null,
    declaredMimeType: declaredMimeType || null,
  });

  if (!filename) {
    return blocked({
      code: "FILENAME_INVALID",
      message: "The declared filename is not valid for document inspection.",
      evidence,
    });
  }

  if (!isAllowedExtension(declaredExtension)) {
    return blocked({
      code: "UNSUPPORTED_EXTENSION",
      message: "The declared document extension is not supported.",
      evidence,
    });
  }

  if (fromFilename !== declaredExtension) {
    return blocked({
      code: "FILENAME_EXTENSION_MISMATCH",
      message:
        "The filename extension does not match the declared document extension.",
      evidence,
    });
  }

  if (
    !declaredMimeType ||
    !ALLOWED_MIME_TYPES[declaredExtension].includes(
      declaredMimeType,
    )
  ) {
    return blocked({
      code: "DECLARED_MIME_TYPE_MISMATCH",
      message:
        "The declared MIME type does not match the declared document extension.",
      evidence,
    });
  }

  if (
    !validPositiveSafeInteger(input.expectedSizeBytes) ||
    !validPositiveSafeInteger(input.limits?.maxBytes) ||
    !normalizeExpectedSha256(input.expectedSha256)
  ) {
    return failed({
      code: "SCANNER_INPUT_INVALID",
      message:
        "Required scanner integrity inputs are invalid.",
      evidence,
    });
  }

  const expectedSizeBytes = Number(input.expectedSizeBytes);
  const maxBytes = Number(input.limits.maxBytes);
  const expectedSha256 = normalizeExpectedSha256(
    input.expectedSha256,
  ) as string;

  if (expectedSizeBytes > maxBytes) {
    return failed({
      code: "RESOURCE_LIMIT_EXCEEDED",
      message:
        "The expected document size exceeds the scanner resource limit.",
      evidence,
    });
  }

  const read = await readBoundedSource({
    input,
    expectedSizeBytes,
    maxBytes,
  });

  if (!read.ok) {
    const messageByCode: Partial<
      Record<NativeDocumentScannerReasonCode, string>
    > = {
      EMPTY_SOURCE: "The document source contained no bytes.",
      SOURCE_CHUNK_INVALID:
        "The document source produced an invalid byte chunk.",
      SOURCE_READ_FAILED:
        "The document source could not be read safely.",
      RESOURCE_LIMIT_EXCEEDED:
        "The document exceeded the scanner resource limit.",
      SIZE_EXCEEDS_EXPECTED:
        "The document contained more bytes than expected.",
      SIZE_MISMATCH:
        "The document byte count did not match the expected size.",
    };

    if (read.verdict === "FAILED") {
      return failed({
        code: read.reasonCode,
        message:
          messageByCode[read.reasonCode] ??
          "The document source could not be inspected safely.",
        bytesScanned: read.bytesScanned,
        evidence,
      });
    }

    return blocked({
      code: read.reasonCode,
      message:
        messageByCode[read.reasonCode] ??
        "The document source did not satisfy identity checks.",
      bytesScanned: read.bytesScanned,
      evidence,
    });
  }

  const shaMatched = read.sha256Hash === expectedSha256;

  if (!shaMatched) {
    return blocked({
      code: "SHA256_MISMATCH",
      message:
        "The document SHA-256 does not match the expected integrity evidence.",
      bytesScanned: read.bytesScanned,
      sha256Hash: read.sha256Hash,
      evidence: {
        ...evidence,
        sizeMatched: true,
        sha256Matched: false,
      },
    });
  }

  const signature = detectSignature(read.prefix);

  evidence = {
    ...evidence,
    detectedContainer: signature.container,
    detectedFormat: signature.format,
    signatureKind: signature.signatureKind,
    sizeMatched: true,
    sha256Matched: true,
  };

  if (signature.container === "EXECUTABLE") {
    return blocked({
      code: "EXECUTABLE_SIGNATURE_DETECTED",
      message:
        "Executable binary content is not permitted as an institutional document.",
      bytesScanned: read.bytesScanned,
      sha256Hash: read.sha256Hash,
      identityInspectionComplete: true,
      evidence,
    });
  }

  if (signature.container === "UNKNOWN") {
    return blocked({
      code: "BINARY_SIGNATURE_UNSUPPORTED",
      message:
        "The document binary signature is not a supported document container.",
      bytesScanned: read.bytesScanned,
      sha256Hash: read.sha256Hash,
      identityInspectionComplete: true,
      evidence,
    });
  }

  const expectedContainer = expectedContainerForExtension(
    declaredExtension,
  );

  if (signature.container !== expectedContainer) {
    return blocked({
      code: "EXTENSION_CONTAINER_MISMATCH",
      message:
        "The detected document container does not match the declared extension.",
      bytesScanned: read.bytesScanned,
      sha256Hash: read.sha256Hash,
      identityInspectionComplete: true,
      evidence,
    });
  }

  return result({
    verdict: "IDENTITY_VERIFIED",
    reasonCodes: [
      "IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED",
    ],
    findings: [
      finding(
        "IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED",
        "INFO",
        "Byte integrity and broad container identity are verified; deeper document security inspection is still required.",
      ),
    ],
    bytesScanned: read.bytesScanned,
    sha256Hash: read.sha256Hash,
    identityInspectionComplete: true,
    identityEvidence: evidence,
  });
}
