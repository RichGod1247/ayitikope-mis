// src/app/admin/fees/structures/page.tsx
"use client";

import { useEffect, useState } from "react";

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

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

function formatMoneyFromPesewas(p: number) {
  if (typeof p !== "number" || Number.isNaN(p)) return "0.00";
  return (p / 100).toFixed(2);
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
  const [formTerm, setFormTerm] = useState("1st Term");
  const [formAcademicYear, setFormAcademicYear] = useState("2025/2026");
  const [formAmountCedis, setFormAmountCedis] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);

  // -------------------------
  // Bootstrap tenant
  // -------------------------
  useEffect(() => {
    (async () => {
      setTenantLoading(true);
      setTenantError(null);
      try {
        const r = await fetch("/api/test/tenants");
        const j = await r.json().catch(() => ({}));
        const t = j?.tenants?.[0];

        if (t?.id) {
          setTenant({
            id: t.id,
            name: t.name || "School",
            slug: t.slug ?? null,
          });
        } else {
          setTenantError(
            "No tenant/school configured. Please contact the administrator."
          );
        }
      } catch {
        setTenantError(
          "Failed to load school context. Please check your connection or contact the administrator."
        );
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  // -------------------------
  // Load structures
  // -------------------------
  async function loadStructures() {
    if (!tenant?.id) return;

    setListLoading(true);
    setListError(null);

    try {
      const params = new URLSearchParams();
      params.set("tenantId", tenant.id);
      // You can later filter by term/year if you like.

      const r = await fetch(
        `/api/admin/fees/structures/list?${params.toString()}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setItems([]);
        setListError(
          j?.error ||
            "Failed to load fee structures. Please try again or contact the system administrator."
        );
        return;
      }

      const arr = Array.isArray(j.items)
        ? (j.items as FeeStructure[])
        : ([] as FeeStructure[]);
      setItems(arr);
    } catch {
      setItems([]);
      setListError(
        "Network or server error while loading fee structures."
      );
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id) {
      loadStructures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  // -------------------------
  // Create new structure
  // -------------------------
  async function handleCreateStructure(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant?.id) return;

    setFormError(null);
    setFormInfo(null);
    setFormLoading(true);

    try {
      const payload = {
        tenantId: tenant.id,
        name: formName,
        description: formDescription || null,
        term: formTerm,
        academicYear: formAcademicYear,
        amountCedis: formAmountCedis,
        isActive: formIsActive,
      };

      const r = await fetch("/api/admin/fees/structures/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setFormError(
          j?.error ||
            "Failed to save fee structure. Please try again or contact the system administrator."
        );
        return;
      }

      setFormInfo("Fee structure saved successfully.");
      setFormName("");
      setFormDescription("");
      setFormAmountCedis("");
      setFormIsActive(true);

      // Reload list
      await loadStructures();
    } catch {
      setFormError(
        "Network or server error while saving fee structure."
      );
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Fees &amp; Billing — Structures</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          Define high-level{" "}
          <span className="font-semibold">fee structures</span> such as
          &quot;Term 1 School Fees&quot; or &quot;PTA Levy&quot; per academic
          year. Later, we&apos;ll connect these to{" "}
          <span className="font-semibold">invoices and payments</span> for each
          learner.
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && (
          <p className="text-xs text-zinc-500">
            Loading school information…
          </p>
        )}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {tenantError}
          </p>
        )}
      </header>

      {/* Create form */}
      <section className="border rounded-xl p-4 bg-white space-y-3">
        <h2 className="text-sm font-semibold">
          Create a new fee structure
        </h2>
        <p className="text-xs text-zinc-500 max-w-2xl">
          Keep things simple: one line per high-level fee (e.g. &quot;Term 2
          school fees&quot;). We store amounts in{" "}
          <span className="font-semibold">pesewas</span> under the hood so that
          rounding is always correct.
        </p>

        <form
          className="grid md:grid-cols-2 gap-3 mt-2"
          onSubmit={handleCreateStructure}
        >
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
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Term<span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={formTerm}
              onChange={(e) => setFormTerm(e.target.value)}
            >
              <option value="1st Term">1st Term</option>
              <option value="2nd Term">2nd Term</option>
              <option value="3rd Term">3rd Term</option>
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
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Amount (GHS)<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="e.g. 150.00"
              value={formAmountCedis}
              onChange={(e) => setFormAmountCedis(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="block text-xs font-medium">
              Description (optional)
            </label>
            <textarea
              className="w-full border rounded-xl px-3 py-2 text-sm min-h-[60px]"
              placeholder="Optional note to yourself or other admins, e.g. how this fee is used."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 md:col-span-2">
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
              />
              Active for billing
            </label>
          </div>

          <div className="flex items-center gap-2 md:col-span-2">
            <button
              type="submit"
              className={btnPrimary}
              disabled={formLoading || !tenant?.id}
            >
              {formLoading ? "Saving…" : "Save fee structure"}
            </button>
            <button
              type="button"
              className={btnOutline}
              onClick={loadStructures}
              disabled={listLoading || !tenant?.id}
            >
              {listLoading ? "Refreshing…" : "Reload list"}
            </button>
          </div>
        </form>

        {formError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">
            {formError}
          </p>
        )}
        {formInfo && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mt-2">
            {formInfo}
          </p>
        )}
      </section>

      {/* List */}
      <section className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Existing structures</h2>
          {listLoading && (
            <span className="text-xs text-zinc-500">
              Loading fee structures…
            </span>
          )}
        </div>

        {listError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {listError}
          </p>
        )}

        <div className="overflow-x-auto mt-2">
          <table className="min-w-full text-xs border rounded-xl overflow-hidden">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-3 py-2 text-left border-b">Name</th>
                <th className="px-3 py-2 text-left border-b">Term</th>
                <th className="px-3 py-2 text-left border-b">
                  Academic Year
                </th>
                <th className="px-3 py-2 text-right border-b">Amount (GHS)</th>
                <th className="px-3 py-2 text-left border-b">Active</th>
                <th className="px-3 py-2 text-left border-b">Description</th>
              </tr>
            </thead>
            <tbody>
              {items.map((fs) => (
                <tr key={fs.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2 align-top font-semibold">
                    {fs.name}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {fs.term || "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {fs.academicYear || "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    {formatMoneyFromPesewas(fs.amountPesewas)}
                  </td>
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
                  <td className="px-3 py-2 align-top max-w-xs">
                    {fs.description || "—"}
                  </td>
                </tr>
              ))}

              {!items.length && !listLoading && !listError && (
                <tr>
                  <td
                    className="px-3 py-3 text-xs text-zinc-600"
                    colSpan={6}
                  >
                    No fee structures defined yet. Use the form above to add
                    your first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-zinc-500 mt-1 max-w-3xl">
          This page is intentionally{" "}
          <span className="font-semibold">simple and low-risk</span>. Later,
          we&apos;ll add controls for linking these structures to classes,
          generating invoices, and recording payments — always with clear,
          humane messaging that matches your vision as a{" "}
          <span className="font-semibold">repairer of the breach</span>, not a
          source of fee pressure.
        </p>
      </section>
    </main>
  );
}
