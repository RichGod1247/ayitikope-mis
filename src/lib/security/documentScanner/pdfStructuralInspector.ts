import type {
  NativeDocumentPdfLimits,
  NativeDocumentPdfStructuralEvidence,
  NativeDocumentScannerReasonCode,
} from "./types";

type PdfName = { kind: "name"; value: string };
type PdfString = { kind: "string"; value: string };
type PdfRef = { kind: "ref"; objectNumber: number; generation: number };
type PdfArray = { kind: "array"; values: PdfValue[] };
type PdfDict = { kind: "dict"; values: Map<string, PdfValue> };
type PdfValue =
  | PdfName
  | PdfString
  | PdfRef
  | PdfArray
  | PdfDict
  | number
  | boolean
  | null;

type XrefEntry = {
  offset: number;
  generation: number;
  inUse: boolean;
};

type ParsedIndirectObject = {
  objectNumber: number;
  generation: number;
  value: PdfValue;
};

export type PdfStructuralInspectionResult =
  | {
      ok: true;
      evidence: NativeDocumentPdfStructuralEvidence;
    }
  | {
      ok: false;
      verdict: "BLOCKED" | "FAILED";
      reasonCode: NativeDocumentScannerReasonCode;
      message: string;
    };

const PDF_WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const PDF_DELIMITERS = new Set([
  0x28,
  0x29,
  0x3c,
  0x3e,
  0x5b,
  0x5d,
  0x7b,
  0x7d,
  0x2f,
  0x25,
]);

function failed(
  reasonCode: NativeDocumentScannerReasonCode,
  message: string,
): PdfStructuralInspectionResult {
  return { ok: false, verdict: "FAILED", reasonCode, message };
}

function blocked(
  reasonCode: NativeDocumentScannerReasonCode,
  message: string,
): PdfStructuralInspectionResult {
  return { ok: false, verdict: "BLOCKED", reasonCode, message };
}

function positiveSafeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

function validateLimits(limits: NativeDocumentPdfLimits) {
  return (
    positiveSafeInteger(limits.maxObjects) &&
    positiveSafeInteger(limits.maxIncrementalUpdates) &&
    positiveSafeInteger(limits.maxNestingDepth) &&
    positiveSafeInteger(limits.maxTokenBytes) &&
    positiveSafeInteger(limits.maxStringBytes)
  );
}

function isWhitespace(byte: number | undefined) {
  return byte !== undefined && PDF_WHITESPACE.has(byte);
}

function isDelimiter(byte: number | undefined) {
  return byte !== undefined && PDF_DELIMITERS.has(byte);
}

function isRegular(byte: number | undefined) {
  return (
    byte !== undefined &&
    !isWhitespace(byte) &&
    !isDelimiter(byte)
  );
}

function ascii(bytes: Buffer, start: number, end: number) {
  return bytes.toString("latin1", start, end);
}

function startsWithAscii(bytes: Buffer, offset: number, value: string) {
  if (offset < 0 || offset + value.length > bytes.length) return false;
  return ascii(bytes, offset, offset + value.length) === value;
}

function skipWhitespaceAndComments(bytes: Buffer, start: number) {
  let offset = start;

  while (offset < bytes.length) {
    if (isWhitespace(bytes[offset])) {
      offset += 1;
      continue;
    }

    if (bytes[offset] === 0x25) {
      offset += 1;
      while (
        offset < bytes.length &&
        bytes[offset] !== 0x0a &&
        bytes[offset] !== 0x0d
      ) {
        offset += 1;
      }
      continue;
    }

    break;
  }

  return offset;
}

function readUnsignedInteger(bytes: Buffer, start: number) {
  let offset = start;
  let value = "";

  while (
    offset < bytes.length &&
    bytes[offset] !== undefined &&
    bytes[offset]! >= 0x30 &&
    bytes[offset]! <= 0x39
  ) {
    value += String.fromCharCode(bytes[offset]!);
    offset += 1;
  }

  if (!value) return null;

  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return null;

  return { value: number, offset };
}

function decodePdfName(raw: string) {
  let decoded = "";

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index] ?? "";

    if (
      character === "#" &&
      index + 2 < raw.length &&
      /^[0-9a-fA-F]{2}$/.test(raw.slice(index + 1, index + 3))
    ) {
      decoded += String.fromCharCode(
        Number.parseInt(raw.slice(index + 1, index + 3), 16),
      );
      index += 2;
      continue;
    }

    decoded += character;
  }

  return decoded;
}

class PdfValueParser {
  private offset: number;

  constructor(
    private readonly bytes: Buffer,
    start: number,
    private readonly limits: NativeDocumentPdfLimits,
  ) {
    this.offset = start;
  }

  position() {
    return this.offset;
  }

  skipSpace() {
    this.offset = skipWhitespaceAndComments(this.bytes, this.offset);
  }

  consumeKeyword(keyword: string) {
    this.skipSpace();

    if (!startsWithAscii(this.bytes, this.offset, keyword)) return false;

    const next = this.bytes[this.offset + keyword.length];
    if (isRegular(next)) return false;

    this.offset += keyword.length;
    return true;
  }

  parseValue(depth = 0): PdfValue {
    if (depth > this.limits.maxNestingDepth) {
      throw new Error("NESTING_LIMIT");
    }

    this.skipSpace();

    const first = this.bytes[this.offset];
    const second = this.bytes[this.offset + 1];

    if (first === undefined) throw new Error("SYNTAX");

    if (first === 0x3c && second === 0x3c) {
      return this.parseDictionary(depth + 1);
    }

    if (first === 0x5b) {
      return this.parseArray(depth + 1);
    }

    if (first === 0x2f) {
      return this.parseName();
    }

    if (first === 0x28) {
      return this.parseLiteralString();
    }

    if (first === 0x3c) {
      return this.parseHexString();
    }

    if (
      (first >= 0x30 && first <= 0x39) ||
      first === 0x2b ||
      first === 0x2d ||
      first === 0x2e
    ) {
      return this.parseNumberOrReference();
    }

    const keyword = this.readRegularToken();

    if (keyword === "true") return true;
    if (keyword === "false") return false;
    if (keyword === "null") return null;

    throw new Error("SYNTAX");
  }

  private readRegularToken() {
    const start = this.offset;

    while (isRegular(this.bytes[this.offset])) {
      this.offset += 1;
      if (this.offset - start > this.limits.maxTokenBytes) {
        throw new Error("TOKEN_LIMIT");
      }
    }

    if (this.offset === start) throw new Error("SYNTAX");

    return ascii(this.bytes, start, this.offset);
  }

  private parseName(): PdfName {
    this.offset += 1;
    const start = this.offset;

    while (isRegular(this.bytes[this.offset])) {
      this.offset += 1;
      if (this.offset - start > this.limits.maxTokenBytes) {
        throw new Error("TOKEN_LIMIT");
      }
    }

    if (this.offset === start) throw new Error("SYNTAX");

    return {
      kind: "name",
      value: decodePdfName(ascii(this.bytes, start, this.offset)),
    };
  }

  private parseLiteralString(): PdfString {
    this.offset += 1;
    let nesting = 1;
    const output: number[] = [];

    while (this.offset < this.bytes.length) {
      const byte = this.bytes[this.offset]!;
      this.offset += 1;

      if (byte === 0x5c) {
        if (this.offset >= this.bytes.length) throw new Error("SYNTAX");
        const escaped = this.bytes[this.offset]!;
        this.offset += 1;

        const simple: Record<number, number> = {
          0x6e: 0x0a,
          0x72: 0x0d,
          0x74: 0x09,
          0x62: 0x08,
          0x66: 0x0c,
          0x28: 0x28,
          0x29: 0x29,
          0x5c: 0x5c,
        };

        if (simple[escaped] !== undefined) {
          output.push(simple[escaped]!);
        } else if (escaped === 0x0d || escaped === 0x0a) {
          if (
            escaped === 0x0d &&
            this.bytes[this.offset] === 0x0a
          ) {
            this.offset += 1;
          }
        } else if (escaped >= 0x30 && escaped <= 0x37) {
          let octal = String.fromCharCode(escaped);
          for (let count = 0; count < 2; count += 1) {
            const next = this.bytes[this.offset];
            if (next === undefined || next < 0x30 || next > 0x37) break;
            octal += String.fromCharCode(next);
            this.offset += 1;
          }
          output.push(Number.parseInt(octal, 8) & 0xff);
        } else {
          output.push(escaped);
        }
      } else if (byte === 0x28) {
        nesting += 1;
        output.push(byte);
      } else if (byte === 0x29) {
        nesting -= 1;
        if (nesting === 0) {
          return {
            kind: "string",
            value: Buffer.from(output).toString("latin1"),
          };
        }
        output.push(byte);
      } else {
        output.push(byte);
      }

      if (output.length > this.limits.maxStringBytes) {
        throw new Error("STRING_LIMIT");
      }
    }

    throw new Error("SYNTAX");
  }

  private parseHexString(): PdfString {
    this.offset += 1;
    let hex = "";

    while (this.offset < this.bytes.length) {
      const byte = this.bytes[this.offset]!;
      this.offset += 1;

      if (byte === 0x3e) break;
      if (isWhitespace(byte)) continue;

      const character = String.fromCharCode(byte);
      if (!/[0-9a-fA-F]/.test(character)) throw new Error("SYNTAX");

      hex += character;
      if (Math.ceil(hex.length / 2) > this.limits.maxStringBytes) {
        throw new Error("STRING_LIMIT");
      }
    }

    if (this.bytes[this.offset - 1] !== 0x3e) throw new Error("SYNTAX");
    if (hex.length % 2 === 1) hex += "0";

    return {
      kind: "string",
      value: Buffer.from(hex, "hex").toString("latin1"),
    };
  }

  private parseNumberOrReference(): PdfValue {
    const firstStart = this.offset;
    const firstToken = this.readRegularToken();
    const firstNumber = Number(firstToken);

    if (!Number.isFinite(firstNumber)) throw new Error("SYNTAX");

    const afterFirst = this.offset;

    if (Number.isSafeInteger(firstNumber) && firstNumber >= 0) {
      this.skipSpace();
      const secondStart = this.offset;

      if (
        this.bytes[this.offset] !== undefined &&
        this.bytes[this.offset]! >= 0x30 &&
        this.bytes[this.offset]! <= 0x39
      ) {
        const secondToken = this.readRegularToken();
        const secondNumber = Number(secondToken);
        this.skipSpace();

        if (
          Number.isSafeInteger(secondNumber) &&
          secondNumber >= 0 &&
          startsWithAscii(this.bytes, this.offset, "R") &&
          !isRegular(this.bytes[this.offset + 1])
        ) {
          this.offset += 1;
          return {
            kind: "ref",
            objectNumber: firstNumber,
            generation: secondNumber,
          };
        }
      }

      this.offset = secondStart;
    }

    this.offset = afterFirst;

    if (
      this.offset - firstStart > this.limits.maxTokenBytes ||
      !Number.isFinite(firstNumber)
    ) {
      throw new Error("TOKEN_LIMIT");
    }

    return firstNumber;
  }

  private parseArray(depth: number): PdfArray {
    this.offset += 1;
    const values: PdfValue[] = [];

    while (true) {
      this.skipSpace();

      if (this.bytes[this.offset] === 0x5d) {
        this.offset += 1;
        return { kind: "array", values };
      }

      values.push(this.parseValue(depth));
      if (values.length > this.limits.maxObjects) throw new Error("TOKEN_LIMIT");
    }
  }

  private parseDictionary(depth: number): PdfDict {
    this.offset += 2;
    const values = new Map<string, PdfValue>();

    while (true) {
      this.skipSpace();

      if (
        this.bytes[this.offset] === 0x3e &&
        this.bytes[this.offset + 1] === 0x3e
      ) {
        this.offset += 2;
        return { kind: "dict", values };
      }

      const key = this.parseName();
      const value = this.parseValue(depth);
      values.set(key.value, value);

      if (values.size > this.limits.maxObjects) throw new Error("TOKEN_LIMIT");
    }
  }
}

function parserFailure(error: unknown) {
  const marker = error instanceof Error ? error.message : "SYNTAX";

  if (marker === "NESTING_LIMIT") {
    return failed(
      "PDF_OBJECT_NESTING_LIMIT_EXCEEDED",
      "The PDF object nesting depth exceeded the configured inspection limit.",
    );
  }

  if (marker === "TOKEN_LIMIT") {
    return failed(
      "PDF_TOKEN_LIMIT_EXCEEDED",
      "A PDF structural token exceeded the configured inspection limit.",
    );
  }

  if (marker === "STRING_LIMIT") {
    return failed(
      "PDF_STRING_LIMIT_EXCEEDED",
      "A PDF string exceeded the configured inspection limit.",
    );
  }

  return failed(
    "PDF_OBJECT_SYNTAX_INVALID",
    "The PDF object syntax could not be parsed safely.",
  );
}

function nameValue(value: PdfValue | undefined) {
  return value && typeof value === "object" && value.kind === "name"
    ? value.value
    : null;
}

function stringValue(value: PdfValue | undefined) {
  return value && typeof value === "object" && value.kind === "string"
    ? value.value
    : null;
}

function refValue(value: PdfValue | undefined) {
  return value && typeof value === "object" && value.kind === "ref"
    ? value
    : null;
}

function numberValue(value: PdfValue | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function parseTrailerDictionary(
  bytes: Buffer,
  start: number,
  limits: NativeDocumentPdfLimits,
) {
  const parser = new PdfValueParser(bytes, start, limits);
  const value = parser.parseValue();
  if (!value || typeof value !== "object" || value.kind !== "dict") {
    throw new Error("SYNTAX");
  }
  return { dictionary: value, endOffset: parser.position() };
}

function detectXrefStreamAt(bytes: Buffer, offset: number) {
  const end = Math.min(bytes.length, offset + 512);
  const text = ascii(bytes, offset, end);
  return /^\s*\d+\s+\d+\s+obj\b/.test(text) && /\/Type\s*\/XRef\b/.test(text);
}

function parseClassicXrefSection(args: {
  bytes: Buffer;
  offset: number;
  limits: NativeDocumentPdfLimits;
}) {
  const { bytes, limits } = args;
  let offset = skipWhitespaceAndComments(bytes, args.offset);

  if (!startsWithAscii(bytes, offset, "xref")) {
    if (detectXrefStreamAt(bytes, offset)) {
      return {
        ok: false as const,
        result: failed(
          "PDF_XREF_STREAM_UNSUPPORTED",
          "PDF cross-reference streams are deferred to a later bounded parser milestone.",
        ),
      };
    }

    return {
      ok: false as const,
      result: failed(
        "PDF_XREF_TABLE_INVALID",
        "The PDF startxref pointer did not identify a valid classic cross-reference table.",
      ),
    };
  }

  offset += 4;
  const entries = new Map<number, XrefEntry>();
  let declaredEntries = 0;

  while (true) {
    offset = skipWhitespaceAndComments(bytes, offset);

    if (startsWithAscii(bytes, offset, "trailer")) {
      offset += "trailer".length;
      break;
    }

    const first = readUnsignedInteger(bytes, offset);
    if (!first) {
      return {
        ok: false as const,
        result: failed(
          "PDF_XREF_TABLE_INVALID",
          "A PDF cross-reference subsection header is invalid.",
        ),
      };
    }

    offset = skipWhitespaceAndComments(bytes, first.offset);
    const count = readUnsignedInteger(bytes, offset);
    if (!count || count.value === 0) {
      return {
        ok: false as const,
        result: failed(
          "PDF_XREF_TABLE_INVALID",
          "A PDF cross-reference subsection count is invalid.",
        ),
      };
    }

    offset = count.offset;
    declaredEntries += count.value;

    if (declaredEntries > limits.maxObjects) {
      return {
        ok: false as const,
        result: failed(
          "PDF_OBJECT_COUNT_LIMIT_EXCEEDED",
          "The PDF cross-reference table exceeds the configured object-count limit.",
        ),
      };
    }

    for (let index = 0; index < count.value; index += 1) {
      offset = skipWhitespaceAndComments(bytes, offset);
      const lineEnd = (() => {
        const lf = bytes.indexOf(0x0a, offset);
        const cr = bytes.indexOf(0x0d, offset);
        if (lf === -1) return cr;
        if (cr === -1) return lf;
        return Math.min(lf, cr);
      })();

      if (lineEnd === -1) {
        return {
          ok: false as const,
          result: failed(
            "PDF_XREF_TABLE_INVALID",
            "A PDF cross-reference entry is truncated.",
          ),
        };
      }

      const line = ascii(bytes, offset, lineEnd).trim();
      const match = /^(\d{10})\s+(\d{5})\s+([nf])(?:\s*)$/.exec(line);

      if (!match) {
        return {
          ok: false as const,
          result: failed(
            "PDF_XREF_TABLE_INVALID",
            "A PDF cross-reference entry has invalid classic-table syntax.",
          ),
        };
      }

      const objectNumber = first.value + index;
      entries.set(objectNumber, {
        offset: Number(match[1]),
        generation: Number(match[2]),
        inUse: match[3] === "n",
      });

      offset = lineEnd;
      if (bytes[offset] === 0x0d) offset += 1;
      if (bytes[offset] === 0x0a) offset += 1;
    }
  }

  try {
    const trailerStart = skipWhitespaceAndComments(bytes, offset);
    const trailer = parseTrailerDictionary(bytes, trailerStart, limits);

    return {
      ok: true as const,
      entries,
      trailer: trailer.dictionary,
    };
  } catch (error) {
    return {
      ok: false as const,
      result: parserFailure(error),
    };
  }
}

function findFinalStartXref(bytes: Buffer) {
  const tailStart = Math.max(0, bytes.length - 4096);
  const tail = ascii(bytes, tailStart, bytes.length);
  const eofIndex = tail.lastIndexOf("%%EOF");
  if (eofIndex < 0) return null;

  const trailing = tail.slice(eofIndex + 5);
  if (!/^[\x00\x09\x0A\x0C\x0D\x20]*$/.test(trailing)) return null;

  const beforeEof = tail.slice(0, eofIndex);
  const startIndex = beforeEof.lastIndexOf("startxref");
  if (startIndex < 0) return null;

  const match = /^startxref\s+(\d+)/.exec(beforeEof.slice(startIndex));
  if (!match) return null;

  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= bytes.length) {
    return { invalid: true as const, offset: -1 };
  }

  return { invalid: false as const, offset };
}

function parseIndirectObjectHeader(bytes: Buffer, offset: number) {
  const start = skipWhitespaceAndComments(bytes, offset);
  const end = Math.min(bytes.length, start + 128);
  const text = ascii(bytes, start, end);
  const match = /^(\d+)\s+(\d+)\s+obj\b/.exec(text);

  if (!match) return null;

  const objectNumber = Number(match[1]);
  const generation = Number(match[2]);

  if (!Number.isSafeInteger(objectNumber) || !Number.isSafeInteger(generation)) {
    return null;
  }

  return {
    objectNumber,
    generation,
    valueOffset: start + match[0].length,
  };
}

function streamDataStart(bytes: Buffer, streamKeywordEnd: number) {
  const offset = streamKeywordEnd;

  if (bytes[offset] === 0x0d && bytes[offset + 1] === 0x0a) {
    return offset + 2;
  }

  if (bytes[offset] === 0x0a || bytes[offset] === 0x0d) {
    return offset + 1;
  }

  return null;
}

function inspectValue(args: {
  value: PdfValue;
  counters: {
    safeUriActionsObserved: number;
  };
}): PdfStructuralInspectionResult | null {
  const { value, counters } = args;

  if (!value || typeof value !== "object") return null;

  if (value.kind === "array") {
    for (const nested of value.values) {
      const result = inspectValue({ value: nested, counters });
      if (result) return result;
    }
    return null;
  }

  if (value.kind !== "dict") return null;

  const values = value.values;
  const type = nameValue(values.get("Type"));
  const subtype = nameValue(values.get("Subtype"));
  const action = nameValue(values.get("S"));

  if (values.has("OpenAction")) {
    return blocked(
      "PDF_OPEN_ACTION_BLOCKED",
      "Automatic PDF open actions are not permitted for institutional document ingress.",
    );
  }

  if (values.has("AA")) {
    return blocked(
      "PDF_ADDITIONAL_ACTION_BLOCKED",
      "PDF additional actions are not permitted for institutional document ingress.",
    );
  }

  if (values.has("XFA")) {
    return blocked(
      "PDF_XFA_BLOCKED",
      "XFA content is not permitted because it can carry active form behavior outside the bounded PDF policy.",
    );
  }

  if (values.has("EmbeddedFiles") || values.has("EF")) {
    return blocked(
      "PDF_EMBEDDED_FILE_BLOCKED",
      "Embedded file content is not permitted in institutional PDF ingress.",
    );
  }

  if (values.has("JavaScript") || values.has("JS") || action === "JavaScript") {
    return blocked(
      "PDF_JAVASCRIPT_BLOCKED",
      "PDF JavaScript is not permitted in institutional document ingress.",
    );
  }

  if (type === "Filespec" || type === "EmbeddedFile") {
    return blocked(
      "PDF_EMBEDDED_FILE_BLOCKED",
      "PDF file-specification or embedded-file objects are not permitted.",
    );
  }

  if (
    subtype === "RichMedia" ||
    subtype === "Movie" ||
    subtype === "Sound" ||
    subtype === "3D"
  ) {
    return blocked(
      "PDF_RICH_MEDIA_BLOCKED",
      "Interactive rich-media PDF content is not permitted.",
    );
  }

  if (action === "Launch") {
    return blocked(
      "PDF_LAUNCH_ACTION_BLOCKED",
      "PDF Launch actions are not permitted.",
    );
  }

  if (
    action === "SubmitForm" ||
    action === "ImportData" ||
    action === "GoToR" ||
    action === "GoToE" ||
    action === "Rendition"
  ) {
    return blocked(
      "PDF_EXTERNAL_ACTION_BLOCKED",
      "PDF actions that submit, import, launch remote content, or invoke renditions are not permitted.",
    );
  }

  if (action === "URI") {
    const uri = stringValue(values.get("URI"));
    if (!uri) {
      return blocked(
        "PDF_UNSAFE_URI_ACTION_BLOCKED",
        "A PDF URI action could not be reduced to a bounded ordinary hyperlink.",
      );
    }

    const normalized = uri.trim().toLowerCase();
    if (
      !normalized.startsWith("https://") &&
      !normalized.startsWith("http://") &&
      !normalized.startsWith("mailto:")
    ) {
      return blocked(
        "PDF_UNSAFE_URI_ACTION_BLOCKED",
        "Only ordinary HTTP(S) and mailto PDF hyperlinks are permitted by the current structural policy.",
      );
    }

    counters.safeUriActionsObserved += 1;
  }

  for (const nested of values.values()) {
    const result = inspectValue({ value: nested, counters });
    if (result) return result;
  }

  return null;
}

export function inspectPdfStructuralSecurity(args: {
  bytes: Buffer;
  limits: NativeDocumentPdfLimits;
}): PdfStructuralInspectionResult {
  const { bytes, limits } = args;

  if (!validateLimits(limits)) {
    return failed(
      "PDF_LIMITS_REQUIRED",
      "Explicit positive PDF parser limits are required for structural inspection.",
    );
  }

  const headerWindow = ascii(bytes, 0, Math.min(bytes.length, 1024));
  const headerMatch = /%PDF-(1\.[0-7]|2\.0)/.exec(headerWindow);

  if (!headerMatch) {
    return failed(
      "PDF_HEADER_INVALID",
      "The PDF version header is missing or unsupported.",
    );
  }

  const startXref = findFinalStartXref(bytes);
  if (!startXref) {
    return failed(
      "PDF_STARTXREF_MISSING",
      "The final PDF startxref/EOF boundary could not be established.",
    );
  }

  if (startXref.invalid) {
    return failed(
      "PDF_STARTXREF_INVALID",
      "The final PDF startxref offset is outside the document boundary.",
    );
  }

  const activeEntries = new Map<number, XrefEntry>();
  const seenObjects = new Set<number>();
  const visitedXrefs = new Set<number>();
  let xrefOffset = startXref.offset;
  let xrefSections = 0;
  let newestTrailer: PdfDict | null = null;

  while (true) {
    if (visitedXrefs.has(xrefOffset)) {
      return failed(
        "PDF_XREF_TABLE_INVALID",
        "The PDF incremental cross-reference chain contains a cycle.",
      );
    }

    visitedXrefs.add(xrefOffset);
    xrefSections += 1;

    if (xrefSections - 1 > limits.maxIncrementalUpdates) {
      return failed(
        "PDF_INCREMENTAL_UPDATE_LIMIT_EXCEEDED",
        "The PDF contains more incremental revisions than the configured parser limit.",
      );
    }

    const parsed = parseClassicXrefSection({
      bytes,
      offset: xrefOffset,
      limits,
    });

    if (!parsed.ok) return parsed.result;
    if (!newestTrailer) newestTrailer = parsed.trailer;

    if (parsed.trailer.values.has("XRefStm")) {
      return failed(
        "PDF_XREF_STREAM_UNSUPPORTED",
        "Hybrid PDF cross-reference streams are deferred to a later bounded parser milestone.",
      );
    }

    for (const [objectNumber, entry] of parsed.entries) {
      if (seenObjects.has(objectNumber)) continue;
      seenObjects.add(objectNumber);
      if (entry.inUse) activeEntries.set(objectNumber, entry);
    }

    if (activeEntries.size > limits.maxObjects) {
      return failed(
        "PDF_OBJECT_COUNT_LIMIT_EXCEEDED",
        "The PDF active-object count exceeds the configured parser limit.",
      );
    }

    const previous = numberValue(parsed.trailer.values.get("Prev"));
    if (previous === null) break;

    if (previous < 0 || previous >= bytes.length) {
      return failed(
        "PDF_XREF_TABLE_INVALID",
        "A PDF incremental-update Prev pointer is outside the document boundary.",
      );
    }

    xrefOffset = previous;
  }

  if (!newestTrailer) {
    return failed(
      "PDF_XREF_TABLE_INVALID",
      "The PDF trailer could not be established.",
    );
  }

  if (newestTrailer.values.has("Encrypt")) {
    return blocked(
      "PDF_ENCRYPTED_BLOCKED",
      "Encrypted PDFs are not accepted because the security engine cannot inspect their complete active structure.",
    );
  }

  const rootRef = refValue(newestTrailer.values.get("Root"));
  if (!rootRef) {
    return failed(
      "PDF_ROOT_CATALOG_MISSING",
      "The PDF trailer does not contain a valid indirect Root catalog reference.",
    );
  }

  const objectCache = new Map<number, ParsedIndirectObject>();
  const resolving = new Set<number>();

  const parseObject = (
    objectNumber: number,
  ): ParsedIndirectObject | PdfStructuralInspectionResult => {
    const cached = objectCache.get(objectNumber);
    if (cached) return cached;

    const entry = activeEntries.get(objectNumber);
    if (!entry || entry.offset < 0 || entry.offset >= bytes.length) {
      return failed(
        "PDF_OBJECT_OFFSET_INVALID",
        "A referenced PDF indirect object does not have a valid active cross-reference offset.",
      );
    }

    if (resolving.has(objectNumber)) {
      return failed(
        "PDF_OBJECT_SYNTAX_INVALID",
        "The PDF contains a cyclic indirect dependency that cannot be reduced safely.",
      );
    }

    resolving.add(objectNumber);

    try {
      const header = parseIndirectObjectHeader(bytes, entry.offset);
      if (
        !header ||
        header.objectNumber !== objectNumber ||
        header.generation !== entry.generation
      ) {
        return failed(
          "PDF_OBJECT_OFFSET_INVALID",
          "A PDF cross-reference entry does not resolve to the declared indirect object.",
        );
      }

      const parser = new PdfValueParser(bytes, header.valueOffset, limits);
      const value = parser.parseValue();
      parser.skipSpace();

      if (
        value &&
        typeof value === "object" &&
        value.kind === "dict" &&
        parser.consumeKeyword("stream")
      ) {
        const type = nameValue(value.values.get("Type"));
        if (type === "ObjStm") {
          return failed(
            "PDF_OBJECT_STREAM_UNSUPPORTED",
            "PDF object streams are deferred to a later bounded parser milestone.",
          );
        }
        if (type === "XRef") {
          return failed(
            "PDF_XREF_STREAM_UNSUPPORTED",
            "PDF cross-reference streams are deferred to a later bounded parser milestone.",
          );
        }

        const lengthValue = value.values.get("Length");
        let streamLength = numberValue(lengthValue);

        if (streamLength === null) {
          const lengthRef = refValue(lengthValue);
          if (!lengthRef) {
            return failed(
              "PDF_STREAM_LENGTH_INVALID",
              "A PDF stream length is neither a bounded integer nor an indirect integer reference.",
            );
          }

          const lengthObject = parseObject(lengthRef.objectNumber);
          if ("ok" in lengthObject) return lengthObject;
          streamLength = numberValue(lengthObject.value);
        }

        if (streamLength === null || streamLength < 0) {
          return failed(
            "PDF_STREAM_LENGTH_INVALID",
            "A PDF stream length could not be resolved to a non-negative safe integer.",
          );
        }

        const dataStart = streamDataStart(bytes, parser.position());
        if (dataStart === null) {
          return failed(
            "PDF_STREAM_BOUNDARY_INVALID",
            "A PDF stream does not begin with the required line boundary.",
          );
        }

        const dataEnd = dataStart + streamLength;
        if (!Number.isSafeInteger(dataEnd) || dataEnd > bytes.length) {
          return failed(
            "PDF_STREAM_BOUNDARY_INVALID",
            "A PDF stream extends beyond the document boundary.",
          );
        }

        let endOffset = dataEnd;
        if (bytes[endOffset] === 0x0d) endOffset += 1;
        if (bytes[endOffset] === 0x0a) endOffset += 1;
        endOffset = skipWhitespaceAndComments(bytes, endOffset);

        if (!startsWithAscii(bytes, endOffset, "endstream")) {
          return failed(
            "PDF_STREAM_BOUNDARY_INVALID",
            "A PDF stream does not terminate at its declared bounded length.",
          );
        }

        endOffset += "endstream".length;
        endOffset = skipWhitespaceAndComments(bytes, endOffset);

        if (!startsWithAscii(bytes, endOffset, "endobj")) {
          return failed(
            "PDF_OBJECT_SYNTAX_INVALID",
            "A PDF stream object is not followed by a valid endobj boundary.",
          );
        }
      } else {
        parser.skipSpace();
        if (!parser.consumeKeyword("endobj")) {
          return failed(
            "PDF_OBJECT_SYNTAX_INVALID",
            "A PDF indirect object is not terminated by endobj.",
          );
        }
      }

      const parsedObject = {
        objectNumber,
        generation: entry.generation,
        value,
      };
      objectCache.set(objectNumber, parsedObject);
      return parsedObject;
    } catch (error) {
      return parserFailure(error);
    } finally {
      resolving.delete(objectNumber);
    }
  };

  const rootObject = parseObject(rootRef.objectNumber);
  if ("ok" in rootObject) return rootObject;

  if (
    !rootObject.value ||
    typeof rootObject.value !== "object" ||
    rootObject.value.kind !== "dict" ||
    nameValue(rootObject.value.values.get("Type")) !== "Catalog"
  ) {
    return failed(
      "PDF_ROOT_CATALOG_MISSING",
      "The PDF Root reference does not resolve to a Catalog dictionary.",
    );
  }

  const pagesRef = refValue(rootObject.value.values.get("Pages"));
  if (!pagesRef) {
    return failed(
      "PDF_PAGE_TREE_MISSING",
      "The PDF Catalog does not contain a valid indirect Pages reference.",
    );
  }

  const pagesObject = parseObject(pagesRef.objectNumber);
  if ("ok" in pagesObject) return pagesObject;

  if (
    !pagesObject.value ||
    typeof pagesObject.value !== "object" ||
    pagesObject.value.kind !== "dict" ||
    nameValue(pagesObject.value.values.get("Type")) !== "Pages"
  ) {
    return failed(
      "PDF_PAGE_TREE_MISSING",
      "The PDF Pages reference does not resolve to a Pages dictionary.",
    );
  }

  const counters = { safeUriActionsObserved: 0 };

  for (const objectNumber of activeEntries.keys()) {
    if (objectNumber === 0) continue;

    const parsed = parseObject(objectNumber);
    if ("ok" in parsed) return parsed;

    const finding = inspectValue({ value: parsed.value, counters });
    if (finding) return finding;
  }

  return {
    ok: true,
    evidence: {
      pdfVersion: headerMatch[1] as NativeDocumentPdfStructuralEvidence["pdfVersion"],
      xrefSections,
      activeObjectCount: activeEntries.size,
      incrementalUpdates: xrefSections - 1,
      safeUriActionsObserved: counters.safeUriActionsObserved,
      encrypted: false,
      xrefStreamsDetected: false,
      objectStreamsDetected: false,
      catalogVerified: true,
      pageTreeRootVerified: true,
      javascriptDetected: false,
      openActionDetected: false,
      additionalActionDetected: false,
      launchActionDetected: false,
      embeddedFileDetected: false,
      richMediaDetected: false,
      xfaDetected: false,
      blockedExternalActionDetected: false,
    },
  };
}
