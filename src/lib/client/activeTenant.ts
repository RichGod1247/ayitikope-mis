// src/lib/client/activeTenant.ts
// Client-only helper: derive active tenant from the user session (/api/me).
// ✅ Production rule: tenant context must come from session, not test endpoints.

export type TenantCtx = {
  id: string;
  name?: string;
  slug?: string | null;
};

function pickTenantFromMePayload(j: any): TenantCtx | null {
  const tid =
    j?.tenantId ||
    j?.activeTenantId ||
    j?.tenant?.id ||
    j?.user?.tenantId ||
    j?.user?.activeTenantId ||
    j?.membership?.tenantId ||
    j?.membership?.tenant?.id ||
    (Array.isArray(j?.memberships)
      ? j.memberships[0]?.tenantId || j.memberships[0]?.tenant?.id
      : null);

  if (typeof tid !== "string" || !tid.trim()) return null;

  const name =
    j?.tenant?.name ||
    j?.membership?.tenant?.name ||
    (Array.isArray(j?.memberships) ? j.memberships[0]?.tenant?.name : null) ||
    j?.tenantName ||
    "School";

  const slug =
    j?.tenant?.slug ??
    j?.membership?.tenant?.slug ??
    (Array.isArray(j?.memberships) ? j.memberships[0]?.tenant?.slug : null) ??
    null;

  return { id: tid, name, slug };
}

async function fetchJsonSafe(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function fetchActiveTenant(): Promise<TenantCtx | null> {
  try {
    const { res, data } = await fetchJsonSafe("/api/me");
    if (!res.ok) return null;
    return pickTenantFromMePayload(data);
  } catch {
    return null;
  }
}
