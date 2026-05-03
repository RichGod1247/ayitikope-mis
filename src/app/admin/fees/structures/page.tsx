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

type ApiResponse<T> = {
  ok: boolean;
  error?: string;
} & Partial<T>;

type MeResponse =
  | { ok: true; tenantId: string; tenant?: { name?: string | null; slug?: string | null } | null }
  | { ok: false; error?: string };

const TERM_OPTIONS = ["1st Term", "2nd Term", "3rd Term"] as const;

function formatMoneyFromPesewas(pesewas: number) {
  const safe = Number.isFinite(pesewas) ? Math.max(0, Math.floor(pesewas)) : 0;
  return `GH₵ ${(safe / 100).toFixed(2)}`;
}

function validateAmountCedis(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false as const, error: "Amount is required." };

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return { ok: false as const, error: "Amount must be a valid number." };
  }

  if (numeric <= 0) {
    return { ok: false as const, error: "Amount must be greater than 0." };
  }

  if (numeric > 1_000_000) {
    return { ok: false as const, error: "Amount is too large. Please verify." };
  }

  return { ok: true as const, value: numeric.toFixed(2) };
}

async function safeJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export default function AdminFeeStructuresPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [items, setItems] = useState<FeeStructure[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [tab, setTab] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTerm, setFormTerm] = useState<(typeof TERM_OPTIONS)[number]>("1st Term");
  const [formAcademicYear, setFormAcademicYear] = useState("2025/2026");
  const [formAmountCedis, setFormAmountCedis] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);

  async function loadTenant() {
    setTenantLoading(true);
    setTenantError(null);

    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await safeJson<MeResponse>(res);

      if (!res.ok || !data || data.ok !== true) {
        setTenantError("Failed to load school context. Please sign in again.");
        return;
      }

      setTenant({
        id: data.tenantId,
        name: data.tenant?.name || "School",
        slug: data.tenant?.slug ?? null,
      });
    } catch {
      setTenantError("Failed to load school context. Please check your connection.");
    } finally {
      setTenantLoading(false);
    }
  }

  async function loadStructures() {
    setListLoading(true);
    setListError(null);

    try {
      const res = await fetch("/api/admin/fees/structures/list", {
        cache: "no-store",
      });

      const data = await safeJson<ApiResponse<{ items: FeeStructure[] }>>(res);

      if (!res.ok || !data || data.ok !== true) {
        setItems([]);
        setListError(data?.error || "Failed to load fee structures.");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
      setListError("Network or server error while loading fee structures.");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadTenant();
  }, []);

  useEffect(() => {
    if (tenant?.id) void loadStructures();
  }, [tenant?.id]);

  async function handleCreateStructure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setFormError(null);
    setFormInfo(null);

    const name = formName.trim();
    const year = formAcademicYear.trim();
    const description = formDescription.trim();

    if (!name) return setFormError("Name is required.");
    if (!year) return setFormError("Academic year is required.");

    const amount = validateAmountCedis(formAmountCedis);
    if (!amount.ok) return setFormError(amount.error);

    setFormLoading(true);

    try {
      const payload = {
        name,
        description: description || null,
        term: formTerm,
        academicYear: year,
        amountCedis: amount.value,
        isActive: true,
      };

      const res = await fetch("/api/admin/fees/structures/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await safeJson<ApiResponse<{ item?: FeeStructure }>>(res);

      if (!res.ok || !data || data.ok !== true) {
        setFormError(data?.error || "Failed to save fee structure.");
        return;
      }

      setFormInfo("Fee structure saved successfully.");
      setFormName("");
      setFormDescription("");
      setFormAmountCedis("");
      setTab("ACTIVE");
      await loadStructures();
    } catch {
      setFormError("Network or server error while saving fee structure.");
    } finally {
      setFormLoading(false);
    }
  }

  async function setStructureActive(id: string, isActive: boolean) {
    setBusyId(id);
    setListError(null);

    try {
      const res = await fetch("/api/admin/fees/structures/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });

      const data = await safeJson<ApiResponse<{ item?: FeeStructure }>>(res);

      if (!res.ok || !data || data.ok !== true) {
        setListError(data?.error || "Failed to update fee structure.");
        return;
      }

      await loadStructures();
    } catch {
      setListError("Network or server error while updating fee structure.");
    } finally {
      setBusyId(null);
    }
  }

  const activeItems = useMemo(() => items.filter((item) => item.isActive), [items]);
  const archivedItems = useMemo(() => items.filter((item) => !item.isActive), [items]);

  const visibleItems = tab === "ACTIVE" ? activeItems : archivedItems;

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#D4AF37]">
          Finance Control
        </p>
        <h1 className="text-2xl font-bold text-[#F7F4ED]">
          Fee Structures
        </h1>
        <p className="max-w-3xl text-sm text-[#C9CDD6]">
          Create fee structures, archive old ones, and preserve financial history without
          destructive deletes.
        </p>

        {tenant && (
          <p className="text-xs text-[#8F98A8]">
            School: <span className="font-semibold text-[#C9CDD6]">{tenant.name}</span>
          </p>
        )}

        {tenantLoading && <p className="text-xs text-[#8F98A8]">Loading school information...</p>}

        {tenantError && (
          <p className="rounded-xl border border-red-500/30 bg-red-900/20 px-3 py-2 text-xs text-red-300">
            {tenantError}
          </p>
        )}
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-sm font-semibold text-[#F7F4ED]">
          Create a new fee structure
        </h2>

        <form onSubmit={handleCreateStructure} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-[#C9CDD6]">Name</span>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="3rd Term Printing fees"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-[#C9CDD6]">Amount</span>
            <input
              value={formAmountCedis}
              onChange={(e) => setFormAmountCedis(e.target.value)}
              placeholder="20.00"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-[#C9CDD6]">Term</span>
            <select
              value={formTerm}
              onChange={(e) => setFormTerm(e.target.value as (typeof TERM_OPTIONS)[number])}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
            >
              {TERM_OPTIONS.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-[#C9CDD6]">Academic Year</span>
            <input
              value={formAcademicYear}
              onChange={(e) => setFormAcademicYear(e.target.value)}
              placeholder="2025/2026"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-[#C9CDD6]">Description</span>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              placeholder="Optional internal note for admins."
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!tenant?.id || formLoading}
              className="rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#071A3D] disabled:opacity-50"
            >
              {formLoading ? "Saving..." : "Save Fee Structure"}
            </button>
          </div>
        </form>

        {formError && <p className="mt-3 text-sm text-red-300">{formError}</p>}
        {formInfo && <p className="mt-3 text-sm text-emerald-300">{formInfo}</p>}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#F7F4ED]">
              Existing fee structures
            </h2>
            <p className="mt-1 text-xs text-[#8F98A8]">
              Archived structures remain visible for audit history but cannot be used for new invoice generation.
            </p>
          </div>

          <button
            onClick={loadStructures}
            disabled={listLoading}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {listLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setTab("ACTIVE")}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              tab === "ACTIVE"
                ? "bg-emerald-400 text-[#071A3D]"
                : "border border-white/10 bg-white/5 text-white"
            }`}
          >
            Active ({activeItems.length})
          </button>

          <button
            onClick={() => setTab("ARCHIVED")}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              tab === "ARCHIVED"
                ? "bg-amber-300 text-[#071A3D]"
                : "border border-white/10 bg-white/5 text-white"
            }`}
          >
            Archived ({archivedItems.length})
          </button>
        </div>

        {listError && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-900/20 px-3 py-2 text-sm text-red-300">
            {listError}
          </p>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-white/50">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {listLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-white/55">
                      Loading fee structures...
                    </td>
                  </tr>
                ) : visibleItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-white/55">
                      No {tab === "ACTIVE" ? "active" : "archived"} fee structures found.
                    </td>
                  </tr>
                ) : (
                  visibleItems.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-white">{item.name}</p>
                        {item.description && (
                          <p className="mt-1 max-w-lg text-xs text-white/55">{item.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-white/70">{item.term}</td>
                      <td className="px-4 py-4 text-white/70">{item.academicYear}</td>
                      <td className="px-4 py-4 font-semibold text-white">
                        {formatMoneyFromPesewas(item.amountPesewas)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${
                            item.isActive
                              ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                              : "border-amber-400/30 bg-amber-500/15 text-amber-200"
                          }`}
                        >
                          {item.isActive ? "ACTIVE" : "ARCHIVED"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {item.isActive ? (
                          <button
                            onClick={() => setStructureActive(item.id, false)}
                            disabled={busyId === item.id}
                            className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                          >
                            {busyId === item.id ? "Archiving..." : "Archive"}
                          </button>
                        ) : (
                          <button
                            onClick={() => setStructureActive(item.id, true)}
                            disabled={busyId === item.id}
                            className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            {busyId === item.id ? "Restoring..." : "Restore"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}