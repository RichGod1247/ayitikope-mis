// src/lib/hooks/useMe.ts
"use client";

import { useCallback, useEffect, useState } from "react";

export type MePayload =
  | { ok: true; tenantId: string; roleName: string | null; effectiveRole: string | null; userId: string }
  | { ok: false; error: string };

export function useMe() {
  const [data, setData] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => null)) as MePayload | null;
      setData(j ?? { ok: false, error: "BAD_RESPONSE" });
    } catch {
      setData({ ok: false, error: "NETWORK_ERROR" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { me: data, loading, refresh };
}
