import { createHash } from "crypto";

import {
  inspectNativeDocumentIdentity,
} from "../src/lib/security/documentScanner/nativeDocumentScanner";
import type {
  NativeDocumentScannerResult,
} from "../src/lib/security/documentScanner/types";

const TEN_MB = 10 * 1024 * 1024;

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceFromChunks(...chunks: Uint8Array[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

function throwingSource() {
  return (async function* () {
    yield Buffer.from("%PDF-1.7\n", "ascii");
    throw new Error("SECRET_STORAGE_KEY_SHOULD_NEVER_LEAK");
  })();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`SELFTEST_ASSERTION_FAILED: ${message}`);
  }
}

function assertVerdict(
  result: NativeDocumentScannerResult,
  expected: NativeDocumentScannerResult["verdict"],
  expectedReason: string,
) {
  assert(
    result.verdict === expected,
    `Expected ${expected}, received ${result.verdict}.`,
  );
  assert(
    result.reasonCodes.includes(
      expectedReason as NativeDocumentScannerResult["reasonCodes"][number],
    ),
    `Expected reason ${expectedReason}.`,
  );
}

function assertSanitized(result: NativeDocumentScannerResult) {
  const serialized = JSON.stringify(result);

  for (const forbidden of [
    "SECRET_STORAGE_KEY_SHOULD_NEVER_LEAK",
    "objectKey",
    "tenantId",
    "databaseUrl",
    "stack",
    "rawBytes",
  ]) {
    assert(
      !serialized.includes(forbidden),
      `Result leaked forbidden material: ${forbidden}`,
    );
  }

  assert(
    !serialized.includes('"verdict":"CLEAN"'),
    "M1 must never emit CLEAN.",
  );
  assert(
    result.inspectionComplete === false,
    "M1 inspectionComplete must always remain false.",
  );
}

async function inspectFixture(args: {
  bytes: Buffer;
  filename: string;
  extension: string;
  mimeType: string;
  expectedSizeBytes?: number;
  expectedSha256?: string;
  maxBytes?: number;
}) {
  return inspectNativeDocumentIdentity({
    source: sourceFromChunks(
      args.bytes.subarray(0, Math.min(3, args.bytes.length)),
      args.bytes.subarray(Math.min(3, args.bytes.length)),
    ),
    expectedSizeBytes:
      args.expectedSizeBytes ?? args.bytes.length,
    expectedSha256:
      args.expectedSha256 ?? sha256(args.bytes),
    declaredFilename: args.filename,
    declaredExtension: args.extension,
    declaredMimeType: args.mimeType,
    limits: {
      maxBytes: args.maxBytes ?? TEN_MB,
    },
  });
}

async function run() {
  const pdf = Buffer.from(
    "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n",
    "ascii",
  );
  const zip = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const ole = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const executable = Buffer.from([
    0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
  ]);

  const positiveCases = [
    await inspectFixture({
      bytes: pdf,
      filename: "notice.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
    await inspectFixture({
      bytes: zip,
      filename: "letter.docx",
      extension: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    await inspectFixture({
      bytes: zip,
      filename: "slides.pptx",
      extension: "pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    await inspectFixture({
      bytes: zip,
      filename: "sheet.xlsx",
      extension: "xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    await inspectFixture({
      bytes: ole,
      filename: "legacy.doc",
      extension: "doc",
      mimeType: "application/msword",
    }),
  ];

  for (const result of positiveCases) {
    assertVerdict(
      result,
      "IDENTITY_VERIFIED",
      "IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED",
    );
    assert(result.identityInspectionComplete, "Identity inspection should complete.");
    assert(result.identityEvidence.sizeMatched, "Size evidence should match.");
    assert(result.identityEvidence.sha256Matched, "SHA evidence should match.");
    assertSanitized(result);
  }

  assert(
    positiveCases[1]?.identityEvidence.detectedFormat === "ZIP_CONTAINER" &&
      positiveCases[2]?.identityEvidence.detectedFormat === "ZIP_CONTAINER" &&
      positiveCases[3]?.identityEvidence.detectedFormat === "ZIP_CONTAINER",
    "M1 must not pretend ZIP alone distinguishes DOCX/XLSX/PPTX.",
  );

  const unsupportedExtension = await inspectFixture({
    bytes: pdf,
    filename: "notice.txt",
    extension: "txt",
    mimeType: "text/plain",
  });
  assertVerdict(
    unsupportedExtension,
    "BLOCKED",
    "UNSUPPORTED_EXTENSION",
  );

  const mimeMismatch = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/msword",
  });
  assertVerdict(
    mimeMismatch,
    "BLOCKED",
    "DECLARED_MIME_TYPE_MISMATCH",
  );

  const filenameExtensionMismatch = await inspectFixture({
    bytes: pdf,
    filename: "notice.docx",
    extension: "pdf",
    mimeType: "application/pdf",
  });
  assertVerdict(
    filenameExtensionMismatch,
    "BLOCKED",
    "FILENAME_EXTENSION_MISMATCH",
  );

  const executableDisguisedAsPdf = await inspectFixture({
    bytes: executable,
    filename: "report.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
  });
  assertVerdict(
    executableDisguisedAsPdf,
    "BLOCKED",
    "EXECUTABLE_SIGNATURE_DETECTED",
  );

  const extensionContainerMismatch = await inspectFixture({
    bytes: pdf,
    filename: "letter.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    extensionContainerMismatch,
    "BLOCKED",
    "EXTENSION_CONTAINER_MISMATCH",
  );

  const smallerThanDeclared = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    expectedSizeBytes: pdf.length + 1,
  });
  assertVerdict(
    smallerThanDeclared,
    "BLOCKED",
    "SIZE_MISMATCH",
  );

  const largerThanDeclared = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    expectedSizeBytes: pdf.length - 1,
  });
  assertVerdict(
    largerThanDeclared,
    "BLOCKED",
    "SIZE_EXCEEDS_EXPECTED",
  );

  const shaMismatch = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    expectedSha256: "0".repeat(64),
  });
  assertVerdict(
    shaMismatch,
    "BLOCKED",
    "SHA256_MISMATCH",
  );

  const empty = Buffer.alloc(0);
  const emptySource = await inspectNativeDocumentIdentity({
    source: sourceFromChunks(empty),
    expectedSizeBytes: 1,
    expectedSha256: sha256(Buffer.from([0x00])),
    declaredFilename: "notice.pdf",
    declaredExtension: "pdf",
    declaredMimeType: "application/pdf",
    limits: { maxBytes: TEN_MB },
  });
  assertVerdict(emptySource, "BLOCKED", "EMPTY_SOURCE");

  const truncatedSignature = Buffer.from("%PD", "ascii");
  const truncated = await inspectFixture({
    bytes: truncatedSignature,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
  });
  assertVerdict(
    truncated,
    "BLOCKED",
    "BINARY_SIGNATURE_UNSUPPORTED",
  );

  const streamFailure = await inspectNativeDocumentIdentity({
    source: throwingSource(),
    expectedSizeBytes: 100,
    expectedSha256: "0".repeat(64),
    declaredFilename: "notice.pdf",
    declaredExtension: "pdf",
    declaredMimeType: "application/pdf",
    limits: { maxBytes: TEN_MB },
  });
  assertVerdict(
    streamFailure,
    "FAILED",
    "SOURCE_READ_FAILED",
  );
  assertSanitized(streamFailure);

  const resourceLimit = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    maxBytes: pdf.length - 1,
  });
  assertVerdict(
    resourceLimit,
    "FAILED",
    "RESOURCE_LIMIT_EXCEEDED",
  );

  const allResults = [
    ...positiveCases,
    unsupportedExtension,
    mimeMismatch,
    filenameExtensionMismatch,
    executableDisguisedAsPdf,
    extensionContainerMismatch,
    smallerThanDeclared,
    largerThanDeclared,
    shaMismatch,
    emptySource,
    truncated,
    streamFailure,
    resourceLimit,
  ];

  for (const result of allResults) {
    assertSanitized(result);
  }

  console.log("HDS M1 native document scanner self-test: GREEN");
  console.log(`Cases: ${allResults.length}`);
  console.log("Identity-valid documents remain non-CLEAN: GREEN");
  console.log("OOXML ZIP ambiguity preserved until M2: GREEN");
  console.log("Sanitized result boundary: GREEN");
}

run().catch(() => {
  console.error("HDS M1 native document scanner self-test: FAILED");
  process.exitCode = 1;
});
