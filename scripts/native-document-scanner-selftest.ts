import { createHash } from "crypto";
import { deflateRawSync } from "node:zlib";

import {
  inspectNativeDocumentIdentity,
} from "../src/lib/security/documentScanner/nativeDocumentScanner";
import type {
  NativeDocumentArchiveLimits,
  NativeDocumentScannerResult,
} from "../src/lib/security/documentScanner/types";

const TEN_MB = 10 * 1024 * 1024;

const ARCHIVE_LIMITS: NativeDocumentArchiveLimits = {
  maxEntries: 128,
  maxEntryUncompressedBytes: 2 * 1024 * 1024,
  maxTotalUncompressedBytes: 8 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxControlPartBytes: 256 * 1024,
};

type ZipFixtureEntry = {
  name: string;
  data: Buffer;
  method?: 0 | 8 | number;
  flags?: number;
};

type BuiltZipEntry = {
  name: string;
  localOffset: number;
  centralOffset: number;
  dataOffset: number;
  compressedSize: number;
};

type BuiltZip = {
  bytes: Buffer;
  entries: BuiltZipEntry[];
  eocdOffset: number;
};

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
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
  expectedReason: NativeDocumentScannerResult["reasonCodes"][number],
) {
  assert(
    result.verdict === expected,
    `Expected ${expected}, received ${result.verdict}.`,
  );
  assert(
    result.reasonCodes.includes(expectedReason),
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
    "M2 must never emit CLEAN.",
  );
  assert(
    result.inspectionComplete === false,
    "M2 inspectionComplete must always remain false.",
  );
}

function buildZip(entries: ZipFixtureEntry[]): BuiltZip {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const builtEntries: BuiltZipEntry[] = [];
  let localOffset = 0;
  let centralOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const flags = (entry.flags ?? 0) | 0x0800;
    const method = entry.method ?? 8;
    const compressed =
      method === 0
        ? Buffer.from(entry.data)
        : method === 8
          ? deflateRawSync(entry.data)
          : Buffer.from(entry.data);
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const dataOffset = localOffset + local.length;
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);

    centralParts.push(central);
    builtEntries.push({
      name: entry.name,
      localOffset,
      centralOffset,
      dataOffset,
      compressedSize: compressed.length,
    });

    localOffset += local.length + compressed.length;
    centralOffset += central.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);
  const eocdOffset = localDirectory.length + centralDirectory.length;

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localDirectory.length, 16);
  eocd.writeUInt16LE(0, 20);

  return {
    bytes: Buffer.concat([localDirectory, centralDirectory, eocd]),
    entries: builtEntries.map((entry) => ({
      ...entry,
      centralOffset: localDirectory.length + entry.centralOffset,
    })),
    eocdOffset,
  };
}

function contentTypesXml(args: {
  mainPart: string;
  contentType: string;
}) {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Override PartName="/${args.mainPart}" ContentType="${args.contentType}"/>` +
      `</Types>`,
    "utf8",
  );
}

function relationshipsXml(mainPart: string) {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainPart}"/>` +
      `</Relationships>`,
    "utf8",
  );
}

function packageFixture(
  kind: "docx" | "pptx" | "xlsx",
  extraEntries: ZipFixtureEntry[] = [],
) {
  const definition =
    kind === "docx"
      ? {
          mainPart: "word/document.xml",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
        }
      : kind === "pptx"
        ? {
            mainPart: "ppt/presentation.xml",
            contentType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
          }
        : {
            mainPart: "xl/workbook.xml",
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
          };

  return buildZip([
    {
      name: "[Content_Types].xml",
      data: contentTypesXml(definition),
    },
    {
      name: "_rels/.rels",
      data: relationshipsXml(definition.mainPart),
    },
    {
      name: definition.mainPart,
      data: Buffer.from("<root/>", "utf8"),
    },
    ...extraEntries,
  ]);
}

async function inspectFixture(args: {
  bytes: Buffer;
  filename: string;
  extension: string;
  mimeType: string;
  expectedSizeBytes?: number;
  expectedSha256?: string;
  maxBytes?: number;
  archiveLimits?: NativeDocumentArchiveLimits | null;
}) {
  return inspectNativeDocumentIdentity({
    source: sourceFromChunks(
      args.bytes.subarray(0, Math.min(7, args.bytes.length)),
      args.bytes.subarray(Math.min(7, args.bytes.length)),
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
      ...(args.archiveLimits === null
        ? {}
        : {
            archive: args.archiveLimits ?? ARCHIVE_LIMITS,
          }),
    },
  });
}

async function run() {
  const pdf = Buffer.from(
    "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n",
    "ascii",
  );
  const ole = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const executable = Buffer.from([
    0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
  ]);

  const docx = packageFixture("docx");
  const pptx = packageFixture("pptx");
  const xlsx = packageFixture("xlsx");

  const positiveCases = [
    await inspectFixture({
      bytes: pdf,
      filename: "notice.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
      archiveLimits: null,
    }),
    await inspectFixture({
      bytes: docx.bytes,
      filename: "letter.docx",
      extension: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    await inspectFixture({
      bytes: pptx.bytes,
      filename: "slides.pptx",
      extension: "pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    await inspectFixture({
      bytes: xlsx.bytes,
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
      archiveLimits: null,
    }),
  ];

  assertVerdict(
    positiveCases[0] as NativeDocumentScannerResult,
    "IDENTITY_VERIFIED",
    "IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED",
  );
  assertVerdict(
    positiveCases[4] as NativeDocumentScannerResult,
    "IDENTITY_VERIFIED",
    "IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED",
  );

  const expectedFormats = [
    "WORD_OOXML",
    "POWERPOINT_OOXML",
    "EXCEL_OOXML",
  ] as const;

  for (let index = 1; index <= 3; index += 1) {
    const result = positiveCases[index] as NativeDocumentScannerResult;
    const expectedFormat = expectedFormats[index - 1];

    assertVerdict(
      result,
      "IDENTITY_VERIFIED",
      "OOXML_PACKAGE_IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED",
    );
    assert(
      result.identityEvidence.detectedFormat === expectedFormat,
      `Expected ${expectedFormat} package identity.`,
    );
    assert(
      result.archiveInspectionComplete === true,
      "OOXML archive inspection should complete.",
    );
    assert(
      result.archiveEvidence?.packageFormat === expectedFormat,
      "OOXML archive evidence should carry the package format.",
    );
    assert(
      result.archiveEvidence?.zip64 === false &&
        result.archiveEvidence.multiDisk === false,
      "Bounded OOXML evidence must exclude ZIP64 and multi-disk containers.",
    );
  }

  for (const result of positiveCases) {
    assert(result.identityInspectionComplete, "Identity inspection should complete.");
    assert(result.identityEvidence.sizeMatched, "Size evidence should match.");
    assert(result.identityEvidence.sha256Matched, "SHA evidence should match.");
    assertSanitized(result);
  }

  const unsupportedExtension = await inspectFixture({
    bytes: pdf,
    filename: "notice.txt",
    extension: "txt",
    mimeType: "text/plain",
    archiveLimits: null,
  });
  assertVerdict(unsupportedExtension, "BLOCKED", "UNSUPPORTED_EXTENSION");

  const mimeMismatch = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/msword",
    archiveLimits: null,
  });
  assertVerdict(mimeMismatch, "BLOCKED", "DECLARED_MIME_TYPE_MISMATCH");

  const filenameExtensionMismatch = await inspectFixture({
    bytes: pdf,
    filename: "notice.docx",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
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
    archiveLimits: null,
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
    archiveLimits: null,
  });
  assertVerdict(smallerThanDeclared, "BLOCKED", "SIZE_MISMATCH");

  const largerThanDeclared = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    expectedSizeBytes: pdf.length - 1,
    archiveLimits: null,
  });
  assertVerdict(largerThanDeclared, "BLOCKED", "SIZE_EXCEEDS_EXPECTED");

  const shaMismatch = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    expectedSha256: "0".repeat(64),
    archiveLimits: null,
  });
  assertVerdict(shaMismatch, "BLOCKED", "SHA256_MISMATCH");

  const emptySource = await inspectNativeDocumentIdentity({
    source: sourceFromChunks(Buffer.alloc(0)),
    expectedSizeBytes: 1,
    expectedSha256: sha256(Buffer.from([0x00])),
    declaredFilename: "notice.pdf",
    declaredExtension: "pdf",
    declaredMimeType: "application/pdf",
    limits: { maxBytes: TEN_MB },
  });
  assertVerdict(emptySource, "BLOCKED", "EMPTY_SOURCE");

  const truncated = await inspectFixture({
    bytes: Buffer.from("%PD", "ascii"),
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(truncated, "BLOCKED", "BINARY_SIGNATURE_UNSUPPORTED");

  const streamFailure = await inspectNativeDocumentIdentity({
    source: throwingSource(),
    expectedSizeBytes: 100,
    expectedSha256: "0".repeat(64),
    declaredFilename: "notice.pdf",
    declaredExtension: "pdf",
    declaredMimeType: "application/pdf",
    limits: { maxBytes: TEN_MB },
  });
  assertVerdict(streamFailure, "FAILED", "SOURCE_READ_FAILED");

  const resourceLimit = await inspectFixture({
    bytes: pdf,
    filename: "notice.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    maxBytes: pdf.length - 1,
    archiveLimits: null,
  });
  assertVerdict(resourceLimit, "FAILED", "RESOURCE_LIMIT_EXCEEDED");

  const missingArchiveLimits = await inspectFixture({
    bytes: docx.bytes,
    filename: "letter.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archiveLimits: null,
  });
  assertVerdict(
    missingArchiveLimits,
    "FAILED",
    "OOXML_ARCHIVE_LIMITS_REQUIRED",
  );

  const fakeZip = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00,
  ]);
  const eocdMissing = await inspectFixture({
    bytes: fakeZip,
    filename: "fake.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    eocdMissing,
    "BLOCKED",
    "ZIP_END_OF_CENTRAL_DIRECTORY_MISSING",
  );

  const wrongApplication = await inspectFixture({
    bytes: xlsx.bytes,
    filename: "wrong.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    wrongApplication,
    "BLOCKED",
    "OOXML_APPLICATION_MISMATCH",
  );

  const missingContentTypes = buildZip([
    {
      name: "_rels/.rels",
      data: relationshipsXml("word/document.xml"),
    },
    {
      name: "word/document.xml",
      data: Buffer.from("<root/>", "utf8"),
    },
  ]);
  const contentTypesMissing = await inspectFixture({
    bytes: missingContentTypes.bytes,
    filename: "missing.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    contentTypesMissing,
    "BLOCKED",
    "OOXML_CONTENT_TYPES_MISSING",
  );

  const missingRelationships = buildZip([
    {
      name: "[Content_Types].xml",
      data: contentTypesXml({
        mainPart: "word/document.xml",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      }),
    },
    {
      name: "word/document.xml",
      data: Buffer.from("<root/>", "utf8"),
    },
  ]);
  const relationshipsMissing = await inspectFixture({
    bytes: missingRelationships.bytes,
    filename: "missing.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    relationshipsMissing,
    "BLOCKED",
    "OOXML_ROOT_RELATIONSHIPS_MISSING",
  );

  const traversal = packageFixture("docx", [
    {
      name: "../evil.bin",
      data: Buffer.from("x"),
    },
  ]);
  const traversalResult = await inspectFixture({
    bytes: traversal.bytes,
    filename: "traversal.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    traversalResult,
    "BLOCKED",
    "ZIP_ENTRY_PATH_TRAVERSAL",
  );

  const absolutePath = packageFixture("docx", [
    {
      name: "/evil.bin",
      data: Buffer.from("x"),
    },
  ]);
  const absolutePathResult = await inspectFixture({
    bytes: absolutePath.bytes,
    filename: "absolute.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    absolutePathResult,
    "BLOCKED",
    "ZIP_ENTRY_ABSOLUTE_PATH",
  );

  const duplicate = packageFixture("docx", [
    {
      name: "WORD/DOCUMENT.XML",
      data: Buffer.from("duplicate", "utf8"),
    },
  ]);
  const duplicateResult = await inspectFixture({
    bytes: duplicate.bytes,
    filename: "duplicate.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(duplicateResult, "BLOCKED", "ZIP_DUPLICATE_ENTRY");

  const encrypted = packageFixture("docx", [
    {
      name: "custom/secret.bin",
      data: Buffer.from("secret"),
      flags: 0x0001,
    },
  ]);
  const encryptedResult = await inspectFixture({
    bytes: encrypted.bytes,
    filename: "encrypted.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(encryptedResult, "BLOCKED", "ZIP_ENTRY_ENCRYPTED");

  const unsupportedCompression = packageFixture("docx", [
    {
      name: "custom/data.bin",
      data: Buffer.from("data"),
      method: 12,
    },
  ]);
  const unsupportedCompressionResult = await inspectFixture({
    bytes: unsupportedCompression.bytes,
    filename: "method.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    unsupportedCompressionResult,
    "BLOCKED",
    "ZIP_COMPRESSION_METHOD_UNSUPPORTED",
  );

  const entryCountResult = await inspectFixture({
    bytes: docx.bytes,
    filename: "count.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archiveLimits: {
      ...ARCHIVE_LIMITS,
      maxEntries: 2,
    },
  });
  assertVerdict(
    entryCountResult,
    "BLOCKED",
    "ZIP_ENTRY_COUNT_LIMIT_EXCEEDED",
  );

  const entrySizeResult = await inspectFixture({
    bytes: docx.bytes,
    filename: "entry-size.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archiveLimits: {
      ...ARCHIVE_LIMITS,
      maxEntryUncompressedBytes: 100,
      maxControlPartBytes: 100,
    },
  });
  assertVerdict(
    entrySizeResult,
    "BLOCKED",
    "ZIP_ENTRY_SIZE_LIMIT_EXCEEDED",
  );

  const expandedPackage = packageFixture("docx", [
    { name: "custom/a.bin", data: Buffer.alloc(300, 0x41) },
    { name: "custom/b.bin", data: Buffer.alloc(300, 0x42) },
    { name: "custom/c.bin", data: Buffer.alloc(300, 0x43) },
  ]);
  const totalExpandedResult = await inspectFixture({
    bytes: expandedPackage.bytes,
    filename: "expanded.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archiveLimits: {
      ...ARCHIVE_LIMITS,
      maxEntryUncompressedBytes: 512,
      maxTotalUncompressedBytes: 900,
      maxControlPartBytes: 256,
    },
  });
  assertVerdict(
    totalExpandedResult,
    "BLOCKED",
    "ZIP_TOTAL_EXPANDED_SIZE_LIMIT_EXCEEDED",
  );

  const highRatio = packageFixture("docx", [
    {
      name: "custom/high-ratio.bin",
      data: Buffer.alloc(16 * 1024, 0x41),
    },
  ]);
  const highRatioResult = await inspectFixture({
    bytes: highRatio.bytes,
    filename: "ratio.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archiveLimits: {
      ...ARCHIVE_LIMITS,
      maxCompressionRatio: 10,
    },
  });
  assertVerdict(
    highRatioResult,
    "BLOCKED",
    "ZIP_COMPRESSION_RATIO_LIMIT_EXCEEDED",
  );

  const controlPartLimit = await inspectFixture({
    bytes: docx.bytes,
    filename: "control.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archiveLimits: {
      ...ARCHIVE_LIMITS,
      maxControlPartBytes: 64,
    },
  });
  assertVerdict(
    controlPartLimit,
    "BLOCKED",
    "OOXML_CONTROL_PART_TOO_LARGE",
  );

  const corruptLocal = Buffer.from(docx.bytes);
  const wordEntry = docx.entries.find(
    (entry) => entry.name === "word/document.xml",
  );
  assert(wordEntry, "Expected Word main part fixture.");
  corruptLocal.writeUInt32LE(0x11111111, wordEntry.localOffset);
  const corruptLocalResult = await inspectFixture({
    bytes: corruptLocal,
    filename: "local.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    corruptLocalResult,
    "BLOCKED",
    "ZIP_LOCAL_HEADER_INVALID",
  );

  const zip64 = Buffer.from(docx.bytes);
  zip64.writeUInt16LE(0xffff, docx.eocdOffset + 8);
  zip64.writeUInt16LE(0xffff, docx.eocdOffset + 10);
  const zip64Result = await inspectFixture({
    bytes: zip64,
    filename: "zip64.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(zip64Result, "BLOCKED", "ZIP64_UNSUPPORTED");

  const multiDisk = Buffer.from(docx.bytes);
  multiDisk.writeUInt16LE(1, docx.eocdOffset + 4);
  const multiDiskResult = await inspectFixture({
    bytes: multiDisk,
    filename: "multi.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    multiDiskResult,
    "BLOCKED",
    "ZIP_MULTI_DISK_UNSUPPORTED",
  );

  const badContentType = buildZip([
    {
      name: "[Content_Types].xml",
      data: contentTypesXml({
        mainPart: "word/document.xml",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
      }),
    },
    {
      name: "_rels/.rels",
      data: relationshipsXml("word/document.xml"),
    },
    {
      name: "word/document.xml",
      data: Buffer.from("<root/>", "utf8"),
    },
  ]);
  const badContentTypeResult = await inspectFixture({
    bytes: badContentType.bytes,
    filename: "content-type.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    badContentTypeResult,
    "BLOCKED",
    "OOXML_MAIN_DOCUMENT_CONTENT_TYPE_MISMATCH",
  );

  const externalRelationship = buildZip([
    {
      name: "[Content_Types].xml",
      data: contentTypesXml({
        mainPart: "word/document.xml",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      }),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="https://example.invalid/document.xml" TargetMode="External"/>` +
          `</Relationships>`,
        "utf8",
      ),
    },
    {
      name: "word/document.xml",
      data: Buffer.from("<root/>", "utf8"),
    },
  ]);
  const externalRelationshipResult = await inspectFixture({
    bytes: externalRelationship.bytes,
    filename: "external.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    externalRelationshipResult,
    "BLOCKED",
    "OOXML_MAIN_DOCUMENT_RELATIONSHIP_EXTERNAL",
  );

  const corruptControl = Buffer.from(docx.bytes);
  const relEntry = docx.entries.find(
    (entry) => entry.name === "_rels/.rels",
  );
  assert(relEntry, "Expected root relationships fixture.");
  assert(relEntry.compressedSize > 2, "Expected compressed relationships bytes.");
  corruptControl[relEntry.dataOffset + 1] ^= 0xff;
  const corruptControlResult = await inspectFixture({
    bytes: corruptControl,
    filename: "corrupt.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert(
    corruptControlResult.verdict === "FAILED" &&
      [
        "OOXML_CONTROL_PART_DECOMPRESSION_FAILED",
        "OOXML_CONTROL_PART_CRC_MISMATCH",
      ].some((code) => corruptControlResult.reasonCodes.includes(
        code as NativeDocumentScannerResult["reasonCodes"][number],
      )),
    "Corrupt OOXML control data must fail closed.",
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
    missingArchiveLimits,
    eocdMissing,
    wrongApplication,
    contentTypesMissing,
    relationshipsMissing,
    traversalResult,
    absolutePathResult,
    duplicateResult,
    encryptedResult,
    unsupportedCompressionResult,
    entryCountResult,
    entrySizeResult,
    totalExpandedResult,
    highRatioResult,
    controlPartLimit,
    corruptLocalResult,
    zip64Result,
    multiDiskResult,
    badContentTypeResult,
    externalRelationshipResult,
    corruptControlResult,
  ];

  for (const result of allResults) {
    assertSanitized(result);
  }

  console.log("HDS M2 native document scanner self-test: GREEN");
  console.log(`Cases: ${allResults.length}`);
  console.log("M1 identity/integrity regression: GREEN");
  console.log("DOCX/XLSX/PPTX package identity: GREEN");
  console.log("Central-directory/path/encryption/resource guards: GREEN");
  console.log("Only bounded OPC control parts are decompressed: GREEN");
  console.log("Identity-valid documents remain non-CLEAN: GREEN");
  console.log("Sanitized result boundary: GREEN");
}

run().catch(() => {
  console.error("HDS M2 native document scanner self-test: FAILED");
  process.exitCode = 1;
});
