import { inflateRawSync } from "node:zlib";

import type {
  NativeDocumentArchiveEvidence,
  NativeDocumentArchiveLimits,
  NativeDocumentExtension,
  NativeDocumentFormat,
  NativeDocumentScannerReasonCode,
} from "./types";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const MIN_EOCD_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

const ZIP_FLAG_ENCRYPTED = 0x0001;
const ZIP_FLAG_STRONG_ENCRYPTION = 0x0040;
const ZIP_FLAG_UTF8 = 0x0800;

const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

const ZIP64_UINT16_SENTINEL = 0xffff;
const ZIP64_UINT32_SENTINEL = 0xffffffff;

const OOXML_CONTENT_TYPES_PATH = "[Content_Types].xml";
const OOXML_ROOT_RELATIONSHIPS_PATH = "_rels/.rels";

const WORD_MAIN_PART = "word/document.xml" as const;
const PRESENTATION_MAIN_PART = "ppt/presentation.xml" as const;
const SPREADSHEET_MAIN_PART = "xl/workbook.xml" as const;

const WORD_MAIN_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const PRESENTATION_MAIN_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const SPREADSHEET_MAIN_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";

type OoxmlPackageFormat = Extract<
  NativeDocumentFormat,
  "WORD_OOXML" | "POWERPOINT_OOXML" | "EXCEL_OOXML"
>;

type ZipEntry = {
  name: string;
  normalizedName: string;
  flags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  dataOffset: number;
  dataEnd: number;
};

export type OoxmlArchiveInspectionResult =
  | {
      ok: true;
      format: OoxmlPackageFormat;
      evidence: NativeDocumentArchiveEvidence;
    }
  | {
      ok: false;
      verdict: "BLOCKED" | "FAILED";
      reasonCode: NativeDocumentScannerReasonCode;
      message: string;
    };

type OoxmlArchiveInspectionFailure = Extract<
  OoxmlArchiveInspectionResult,
  { ok: false }
>;

function blocked(
  reasonCode: NativeDocumentScannerReasonCode,
  message: string,
): OoxmlArchiveInspectionFailure {
  return {
    ok: false,
    verdict: "BLOCKED",
    reasonCode,
    message,
  };
}

function failed(
  reasonCode: NativeDocumentScannerReasonCode,
  message: string,
): OoxmlArchiveInspectionFailure {
  return {
    ok: false,
    verdict: "FAILED",
    reasonCode,
    message,
  };
}

function isPositiveSafeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

function isPositiveFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function validateArchiveLimits(limits: NativeDocumentArchiveLimits) {
  return (
    isPositiveSafeInteger(limits.maxEntries) &&
    isPositiveSafeInteger(limits.maxEntryUncompressedBytes) &&
    isPositiveSafeInteger(limits.maxTotalUncompressedBytes) &&
    isPositiveFiniteNumber(limits.maxCompressionRatio) &&
    isPositiveSafeInteger(limits.maxControlPartBytes) &&
    limits.maxControlPartBytes <= limits.maxEntryUncompressedBytes &&
    limits.maxEntryUncompressedBytes <= limits.maxTotalUncompressedBytes
  );
}

function findEndOfCentralDirectory(bytes: Buffer) {
  if (bytes.length < MIN_EOCD_BYTES) return null;

  const earliestOffset = Math.max(
    0,
    bytes.length - MIN_EOCD_BYTES - MAX_ZIP_COMMENT_BYTES,
  );

  for (
    let offset = bytes.length - MIN_EOCD_BYTES;
    offset >= earliestOffset;
    offset -= 1
  ) {
    if (
      bytes.readUInt32LE(offset) !==
      END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      continue;
    }

    const commentLength = bytes.readUInt16LE(offset + 20);

    if (offset + MIN_EOCD_BYTES + commentLength === bytes.length) {
      return offset;
    }
  }

  return null;
}

function decodeZipEntryName(nameBytes: Buffer, flags: number) {
  if (!nameBytes.length) return null;

  try {
    if ((flags & ZIP_FLAG_UTF8) !== 0) {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return decoder.decode(nameBytes);
    }

    if (nameBytes.some((value) => value > 0x7f)) {
      return null;
    }

    return nameBytes.toString("ascii");
  } catch {
    return null;
  }
}

function validateZipEntryPath(name: string):
  | { ok: true; normalizedName: string }
  | {
      ok: false;
      reasonCode: NativeDocumentScannerReasonCode;
      message: string;
    } {
  if (
    !name ||
    name.length > 1024 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    name.includes("\\")
  ) {
    return {
      ok: false,
      reasonCode: "ZIP_ENTRY_PATH_INVALID",
      message: "A ZIP entry path is not valid for bounded OOXML inspection.",
    };
  }

  if (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[A-Za-z]:/.test(name)
  ) {
    return {
      ok: false,
      reasonCode: "ZIP_ENTRY_ABSOLUTE_PATH",
      message: "Absolute ZIP entry paths are not permitted.",
    };
  }

  const isDirectory = name.endsWith("/");
  const pathForSegments = isDirectory ? name.slice(0, -1) : name;
  const segments = pathForSegments.split("/");

  if (
    !segments.length ||
    segments.some((segment) => segment === "..")
  ) {
    return {
      ok: false,
      reasonCode: "ZIP_ENTRY_PATH_TRAVERSAL",
      message: "ZIP entry traversal segments are not permitted.",
    };
  }

  if (
    segments.some(
      (segment) => !segment || segment === ".",
    )
  ) {
    return {
      ok: false,
      reasonCode: "ZIP_ENTRY_PATH_INVALID",
      message: "ZIP entry path segments are malformed.",
    };
  }

  return {
    ok: true,
    normalizedName: name.normalize("NFC").toLowerCase(),
  };
}

function parseZipEntries(args: {
  bytes: Buffer;
  limits: NativeDocumentArchiveLimits;
}):
  | {
      ok: true;
      entries: ZipEntry[];
      centralDirectoryOffset: number;
      centralDirectorySize: number;
      totalCompressedBytes: number;
      totalUncompressedBytes: number;
    }
  | OoxmlArchiveInspectionFailure {
  const eocdOffset = findEndOfCentralDirectory(args.bytes);

  if (eocdOffset === null) {
    return blocked(
      "ZIP_END_OF_CENTRAL_DIRECTORY_MISSING",
      "The OOXML ZIP end-of-central-directory record is missing.",
    );
  }

  const diskNumber = args.bytes.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = args.bytes.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = args.bytes.readUInt16LE(eocdOffset + 8);
  const totalEntries = args.bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = args.bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = args.bytes.readUInt32LE(eocdOffset + 16);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== totalEntries
  ) {
    return blocked(
      "ZIP_MULTI_DISK_UNSUPPORTED",
      "Multi-disk ZIP containers are not permitted for institutional OOXML documents.",
    );
  }

  if (
    entriesOnDisk === ZIP64_UINT16_SENTINEL ||
    totalEntries === ZIP64_UINT16_SENTINEL ||
    centralDirectorySize === ZIP64_UINT32_SENTINEL ||
    centralDirectoryOffset === ZIP64_UINT32_SENTINEL
  ) {
    return blocked(
      "ZIP64_UNSUPPORTED",
      "ZIP64 containers are outside the bounded M2 OOXML policy.",
    );
  }

  if (totalEntries <= 0) {
    return blocked(
      "ZIP_CENTRAL_DIRECTORY_INVALID",
      "An OOXML package must contain a non-empty ZIP central directory.",
    );
  }

  if (totalEntries > args.limits.maxEntries) {
    return blocked(
      "ZIP_ENTRY_COUNT_LIMIT_EXCEEDED",
      "The ZIP entry count exceeds the configured archive limit.",
    );
  }

  const centralDirectoryEnd =
    centralDirectoryOffset + centralDirectorySize;

  if (
    !Number.isSafeInteger(centralDirectoryEnd) ||
    centralDirectoryOffset < 0 ||
    centralDirectorySize <= 0 ||
    centralDirectoryEnd !== eocdOffset ||
    centralDirectoryEnd > args.bytes.length
  ) {
    return blocked(
      "ZIP_CENTRAL_DIRECTORY_INVALID",
      "The ZIP central-directory bounds are inconsistent.",
    );
  }

  const entries: ZipEntry[] = [];
  const seenNames = new Set<string>();
  const seenLocalOffsets = new Set<number>();
  let cursor = centralDirectoryOffset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    if (
      cursor + 46 > centralDirectoryEnd ||
      args.bytes.readUInt32LE(cursor) !==
        CENTRAL_DIRECTORY_HEADER_SIGNATURE
    ) {
      return blocked(
        "ZIP_CENTRAL_DIRECTORY_INVALID",
        "A ZIP central-directory entry is malformed.",
      );
    }

    const flags = args.bytes.readUInt16LE(cursor + 8);
    const compressionMethod = args.bytes.readUInt16LE(cursor + 10);
    const crc32 = args.bytes.readUInt32LE(cursor + 16);
    const compressedSize = args.bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = args.bytes.readUInt32LE(cursor + 24);
    const filenameLength = args.bytes.readUInt16LE(cursor + 28);
    const extraLength = args.bytes.readUInt16LE(cursor + 30);
    const commentLength = args.bytes.readUInt16LE(cursor + 32);
    const diskStart = args.bytes.readUInt16LE(cursor + 34);
    const localHeaderOffset = args.bytes.readUInt32LE(cursor + 42);

    if (
      compressedSize === ZIP64_UINT32_SENTINEL ||
      uncompressedSize === ZIP64_UINT32_SENTINEL ||
      localHeaderOffset === ZIP64_UINT32_SENTINEL ||
      diskStart === ZIP64_UINT16_SENTINEL
    ) {
      return blocked(
        "ZIP64_UNSUPPORTED",
        "ZIP64 entry metadata is outside the bounded M2 OOXML policy.",
      );
    }

    if (diskStart !== 0) {
      return blocked(
        "ZIP_MULTI_DISK_UNSUPPORTED",
        "Multi-disk ZIP entry metadata is not permitted.",
      );
    }

    if (
      (flags & ZIP_FLAG_ENCRYPTED) !== 0 ||
      (flags & ZIP_FLAG_STRONG_ENCRYPTION) !== 0
    ) {
      return blocked(
        "ZIP_ENTRY_ENCRYPTED",
        "Encrypted ZIP entries cannot be inspected safely.",
      );
    }

    if (
      compressionMethod !== COMPRESSION_STORED &&
      compressionMethod !== COMPRESSION_DEFLATE
    ) {
      return blocked(
        "ZIP_COMPRESSION_METHOD_UNSUPPORTED",
        "The ZIP compression method is outside the bounded OOXML policy.",
      );
    }

    const recordEnd =
      cursor + 46 + filenameLength + extraLength + commentLength;

    if (
      filenameLength <= 0 ||
      recordEnd > centralDirectoryEnd
    ) {
      return blocked(
        "ZIP_CENTRAL_DIRECTORY_INVALID",
        "A ZIP central-directory record exceeds its declared bounds.",
      );
    }

    const rawName = args.bytes.subarray(
      cursor + 46,
      cursor + 46 + filenameLength,
    );
    const name = decodeZipEntryName(rawName, flags);

    if (!name) {
      return blocked(
        "ZIP_ENTRY_NAME_ENCODING_UNSUPPORTED",
        "A ZIP entry name cannot be decoded under the bounded OOXML policy.",
      );
    }

    const pathValidation = validateZipEntryPath(name);

    if (!pathValidation.ok) {
      return blocked(
        pathValidation.reasonCode,
        pathValidation.message,
      );
    }

    if (seenNames.has(pathValidation.normalizedName)) {
      return blocked(
        "ZIP_DUPLICATE_ENTRY",
        "Duplicate or case-colliding ZIP entry paths are not permitted.",
      );
    }

    seenNames.add(pathValidation.normalizedName);

    if (seenLocalOffsets.has(localHeaderOffset)) {
      return blocked(
        "ZIP_ENTRY_DATA_OVERLAP",
        "Multiple ZIP entries cannot share the same local header.",
      );
    }

    seenLocalOffsets.add(localHeaderOffset);

    const isDirectory = name.endsWith("/");

    if (
      uncompressedSize > args.limits.maxEntryUncompressedBytes
    ) {
      return blocked(
        "ZIP_ENTRY_SIZE_LIMIT_EXCEEDED",
        "A ZIP entry exceeds the configured uncompressed-size limit.",
      );
    }

    totalCompressedBytes += compressedSize;
    totalUncompressedBytes += uncompressedSize;

    if (
      !Number.isSafeInteger(totalCompressedBytes) ||
      !Number.isSafeInteger(totalUncompressedBytes) ||
      totalUncompressedBytes > args.limits.maxTotalUncompressedBytes
    ) {
      return blocked(
        "ZIP_TOTAL_EXPANDED_SIZE_LIMIT_EXCEEDED",
        "The ZIP declared expanded size exceeds the configured archive limit.",
      );
    }

    if (!isDirectory && uncompressedSize > 0) {
      const ratio =
        compressedSize === 0
          ? Number.POSITIVE_INFINITY
          : uncompressedSize / compressedSize;

      if (ratio > args.limits.maxCompressionRatio) {
        return blocked(
          "ZIP_COMPRESSION_RATIO_LIMIT_EXCEEDED",
          "A ZIP entry exceeds the configured compression-ratio limit.",
        );
      }
    }

    if (
      localHeaderOffset < 0 ||
      localHeaderOffset + 30 > centralDirectoryOffset ||
      args.bytes.readUInt32LE(localHeaderOffset) !==
        LOCAL_FILE_HEADER_SIGNATURE
    ) {
      return blocked(
        "ZIP_LOCAL_HEADER_INVALID",
        "A ZIP local file header is missing or outside bounded package data.",
      );
    }

    const localFlags = args.bytes.readUInt16LE(localHeaderOffset + 6);
    const localCompressionMethod =
      args.bytes.readUInt16LE(localHeaderOffset + 8);
    const localFilenameLength =
      args.bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength =
      args.bytes.readUInt16LE(localHeaderOffset + 28);

    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localFilenameLength;
    const dataOffset = localNameEnd + localExtraLength;
    const dataEnd = dataOffset + compressedSize;

    if (
      localNameEnd > centralDirectoryOffset ||
      dataOffset > centralDirectoryOffset ||
      dataEnd > centralDirectoryOffset
    ) {
      return blocked(
        "ZIP_LOCAL_HEADER_INVALID",
        "ZIP local entry bounds overlap the central directory.",
      );
    }

    const localName = decodeZipEntryName(
      args.bytes.subarray(localNameStart, localNameEnd),
      localFlags,
    );

    if (
      !localName ||
      localName !== name ||
      localCompressionMethod !== compressionMethod ||
      localFlags !== flags
    ) {
      return blocked(
        "ZIP_LOCAL_HEADER_INVALID",
        "ZIP local-header metadata does not match the central directory.",
      );
    }

    if (
      compressionMethod === COMPRESSION_STORED &&
      compressedSize !== uncompressedSize
    ) {
      return blocked(
        "ZIP_LOCAL_HEADER_INVALID",
        "Stored ZIP entries must have equal compressed and uncompressed sizes.",
      );
    }

    entries.push({
      name,
      normalizedName: pathValidation.normalizedName,
      flags,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataOffset,
      dataEnd,
    });

    cursor = recordEnd;
  }

  if (cursor !== centralDirectoryEnd) {
    return blocked(
      "ZIP_CENTRAL_DIRECTORY_INVALID",
      "The ZIP central directory contains unaccounted metadata.",
    );
  }

  const dataRanges = entries
    .filter((entry) => entry.dataEnd > entry.localHeaderOffset)
    .map((entry) => ({
      start: entry.localHeaderOffset,
      end: entry.dataEnd,
    }))
    .sort((left, right) => left.start - right.start);

  for (let index = 1; index < dataRanges.length; index += 1) {
    const previous = dataRanges[index - 1];
    const current = dataRanges[index];

    if (previous && current && current.start < previous.end) {
      return blocked(
        "ZIP_ENTRY_DATA_OVERLAP",
        "ZIP local-entry data regions overlap.",
      );
    }
  }

  return {
    ok: true,
    entries,
    centralDirectoryOffset,
    centralDirectorySize,
    totalCompressedBytes,
    totalUncompressedBytes,
  };
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

function readControlPart(args: {
  bytes: Buffer;
  entry: ZipEntry;
  maxControlPartBytes: number;
}):
  | { ok: true; bytes: Buffer }
  | OoxmlArchiveInspectionFailure {
  if (args.entry.uncompressedSize > args.maxControlPartBytes) {
    return blocked(
      "OOXML_CONTROL_PART_TOO_LARGE",
      "An OOXML control part exceeds the configured inspection limit.",
    );
  }

  const compressed = args.bytes.subarray(
    args.entry.dataOffset,
    args.entry.dataEnd,
  );

  let output: Buffer;

  try {
    if (args.entry.compressionMethod === COMPRESSION_STORED) {
      output = Buffer.from(compressed);
    } else if (args.entry.compressionMethod === COMPRESSION_DEFLATE) {
      output = inflateRawSync(compressed, {
        maxOutputLength: args.maxControlPartBytes,
      });
    } else {
      return blocked(
        "ZIP_COMPRESSION_METHOD_UNSUPPORTED",
        "The OOXML control-part compression method is unsupported.",
      );
    }
  } catch {
    return failed(
      "OOXML_CONTROL_PART_DECOMPRESSION_FAILED",
      "An OOXML control part could not be decompressed within bounded limits.",
    );
  }

  if (output.length !== args.entry.uncompressedSize) {
    return failed(
      "OOXML_CONTROL_PART_SIZE_MISMATCH",
      "An OOXML control part did not match its declared expanded size.",
    );
  }

  if (crc32(output) !== args.entry.crc32) {
    return failed(
      "OOXML_CONTROL_PART_CRC_MISMATCH",
      "An OOXML control part failed CRC integrity verification.",
    );
  }

  return { ok: true, bytes: output };
}

function decodeXml(bytes: Buffer) {
  try {
    if (
      bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
    ) {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(3),
      );
    }

    if (
      bytes.length >= 2 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xfe
    ) {
      return bytes.subarray(2).toString("utf16le");
    }

    if (
      bytes.length >= 2 &&
      bytes[0] === 0xfe &&
      bytes[1] === 0xff
    ) {
      const swapped = Buffer.from(bytes.subarray(2));
      swapped.swap16();
      return swapped.toString("utf16le");
    }

    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function decodeXmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tagAttributes(tag: string) {
  const attributes = new Map<string, string>();
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g;

  for (const match of tag.matchAll(pattern)) {
    const name = match[1];
    const value = match[3];

    if (!name || value === undefined || attributes.has(name)) {
      continue;
    }

    attributes.set(name, decodeXmlAttribute(value));
  }

  return attributes;
}

function normalizeMainPartTarget(target: string) {
  const cleaned = target.trim().replace(/^\/+/, "");

  if (
    !cleaned ||
    cleaned.includes("\\") ||
    cleaned.includes("#") ||
    cleaned.includes("?") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(cleaned)
  ) {
    return null;
  }

  const segments = cleaned.split("/");

  if (
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    )
  ) {
    return null;
  }

  return cleaned.normalize("NFC");
}

function parseMainDocumentRelationship(xml: string):
  | {
      ok: true;
      target: string;
    }
  | OoxmlArchiveInspectionFailure {
  const relationships: Array<{
    type: string;
    target: string;
    targetMode: string | null;
  }> = [];

  const relationshipTags = xml.match(
    /<(?:[A-Za-z_][A-Za-z0-9_.-]*:)?Relationship\b[^>]*>/g,
  );

  for (const tag of relationshipTags ?? []) {
    const attributes = tagAttributes(tag);
    const type = attributes.get("Type") ?? "";
    const target = attributes.get("Target") ?? "";
    const targetMode = attributes.get("TargetMode") ?? null;

    if (type.endsWith("/officeDocument")) {
      relationships.push({ type, target, targetMode });
    }
  }

  if (!relationships.length) {
    return blocked(
      "OOXML_MAIN_DOCUMENT_RELATIONSHIP_MISSING",
      "The OOXML package has no root office-document relationship.",
    );
  }

  if (relationships.length !== 1) {
    return blocked(
      "OOXML_MAIN_DOCUMENT_RELATIONSHIP_AMBIGUOUS",
      "The OOXML package has multiple root office-document relationships.",
    );
  }

  const relationship = relationships[0];

  if (!relationship) {
    return blocked(
      "OOXML_MAIN_DOCUMENT_RELATIONSHIP_MISSING",
      "The OOXML package has no root office-document relationship.",
    );
  }

  if (
    relationship.targetMode &&
    relationship.targetMode.toLowerCase() === "external"
  ) {
    return blocked(
      "OOXML_MAIN_DOCUMENT_RELATIONSHIP_EXTERNAL",
      "The OOXML main document relationship cannot be external.",
    );
  }

  const target = normalizeMainPartTarget(relationship.target);

  if (!target) {
    return blocked(
      "OOXML_MAIN_DOCUMENT_RELATIONSHIP_MISSING",
      "The OOXML main document relationship target is invalid.",
    );
  }

  return { ok: true, target };
}

function contentTypeForMainPart(args: {
  xml: string;
  mainPartPath: string;
}) {
  const overrideTags = args.xml.match(
    /<(?:[A-Za-z_][A-Za-z0-9_.-]*:)?Override\b[^>]*>/g,
  );

  const wantedPartName = `/${args.mainPartPath}`;

  for (const tag of overrideTags ?? []) {
    const attributes = tagAttributes(tag);
    const partName = attributes.get("PartName") ?? "";
    const contentType = attributes.get("ContentType") ?? "";

    if (partName === wantedPartName) {
      return contentType.trim();
    }
  }

  return null;
}

function packageIdentityFromMainPart(path: string):
  | {
      format: OoxmlPackageFormat;
      mainPartPath:
        | typeof WORD_MAIN_PART
        | typeof PRESENTATION_MAIN_PART
        | typeof SPREADSHEET_MAIN_PART;
      contentType: string;
      extension: Extract<NativeDocumentExtension, "docx" | "pptx" | "xlsx">;
    }
  | null {
  if (path === WORD_MAIN_PART) {
    return {
      format: "WORD_OOXML",
      mainPartPath: WORD_MAIN_PART,
      contentType: WORD_MAIN_CONTENT_TYPE,
      extension: "docx",
    };
  }

  if (path === PRESENTATION_MAIN_PART) {
    return {
      format: "POWERPOINT_OOXML",
      mainPartPath: PRESENTATION_MAIN_PART,
      contentType: PRESENTATION_MAIN_CONTENT_TYPE,
      extension: "pptx",
    };
  }

  if (path === SPREADSHEET_MAIN_PART) {
    return {
      format: "EXCEL_OOXML",
      mainPartPath: SPREADSHEET_MAIN_PART,
      contentType: SPREADSHEET_MAIN_CONTENT_TYPE,
      extension: "xlsx",
    };
  }

  return null;
}

export function inspectOoxmlArchive(args: {
  bytes: Buffer;
  declaredExtension: Extract<
    NativeDocumentExtension,
    "docx" | "pptx" | "xlsx"
  >;
  limits: NativeDocumentArchiveLimits;
}): OoxmlArchiveInspectionResult {
  if (!validateArchiveLimits(args.limits)) {
    return failed(
      "SCANNER_INPUT_INVALID",
      "The configured OOXML archive limits are invalid.",
    );
  }

  const parsed = parseZipEntries({
    bytes: args.bytes,
    limits: args.limits,
  });

  if (!parsed.ok) return parsed;

  const byName = new Map(
    parsed.entries.map((entry) => [entry.normalizedName, entry]),
  );

  const contentTypesEntry = byName.get(
    OOXML_CONTENT_TYPES_PATH.toLowerCase(),
  );

  if (!contentTypesEntry) {
    return blocked(
      "OOXML_CONTENT_TYPES_MISSING",
      "The OOXML [Content_Types].xml control part is missing.",
    );
  }

  const relationshipsEntry = byName.get(
    OOXML_ROOT_RELATIONSHIPS_PATH.toLowerCase(),
  );

  if (!relationshipsEntry) {
    return blocked(
      "OOXML_ROOT_RELATIONSHIPS_MISSING",
      "The OOXML root relationships control part is missing.",
    );
  }

  const contentTypesPart = readControlPart({
    bytes: args.bytes,
    entry: contentTypesEntry,
    maxControlPartBytes: args.limits.maxControlPartBytes,
  });

  if (!contentTypesPart.ok) return contentTypesPart;

  const relationshipsPart = readControlPart({
    bytes: args.bytes,
    entry: relationshipsEntry,
    maxControlPartBytes: args.limits.maxControlPartBytes,
  });

  if (!relationshipsPart.ok) return relationshipsPart;

  const contentTypesXml = decodeXml(contentTypesPart.bytes);
  const relationshipsXml = decodeXml(relationshipsPart.bytes);

  if (!contentTypesXml || !relationshipsXml) {
    return failed(
      "OOXML_CONTROL_XML_INVALID",
      "An OOXML control part is not valid bounded XML text.",
    );
  }

  const mainRelationship = parseMainDocumentRelationship(
    relationshipsXml,
  );

  if (!mainRelationship.ok) return mainRelationship;

  const identity = packageIdentityFromMainPart(
    mainRelationship.target,
  );

  if (!identity) {
    return blocked(
      "OOXML_MAIN_DOCUMENT_RELATIONSHIP_MISSING",
      "The OOXML root relationship does not identify a supported Word, Excel, or PowerPoint main part.",
    );
  }

  if (identity.extension !== args.declaredExtension) {
    return blocked(
      "OOXML_APPLICATION_MISMATCH",
      "The OOXML package application does not match the declared extension.",
    );
  }

  const mainPart = byName.get(identity.mainPartPath.toLowerCase());

  if (!mainPart) {
    return blocked(
      "OOXML_MAIN_DOCUMENT_PART_MISSING",
      "The OOXML main document part referenced by the package is missing.",
    );
  }

  const mainContentType = contentTypeForMainPart({
    xml: contentTypesXml,
    mainPartPath: identity.mainPartPath,
  });

  if (mainContentType !== identity.contentType) {
    return blocked(
      "OOXML_MAIN_DOCUMENT_CONTENT_TYPE_MISMATCH",
      "The OOXML main document content type does not match the package application.",
    );
  }

  return {
    ok: true,
    format: identity.format,
    evidence: {
      entryCount: parsed.entries.length,
      centralDirectoryOffset: parsed.centralDirectoryOffset,
      centralDirectorySize: parsed.centralDirectorySize,
      totalCompressedBytes: parsed.totalCompressedBytes,
      totalUncompressedBytes: parsed.totalUncompressedBytes,
      packageFormat: identity.format,
      mainPartPath: identity.mainPartPath,
      contentTypesPartVerified: true,
      rootRelationshipsPartVerified: true,
      mainPartPresent: true,
      zip64: false,
      multiDisk: false,
      encryptedEntriesDetected: false,
      duplicatePathsDetected: false,
      pathTraversalDetected: false,
    },
  };
}
