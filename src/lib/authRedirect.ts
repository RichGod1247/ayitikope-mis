// src/lib/authRedirect.ts
// Central, safe auth redirect builder.
// Goal: ALWAYS land users on /app after signin (unified gateway).

const FORCE_APP_PREFIXES = [
  "/admin",
  "/teacher",
  "/headteacher",
  "/parent",
  "/teacher-portal",
  "/parent-portal",
  "/head-portal",
];

export function safeInternalPath(raw: unknown, fallback = "/app") {
  const v = String(raw ?? "").trim();
  if (!v) return fallback;

  // block protocol-relative & weird backslash paths
  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;

  // already an internal path
  if (v.startsWith("/")) return v;

  // if it's an absolute URL, extract only internal path
  try {
    const u = new URL(v);
    const path = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    return path || fallback;
  } catch {
    return fallback;
  }
}

function normalizeToApp(path: string) {
  const base = path.split("?")[0] || path;
  for (const p of FORCE_APP_PREFIXES) {
    if (base === p || base.startsWith(`${p}/`)) return "/app";
  }
  return path;
}

export function buildSigninUrl(args?: { callbackUrl?: unknown; error?: string }) {
  const cb = normalizeToApp(safeInternalPath(args?.callbackUrl ?? "/app", "/app"));

  const sp = new URLSearchParams();
  if (args?.error) sp.set("error", args.error);
  sp.set("callbackUrl", cb);

  return `/auth/signin?${sp.toString()}`;
}
