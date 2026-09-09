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
