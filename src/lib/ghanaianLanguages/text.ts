export function normalizeEducationalText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFC");
}

export function normalizeEducationalTextNullable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return normalizeEducationalText(value);
}

export function normalizeEducationalTextTrimmed(value: unknown) {
  return normalizeEducationalText(value).trim();
}

export function tokenizeEducationalText(value: unknown) {
  const normalized = normalizeEducationalText(value).toLocaleLowerCase("en-GH");
  return normalized.match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
}
export type EducationalCombiningMarkApplyResult =
  | {
      ok: true;
      value: string;
      cursor: number;
    }
  | {
      ok: false;
      reason: "INVALID_MARK" | "NO_BASE_LETTER" | "INVALID_SELECTION" | "DUPLICATE_MARK";
    };

const EDUCATIONAL_COMBINING_MARK_RE = /^\p{M}$/u;
const EDUCATIONAL_BASE_LETTER_RE = /^\p{L}$/u;
const EDUCATIONAL_SINGLE_GRAPHEME_RE = /^\p{L}\p{M}*$/u;

function clampTextOffset(value: string, offset: number) {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.trunc(offset), value.length));
}

function previousCodePointStart(value: string, end: number) {
  if (end <= 0) return 0;
  const trailing = value.charCodeAt(end - 1);
  if (trailing >= 0xdc00 && trailing <= 0xdfff && end >= 2) {
    const leading = value.charCodeAt(end - 2);
    if (leading >= 0xd800 && leading <= 0xdbff) return end - 2;
  }
  return end - 1;
}

function nextCodePointEnd(value: string, start: number) {
  if (start >= value.length) return value.length;
  const leading = value.charCodeAt(start);
  if (leading >= 0xd800 && leading <= 0xdbff && start + 1 < value.length) {
    const trailing = value.charCodeAt(start + 1);
    if (trailing >= 0xdc00 && trailing <= 0xdfff) return start + 2;
  }
  return start + 1;
}

export function applyCombiningMarkAtSelection(
  value: unknown,
  selectionStart: number,
  selectionEnd: number,
  markValue: unknown,
  replacementMarkValues: readonly string[] = [],
): EducationalCombiningMarkApplyResult {
  const source = String(value ?? "");
  const normalizedMark = String(markValue ?? "").normalize("NFD");

  if (
    Array.from(normalizedMark).length !== 1 ||
    !EDUCATIONAL_COMBINING_MARK_RE.test(normalizedMark)
  ) {
    return { ok: false, reason: "INVALID_MARK" };
  }

  let start = clampTextOffset(source, selectionStart);
  let end = clampTextOffset(source, selectionEnd);

  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
  }

  let targetStart = start;
  let targetEnd = end;

  if (start === end) {
    targetEnd = start;
    let cursor = start;
    let foundBase = false;

    while (cursor > 0) {
      const previousStart = previousCodePointStart(source, cursor);
      const previous = source.slice(previousStart, cursor);

      if (EDUCATIONAL_COMBINING_MARK_RE.test(previous)) {
        cursor = previousStart;
        continue;
      }

      if (EDUCATIONAL_BASE_LETTER_RE.test(previous)) {
        targetStart = previousStart;
        foundBase = true;
        break;
      }

      return { ok: false, reason: "NO_BASE_LETTER" };
    }

    if (!foundBase) {
      return { ok: false, reason: "NO_BASE_LETTER" };
    }
  } else {
    while (targetEnd < source.length) {
      const nextEnd = nextCodePointEnd(source, targetEnd);
      const next = source.slice(targetEnd, nextEnd);
      if (!EDUCATIONAL_COMBINING_MARK_RE.test(next)) break;
      targetEnd = nextEnd;
    }
  }

  const target = source.slice(targetStart, targetEnd);
  const targetNfd = target.normalize("NFD");

  if (!EDUCATIONAL_SINGLE_GRAPHEME_RE.test(targetNfd)) {
    return { ok: false, reason: "INVALID_SELECTION" };
  }

  const targetParts = Array.from(targetNfd);
  const baseLetter = targetParts[0] ?? "";
  const existingMarks = targetParts.slice(1);

  if (existingMarks.includes(normalizedMark)) {
    return { ok: false, reason: "DUPLICATE_MARK" };
  }

  const replacementGroup = new Set(
    replacementMarkValues
      .map((candidate) => String(candidate ?? "").normalize("NFD"))
      .filter(
        (candidate) =>
          Array.from(candidate).length === 1 &&
          EDUCATIONAL_COMBINING_MARK_RE.test(candidate),
      ),
  );

  replacementGroup.add(normalizedMark);

  const preservedMarks = existingMarks.filter(
    (existingMark) => !replacementGroup.has(existingMark),
  );

  const replacement =
    `${baseLetter}${preservedMarks.join("")}${normalizedMark}`.normalize("NFC");
  const prefix = normalizeEducationalText(source.slice(0, targetStart));
  const suffix = normalizeEducationalText(source.slice(targetEnd));
  const valueWithMark = normalizeEducationalText(`${prefix}${replacement}${suffix}`);
  const cursor = normalizeEducationalText(`${prefix}${replacement}`).length;

  return {
    ok: true,
    value: valueWithMark,
    cursor,
  };
}
