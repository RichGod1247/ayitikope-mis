// src/lib/media.ts

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function stripTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}

function isAbsoluteUrl(s: string) {
  return /^(https?:)?\/\//i.test(s) || /^data:/i.test(s) || /^blob:/i.test(s);
}

function getMediaBase() {
  const candidates = [
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
    process.env.MEDIA_BASE_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_BASE_URL,
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL,
  ]
    .map(clean)
    .filter(Boolean);

  return candidates.length ? stripTrailingSlash(candidates[0]!) : "";
}

function splitPathQueryHash(raw: string) {
  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");

  let cut = raw.length;
  if (queryIndex >= 0) cut = Math.min(cut, queryIndex);
  if (hashIndex >= 0) cut = Math.min(cut, hashIndex);

  const pathname = raw.slice(0, cut);
  const suffix = raw.slice(cut);
  return { pathname, suffix };
}

/**
 * Converts old DB media keys into the real R2 public key layout.
 *
 * Keep this conservative:
 * - curriculum/jhs/...          -> jhs/...
 * - curriculum/lower-primary/... -> lower-primary/...
 * - curriculum/kg1/... and kg2 are intentionally left alone here because
 *   the lesson-note print page already applies subject-aware KG rewriting.
 */
function canonicalizeStorageKey(rawPathname: string) {
  const p = rawPathname
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();

  if (!p) return "";

  if (/^curriculum\/jhs\//i.test(p)) {
    return p.replace(/^curriculum\//i, "");
  }

  if (/^curriculum\/lower-primary\//i.test(p)) {
    return p.replace(/^curriculum\//i, "");
  }

  return p;
}

function encodeRelativePath(raw: string) {
  const normalized = raw
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();

  if (!normalized) return "";

  const { pathname, suffix } = splitPathQueryHash(normalized);
  const canonicalPathname = canonicalizeStorageKey(pathname);

  const encodedPath = canonicalPathname
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  return encodedPath ? `${encodedPath}${suffix}` : "";
}

/**
 * Build a safe media URL:
 * - Absolute URLs are returned unchanged.
 * - Relative storage keys are encoded and joined to media base if configured.
 * - Known legacy DB keys are mapped to canonical R2 keys.
 * - If no base is configured, fall back to site-relative "/<path>".
 */
export function mediaUrl(path?: string | null) {
  const raw = clean(path);
  if (!raw) return "";

  if (isAbsoluteUrl(raw)) return raw;

  const cleanPath = encodeRelativePath(raw);
  if (!cleanPath) return "";

  const base = getMediaBase();
  if (!base) return `/${cleanPath}`;

  return `${base}/${cleanPath}`;
}