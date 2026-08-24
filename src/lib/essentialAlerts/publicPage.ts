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
    .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
    button{cursor:pointer;border-radius:14px;border:1px solid rgba(255,255,255,.14);padding:12px 16px;font-weight:750;font-size:15px}
    .primary{background:#2563eb;color:#fff;border-color:#3b82f6}
    .outline{background:#111827;color:#f7f4ed}
    ul{padding-left:20px;color:#d6d9df}
    li{margin:5px 0}
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

export function requestIp(req: Request) {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip")?.trim() || null;
}
