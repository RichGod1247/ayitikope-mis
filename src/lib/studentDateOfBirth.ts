const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type StudentDateOfBirthParseResult =
  | { ok: true; value: Date | null; iso: string | null }
  | { ok: false; error: "INVALID_DATE_OF_BIRTH" | "DATE_OF_BIRTH_IN_FUTURE" };

function utcTodayParts(now = new Date()) {
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  };
}

function isAfterToday(year: number, month: number, day: number, now = new Date()) {
  const today = utcTodayParts(now);
  if (year !== today.year) return year > today.year;
  if (month !== today.month) return month > today.month;
  return day > today.day;
}

export function parseStudentDateOfBirth(
  raw: unknown,
  now = new Date(),
): StudentDateOfBirthParseResult {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, value: null, iso: null };

  const match = DATE_ONLY_RE.exec(text);
  if (!match) return { ok: false, error: "INVALID_DATE_OF_BIRTH" };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));

  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() + 1 !== month ||
    value.getUTCDate() !== day
  ) {
    return { ok: false, error: "INVALID_DATE_OF_BIRTH" };
  }

  if (isAfterToday(year, month, day, now)) {
    return { ok: false, error: "DATE_OF_BIRTH_IN_FUTURE" };
  }

  return { ok: true, value, iso: text };
}

export function studentDateOfBirthIso(value: Date | null | undefined) {
  if (!value) return null;
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function studentDateOfBirthLabel(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}
