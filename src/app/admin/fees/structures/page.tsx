// src/app/admin/fees/structures/page.tsx
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
};

type FeeStructure = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  term: string;
  academicYear: string;
  amountPesewas: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type MeResponse =
  | { ok: true; tenantId: string; tenant?: { name?: string | null; slug?: string | null } | null }
  | { ok: false; error?: string };

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

const TERM_OPTIONS = ["1st Term", "2nd Term", "3rd Term"] as const;

function formatMoneyFromPesewas(p: number) {
  const n = typeof p === "number" && Number.isFinite(p) ? p : 0;
  const cedis = n / 100;
  return `GH₵ ${cedis.toFixed(2)}`;
}

function normalizeYear(v: string) {
  return String(v ?? "").trim();
}

function normalizeName(v: string) {
  return String(v ?? "").trim();
}

function validateAmountCedis(v: string): { ok: true; value: string } | { ok: false; error: string } {
  const raw = String(v ?? "").trim();
  if (!raw.length) return { ok: false, error: "Amount is required." };

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return { ok: false, error: "Amount must be a valid number." };
  if (numeric <= 0) return { ok: false, error: "Amount must be greater than 0." };
  if (numeric > 1_000_000) return { ok: false, error: "Amount is too large. Please verify." };

  return { ok: true, value: numeric.toFixed(2) };
}

async function safeJson(r: Response) {
  return (await r.json().catch(() => ({}))) as any;
}

export default function AdminFeeStructuresPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [items, setItems] = useState<FeeStructure[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTerm, setFormTerm] = useState<(typeof TERM_OPTIONS)[number]>("1st Term");
  const [formAcademicYear, setFormAcademicYear] = useState("2025/2026");
  const [formAmountCedis, setFormAmountCedis] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);

  // -------------------------
  // Bootstrap tenant from /api/me
  // -------------------------
  useEffect(() => {
    let alive = true;

    (async () => {
      setTenantLoading(true);
      setTenantError(null);

      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as MeResponse;

        if (!alive) return;

        if (!r.ok || !j || (j as any).ok !== true) {
          setTenantError("Failed to load school context. Please sign in again.");
          return;
        }

        const ok = j as Extract<MeResponse, { ok: true }>;
        setTenant({
          id: ok.tenantId,
          name: ok.tenant?.name || "School",
          slug: ok.tenant?.slug ?? null,
        });
      } catch {
        if (!alive) return;
        setTenantError("Failed to load school context. Please check your connection.");
      } finally {
        if (alive) setTenantLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // -------------------------
  // Load structures (prefers session tenant)
  // -------------------------
  async function loadStructures() {
    if (!tenant?.id) return;

    setListLoading(true);
    setListError(null);

    try {
      // 1) Prefer bank-grade API: server derives tenant from session
      let r = await fetch("/api/admin/fees/structures/list", { cache: "no-store" });
      let j = await safeJson(r);

      // 2) Backward compatibility: if your route still requires tenantId, fallback
      if ((!r.ok || !j?.ok) && tenant.id) {
        const params = new URLSearchParams();
        params.set("tenantId", tenant.id);
        r = await fetch(`/api/admin/fees/structures/list?${params.toString()}`, { cache: "no-store" });
        j = await safeJson(r);
      }

      if (!r.ok || !j?.ok) {
        setItems([]);
        setListError(j?.error || "Failed to load fee structures. Please try again.");
        return;
      }

      setItems(Array.isArray(j.items) ? (j.items as FeeStructure[]) : []);
    } catch {
      setItems([]);
      setListError("Network or server error while loading fee structures.");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id) loadStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  // -------------------------
  // Create new structure (prefers session tenant)
  // -------------------------
  async function handleCreateStructure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tenant?.id) return;

    setFormError(null);
    setFormInfo(null);

    const name = normalizeName(formName);
    if (!name.length) return setFormError("Name is required.");

    const year = normalizeYear(formAcademicYear);
    if (!year.length) return setFormError("Academic year is required.");

    const amt = validateAmountCedis(formAmountCedis);
    if (!amt.ok) return setFormError(amt.error);

    setFormLoading(true);

    try {
      // 1) Prefer bank-grade: no tenantId from client
      let payload: any = {
        name,
        description: formDescription.trim().length ? formDescription.trim() : null,
        term: formTerm,
        academicYear: year,
        amountCedis: amt.value, // backward-compatible input format
        isActive: !!formIsActive,
      };

      let r = await fetch("/api/admin/fees/structures/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      let j = await safeJson(r);

      // 2) Backward compatibility: if backend still expects tenantId, fallback
      if ((!r.ok || !j?.ok) && tenant.id) {
        payload = { ...payload, tenantId: tenant.id };
        r = await fetch("/api/admin/fees/structures/upsert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        j = await safeJson(r);
      }

      if (!r.ok || !j?.ok) {
        setFormError(j?.error || "Failed to save fee structure. Please try again.");
        return;
      }

      setFormInfo("Fee structure saved successfully.");
      setFormName("");
      setFormDescription("");
      setFormAmountCedis("");
      setFormIsActive(true);

      await loadStructures();
    } catch {
      setFormError("Network or server error while saving fee structure.");
    } finally {
      setFormLoading(false);
    }
  }

  const canSubmit = useMemo(() => !!tenant?.id && !formLoading, [tenant?.id, formLoading]);

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Fees &amp; Billing — Structures</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          Define high-level <span className="font-semibold">fee structures</span> such as “Term 1 School Fees”
          per academic year.
        </p>

        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && <p className="text-xs text-zinc-500">Loading school information…</p>}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{tenantError}</p>
        )}
      </header>

      <section className="border rounded-xl p-4 bg-white space-y-3">
        <h2 className="text-sm font-semibold">Create a new fee structure</h2>
        <p className="text-xs text-zinc-500 max-w-2xl">
          Amounts are stored in <span className="font-semibold">pesewas</span> for correct rounding.
        </p>

        <form className="grid md:grid-cols-2 gap-3 mt-2" onSubmit={handleCreateStructure}>
          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="e.g. Term 1 School Fees"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              disabled={!tenant?.id}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Term<span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={formTerm}
              onChange={(e) => setFormTerm(e.target.value as any)}
              disabled={!tenant?.id}
            >
              {TERM_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Academic year<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="e.g. 2025/2026"
              value={formAcademicYear}
              onChange={(e) => setFormAcademicYear(e.target.value)}
              required
              disabled={!tenant?.id}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Amount (GHS)<span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="e.g. 150.00"
              value={formAmountCedis}
              onChange={(e) => setFormAmountCedis(e.target.value)}
              required
              disabled={!tenant?.id}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="block text-xs font-medium">Description (optional)</label>
            <textarea
              className="w-full border rounded-xl px-3 py-2 text-sm min-h-[60px]"
              placeholder="Optional note for admins."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              disabled={!tenant?.id}
            />
          </div>

          <div className="flex items-center gap-2 md:col-span-2">
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                disabled={!tenant?.id}
              />
              Active for billing
            </label>
          </div>

          <div className="flex items-center gap-2 md:col-span-2">
            <button type="submit" className={btnPrimary} disabled={!canSubmit}>
              {formLoading ? "Saving…" : "Save fee structure"}
            </button>
            <button type="button" className={btnOutline} onClick={loadStructures} disabled={listLoading || !tenant?.id}>
              {listLoading ? "Refreshing…" : "Reload list"}
            </button>
          </div>
        </form>

        {formError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">{formError}</p>
        )}
        {formInfo && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mt-2">
            {formInfo}
          </p>
        )}
      </section>

      <section className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Existing structures</h2>
          {listLoading && <span className="text-xs text-zinc-500">Loading…</span>}
        </div>

        {listError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{listError}</p>
        )}

        <div className="overflow-x-auto mt-2">
          <table className="min-w-full text-xs border rounded-xl overflow-hidden">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-3 py-2 text-left border-b">Name</th>
                <th className="px-3 py-2 text-left border-b">Term</th>
                <th className="px-3 py-2 text-left border-b">Academic Year</th>
                <th className="px-3 py-2 text-right border-b">Amount</th>
                <th className="px-3 py-2 text-left border-b">Active</th>
                <th className="px-3 py-2 text-left border-b">Description</th>
              </tr>
            </thead>
            <tbody>
              {items.map((fs) => (
                <tr key={fs.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2 align-top font-semibold">{fs.name}</td>
                  <td className="px-3 py-2 align-top">{fs.term || "—"}</td>
                  <td className="px-3 py-2 align-top">{fs.academicYear || "—"}</td>
                  <td className="px-3 py-2 align-top text-right">{formatMoneyFromPesewas(fs.amountPesewas)}</td>
                  <td className="px-3 py-2 align-top">
                    {fs.isActive ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-700 text-[11px]">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top max-w-xs">{fs.description || "—"}</td>
                </tr>
              ))}

              {!items.length && !listLoading && !listError && (
                <tr>
                  <td className="px-3 py-3 text-xs text-zinc-600" colSpan={6}>
                    No fee structures defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-zinc-500 mt-1 max-w-3xl">
          Next: invoices + payments. This page stays intentionally low-risk.
        </p>
      </section>
    </main>
  );
}
