import { createHash } from "crypto";
import { deflateRawSync } from "node:zlib";

import {
  inspectNativeDocumentIdentity,
} from "../src/lib/security/documentScanner/nativeDocumentScanner";
import type {
  NativeDocumentArchiveLimits,
  NativeDocumentPdfLimits,
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

const PDF_LIMITS: NativeDocumentPdfLimits = {
  maxObjects: 128,
  maxIncrementalUpdates: 4,
  maxNestingDepth: 24,
  maxTokenBytes: 4096,
  maxStringBytes: 64 * 1024,
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
    "M3B1 must never emit CLEAN.",
  );
  assert(
    result.inspectionComplete === false,
    "M3B1 inspectionComplete must always remain false.",
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
  extraOverrides?: Array<{ partName: string; contentType: string }>;
}) {
  const extras = (args.extraOverrides ?? [])
    .map(
      (item) =>
        `<Override PartName="/${item.partName}" ContentType="${item.contentType}"/>`,
    )
    .join("");

  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Override PartName="/${args.mainPart}" ContentType="${args.contentType}"/>` +
      extras +
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

function relationshipPartXml(
  relationships: Array<{
    id: string;
    type: string;
    target: string;
    targetMode?: string;
  }>,
) {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      relationships
        .map(
          (item) =>
            `<Relationship Id="${item.id}" Type="${item.type}" Target="${item.target}"${
              item.targetMode
                ? ` TargetMode="${item.targetMode}"`
                : ""
            }/>`,
        )
        .join("") +
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


type ClassicPdfFixtureOptions = {
  catalogExtra?: string;
  catalogOverride?: string;
  pageExtra?: string;
  trailerExtra?: string;
  extraObjects?: string[];
};

function buildClassicPdf(options: ClassicPdfFixtureOptions = {}) {
  const objectBodies = [
    options.catalogOverride ??
      `<< /Type /Catalog /Pages 2 0 R ${options.catalogExtra ?? ""} >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${options.pageExtra ?? ""} >>`,
    ...(options.extraObjects ?? []),
  ];

  const chunks: Buffer[] = [
    Buffer.from("%PDF-1.7\n%HDS\n", "latin1"),
  ];
  const offsets: number[] = [0];
  let byteLength = chunks[0]?.length ?? 0;

  objectBodies.forEach((body, index) => {
    offsets[index + 1] = byteLength;
    const objectBytes = Buffer.from(
      `${index + 1} 0 obj\n${body}\nendobj\n`,
      "latin1",
    );
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  });

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objectBodies.length + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (let objectNumber = 1; objectNumber <= objectBodies.length; objectNumber += 1) {
    xref += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
  }

  xref +=
    `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R ${options.trailerExtra ?? ""} >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

function buildXrefStreamPdf() {
  const prefix = Buffer.from(
    "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
    "latin1",
  );
  const xrefOffset = prefix.length;
  const xrefObject = Buffer.from(
    "3 0 obj\n<< /Type /XRef /Length 0 >>\nstream\n\nendstream\nendobj\n" +
      `startxref\n${xrefOffset}\n%%EOF\n`,
    "latin1",
  );
  return Buffer.concat([prefix, xrefObject]);
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
  pdfLimits?: NativeDocumentPdfLimits | null;
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
      ...(args.pdfLimits === null
        ? {}
        : {
            pdf: args.pdfLimits ?? PDF_LIMITS,
          }),
    },
  });
}

async function run() {
  const pdf = buildClassicPdf();
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
    "PDF_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    (positiveCases[0] as NativeDocumentScannerResult)
      .pdfStructuralInspectionComplete === true,
    "Classic PDF structural inspection should complete.",
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
      "OOXML_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
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
    assert(
      result.ooxmlStructuralInspectionComplete === true,
      "M3A OOXML structural inspection should complete for safe fixtures.",
    );
    assert(
      result.ooxmlStructuralEvidence?.vbaProjectDetected === false &&
        result.ooxmlStructuralEvidence.activeXDetected === false &&
        result.ooxmlStructuralEvidence.embeddedObjectDetected === false,
      "Safe OOXML fixtures must have clean M3A structural evidence without earning CLEAN.",
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
    limits: { maxBytes: TEN_MB, pdf: PDF_LIMITS },
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
    limits: { maxBytes: TEN_MB, pdf: PDF_LIMITS },
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

  const vbaEntry = packageFixture("docx", [
    {
      name: "word/vbaProject.bin",
      data: Buffer.from("VBA", "ascii"),
    },
  ]);
  const vbaEntryResult = await inspectFixture({
    bytes: vbaEntry.bytes,
    filename: "vba.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    vbaEntryResult,
    "BLOCKED",
    "OOXML_VBA_PROJECT_BLOCKED",
  );

  const macroContentType = buildZip([
    {
      name: "[Content_Types].xml",
      data: contentTypesXml({
        mainPart: "word/document.xml",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
        extraOverrides: [
          {
            partName: "custom/macro.xml",
            contentType:
              "application/vnd.ms-word.document.macroEnabled.main+xml",
          },
        ],
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
    {
      name: "custom/macro.xml",
      data: Buffer.from("<root/>", "utf8"),
    },
  ]);
  const macroContentTypeResult = await inspectFixture({
    bytes: macroContentType.bytes,
    filename: "macro-type.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    macroContentTypeResult,
    "BLOCKED",
    "OOXML_MACRO_ENABLED_CONTENT_TYPE_BLOCKED",
  );

  const activeXPath = packageFixture("xlsx", [
    {
      name: "xl/activeX/activeX1.xml",
      data: Buffer.from("<ocx/>", "utf8"),
    },
  ]);
  const activeXPathResult = await inspectFixture({
    bytes: activeXPath.bytes,
    filename: "activex.xlsx",
    extension: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  assertVerdict(activeXPathResult, "BLOCKED", "OOXML_ACTIVEX_BLOCKED");

  const activeXRelationship = packageFixture("xlsx", [
    {
      name: "xl/worksheets/_rels/sheet1.xml.rels",
      data: relationshipPartXml([
        {
          id: "rId1",
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/control",
          target: "../activeX/activeX1.xml",
        },
      ]),
    },
  ]);
  const activeXRelationshipResult = await inspectFixture({
    bytes: activeXRelationship.bytes,
    filename: "activex-rel.xlsx",
    extension: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  assertVerdict(
    activeXRelationshipResult,
    "BLOCKED",
    "OOXML_ACTIVEX_BLOCKED",
  );

  const embeddedObject = packageFixture("docx", [
    {
      name: "word/embeddings/oleObject1.bin",
      data: Buffer.from("OLE", "ascii"),
    },
  ]);
  const embeddedObjectResult = await inspectFixture({
    bytes: embeddedObject.bytes,
    filename: "embedded.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    embeddedObjectResult,
    "BLOCKED",
    "OOXML_EMBEDDED_OBJECT_BLOCKED",
  );

  const oleRelationship = packageFixture("pptx", [
    {
      name: "ppt/slides/_rels/slide1.xml.rels",
      data: relationshipPartXml([
        {
          id: "rId1",
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject",
          target: "../embeddings/oleObject1.bin",
        },
      ]),
    },
  ]);
  const oleRelationshipResult = await inspectFixture({
    bytes: oleRelationship.bytes,
    filename: "ole-rel.pptx",
    extension: "pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  assertVerdict(
    oleRelationshipResult,
    "BLOCKED",
    "OOXML_EMBEDDED_OBJECT_BLOCKED",
  );

  const remoteTemplate = packageFixture("docx", [
    {
      name: "word/_rels/settings.xml.rels",
      data: relationshipPartXml([
        {
          id: "rId1",
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate",
          target: "https://example.invalid/template.dotm",
          targetMode: "External",
        },
      ]),
    },
  ]);
  const remoteTemplateResult = await inspectFixture({
    bytes: remoteTemplate.bytes,
    filename: "template.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    remoteTemplateResult,
    "BLOCKED",
    "OOXML_REMOTE_TEMPLATE_BLOCKED",
  );

  const externalImage = packageFixture("docx", [
    {
      name: "word/_rels/document.xml.rels",
      data: relationshipPartXml([
        {
          id: "rId1",
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
          target: "https://example.invalid/image.png",
          targetMode: "External",
        },
      ]),
    },
  ]);
  const externalImageResult = await inspectFixture({
    bytes: externalImage.bytes,
    filename: "external-image.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    externalImageResult,
    "BLOCKED",
    "OOXML_EXTERNAL_RELATIONSHIP_BLOCKED",
  );

  const externalLinkPart = packageFixture("xlsx", [
    {
      name: "xl/externalLinks/externalLink1.xml",
      data: Buffer.from("<externalLink/>", "utf8"),
    },
  ]);
  const externalLinkPartResult = await inspectFixture({
    bytes: externalLinkPart.bytes,
    filename: "external-link.xlsx",
    extension: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  assertVerdict(
    externalLinkPartResult,
    "BLOCKED",
    "OOXML_EXTERNAL_RELATIONSHIP_BLOCKED",
  );

  const executablePart = packageFixture("docx", [
    {
      name: "custom/payload.exe",
      data: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
    },
  ]);
  const executablePartResult = await inspectFixture({
    bytes: executablePart.bytes,
    filename: "payload.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    executablePartResult,
    "BLOCKED",
    "OOXML_EXECUTABLE_PACKAGE_PART_BLOCKED",
  );

  const vbaRelationship = packageFixture("pptx", [
    {
      name: "ppt/_rels/presentation.xml.rels",
      data: relationshipPartXml([
        {
          id: "rId9",
          type: "http://schemas.microsoft.com/office/2006/relationships/vbaProject",
          target: "vbaProject.bin",
        },
      ]),
    },
  ]);
  const vbaRelationshipResult = await inspectFixture({
    bytes: vbaRelationship.bytes,
    filename: "vba-rel.pptx",
    extension: "pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  assertVerdict(
    vbaRelationshipResult,
    "BLOCKED",
    "OOXML_VBA_PROJECT_BLOCKED",
  );

  const invalidRelationshipXml = packageFixture("docx", [
    {
      name: "word/_rels/document.xml.rels",
      data: Buffer.from(
        `<!DOCTYPE Relationships [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
        "utf8",
      ),
    },
  ]);
  const invalidRelationshipXmlResult = await inspectFixture({
    bytes: invalidRelationshipXml.bytes,
    filename: "invalid-rel.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    invalidRelationshipXmlResult,
    "FAILED",
    "OOXML_RELATIONSHIP_XML_INVALID",
  );

  const oversizedRelationshipXml = packageFixture("docx", [
    {
      name: "word/_rels/document.xml.rels",
      data: Buffer.from(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `${" ".repeat(400)}` +
          `</Relationships>`,
        "utf8",
      ),
    },
  ]);
  const oversizedRelationshipXmlResult = await inspectFixture({
    bytes: oversizedRelationshipXml.bytes,
    filename: "large-rel.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archiveLimits: {
      ...ARCHIVE_LIMITS,
      maxControlPartBytes: 320,
    },
  });
  assertVerdict(
    oversizedRelationshipXmlResult,
    "BLOCKED",
    "OOXML_RELATIONSHIP_PART_TOO_LARGE",
  );

  const absoluteInternalTarget = packageFixture("docx", [
    {
      name: "word/_rels/document.xml.rels",
      data: relationshipPartXml([
        {
          id: "rId1",
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
          target: "https://example.invalid/not-marked-external.png",
        },
      ]),
    },
  ]);
  const absoluteInternalTargetResult = await inspectFixture({
    bytes: absoluteInternalTarget.bytes,
    filename: "absolute-target.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    absoluteInternalTargetResult,
    "BLOCKED",
    "OOXML_RELATIONSHIP_TARGET_INVALID",
  );

  const allowedHyperlink = packageFixture("docx", [
    {
      name: "word/_rels/document.xml.rels",
      data: relationshipPartXml([
        {
          id: "rId1",
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
          target: "https://example.org/policy",
          targetMode: "External",
        },
      ]),
    },
  ]);
  const allowedHyperlinkResult = await inspectFixture({
    bytes: allowedHyperlink.bytes,
    filename: "hyperlink.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assertVerdict(
    allowedHyperlinkResult,
    "IDENTITY_VERIFIED",
    "OOXML_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    allowedHyperlinkResult.ooxmlStructuralEvidence
      ?.externalHyperlinksObserved === 1,
    "An ordinary external HTTPS hyperlink should be observed but not treated as a trusted-document CLEAN verdict.",
  );


  const missingPdfLimits = await inspectFixture({
    bytes: pdf,
    filename: "missing-limits.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(missingPdfLimits, "FAILED", "PDF_LIMITS_REQUIRED");

  const pdfJavascript = await inspectFixture({
    bytes: buildClassicPdf({
      extraObjects: ["<< /S /JavaScript /JS (app.alert\\(1\\)) >>"],
    }),
    filename: "javascript.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfJavascript, "BLOCKED", "PDF_JAVASCRIPT_BLOCKED");

  const pdfOpenAction = await inspectFixture({
    bytes: buildClassicPdf({ catalogExtra: "/OpenAction [3 0 R /Fit]" }),
    filename: "open-action.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfOpenAction, "BLOCKED", "PDF_OPEN_ACTION_BLOCKED");

  const pdfAdditionalAction = await inspectFixture({
    bytes: buildClassicPdf({ catalogExtra: "/AA << /WC 4 0 R >>", extraObjects: ["<< /S /Named /N /NextPage >>"] }),
    filename: "additional-action.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfAdditionalAction, "BLOCKED", "PDF_ADDITIONAL_ACTION_BLOCKED");

  const pdfLaunch = await inspectFixture({
    bytes: buildClassicPdf({ extraObjects: ["<< /S /Launch /F (calc.exe) >>"] }),
    filename: "launch.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfLaunch, "BLOCKED", "PDF_LAUNCH_ACTION_BLOCKED");

  const pdfEmbedded = await inspectFixture({
    bytes: buildClassicPdf({ extraObjects: ["<< /Type /Filespec /F (payload.bin) /EF << /F 5 0 R >> >>", "<< /Type /EmbeddedFile /Length 0 >>\nstream\n\nendstream"] }),
    filename: "embedded.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfEmbedded, "BLOCKED", "PDF_EMBEDDED_FILE_BLOCKED");

  const pdfRichMedia = await inspectFixture({
    bytes: buildClassicPdf({ extraObjects: ["<< /Type /Annot /Subtype /RichMedia >>"] }),
    filename: "rich-media.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfRichMedia, "BLOCKED", "PDF_RICH_MEDIA_BLOCKED");

  const pdfXfa = await inspectFixture({
    bytes: buildClassicPdf({ catalogExtra: "/AcroForm << /XFA (form) >>" }),
    filename: "xfa.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfXfa, "BLOCKED", "PDF_XFA_BLOCKED");

  const pdfExternalAction = await inspectFixture({
    bytes: buildClassicPdf({ extraObjects: ["<< /S /SubmitForm /F (https://example.org/submit) >>"] }),
    filename: "submit.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfExternalAction, "BLOCKED", "PDF_EXTERNAL_ACTION_BLOCKED");

  const pdfUnsafeUri = await inspectFixture({
    bytes: buildClassicPdf({ extraObjects: ["<< /S /URI /URI (file:///etc/passwd) >>"] }),
    filename: "unsafe-uri.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfUnsafeUri, "BLOCKED", "PDF_UNSAFE_URI_ACTION_BLOCKED");

  const pdfSafeUri = await inspectFixture({
    bytes: buildClassicPdf({ extraObjects: ["<< /S /URI /URI (https://example.org/policy) >>"] }),
    filename: "safe-uri.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfSafeUri,
    "IDENTITY_VERIFIED",
    "PDF_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    pdfSafeUri.pdfStructuralEvidence?.safeUriActionsObserved === 1,
    "An ordinary HTTPS PDF hyperlink should be observed without earning CLEAN.",
  );

  const pdfEncrypted = await inspectFixture({
    bytes: buildClassicPdf({
      trailerExtra: "/Encrypt 4 0 R",
      extraObjects: ["<< /Filter /Standard >>"],
    }),
    filename: "encrypted.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfEncrypted, "BLOCKED", "PDF_ENCRYPTED_BLOCKED");

  const pdfObjectStream = await inspectFixture({
    bytes: buildClassicPdf({
      extraObjects: ["<< /Type /ObjStm /Length 0 >>\nstream\n\nendstream"],
    }),
    filename: "object-stream.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfObjectStream, "FAILED", "PDF_OBJECT_STREAM_UNSUPPORTED");

  const pdfXrefStream = await inspectFixture({
    bytes: buildXrefStreamPdf(),
    filename: "xref-stream.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfXrefStream, "FAILED", "PDF_XREF_STREAM_UNSUPPORTED");

  const pdfMissingPageTree = await inspectFixture({
    bytes: buildClassicPdf({ catalogOverride: "<< /Type /Catalog >>" }),
    filename: "missing-pages.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfMissingPageTree, "FAILED", "PDF_PAGE_TREE_MISSING");


  const pdfObjectCountLimit = await inspectFixture({
    bytes: pdf,
    filename: "object-limit.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
    pdfLimits: {
      ...PDF_LIMITS,
      maxObjects: 3,
    },
  });
  assertVerdict(
    pdfObjectCountLimit,
    "FAILED",
    "PDF_OBJECT_COUNT_LIMIT_EXCEEDED",
  );

  const pdfNestingLimit = await inspectFixture({
    bytes: buildClassicPdf({
      extraObjects: ["<< /Nested [[[1]]] >>"],
    }),
    filename: "nesting-limit.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
    pdfLimits: {
      ...PDF_LIMITS,
      maxNestingDepth: 2,
    },
  });
  assertVerdict(
    pdfNestingLimit,
    "FAILED",
    "PDF_OBJECT_NESTING_LIMIT_EXCEEDED",
  );

  const pdfStringLimit = await inspectFixture({
    bytes: buildClassicPdf({
      extraObjects: ["<< /Title (123456789) >>"],
    }),
    filename: "string-limit.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
    pdfLimits: {
      ...PDF_LIMITS,
      maxStringBytes: 4,
    },
  });
  assertVerdict(
    pdfStringLimit,
    "FAILED",
    "PDF_STRING_LIMIT_EXCEEDED",
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
    vbaEntryResult,
    macroContentTypeResult,
    activeXPathResult,
    activeXRelationshipResult,
    embeddedObjectResult,
    oleRelationshipResult,
    remoteTemplateResult,
    externalImageResult,
    externalLinkPartResult,
    executablePartResult,
    vbaRelationshipResult,
    invalidRelationshipXmlResult,
    oversizedRelationshipXmlResult,
    absoluteInternalTargetResult,
    allowedHyperlinkResult,
    missingPdfLimits,
    pdfJavascript,
    pdfOpenAction,
    pdfAdditionalAction,
    pdfLaunch,
    pdfEmbedded,
    pdfRichMedia,
    pdfXfa,
    pdfExternalAction,
    pdfUnsafeUri,
    pdfSafeUri,
    pdfEncrypted,
    pdfObjectStream,
    pdfXrefStream,
    pdfMissingPageTree,
    pdfObjectCountLimit,
    pdfNestingLimit,
    pdfStringLimit,
  ];

  for (const result of allResults) {
    assertSanitized(result);
  }

  console.log("HDS M3B1 native document scanner self-test: GREEN");
  console.log(`Cases: ${allResults.length}`);
  console.log("M1 identity/integrity regression: GREEN");
  console.log("M2 bounded OOXML archive regression: GREEN");
  console.log("M3A OOXML structural security regression: GREEN");
  console.log("Classic PDF xref/object structural parsing: GREEN");
  console.log("PDF object/nesting/string resource guards: GREEN");
  console.log("PDF JavaScript/action/attachment/rich-media blocks: GREEN");
  console.log("Encrypted/xref-stream/object-stream fail-closed policy: GREEN");
  console.log("Ordinary HTTP(S) PDF hyperlink policy: GREEN");
  console.log("OOXML/PDF structural passes remain non-CLEAN: GREEN");
  console.log("Sanitized result boundary: GREEN");
}

run().catch(() => {
  console.error("HDS M3B1 native document scanner self-test: FAILED");
  process.exitCode = 1;
});
