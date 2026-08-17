import { createHash } from "crypto";
import { deflateRawSync, deflateSync } from "node:zlib";

import {
  inspectNativeDocumentIdentity,
} from "../src/lib/security/documentScanner/nativeDocumentScanner";
import {
  evaluateOoxmlSecurityRules,
  HEHXAGON_DOCUMENT_SECURITY_RULE_IDS,
  HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION,
} from "../src/lib/security/documentScanner/securityRulePack";
import type {
  NativeDocumentArchiveLimits,
  NativeDocumentPdfLimits,
  NativeDocumentOleLimits,
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

const OLE_LIMITS: NativeDocumentOleLimits = {
  maxDirectoryEntries: 128,
  maxDirectoryDepth: 16,
  maxFatSectors: 32,
  maxDifatSectors: 8,
  maxMiniFatSectors: 8,
  maxSectorChainLength: 256,
  maxStreams: 64,
  maxStreamBytes: 4 * 1024 * 1024,
  maxTotalStreamBytes: 8 * 1024 * 1024,
};

const PDF_LIMITS: NativeDocumentPdfLimits = {
  maxObjects: 128,
  maxIncrementalUpdates: 4,
  maxNestingDepth: 24,
  maxTokenBytes: 4096,
  maxStringBytes: 64 * 1024,
  maxDecodedXrefStreamBytes: 256 * 1024,
  maxDecodedObjectStreamBytes: 2 * 1024 * 1024,
  maxObjectsPerObjectStream: 64,
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

function assertRulePack(
  result: NativeDocumentScannerResult,
  expectedOutcome: "PASS" | "BLOCK",
  expectedRuleId?: string,
) {
  assert(
    result.rulePackVersion === HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION,
    "Result must expose the exact M4 rule-pack version.",
  );
  assert(
    result.rulePackEvaluationComplete === true &&
      result.rulePackEvaluation !== null,
    "Supported structural documents must carry a completed M4 rule-pack evaluation.",
  );
  assert(
    result.rulePackEvaluation.outcome === expectedOutcome,
    `Expected rule-pack outcome ${expectedOutcome}.`,
  );
  assert(
    Object.isFrozen(result.rulePackEvaluation) &&
      Object.isFrozen(result.rulePackEvaluation.matchedRules),
    "Rule-pack evaluations and matched-rule arrays must be immutable.",
  );
  if (expectedRuleId) {
    assert(
      result.rulePackEvaluation.matchedRules.some(
        (rule) => rule.ruleId === expectedRuleId,
      ),
      `Expected matched security rule ${expectedRuleId}.`,
    );
  }
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
    "M4 must never emit CLEAN.",
  );
  assert(
    result.inspectionComplete === false,
    "M4 inspectionComplete must always remain false.",
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

function xrefRow(type: number, field1: number, field2: number) {
  const row = Buffer.alloc(7);
  row[0] = type & 0xff;
  row.writeUInt32BE(field1 >>> 0, 1);
  row.writeUInt16BE(field2 & 0xffff, 5);
  return row;
}

function encodePngNoneRows(bytes: Buffer, columns: number) {
  if (bytes.length % columns !== 0) {
    throw new Error("Fixture xref data is not row aligned.");
  }

  const rows: Buffer[] = [];
  for (let offset = 0; offset < bytes.length; offset += columns) {
    rows.push(Buffer.from([0]));
    rows.push(bytes.subarray(offset, offset + columns));
  }
  return Buffer.concat(rows);
}

type XrefStreamFixtureOptions = {
  flate?: boolean;
  predictor?: boolean;
  filterName?: string;
  w?: string;
  index?: string;
};

function buildXrefStreamPdf(options: XrefStreamFixtureOptions = {}) {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%HDS\n", "latin1")];
  const offsets = new Map<number, number>();
  let byteLength = chunks[0]!.length;

  const addObject = (objectNumber: number, body: string) => {
    offsets.set(objectNumber, byteLength);
    const objectBytes = Buffer.from(
      `${objectNumber} 0 obj\n${body}\nendobj\n`,
      "latin1",
    );
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  };

  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>");

  const xrefObjectNumber = 4;
  const xrefOffset = byteLength;
  const rawXref = Buffer.concat([
    xrefRow(0, 0, 65535),
    xrefRow(1, offsets.get(1)!, 0),
    xrefRow(1, offsets.get(2)!, 0),
    xrefRow(1, offsets.get(3)!, 0),
    xrefRow(1, xrefOffset, 0),
  ]);

  const predictor = options.predictor === true;
  const flate = options.flate === true || predictor;
  const preFlate = predictor ? encodePngNoneRows(rawXref, 7) : rawXref;
  const streamData = flate ? deflateSync(preFlate) : preFlate;
  const filterName = options.filterName ?? (flate ? "FlateDecode" : "");
  const filter = filterName ? ` /Filter /${filterName}` : "";
  const decodeParms = predictor
    ? " /DecodeParms << /Predictor 12 /Columns 7 /Colors 1 /BitsPerComponent 8 >>"
    : "";
  const w = options.w ?? "[1 4 2]";
  const index = options.index ?? "[0 5]";

  const xrefObject = Buffer.concat([
    Buffer.from(
      `${xrefObjectNumber} 0 obj\n` +
        `<< /Type /XRef /Size 5 /Root 1 0 R /W ${w} /Index ${index}` +
        ` /Length ${streamData.length}${filter}${decodeParms} >>\nstream\n`,
      "latin1",
    ),
    streamData,
    Buffer.from(
      `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "latin1",
    ),
  ]);

  chunks.push(xrefObject);
  return Buffer.concat(chunks);
}

type ObjectStreamFixtureOptions = {
  extraCompressedObject?: string;
  rootObjectStreamIndex?: number;
  objectFilterName?: string;
  firstOverride?: number;
};

function buildObjectStreamPdf(options: ObjectStreamFixtureOptions = {}) {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%HDS\n", "latin1")];
  const offsets = new Map<number, number>();
  let byteLength = chunks[0]!.length;

  const addObjectBytes = (objectNumber: number, body: Buffer) => {
    offsets.set(objectNumber, byteLength);
    const objectBytes = Buffer.concat([
      Buffer.from(`${objectNumber} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  };

  addObjectBytes(
    3,
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
      "latin1",
    ),
  );

  const containedBodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    ...(options.extraCompressedObject ? [options.extraCompressedObject] : []),
  ];
  const containedNumbers = [1, 2, ...(options.extraCompressedObject ? [6] : [])];

  const bodyBuffers = containedBodies.map((body) => Buffer.from(body, "latin1"));
  const relativeOffsets: number[] = [];
  let bodyOffset = 0;
  for (const body of bodyBuffers) {
    relativeOffsets.push(bodyOffset);
    bodyOffset += body.length + 1;
  }

  let header = "";
  containedNumbers.forEach((objectNumber, index) => {
    header += `${objectNumber} ${relativeOffsets[index]} `;
  });
  const headerBytes = Buffer.from(header, "latin1");
  const first = options.firstOverride ?? headerBytes.length;
  const decodedObjectStreamParts: Buffer[] = [headerBytes];
  bodyBuffers.forEach((body, index) => {
    decodedObjectStreamParts.push(body);
    if (index + 1 < bodyBuffers.length) {
      decodedObjectStreamParts.push(Buffer.from(" "));
    }
  });
  const decodedObjectStream = Buffer.concat(decodedObjectStreamParts);
  const encodedObjectStream = deflateSync(decodedObjectStream);
  const objectFilterName = options.objectFilterName ?? "FlateDecode";

  addObjectBytes(
    4,
    Buffer.concat([
      Buffer.from(
        `<< /Type /ObjStm /N ${containedNumbers.length} /First ${first}` +
          ` /Length ${encodedObjectStream.length} /Filter /${objectFilterName} >>\nstream\n`,
        "latin1",
      ),
      encodedObjectStream,
      Buffer.from("\nendstream", "latin1"),
    ]),
  );

  const xrefObjectNumber = 5;
  const xrefOffset = byteLength;
  const size = options.extraCompressedObject ? 7 : 6;
  const rows: Buffer[] = [xrefRow(0, 0, 65535)];
  rows.push(xrefRow(2, 4, options.rootObjectStreamIndex ?? 0));
  rows.push(xrefRow(2, 4, 1));
  rows.push(xrefRow(1, offsets.get(3)!, 0));
  rows.push(xrefRow(1, offsets.get(4)!, 0));
  rows.push(xrefRow(1, xrefOffset, 0));
  if (options.extraCompressedObject) rows.push(xrefRow(2, 4, 2));

  const xrefData = deflateSync(Buffer.concat(rows));
  const xrefObject = Buffer.concat([
    Buffer.from(
      `${xrefObjectNumber} 0 obj\n` +
        `<< /Type /XRef /Size ${size} /Root 1 0 R /W [1 4 2] /Index [0 ${size}]` +
        ` /Length ${xrefData.length} /Filter /FlateDecode >>\nstream\n`,
      "latin1",
    ),
    xrefData,
    Buffer.from(
      `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "latin1",
    ),
  ]);

  chunks.push(xrefObject);
  return Buffer.concat(chunks);
}

function buildMixedClassicThenXrefStreamPdf() {
  const base = buildClassicPdf();
  const baseText = base.toString("latin1");
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(baseText);
  if (!match) throw new Error("Classic fixture startxref missing.");
  const previousXref = Number(match[1]);

  const xrefOffset = base.length;
  const row = xrefRow(1, xrefOffset, 0);
  const encoded = deflateSync(row);
  const xrefObject = Buffer.concat([
    Buffer.from(
      `4 0 obj\n<< /Type /XRef /Size 5 /Root 1 0 R /Prev ${previousXref}` +
        ` /W [1 4 2] /Index [4 1] /Length ${encoded.length} /Filter /FlateDecode >>\nstream\n`,
      "latin1",
    ),
    encoded,
    Buffer.from(
      `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "latin1",
    ),
  ]);

  return Buffer.concat([base, xrefObject]);
}

function buildHybridReferencePdf(hiddenObjectBody: string) {
  const base = buildClassicPdf();
  const baseText = base.toString("latin1");
  const previousMatch = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(baseText);
  if (!previousMatch) throw new Error("Classic fixture startxref missing.");
  const previousXref = Number(previousMatch[1]);

  const chunks: Buffer[] = [base];
  let byteLength = base.length;

  const objectStreamOffset = byteLength;
  const header = Buffer.from("6 0 ", "latin1");
  const body = Buffer.from(hiddenObjectBody, "latin1");
  const decodedObjectStream = Buffer.concat([header, body]);
  const encodedObjectStream = deflateSync(decodedObjectStream);
  const objectStream = Buffer.concat([
    Buffer.from(
      `4 0 obj\n<< /Type /ObjStm /N 1 /First ${header.length}` +
        ` /Length ${encodedObjectStream.length} /Filter /FlateDecode >>\nstream\n`,
      "latin1",
    ),
    encodedObjectStream,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
  chunks.push(objectStream);
  byteLength += objectStream.length;

  const xrefStreamOffset = byteLength;
  const hiddenEntry = deflateSync(xrefRow(2, 4, 0));
  const xrefStream = Buffer.concat([
    Buffer.from(
      `5 0 obj\n<< /Type /XRef /Size 7 /W [1 4 2] /Index [6 1]` +
        ` /Length ${hiddenEntry.length} /Filter /FlateDecode >>\nstream\n`,
      "latin1",
    ),
    hiddenEntry,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
  chunks.push(xrefStream);
  byteLength += xrefStream.length;

  const updateXrefOffset = byteLength;
  const updateXref =
    "xref\n4 2\n" +
    `${String(objectStreamOffset).padStart(10, "0")} 00000 n \n` +
    `${String(xrefStreamOffset).padStart(10, "0")} 00000 n \n` +
    `trailer\n<< /Size 7 /Root 1 0 R /Prev ${previousXref} /XRefStm ${xrefStreamOffset} >>\n` +
    `startxref\n${updateXrefOffset}\n%%EOF\n`;

  chunks.push(Buffer.from(updateXref, "latin1"));
  return Buffer.concat(chunks);
}


type CfbFixtureStream = {
  path: string;
  data: Buffer;
};

type CfbFixtureNode = {
  id: number;
  name: string;
  type: 1 | 2 | 5;
  parentPath: string | null;
  data: Buffer | null;
  startSector: number;
  streamSize: number;
  left: number;
  right: number;
  child: number;
};

function buildCfb(streams: CfbFixtureStream[], majorVersion: 3 | 4 = 3) {
  const sectorSize = majorVersion === 3 ? 512 : 4096;
  const miniSectorSize = 64;
  const nodes: CfbFixtureNode[] = [
    {
      id: 0,
      name: "Root Entry",
      type: 5,
      parentPath: null,
      data: null,
      startSector: 0xfffffffe,
      streamSize: 0,
      left: 0xffffffff,
      right: 0xffffffff,
      child: 0xffffffff,
    },
  ];
  const storageIds = new Map<string, number>();

  for (const stream of streams) {
    const parts = stream.path.split("/").filter(Boolean);
    assert(parts.length > 0, "CFB fixture stream path is required.");
    let parentPath = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index] as string;
      const path = parentPath ? `${parentPath}/${name}` : name;
      if (!storageIds.has(path)) {
        const id = nodes.length;
        storageIds.set(path, id);
        nodes.push({
          id,
          name,
          type: 1,
          parentPath: parentPath || "",
          data: null,
          startSector: 0,
          streamSize: 0,
          left: 0xffffffff,
          right: 0xffffffff,
          child: 0xffffffff,
        });
      }
      parentPath = path;
    }
    const name = parts[parts.length - 1] as string;
    nodes.push({
      id: nodes.length,
      name,
      type: 2,
      parentPath: parentPath || "",
      data: Buffer.from(stream.data),
      startSector: 0xfffffffe,
      streamSize: stream.data.length,
      left: 0xffffffff,
      right: 0xffffffff,
      child: 0xffffffff,
    });
  }

  const pathById = new Map<number, string>([[0, ""]]);
  for (const [path, id] of storageIds) pathById.set(id, path);

  const childrenByParent = new Map<string, number[]>();
  for (const node of nodes.slice(1)) {
    const parent = node.parentPath ?? "";
    const list = childrenByParent.get(parent) ?? [];
    list.push(node.id);
    childrenByParent.set(parent, list);
  }

  for (const [parentPath, childIds] of childrenByParent) {
    const parentId = parentPath === "" ? 0 : storageIds.get(parentPath);
    assert(parentId !== undefined, "CFB fixture parent storage must exist.");
    nodes[parentId]!.child = childIds[0] ?? 0xffffffff;
    for (let index = 0; index < childIds.length - 1; index += 1) {
      nodes[childIds[index]!]!.right = childIds[index + 1] as number;
    }
  }

  const smallStreams = nodes.filter(
    (node) => node.type === 2 && node.streamSize > 0 && node.streamSize < 4096,
  );
  const regularStreams = nodes.filter(
    (node) => node.type === 2 && node.streamSize >= 4096,
  );

  const miniFatEntries: number[] = [];
  const miniChunks: Buffer[] = [];
  for (const node of smallStreams) {
    const miniCount = Math.ceil(node.streamSize / miniSectorSize);
    const firstMini = miniFatEntries.length;
    node.startSector = firstMini;
    for (let index = 0; index < miniCount; index += 1) {
      const chunk = Buffer.alloc(miniSectorSize);
      node.data!.subarray(index * miniSectorSize, (index + 1) * miniSectorSize).copy(chunk);
      miniChunks.push(chunk);
      miniFatEntries.push(index === miniCount - 1 ? 0xfffffffe : firstMini + index + 1);
    }
  }
  const miniStream = Buffer.concat(miniChunks);
  nodes[0]!.streamSize = miniStream.length;

  const directoryBytesLength = Math.max(sectorSize, Math.ceil(nodes.length * 128 / sectorSize) * sectorSize);
  const directorySectorCount = directoryBytesLength / sectorSize;
  const miniFatSectorCount = miniFatEntries.length === 0 ? 0 : Math.ceil(miniFatEntries.length * 4 / sectorSize);
  const rootMiniSectorCount = miniStream.length === 0 ? 0 : Math.ceil(miniStream.length / sectorSize);
  const regularSectorCounts = regularStreams.map((node) => Math.ceil(node.streamSize / sectorSize));

  const nonFatSectors = directorySectorCount + miniFatSectorCount + rootMiniSectorCount + regularSectorCounts.reduce((sum, count) => sum + count, 0);
  let fatSectorCount = 1;
  while (Math.ceil((nonFatSectors + fatSectorCount) / (sectorSize / 4)) > fatSectorCount) {
    fatSectorCount += 1;
  }
  assert(fatSectorCount <= 109, "CFB fixture must fit the header DIFAT.");

  let nextSector = 0;
  const directoryStart = nextSector;
  nextSector += directorySectorCount;
  const miniFatStart = miniFatSectorCount ? nextSector : 0xfffffffe;
  nextSector += miniFatSectorCount;
  const rootMiniStart = rootMiniSectorCount ? nextSector : 0xfffffffe;
  nextSector += rootMiniSectorCount;
  nodes[0]!.startSector = rootMiniStart;

  const regularStarts = new Map<number, number>();
  for (let index = 0; index < regularStreams.length; index += 1) {
    const node = regularStreams[index] as CfbFixtureNode;
    regularStarts.set(node.id, nextSector);
    node.startSector = nextSector;
    nextSector += regularSectorCounts[index] as number;
  }

  const fatStart = nextSector;
  const totalSectors = nonFatSectors + fatSectorCount;
  assert(fatStart + fatSectorCount === totalSectors, "CFB fixture FAT allocation mismatch.");

  const fat = new Array<number>(fatSectorCount * (sectorSize / 4)).fill(0xffffffff);
  const chain = (start: number, count: number, terminal = 0xfffffffe) => {
    for (let index = 0; index < count; index += 1) {
      fat[start + index] = index === count - 1 ? terminal : start + index + 1;
    }
  };

  chain(directoryStart, directorySectorCount);
  if (miniFatSectorCount) chain(miniFatStart, miniFatSectorCount);
  if (rootMiniSectorCount) chain(rootMiniStart, rootMiniSectorCount);
  for (let index = 0; index < regularStreams.length; index += 1) {
    chain(regularStarts.get(regularStreams[index]!.id) as number, regularSectorCounts[index] as number);
  }
  for (let index = 0; index < fatSectorCount; index += 1) {
    fat[fatStart + index] = 0xfffffffd;
  }

  const directory = Buffer.alloc(directoryBytesLength);
  for (const node of nodes) {
    const entry = directory.subarray(node.id * 128, node.id * 128 + 128);
    const nameBytes = Buffer.from(`${node.name}\u0000`, "utf16le");
    assert(nameBytes.length <= 64, `CFB fixture directory name too long: ${node.name}`);
    nameBytes.copy(entry, 0);
    entry.writeUInt16LE(nameBytes.length, 64);
    entry[66] = node.type;
    entry[67] = 1;
    entry.writeUInt32LE(node.left >>> 0, 68);
    entry.writeUInt32LE(node.right >>> 0, 72);
    entry.writeUInt32LE(node.child >>> 0, 76);
    entry.writeUInt32LE(node.startSector >>> 0, 116);
    entry.writeUInt32LE(node.streamSize >>> 0, 120);
    entry.writeUInt32LE(0, 124);
  }

  const miniFatBytes = Buffer.alloc(miniFatSectorCount * sectorSize, 0xff);
  for (let index = 0; index < miniFatEntries.length; index += 1) {
    miniFatBytes.writeUInt32LE(miniFatEntries[index] as number, index * 4);
  }

  const rootMiniBytes = Buffer.alloc(rootMiniSectorCount * sectorSize);
  miniStream.copy(rootMiniBytes);

  const regularBytes: Buffer[] = [];
  for (let index = 0; index < regularStreams.length; index += 1) {
    const node = regularStreams[index] as CfbFixtureNode;
    const allocated = Buffer.alloc((regularSectorCounts[index] as number) * sectorSize);
    node.data!.copy(allocated);
    regularBytes.push(allocated);
  }

  const fatBytes = Buffer.alloc(fatSectorCount * sectorSize, 0xff);
  for (let index = 0; index < fat.length; index += 1) {
    fatBytes.writeUInt32LE(fat[index] as number, index * 4);
  }

  const header = Buffer.alloc(sectorSize);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(majorVersion, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(majorVersion === 3 ? 9 : 12, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(majorVersion === 4 ? directorySectorCount : 0, 40);
  header.writeUInt32LE(fatSectorCount, 44);
  header.writeUInt32LE(directoryStart, 48);
  header.writeUInt32LE(0, 52);
  header.writeUInt32LE(4096, 56);
  header.writeUInt32LE(miniFatStart >>> 0, 60);
  header.writeUInt32LE(miniFatSectorCount, 64);
  header.writeUInt32LE(0xfffffffe, 68);
  header.writeUInt32LE(0, 72);
  for (let index = 0; index < 109; index += 1) {
    header.writeUInt32LE(index < fatSectorCount ? fatStart + index : 0xffffffff, 76 + index * 4);
  }

  return Buffer.concat([
    header,
    directory,
    miniFatBytes,
    rootMiniBytes,
    ...regularBytes,
    fatBytes,
  ]);
}

function legacyOfficeFixture(
  extension: "doc" | "xls" | "ppt",
  extras: CfbFixtureStream[] = [],
  majorVersion: 3 | 4 = 3,
) {
  const applicationName =
    extension === "doc"
      ? "WordDocument"
      : extension === "xls"
        ? "Workbook"
        : "PowerPoint Document";
  return buildCfb([
    {
      path: applicationName,
      data: Buffer.alloc(4096, extension === "doc" ? 0x57 : extension === "xls" ? 0x58 : 0x50),
    },
    { path: "\u0005SummaryInformation", data: Buffer.alloc(100, 0x53) },
    ...extras,
  ], majorVersion);
}


function cfbDirectoryEntryOffset(entryId: number) {
  return 512 + entryId * 128;
}

function cfbDirectoryStartSector(bytes: Buffer, entryId: number) {
  return bytes.readUInt32LE(cfbDirectoryEntryOffset(entryId) + 116);
}

function patchCfbDirectoryStartSector(bytes: Buffer, entryId: number, sectorId: number) {
  const copy = Buffer.from(bytes);
  copy.writeUInt32LE(sectorId >>> 0, cfbDirectoryEntryOffset(entryId) + 116);
  return copy;
}

function patchCfbFatEntry(bytes: Buffer, sectorId: number, value: number) {
  const copy = Buffer.from(bytes);
  const sectorSize = 1 << copy.readUInt16LE(30);
  const fatSectorId = copy.readUInt32LE(76);
  const fatOffset = (fatSectorId + 1) * sectorSize;
  copy.writeUInt32LE(value >>> 0, fatOffset + sectorId * 4);
  return copy;
}

function patchCfbMiniFatEntry(bytes: Buffer, miniSectorId: number, value: number) {
  const copy = Buffer.from(bytes);
  const sectorSize = 1 << copy.readUInt16LE(30);
  const miniFatSectorId = copy.readUInt32LE(60);
  assert(miniFatSectorId < 0xfffffffa, "CFB fixture MiniFAT sector must exist.");
  const miniFatOffset = (miniFatSectorId + 1) * sectorSize;
  copy.writeUInt32LE(value >>> 0, miniFatOffset + miniSectorId * 4);
  return copy;
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
  oleLimits?: NativeDocumentOleLimits | null;
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
      ...(args.oleLimits === null
        ? {}
        : {
            ole: args.oleLimits ?? OLE_LIMITS,
          }),
    },
  });
}

async function run() {
  const pdf = buildClassicPdf();
  const ole = legacyOfficeFixture("doc");
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
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    (positiveCases[0] as NativeDocumentScannerResult)
      .pdfStructuralInspectionComplete === true,
    "Classic PDF structural inspection should complete.",
  );
  assertVerdict(
    positiveCases[4] as NativeDocumentScannerResult,
    "IDENTITY_VERIFIED",
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    (positiveCases[4] as NativeDocumentScannerResult).oleStructuralInspectionComplete === true,
    "Legacy Word CFB structural inspection should complete.",
  );
  assert(
    (positiveCases[4] as NativeDocumentScannerResult).identityEvidence.detectedFormat ===
      "WORD_BINARY",
    "Legacy Word application identity should be established.",
  );
  assertRulePack(positiveCases[0] as NativeDocumentScannerResult, "PASS");
  assertRulePack(positiveCases[1] as NativeDocumentScannerResult, "PASS");
  assertRulePack(positiveCases[4] as NativeDocumentScannerResult, "PASS");

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
      "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
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
  assertRulePack(vbaEntryResult, "BLOCK", "HDS-OOXML-001-VBA");

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
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
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
  assertRulePack(pdfJavascript, "BLOCK", "HDS-PDF-002-JAVASCRIPT");

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
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
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

  const pdfXrefStream = await inspectFixture({
    bytes: buildXrefStreamPdf(),
    filename: "xref-stream.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfXrefStream,
    "IDENTITY_VERIFIED",
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    pdfXrefStream.pdfStructuralEvidence?.xrefStreamsDetected === true &&
      pdfXrefStream.pdfStructuralEvidence.xrefStreamCount === 1,
    "A modern xref-stream PDF should complete bounded xref-stream inspection.",
  );

  const pdfFlatePredictorXref = await inspectFixture({
    bytes: buildXrefStreamPdf({ flate: true, predictor: true }),
    filename: "xref-predictor.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfFlatePredictorXref,
    "IDENTITY_VERIFIED",
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );

  const pdfObjectStream = await inspectFixture({
    bytes: buildObjectStreamPdf(),
    filename: "object-stream.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfObjectStream,
    "IDENTITY_VERIFIED",
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    pdfObjectStream.pdfStructuralEvidence?.objectStreamsDetected === true &&
      pdfObjectStream.pdfStructuralEvidence.compressedObjectCount === 2,
    "Compressed Catalog/Pages objects should be resolved through a bounded object stream.",
  );

  const pdfCompressedJavascript = await inspectFixture({
    bytes: buildObjectStreamPdf({
      extraCompressedObject: "<< /S /JavaScript /JS (app.alert\(1\)) >>",
    }),
    filename: "compressed-javascript.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfCompressedJavascript,
    "BLOCKED",
    "PDF_JAVASCRIPT_BLOCKED",
  );

  const pdfMixedXrefChain = await inspectFixture({
    bytes: buildMixedClassicThenXrefStreamPdf(),
    filename: "mixed-xref-chain.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfMixedXrefChain,
    "IDENTITY_VERIFIED",
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    pdfMixedXrefChain.pdfStructuralEvidence?.incrementalUpdates === 1 &&
      pdfMixedXrefChain.pdfStructuralEvidence.xrefStreamsDetected === true,
    "A modern xref-stream revision should safely chain to a prior classic xref revision.",
  );

  const pdfHybridHiddenJavascript = await inspectFixture({
    bytes: buildHybridReferencePdf(
      "<< /S /JavaScript /JS (app.alert\(hybrid\)) >>",
    ),
    filename: "hybrid-hidden-javascript.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfHybridHiddenJavascript,
    "BLOCKED",
    "PDF_JAVASCRIPT_BLOCKED",
  );

  const pdfInvalidXrefIndex = await inspectFixture({
    bytes: buildXrefStreamPdf({ index: "[0 3 2 2]" }),
    filename: "invalid-xref-index.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfInvalidXrefIndex,
    "FAILED",
    "PDF_XREF_STREAM_INDEX_INVALID",
  );

  const pdfUnsupportedObjectStreamFilter = await inspectFixture({
    bytes: buildObjectStreamPdf({ objectFilterName: "ASCIIHexDecode" }),
    filename: "unsupported-object-stream-filter.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfUnsupportedObjectStreamFilter,
    "FAILED",
    "PDF_STREAM_FILTER_UNSUPPORTED",
  );

  const pdfInvalidXrefW = await inspectFixture({
    bytes: buildXrefStreamPdf({ w: "[1 7 2]" }),
    filename: "invalid-xref-w.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(pdfInvalidXrefW, "FAILED", "PDF_XREF_STREAM_W_INVALID");

  const pdfUnsupportedXrefFilter = await inspectFixture({
    bytes: buildXrefStreamPdf({ filterName: "ASCIIHexDecode" }),
    filename: "unsupported-xref-filter.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfUnsupportedXrefFilter,
    "FAILED",
    "PDF_STREAM_FILTER_UNSUPPORTED",
  );

  const pdfXrefDecodeLimit = await inspectFixture({
    bytes: buildXrefStreamPdf({ flate: true }),
    filename: "xref-decode-limit.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
    pdfLimits: {
      ...PDF_LIMITS,
      maxDecodedXrefStreamBytes: 8,
    },
  });
  assertVerdict(
    pdfXrefDecodeLimit,
    "FAILED",
    "PDF_STREAM_DECODE_LIMIT_EXCEEDED",
  );

  const pdfObjectStreamCountLimit = await inspectFixture({
    bytes: buildObjectStreamPdf(),
    filename: "object-stream-count-limit.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
    pdfLimits: {
      ...PDF_LIMITS,
      maxObjectsPerObjectStream: 1,
    },
  });
  assertVerdict(
    pdfObjectStreamCountLimit,
    "FAILED",
    "PDF_OBJECT_STREAM_OBJECT_LIMIT_EXCEEDED",
  );

  const pdfObjectStreamDecodeLimit = await inspectFixture({
    bytes: buildObjectStreamPdf(),
    filename: "object-stream-decode-limit.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
    pdfLimits: {
      ...PDF_LIMITS,
      maxDecodedObjectStreamBytes: 16,
    },
  });
  assertVerdict(
    pdfObjectStreamDecodeLimit,
    "FAILED",
    "PDF_STREAM_DECODE_LIMIT_EXCEEDED",
  );

  const pdfCompressedIndexMismatch = await inspectFixture({
    bytes: buildObjectStreamPdf({ rootObjectStreamIndex: 1 }),
    filename: "compressed-index-mismatch.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfCompressedIndexMismatch,
    "FAILED",
    "PDF_COMPRESSED_OBJECT_REFERENCE_INVALID",
  );

  const pdfObjectStreamFirstInvalid = await inspectFixture({
    bytes: buildObjectStreamPdf({ firstOverride: 9999 }),
    filename: "object-stream-first-invalid.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    archiveLimits: null,
  });
  assertVerdict(
    pdfObjectStreamFirstInvalid,
    "FAILED",
    "PDF_OBJECT_STREAM_HEADER_INVALID",
  );

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



  const legacyV4 = await inspectFixture({
    bytes: legacyOfficeFixture("doc", [], 4),
    filename: "legacy-v4.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(
    legacyV4,
    "IDENTITY_VERIFIED",
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    legacyV4.oleStructuralEvidence?.majorVersion === 4 &&
      legacyV4.oleStructuralEvidence.sectorSize === 4096,
    "Version 4 CFB sector geometry should be verified.",
  );

  const legacyXls = await inspectFixture({
    bytes: legacyOfficeFixture("xls"),
    filename: "legacy.xls",
    extension: "xls",
    mimeType: "application/vnd.ms-excel",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(
    legacyXls,
    "IDENTITY_VERIFIED",
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    legacyXls.identityEvidence.detectedFormat === "EXCEL_BINARY",
    "Legacy Excel application identity should be established.",
  );

  const legacyPpt = await inspectFixture({
    bytes: legacyOfficeFixture("ppt"),
    filename: "legacy.ppt",
    extension: "ppt",
    mimeType: "application/vnd.ms-powerpoint",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(
    legacyPpt,
    "IDENTITY_VERIFIED",
    "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
  );
  assert(
    legacyPpt.identityEvidence.detectedFormat === "POWERPOINT_BINARY",
    "Legacy PowerPoint application identity should be established.",
  );

  const legacyMissingLimits = await inspectFixture({
    bytes: legacyOfficeFixture("doc"),
    filename: "no-ole-limits.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
    oleLimits: null,
  });
  assertVerdict(legacyMissingLimits, "FAILED", "OLE_LIMITS_REQUIRED");

  const legacyApplicationMismatch = await inspectFixture({
    bytes: legacyOfficeFixture("xls"),
    filename: "renamed.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyApplicationMismatch, "BLOCKED", "OLE_APPLICATION_MISMATCH");


  const legacyConflictingApplication = await inspectFixture({
    bytes: legacyOfficeFixture("doc", [
      { path: "Workbook", data: Buffer.alloc(4096, 0x58) },
    ]),
    filename: "conflicting-app.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyConflictingApplication, "BLOCKED", "OLE_APPLICATION_MISMATCH");

  const legacyApplicationMissing = await inspectFixture({
    bytes: buildCfb([
      { path: "\u0005SummaryInformation", data: Buffer.alloc(100, 0x53) },
    ]),
    filename: "missing-main.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyApplicationMissing, "FAILED", "OLE_APPLICATION_STREAM_MISSING");

  const legacyVba = await inspectFixture({
    bytes: legacyOfficeFixture("doc", [
      { path: "VBA/dir", data: Buffer.from("compressed-vba-directory", "utf8") },
      { path: "VBA/_VBA_PROJECT", data: Buffer.from("project", "utf8") },
    ]),
    filename: "macro.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyVba, "BLOCKED", "OLE_VBA_PROJECT_BLOCKED");
  assertRulePack(legacyVba, "BLOCK", "HDS-OLE-001-VBA");

  const legacyEmbedded = await inspectFixture({
    bytes: legacyOfficeFixture("doc", [
      { path: "ObjectPool/Object 1/\u0001Ole10Native", data: Buffer.from("payload", "utf8") },
    ]),
    filename: "embedded.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyEmbedded, "BLOCKED", "OLE_EMBEDDED_OBJECT_BLOCKED");

  const legacyEncrypted = await inspectFixture({
    bytes: legacyOfficeFixture("doc", [
      { path: "EncryptionInfo", data: Buffer.from("info", "utf8") },
      { path: "EncryptedPackage", data: Buffer.from("ciphertext", "utf8") },
    ]),
    filename: "encrypted.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyEncrypted, "BLOCKED", "OLE_ENCRYPTED_PACKAGE_BLOCKED");

  const legacyExecutable = await inspectFixture({
    bytes: legacyOfficeFixture("doc", [
      { path: "payload.exe", data: Buffer.from([0x4d, 0x5a, 0x90, 0x00]) },
    ]),
    filename: "payload.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyExecutable, "BLOCKED", "OLE_EXECUTABLE_STREAM_BLOCKED");

  const legacyDirectoryLimit = await inspectFixture({
    bytes: legacyOfficeFixture("doc"),
    filename: "directory-limit.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
    oleLimits: { ...OLE_LIMITS, maxDirectoryEntries: 2 },
  });
  assertVerdict(legacyDirectoryLimit, "FAILED", "OLE_DIRECTORY_ENTRY_LIMIT_EXCEEDED");

  const legacyStreamCountLimit = await inspectFixture({
    bytes: legacyOfficeFixture("doc"),
    filename: "stream-count.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
    oleLimits: { ...OLE_LIMITS, maxStreams: 1 },
  });
  assertVerdict(legacyStreamCountLimit, "FAILED", "OLE_STREAM_COUNT_LIMIT_EXCEEDED");

  const legacyStreamSizeLimit = await inspectFixture({
    bytes: legacyOfficeFixture("doc"),
    filename: "stream-size.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
    oleLimits: { ...OLE_LIMITS, maxStreamBytes: 1024 },
  });
  assertVerdict(legacyStreamSizeLimit, "FAILED", "OLE_STREAM_SIZE_LIMIT_EXCEEDED");

  const legacyTotalSizeLimit = await inspectFixture({
    bytes: legacyOfficeFixture("doc"),
    filename: "total-size.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
    oleLimits: { ...OLE_LIMITS, maxTotalStreamBytes: 2048 },
  });
  assertVerdict(legacyTotalSizeLimit, "FAILED", "OLE_TOTAL_STREAM_SIZE_LIMIT_EXCEEDED");

  const chainLoopBase = legacyOfficeFixture("doc");
  const applicationStart = cfbDirectoryStartSector(chainLoopBase, 1);
  const legacySectorLoop = await inspectFixture({
    bytes: patchCfbFatEntry(chainLoopBase, applicationStart, applicationStart),
    filename: "sector-loop.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacySectorLoop, "FAILED", "OLE_SECTOR_CHAIN_LOOP");

  const legacyMiniLoop = await inspectFixture({
    bytes: patchCfbMiniFatEntry(legacyOfficeFixture("doc"), 0, 0),
    filename: "mini-loop.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyMiniLoop, "FAILED", "OLE_SECTOR_CHAIN_LOOP");

  const overlapBase = legacyOfficeFixture("doc", [
    { path: "SecondBigStream", data: Buffer.alloc(4096, 0x41) },
  ]);
  const firstStart = cfbDirectoryStartSector(overlapBase, 1);
  const legacySectorOverlap = await inspectFixture({
    bytes: patchCfbDirectoryStartSector(overlapBase, 3, firstStart),
    filename: "sector-overlap.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacySectorOverlap, "FAILED", "OLE_SECTOR_OWNERSHIP_CONFLICT");

  const difatBase = legacyOfficeFixture("doc");
  const duplicatedDifat = Buffer.from(difatBase);
  duplicatedDifat.writeUInt32LE(duplicatedDifat.readUInt32LE(76), 80);
  const legacyDuplicateDifat = await inspectFixture({
    bytes: duplicatedDifat,
    filename: "duplicate-difat.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyDuplicateDifat, "FAILED", "OLE_DIFAT_INVALID");

  const versionBase = legacyOfficeFixture("doc");
  const badVersion = Buffer.from(versionBase);
  badVersion.writeUInt16LE(5, 26);
  const legacyBadVersion = await inspectFixture({
    bytes: badVersion,
    filename: "bad-version.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyBadVersion, "FAILED", "OLE_VERSION_UNSUPPORTED");


  const legacyDirectoryDepth = await inspectFixture({
    bytes: legacyOfficeFixture("doc", [
      { path: "Level1/Level2/deep.bin", data: Buffer.from("deep", "utf8") },
    ]),
    filename: "directory-depth.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
    oleLimits: { ...OLE_LIMITS, maxDirectoryDepth: 1 },
  });
  assertVerdict(legacyDirectoryDepth, "FAILED", "OLE_DIRECTORY_DEPTH_LIMIT_EXCEEDED");

  const legacyChainLimit = await inspectFixture({
    bytes: legacyOfficeFixture("doc"),
    filename: "chain-limit.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
    oleLimits: { ...OLE_LIMITS, maxSectorChainLength: 4 },
  });
  assertVerdict(legacyChainLimit, "FAILED", "OLE_SECTOR_CHAIN_LIMIT_EXCEEDED");

  const fatLimitBytes = Buffer.from(legacyOfficeFixture("doc"));
  fatLimitBytes.writeUInt32LE(OLE_LIMITS.maxFatSectors + 1, 44);
  const legacyFatLimit = await inspectFixture({
    bytes: fatLimitBytes,
    filename: "fat-limit.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyFatLimit, "FAILED", "OLE_FAT_LIMIT_EXCEEDED");

  const difatLimitBytes = Buffer.from(legacyOfficeFixture("doc"));
  difatLimitBytes.writeUInt32LE(OLE_LIMITS.maxDifatSectors + 1, 72);
  const legacyDifatLimit = await inspectFixture({
    bytes: difatLimitBytes,
    filename: "difat-limit.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyDifatLimit, "FAILED", "OLE_DIFAT_LIMIT_EXCEEDED");

  const miniFatLimitBytes = Buffer.from(legacyOfficeFixture("doc"));
  miniFatLimitBytes.writeUInt32LE(OLE_LIMITS.maxMiniFatSectors + 1, 64);
  const legacyMiniFatLimit = await inspectFixture({
    bytes: miniFatLimitBytes,
    filename: "minifat-limit.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyMiniFatLimit, "FAILED", "OLE_MINIFAT_LIMIT_EXCEEDED");

  const orphanBase = Buffer.from(legacyOfficeFixture("doc"));
  orphanBase.writeUInt32LE(0xffffffff, cfbDirectoryEntryOffset(0) + 76);
  const legacyOrphanDirectory = await inspectFixture({
    bytes: orphanBase,
    filename: "orphan-directory.doc",
    extension: "doc",
    mimeType: "application/msword",
    archiveLimits: null,
    pdfLimits: null,
  });
  assertVerdict(legacyOrphanDirectory, "FAILED", "OLE_DIRECTORY_TREE_INVALID");

  const ooxmlPassEvidence =
    (positiveCases[1] as NativeDocumentScannerResult).ooxmlStructuralEvidence;
  assert(ooxmlPassEvidence, "Positive OOXML evidence is required for M4 rule-order QA.");
  const deterministicRuleOrder = evaluateOoxmlSecurityRules({
    ...ooxmlPassEvidence,
    vbaProjectDetected: true,
    activeXDetected: true,
    executablePackagePartDetected: true,
  });
  assert(
    deterministicRuleOrder.matchedRules.map((rule) => rule.ruleId).join(",") ===
      "HDS-OOXML-001-VBA,HDS-OOXML-003-ACTIVEX,HDS-OOXML-007-EXECUTABLE-PART",
    "M4 rule matches must remain deterministically ordered by the versioned rule pack.",
  );
  assert(
    Object.isFrozen(HEHXAGON_DOCUMENT_SECURITY_RULE_IDS) &&
      HEHXAGON_DOCUMENT_SECURITY_RULE_IDS.length === 21,
    "M4 must expose the immutable 21-rule baseline rule inventory.",
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
    pdfFlatePredictorXref,
    pdfCompressedJavascript,
    pdfMixedXrefChain,
    pdfHybridHiddenJavascript,
    pdfInvalidXrefIndex,
    pdfUnsupportedObjectStreamFilter,
    pdfInvalidXrefW,
    pdfUnsupportedXrefFilter,
    pdfXrefDecodeLimit,
    pdfObjectStreamCountLimit,
    pdfObjectStreamDecodeLimit,
    pdfCompressedIndexMismatch,
    pdfObjectStreamFirstInvalid,
    pdfMissingPageTree,
    pdfObjectCountLimit,
    pdfNestingLimit,
    pdfStringLimit,
    legacyV4,
    legacyXls,
    legacyPpt,
    legacyMissingLimits,
    legacyApplicationMismatch,
    legacyConflictingApplication,
    legacyApplicationMissing,
    legacyVba,
    legacyEmbedded,
    legacyEncrypted,
    legacyExecutable,
    legacyDirectoryLimit,
    legacyStreamCountLimit,
    legacyStreamSizeLimit,
    legacyTotalSizeLimit,
    legacySectorLoop,
    legacyMiniLoop,
    legacySectorOverlap,
    legacyDuplicateDifat,
    legacyBadVersion,
    legacyDirectoryDepth,
    legacyChainLimit,
    legacyFatLimit,
    legacyDifatLimit,
    legacyMiniFatLimit,
    legacyOrphanDirectory,
  ];

  for (const result of allResults) {
    assertSanitized(result);
  }

  console.log("HDS M4 native document scanner self-test: GREEN");
  console.log(`Cases: ${allResults.length + 6}`);
  console.log("M1 identity/integrity regression: GREEN");
  console.log("M2 bounded OOXML archive regression: GREEN");
  console.log("M3A OOXML structural security regression: GREEN");
  console.log("M4 versioned rule-pack separation + deterministic ordering: GREEN");
  console.log("Classic PDF xref/object structural regression: GREEN");
  console.log("Modern PDF xref/object-stream structural parsing: GREEN");
  console.log("PDF object/nesting/string/decompression resource guards: GREEN");
  console.log("PDF JavaScript/action/attachment/rich-media blocks: GREEN");
  console.log("Encrypted PDF fail-closed policy: GREEN");
  console.log("Ordinary HTTP(S) PDF hyperlink policy: GREEN");
  console.log("Legacy DOC/XLS/PPT CFB structural parsing: GREEN");
  console.log("OLE FAT/DIFAT/MiniFAT/directory/ownership guards: GREEN");
  console.log("OLE VBA/embedded/encrypted/executable blocks: GREEN");
  console.log("OOXML/PDF/OLE rule-pack passes remain non-CLEAN: GREEN");
  console.log("Sanitized result boundary: GREEN");
}

run().catch(() => {
  console.error("HDS M4 native document scanner self-test: FAILED");
  process.exitCode = 1;
});
