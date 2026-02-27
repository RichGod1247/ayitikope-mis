// src/app/admin/attendance/overview/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
};

type ClassroomOption = {
  id: string;
  label: string;
};

type SessionState = "NONE" | "OPEN" | "CLOSED" | "CERTIFIED";

type ClassSummary = {
  classroomId: string;
  classLabel: string;
  state: SessionState;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeTenant(x: any): Tenant | null {
  const id = cleanStr(x?.id ?? x?.tenantId);
  if (!id) return null;
  const name = cleanStr(x?.name ?? x?.tenantName) || "School";
  const slug = (x?.slug ?? x?.tenantSlug ?? null) as string | null;
  return { id, name, slug };
}

// Backward-compatible extraction (matches your current parsing expectations)
function extractTenantsFromMe(j: any): Tenant[] {
  const memberships =
    (Array.isArray(j?.memberships) && j.memberships) ||
    (Array.isArray(j?.user?.memberships) && j.user.memberships) ||
    [];

  const list: Tenant[] = [];
  for (const m of memberships) {
    const t = normalizeTenant(m?.tenant ?? m);
    if (t) list.push(t);
  }

  const direct =
    normalizeTenant(j?.activeTenant) ||
    normalizeTenant(j?.tenant) ||
    normalizeTenant(j?.user?.activeTenant) ||
    normalizeTenant(j?.user?.tenant);

  if (direct) list.unshift(direct);

  const seen = new Set<string>();
  const out: Tenant[] = [];
  for (const t of list) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

function pickActiveTenantFromMe(j: any): Tenant | null {
  const tenants = extractTenantsFromMe(j);
  if (!tenants.length) return null;

  const activeId =
    cleanStr(j?.activeTenantId) ||
    cleanStr(j?.tenantId) ||
    cleanStr(j?.user?.activeTenantId) ||
    cleanStr(j?.user?.tenantId);

  if (activeId) {
    const match = tenants.find((t) => t.id === activeId);
    if (match) return match;
  }
  return tenants[0] ?? null;
}

function statusBadge(state: SessionState) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px]";
  if (state === "CERTIFIED") return `${base} bg-indigo-50 border-indigo-200 text-indigo-800`;
  if (state === "CLOSED") return `${base} bg-emerald-50 border-emerald-200 text-emerald-800`;
  if (state === "OPEN") return `${base} bg-amber-50 border-amber-200 text-amber-800`;
  return `${base} bg-zinc-50 border-zinc-200 text-zinc-700`;
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function extractCounts(j: any) {
  const c = j?.counts ?? j?.summary ?? j?.stats ?? j ?? {};
  let total = num(c.total ?? c.studentCount ?? j?.studentCount ?? j?.total ?? 0);
  let present = num(c.present ?? c.presentCount ?? j?.present ?? 0);
  let absent = num(c.absent ?? c.absentCount ?? j?.absent ?? 0);
  const late = num(c.late ?? c.lateCount ?? j?.late ?? 0);
  const excused = num(c.excused ?? c.excusedCount ?? j?.excused ?? 0);

  // If API returns total+present but absent omitted, derive it safely.
  if (!absent && total && present && total >= present) absent = Math.max(0, total - present);

  return { total, present, absent, late, excused };
}

export default function AdminAttendanceOverviewPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [mode, setMode] = useState<"single" | "multi">("single");
  const [classOptions, setClassOptions] = useState<ClassroomOption[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [summaries, setSummaries] = useState<ClassSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Bootstrap tenant from /api/me (AUTH)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTenantLoading(true);
      setTenantError(null);

      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));

        if (r.status === 401) {
          if (!cancelled) setTenantError("You must be signed in to view attendance overview.");
          return;
        }

        const t = pickActiveTenantFromMe(j);
        if (!t?.id) {
          if (!cancelled) setTenantError("No tenant/school context found for your account.");
          return;
        }

        if (!cancelled) {
          setTenant({ id: t.id, name: t.name || "School", slug: t.slug ?? null });
        }
      } catch {
        if (!cancelled) {
          setTenantError("Failed to load school context. Please check your connection or contact the system administrator.");
        }
      } finally {
        if (!cancelled) setTenantLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchClassOptions(m: "single" | "multi") {
    setClassLoading(true);
    setClassError(null);

    try {
      // IMPORTANT: no tenantId in URL — server must use session tenant
      const url = `/api/classrooms/list?mode=${encodeURIComponent(m)}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));

      let items: ClassroomOption[] = [];
      if (r.ok && Array.isArray(j?.items)) {
        items = j.items.map((x: any) => ({
          id: String(x.id ?? ""),
          label: String(x.label ?? ""),
        })).filter((x: ClassroomOption) => x.id && x.label);
      }

      setClassOptions(items);

      if (!items.length) {
        setClassError("No classrooms found. Use the seeding tools on the Classrooms page to create standard KG–JHS classes.");
      }
    } catch {
      setClassOptions([]);
      setClassError("Failed to load classrooms. Please try again.");
    } finally {
      setClassLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id) fetchClassOptions(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, mode]);

  async function loadSummariesForDate() {
    if (!tenant?.id || !date) return;
    if (!classOptions.length) {
      setSummaries([]);
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);
    setSummaries([]);

    try {
      const requests = classOptions.map((c) => {
        const params = new URLSearchParams();
        // IMPORTANT: no tenantId param — session tenant enforced server-side
        params.set("classroomId", c.id);
        params.set("date", date);

        const url = `/api/attendance/sessions/summary?${params.toString()}`;

        return fetch(url, { cache: "no-store" })
          .then(async (r) => {
            const j = await r.json().catch(() => ({}));
            return { ok: r.ok && Boolean(j?.ok), raw: j, classroom: c };
          })
          .catch(() => ({ ok: false, raw: null as any, classroom: c }));
      });

      const results = await Promise.all(requests);

      const next: ClassSummary[] = [];
      let anyError = false;

      for (const res of results) {
        const c = res.classroom;
        if (!res.ok || !res.raw) {
          anyError = true;
          continue;
        }

        const j = res.raw;
        const session = j.session || null;

        let state: SessionState = "NONE";
        if (!session) state = "NONE";
        else if (session.certifiedAt) state = "CERTIFIED";
        else if (session.isClosed) state = "CLOSED";
        else state = "OPEN";

        const counts = extractCounts(j);

        next.push({
          classroomId: c.id,
          classLabel: c.label,
          state,
          total: counts.total,
          present: counts.present,
          absent: counts.absent,
          late: counts.late,
          excused: counts.excused,
        });
      }

      next.sort((a, b) => a.classLabel.localeCompare(b.classLabel));

      setSummaries(next);

      if (anyError) {
        setSummaryError("Some classes failed to load. This usually means session tenant enforcement rejected a mismatched request or the session is missing tenant context.");
      }
    } catch {
      setSummaries([]);
      setSummaryError("Failed to load attendance summaries. Please try again.");
    } finally {
      setSummaryLoading(false);
    }
  }

  const header = useMemo(() => {
    if (tenantLoading) return "Loading school context…";
    if (tenantError) return tenantError;
    if (!tenant) return "No school context.";
    return `${tenant.name} — Attendance Overview`;
  }, [tenant, tenantError, tenantLoading]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{header}</h1>
          {tenant && <p className="text-sm text-zinc-600 mt-1">Tenant ID: {tenant.id}</p>}
        </div>

        <div className="flex items-center gap-2">
          <button
            className={btnOutline}
            onClick={() => setMode((m) => (m === "single" ? "multi" : "single"))}
            disabled={!tenant || tenantLoading}
            title="Toggle single vs multi-arm class list"
          >
            Mode: {mode === "single" ? "Single" : "Multi"}
          </button>

          <button
            className={btnPrimary}
            onClick={loadSummariesForDate}
            disabled={!tenant || tenantLoading || classLoading || summaryLoading || !classOptions.length}
          >
            {summaryLoading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-zinc-600">Date</label>
          <input
            className="h-9 px-3 rounded-xl border border-zinc-300 text-sm"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!tenant || tenantLoading}
          />
        </div>

        <div className="text-sm text-zinc-600">
          {classLoading ? "Loading classrooms…" : classError ? classError : classOptions.length ? `${classOptions.length} classes loaded.` : ""}
        </div>
      </div>

      {summaryError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {summaryError}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="grid grid-cols-7 gap-0 bg-zinc-50 border-b border-zinc-200 text-xs font-medium text-zinc-700">
          <div className="p-3">Class</div>
          <div className="p-3">Status</div>
          <div className="p-3 text-right">Total</div>
          <div className="p-3 text-right">Present</div>
          <div className="p-3 text-right">Absent</div>
          <div className="p-3 text-right">Late</div>
          <div className="p-3 text-right">Excused</div>
        </div>

        {summaryLoading ? (
          <div className="p-4 text-sm text-zinc-600">Loading summaries…</div>
        ) : !summaries.length ? (
          <div className="p-4 text-sm text-zinc-600">No data loaded yet.</div>
        ) : (
          summaries.map((s) => (
            <div key={s.classroomId} className="grid grid-cols-7 gap-0 border-b border-zinc-100 text-sm">
              <div className="p-3 font-medium text-zinc-900">{s.classLabel}</div>
              <div className="p-3">
                <span className={statusBadge(s.state)}>{s.state}</span>
              </div>
              <div className="p-3 text-right tabular-nums">{s.total}</div>
              <div className="p-3 text-right tabular-nums">{s.present}</div>
              <div className="p-3 text-right tabular-nums">{s.absent}</div>
              <div className="p-3 text-right tabular-nums">{s.late}</div>
              <div className="p-3 text-right tabular-nums">{s.excused}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
