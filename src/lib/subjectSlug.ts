// src/lib/subjectSlug.ts
export function normalizeSubjectSlug(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;

  // Accept canonical slugs only (kebab-case). We do NOT try to invent slugs here.
  // This prevents “almost-slug” client bugs from silently creating mismatches.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) return null;

  return v;
}
