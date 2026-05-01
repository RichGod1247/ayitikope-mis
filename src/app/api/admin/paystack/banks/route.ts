// src/app/api/admin/paystack/banks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaystackBank = {
  id?: number;
  name?: string;
  slug?: string;
  code?: string;
  longcode?: string | null;
  gateway?: string | null;
  pay_with_bank?: boolean;
  active?: boolean;
  is_deleted?: boolean;
  country?: string;
  currency?: string;
  type?: string;
};

let cached:
  | {
      at: number;
      items: Array<{
        name: string;
        code: string;
        slug: string | null;
        type: string | null;
        currency: string | null;
      }>;
    }
  | null = null;

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
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN", "ADMIN", "HEADTEACHER"],
  });

  if (!auth.ok) return auth.res;

  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!paystackSecret) {
    return json({ ok: false, error: "PAYSTACK_SECRET_KEY_NOT_CONFIGURED" }, 500);
  }

  if (!paystackSecret.startsWith("sk_test_") && !paystackSecret.startsWith("sk_live_")) {
    return json({ ok: false, error: "INVALID_PAYSTACK_SECRET_KEY" }, 500);
  }

  const now = Date.now();

  if (cached && now - cached.at < CACHE_MS) {
    return json({
      ok: true,
      source: "cache",
      country: "ghana",
      currency: "GHS",
      items: cached.items,
    });
  }

  const url = new URL("https://api.paystack.co/bank");
  url.searchParams.set("country", "ghana");
  url.searchParams.set("perPage", "100");
  url.searchParams.set("use_cursor", "false");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: PaystackBank[];
  } | null;

  if (!res.ok || !data?.status || !Array.isArray(data.data)) {
    return json(
      {
        ok: false,
        error: "PAYSTACK_BANKS_FETCH_FAILED",
        message: data?.message ?? null,
      },
      502
    );
  }

  const items = data.data
    .map((b) => ({
      name: clean(b.name),
      code: clean(b.code),
      slug: clean(b.slug) || null,
      type: clean(b.type) || null,
      currency: clean(b.currency) || null,
    }))
    .filter((b) => b.name && b.code)
    .sort((a, b) => a.name.localeCompare(b.name));

  cached = { at: now, items };

  return json({
    ok: true,
    source: "paystack",
    country: "ghana",
    currency: "GHS",
    items,
  });
}