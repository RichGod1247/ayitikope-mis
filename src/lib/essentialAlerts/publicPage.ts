export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function essentialAlertPage(input: {
  title: string;
  bodyHtml: string;
  status?: number;
}) {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;line-height:1.5;margin:0;background:#05070b;color:#f7f4ed}
    .wrap{max-width:620px;margin:0 auto;padding:28px 16px 48px}
    .eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#e8c96a;font-weight:700}
    .card{margin-top:12px;background:#0b1018;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:20px}
    h1{font-size:24px;line-height:1.2;margin:0 0 10px}
    h2{font-size:16px;margin:20px 0 8px}
    p{margin:9px 0;color:#d6d9df}
    .strong{color:#fff;font-weight:700}
    .muted{color:#9ca6b6;font-size:13px}
    .good{border:1px solid rgba(52,211,153,.28);background:rgba(16,185,129,.08);padding:12px;border-radius:14px}
    .notice{border:1px solid rgba(232,201,106,.22);background:rgba(232,201,106,.06);padding:12px;border-radius:14px}
    .danger{border:1px solid rgba(248,113,113,.26);background:rgba(239,68,68,.08);padding:12px;border-radius:14px}
    .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
    button{cursor:pointer;border-radius:14px;border:1px solid rgba(255,255,255,.14);padding:12px 16px;font-weight:750;font-size:15px}
    .primary{background:#2563eb;color:#fff;border-color:#3b82f6}
    .outline{background:#111827;color:#f7f4ed}
    ul{padding-left:20px;color:#d6d9df}
    li{margin:5px 0}
    .people{margin:12px 0;padding:0;list-style:none}
    .people li{padding:9px 10px;border:1px solid rgba(255,255,255,.09);border-radius:12px;margin:7px 0;background:rgba(255,255,255,.025)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="eyebrow">EduLife OS · Essential School Alerts</div>
    <div class="card">${input.bodyHtml}</div>
    <p class="muted">Need help? Contact your school office. EduLife OS does not use this enrollment for advertising.</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: input.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function configuredPublicOrigin() {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "";

  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return null;

  try {
    const parsed = new URL(value);
    const origin = parsed.origin;

    if (!isLoopbackOrigin(origin) && parsed.protocol !== "https:") {
      throw new Error("ESSENTIAL_ALERT_PUBLIC_ORIGIN_INSECURE");
    }

    return origin;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ESSENTIAL_ALERT_PUBLIC_ORIGIN_INSECURE"
    ) {
      throw error;
    }
    throw new Error("ESSENTIAL_ALERT_PUBLIC_ORIGIN_INVALID");
  }
}

function requestOrigin(req: Request) {
  let requestUrl: URL | null = null;

  try {
    requestUrl = new URL(req.url);
  } catch {
    requestUrl = null;
  }

  const forwardedHost = req.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || req.headers.get("host")?.trim() || null;
  const forwardedProto = req.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProto || requestUrl?.protocol.replace(/:$/, "") || "https";

  // In local/UAT, Next.js may canonicalize req.url to "localhost" even when
  // the browser reached 127.0.0.1. Prefer the actual loopback Host header so
  // the SMS link points back to the runtime the tester can really reach.
  if (host) {
    try {
      const headerOrigin = new URL(`${protocol}://${host}`).origin;
      if (isLoopbackOrigin(headerOrigin)) return headerOrigin;
    } catch {
      // Fall through to the parsed request URL.
    }
  }

  return requestUrl?.origin ?? null;
}

function isLoopbackOrigin(origin: string | null) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function essentialAlertPublicOrigin(req: Request) {
  const requested = requestOrigin(req);
  const configured = configuredPublicOrigin();

  // Local/UAT must follow the actual runtime port instead of a stale
  // localhost:3000 configured URL. A real hosted public origin always wins,
  // so an internal production loopback URL can never replace it.
  if (
    isLoopbackOrigin(requested) &&
    (!configured || isLoopbackOrigin(configured))
  ) {
    return requested as string;
  }

  // Hosted SMS links must never derive their public destination from request
  // headers alone. A non-loopback deployment requires an explicit HTTPS public
  // origin; a stale loopback configuration is also rejected fail-closed.
  if (configured && !isLoopbackOrigin(configured)) return configured;

  throw new Error("ESSENTIAL_ALERT_PUBLIC_ORIGIN_REQUIRED");
}

export function essentialAlertConfiguredPublicOrigin() {
  const configured = configuredPublicOrigin();

  // Background SMS workers have no trustworthy request origin and the
  // recipient cannot use localhost/127.0.0.1 from their phone. Require an
  // explicitly configured hosted HTTPS origin rather than guessing a port.
  if (!configured || isLoopbackOrigin(configured)) {
    throw new Error("ESSENTIAL_ALERT_PUBLIC_ORIGIN_REQUIRED");
  }

  return configured;
}

export function essentialAlertParentPortalUrl(req: Request) {
  return `${essentialAlertPublicOrigin(req)}/parent-portal`;
}

export function essentialAlertConfiguredParentPortalUrl() {
  return `${essentialAlertConfiguredPublicOrigin()}/parent-portal`;
}

export function requestIp(req: Request) {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip")?.trim() || null;
}
