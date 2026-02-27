// src/lib/client/useMe.ts
"use client";

import { useCallback, useEffect, useState } from "react";

export type MeOk = {
  ok: true;
  userId: string;
  email: string | null;
  name: string | null;
  tenantId: string;
  staffId: string | null;
  roleName: string | null;
  teacherScope: unknown | null;
  tenant: {
    id: string;
    name: string;
    slug: string | null;
    schoolCode: string | null;
    status: string;
  } | null;
};

export type MeFail = {
  ok: false;
  error: string;
  userId?: string;
  email?: string | null;
  name?: string | null;
};

export type MeResp = MeOk | MeFail;

async function fetchMe(): Promise<MeResp> {
  const r = await fetch("/api/me", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
    headers: { "Cache-Control": "no-store" },
  });

  const j = (await r.json().catch(() => null)) as MeResp | null;
  if (j && typeof j === "object" && "ok" in j) return j;

  return { ok: false, error: "BAD_ME_RESPONSE" };
}

export function useMe(opts?: { requireTenant?: boolean }) {
  const requireTenant = !!opts?.requireTenant;

  const [me, setMe] = useState<MeOk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const res = await fetchMe();

    if (!res.ok) {
      // 401 or 409 are the common cases:
      // - UNAUTHENTICATED
      // - TENANT_REQUIRED (means user must pick active tenant via /app/dashboard)
      if (requireTenant && res.error === "TENANT_REQUIRED") {
        setError("TENANT_REQUIRED");
      } else {
        setError(res.error || "ME_FAILED");
      }
      setMe(null);
      setLoading(false);
      return;
    }

    if (requireTenant && !res.tenantId) {
      setError("TENANT_REQUIRED");
      setMe(null);
      setLoading(false);
      return;
    }

    setMe(res);
    setLoading(false);
  }, [requireTenant]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await refresh();
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  return { me, loading, error, refresh };
}
