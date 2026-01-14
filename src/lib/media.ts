// src/lib/media.ts
const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || "").replace(/\/$/, "");

export function mediaUrl(path?: string | null) {
  if (!path) return "";
  const clean = path.replace(/^\//, "");
  return `${base}/${clean}`;
}
