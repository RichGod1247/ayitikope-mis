// src/app/api/admin/paystack/banks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackBank = {
  name?: string;
  slug?: string;
  code?: string;
  active?: boolean;
  is_deleted?: boolean;
  country?: string;
  currency?: string;
  type?: string;
};

let cached: {
  at: number;
  items: Array<{
    name: string;
    code: string;
    slug: string | null;
    type: string | null;
    currency: string | null;
  }>;
} | null = null;

const CACHE_MS = 10 * 60 * 1000;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SUPERADMIN", "ADMIN", "SCHOOL_ADMIN", "HEADTEACHER"],
  });

  if (!auth.ok) return auth.res;

  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!paystackSecret) {
    return json({ ok: false, error: "PAYSTACK_SECRET_KEY_NOT_CONFIGURED" }, 500);
  }

  const now = Date.now();

  if (cached && now - cached.at < CACHE_MS) {
    return json({ ok: true, source: "cache", country: "ghana", currency: "GHS", items: cached.items });
  }

  const url = new URL("https://api.paystack.co/bank");
  url.searchParams.set("country", "ghana");
  url.searchParams.set("currency", "GHS");
  url.searchParams.set("perPage", "100");
  url.searchParams.set("use_cursor", "false");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${paystackSecret}` },
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: PaystackBank[];
  } | null;

  if (!res.ok || !data?.status || !Array.isArray(data.data)) {
    return json(
      { ok: false, error: "PAYSTACK_BANKS_FETCH_FAILED", message: data?.message ?? null },
      502
    );
  }

  const byCode = new Map<string, any>();

  for (const b of data.data) {
    const name = clean(b.name);
    const code = clean(b.code);
    const slug = clean(b.slug) || null;
    const type = clean(b.type) || null;
    const currency = clean(b.currency) || null;

    if (!name || !code) continue;
    if (currency && currency !== "GHS") continue;
    if (type && type !== "ghipss") continue;

    if (!byCode.has(code)) {
      byCode.set(code, { name, code, slug, type, currency: currency || "GHS" });
    }
  }

  const items = Array.from(byCode.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  cached = { at: now, items };

  return json({ ok: true, source: "paystack", country: "ghana", currency: "GHS", items });
}