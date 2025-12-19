// src/app/admin/fees/invoices/page.tsx
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

type FeeStructureSummary = {
  id: string;
  name: string;
  term: string;
  academicYear: string;
  amountPesewas: number;
  isActive: boolean;
};

type FeeInvoiceRow = {
  invoiceId: string;
  studentId: string;
  studentName: string;
  classLabel?: string | null;
  term: string;
  academicYear: string;
  amountBilledPesewas: number;
  totalPaidPesewas: number;
  balancePesewas: number;
  lastPaymentAt?: string | null;
};

type PaymentModalState = {
  open: boolean;
  invoiceId: string | null;
  studentName: string;
  classLabel?: string | null;
  balancePesewas: number;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const btnDanger = `${btnBase} bg-red-600 text-white border-red-600 hover:bg-red-700`;

function formatMoneyFromPesewas(p: number) {
  const cedis = (p || 0) / 100;
  return `GH₵ ${cedis.toFixed(2)}`;
}

function formatDateShort(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function AdminFeesInvoicesPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [mode, setMode] = useState<"single" | "multi">("single");
  const [classOptions, setClassOptions] = useState<ClassroomOption[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [classroomId, setClassroomId] = useState<string>("");

  // Term + academic year
  const [term, setTerm] = useState<string>("1st Term");
  const [academicYear, setAcademicYear] = useState<string>("2025/2026");

  // Fee structures
  const [structures, setStructures] = useState<FeeStructureSummary[]>([]);
  const [structuresLoading, setStructuresLoading] = useState(false);
  const [structuresError, setStructuresError] = useState<string | null>(null);
  const [selectedStructureId, setSelectedStructureId] =
    useState<string>("");

  // Invoices
  const [invoices, setInvoices] = useState<FeeInvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Generate + payments
  const [generateLoading, setGenerateLoading] = useState(false);
  const [paymentModal, setPaymentModal] = useState<PaymentModalState>({
    open: false,
    invoiceId: null,
    studentName: "",
    classLabel: undefined,
    balancePesewas: 0,
  });
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentChannel, setPaymentChannel] = useState<string>("office");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // ---------------------------
  // Bootstrap tenant
  // ---------------------------
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
          "Failed to load school context. Please check your connection."
        );
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  // ---------------------------
  // Load classrooms
  // ---------------------------
  async function fetchClassOptions(tid: string, m: "single" | "multi") {
    setClassLoading(true);
    setClassError(null);
    try {
      const url = `/api/classrooms/list?tenantId=${encodeURIComponent(
        tid
      )}&mode=${m}`;
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));
      let items: ClassroomOption[] = [];
      if (r.ok && Array.isArray(j?.items)) {
        items = j.items.map((x: any) => ({
          id: x.id as string,
          label: (x.label as string) || "",
        }));
      }
      setClassOptions(items);
      if (!items.length) {
        setClassroomId("");
        setClassError(
          "No classrooms found. Use the class seeding tools to create KG–JHS classes."
        );
      } else {
        const existing = items.find((c) => c.id === classroomId);
        setClassroomId(existing ? existing.id : items[0].id);
      }
    } catch {
      setClassOptions([]);
      setClassroomId("");
      setClassError("Failed to load classrooms.");
    } finally {
      setClassLoading(false);
    }
  }

  async function seedClasses(modeToSeed: "single" | "multi") {
    if (!tenant?.id) return;
    setClassLoading(true);
    setClassError(null);
    try {
      const r = await fetch("/api/classrooms/seed-canonical", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, mode: modeToSeed }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setClassError(j?.error || "Failed to seed classrooms.");
      } else {
        await fetchClassOptions(tenant.id, mode);
      }
    } catch {
      setClassError("Error while seeding classrooms.");
    } finally {
      setClassLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id) {
      fetchClassOptions(tenant.id, mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, mode]);

  // ---------------------------
  // Load fee structures
  // ---------------------------
  async function loadStructures() {
    if (!tenant?.id) return;
    setStructuresLoading(true);
    setStructuresError(null);
    try {
      const params = new URLSearchParams();
      params.set("tenantId", tenant.id);
      params.set("term", term);
      params.set("academicYear", academicYear);

      const r = await fetch(
        `/api/admin/fees/structures/list?${params.toString()}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setStructures([]);
        setStructuresError(
          j?.error ||
            "Failed to load fee structures for this term/year. Please try again or contact the office."
        );
        return;
      }

      const items = Array.isArray(j.items)
        ? (j.items as FeeStructureSummary[])
        : ([] as FeeStructureSummary[]);
      setStructures(items);

      if (!items.length) {
        setSelectedStructureId("");
      } else {
        const match = items.find((s) => s.term === term && s.academicYear === academicYear);
        setSelectedStructureId(
          match ? match.id : items[0]?.id ?? ""
        );
      }
    } catch {
      setStructures([]);
      setStructuresError(
        "Network or server error while loading fee structures."
      );
    } finally {
      setStructuresLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id) {
      loadStructures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, term, academicYear]);

  // ---------------------------
  // Generate invoices
  // ---------------------------
  async function handleGenerateInvoices() {
    if (!tenant?.id || !classroomId || !term || !academicYear) return;
    if (!selectedStructureId) {
      setInfo(
        "Please choose a fee structure for this term and year before generating invoices."
      );
      return;
    }

    setGenerateLoading(true);
    setInfo(null);
    setInvoicesError(null);

    try {
      const body = {
        tenantId: tenant.id,
        classroomId,
        term,
        academicYear,
        feeStructureId: selectedStructureId,
      };

      const r = await fetch("/api/admin/fees/invoices/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setInvoicesError(
          j?.error ||
            "Failed to generate fee invoices. Please try again or contact the office."
        );
        return;
      }

      setInfo(
        `Invoices generated using "${j.structureName}" for term ${term}, ${academicYear}. Created: ${j.createdCount ?? 0}, already existed: ${j.existingCount ?? 0}, total learners in class: ${j.totalLearners ?? 0}.`
      );

      // Refresh invoice list
      await loadInvoices();
    } catch {
      setInvoicesError(
        "Network or server error while generating invoices."
      );
    } finally {
      setGenerateLoading(false);
    }
  }

  // ---------------------------
  // Load invoices
  // ---------------------------
  async function loadInvoices() {
    if (!tenant?.id || !term || !academicYear) return;

    setInvoicesLoading(true);
    setInvoicesError(null);

    try {
      const params = new URLSearchParams();
      params.set("tenantId", tenant.id);
      params.set("term", term);
      params.set("academicYear", academicYear);
      if (classroomId) params.set("classroomId", classroomId);

      const r = await fetch(
        `/api/admin/fees/invoices/list?${params.toString()}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setInvoices([]);
        setInvoicesError(
          j?.error ||
            "Failed to load fee invoices. Please try again or contact the office."
        );
        return;
      }

      const items = Array.isArray(j.items)
        ? (j.items as FeeInvoiceRow[])
        : ([] as FeeInvoiceRow[]);
      setInvoices(items);

      if (!items.length) {
        setInfo(
          "No invoices found for this class, term, and academic year yet. Try generating invoices above."
        );
      }
    } catch {
      setInvoices([]);
      setInvoicesError(
        "Network or server error while loading fee invoices."
      );
    } finally {
      setInvoicesLoading(false);
    }
  }

  // ---------------------------
  // Payment modal helpers
  // ---------------------------
  function openPaymentModal(inv: FeeInvoiceRow) {
    setPaymentError(null);
    setPaymentAmount("");
    setPaymentMethod("cash");
    setPaymentReference("");
    setPaymentChannel("office");
    setPaymentModal({
      open: true,
      invoiceId: inv.invoiceId,
      studentName: inv.studentName,
      classLabel: inv.classLabel,
      balancePesewas: inv.balancePesewas,
    });
  }

  function closePaymentModal() {
    setPaymentModal((prev) => ({
      ...prev,
      open: false,
    }));
  }

  // ---------------------------
  // Record payment
  // ---------------------------
  async function handleSubmitPayment() {
    if (!tenant?.id) return;
    if (!paymentModal.invoiceId) {
      setPaymentError("Invoice is required.");
      return;
    }

    const trimmed = paymentAmount.trim();
    if (!trimmed) {
      setPaymentError("Please enter an amount to record.");
      return;
    }

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setPaymentError("Please enter a valid positive amount.");
      return;
    }

    const pesewas = Math.round(numeric * 100);

    // Extra guard: don't allow overpayment in the UI
    if (pesewas > paymentModal.balancePesewas) {
      setPaymentError(
        "Payment amount is larger than the remaining balance. Please adjust."
      );
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);

    try {
      const body = {
        tenantId: tenant.id,
        invoiceId: paymentModal.invoiceId,
        amountPesewas: pesewas,
        method: paymentMethod || "cash",
        reference: paymentReference || undefined,
        channel: paymentChannel || "office",
      };

      const r = await fetch("/api/admin/fees/payments/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setPaymentError(
          j?.error ||
            "Failed to record payment. Please try again or contact the office."
        );
        return;
      }

      // Close modal and refresh invoice list
      closePaymentModal();
      await loadInvoices();
      setInfo("Payment recorded successfully and balances updated.");
    } catch {
      setPaymentError(
        "Network or server error while recording payment."
      );
    } finally {
      setPaymentLoading(false);
    }
  }

  // ---------------------------
  // Derived summary
  // ---------------------------
  const summary = useMemo(() => {
    const totalInvoices = invoices.length;
    const totalBilled = invoices.reduce(
      (sum, inv) => sum + (inv.amountBilledPesewas || 0),
      0
    );
    const totalPaid = invoices.reduce(
      (sum, inv) => sum + (inv.totalPaidPesewas || 0),
      0
    );
    const totalBalance = invoices.reduce(
      (sum, inv) => sum + (inv.balancePesewas || 0),
      0
    );

    return {
      totalInvoices,
      totalBilled,
      totalPaid,
      totalBalance,
    };
  }, [invoices]);

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Fees — Invoices & Payments</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          Create and manage{" "}
          <span className="font-semibold">
            per-learner fee invoices for each term
          </span>
          , track payments, and see clear balances — all designed to be{" "}
          <span className="font-semibold">calm, fair, and transparent</span>{" "}
          for families.
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && (
          <p className="text-xs text-zinc-500">Loading school context…</p>
        )}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {tenantError}
          </p>
        )}
      </header>

      {/* Filters: term/year/class + structure */}
      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          {/* Left: term + year */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Term & Academic Year
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Term
                </label>
                <select
                  className="border rounded-xl h-9 px-2 text-sm"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  <option>1st Term</option>
                  <option>2nd Term</option>
                  <option>3rd Term</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Academic year
                </label>
                <input
                  type="text"
                  className="border rounded-xl h-9 px-2 text-sm"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="e.g. 2025/2026"
                />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 max-w-md">
              These filters control{" "}
              <span className="font-semibold">
                both the fee structures and invoices
              </span>{" "}
              shown below.
            </p>
          </div>

          {/* Right: class mode + classroom */}
          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Class selection
            </div>
            <div className="flex items-center gap-2 mb-2">
              <button
                className={`${btnOutline} h-8 px-3 ${
                  mode === "single" ? "ring-2 ring-zinc-800" : ""
                }`}
                onClick={() => setMode("single")}
                disabled={classLoading}
              >
                Single-stream
              </button>
              <button
                className={`${btnOutline} h-8 px-3 ${
                  mode === "multi" ? "ring-2 ring-zinc-800" : ""
                }`}
                onClick={() => setMode("multi")}
                disabled={classLoading}
              >
                Multi-stream (A–D)
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Classroom
                </label>
                {classLoading ? (
                  <div className="h-9 rounded-xl border bg-zinc-50 animate-pulse" />
                ) : classOptions.length ? (
                  <select
                    className="w-full border rounded-xl h-9 px-2 text-sm"
                    value={classroomId}
                    onChange={(e) => setClassroomId(e.target.value)}
                  >
                    {classOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="border rounded-xl px-3 py-2 text-xs text-zinc-700">
                    {classError || "No classrooms available yet."}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Quick seeding
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={btnOutline}
                    onClick={() => seedClasses("single")}
                    disabled={!tenant?.id || classLoading}
                  >
                    Seed KG1 → JHS3 (single)
                  </button>
                  <button
                    className={btnOutline}
                    onClick={() => seedClasses("multi")}
                    disabled={!tenant?.id || classLoading}
                  >
                    Seed KG1 → JHS3 (A–D)
                  </button>
                </div>
              </div>
            </div>
            {classError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-1">
                {classError}
              </div>
            )}
          </div>
        </div>

        {/* Fee structure picker */}
        <div className="border-t pt-3 mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Fee structure for this term/year
            </div>
            <button
              className={btnOutline}
              onClick={loadStructures}
              disabled={structuresLoading || !tenant?.id}
            >
              Reload structures
            </button>
          </div>

          {structuresError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {structuresError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {structuresLoading && (
              <span className="text-xs text-zinc-500">
                Loading fee structures…
              </span>
            )}
            {!structuresLoading && !structures.length && !structuresError && (
              <p className="text-xs text-zinc-600">
                No fee structures found yet for{" "}
                <span className="font-semibold">
                  {term}, {academicYear}
                </span>
                . You can create them later under a dedicated{" "}
                <span className="font-semibold">Fees Setup</span> screen.
              </p>
            )}
            {!!structures.length && (
              <div className="flex flex-wrap gap-2">
                {structures.map((s) => {
                  const selected = s.id === selectedStructureId;
                  return (
                    <button
                      key={s.id}
                      className={`${btnOutline} ${
                        selected ? "ring-2 ring-zinc-800" : ""
                      }`}
                      onClick={() => setSelectedStructureId(s.id)}
                    >
                      <span className="font-semibold">{s.name}</span>
                      <span className="ml-2 text-[11px] text-zinc-600">
                        ({formatMoneyFromPesewas(s.amountPesewas)})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Summary + actions */}
      <section className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Invoice Summary
            </div>
            <div>
              Total invoices in view:{" "}
              <span className="font-semibold">
                {summary.totalInvoices}
              </span>
            </div>
            <div>
              Total billed:{" "}
              <span className="font-semibold">
                {formatMoneyFromPesewas(summary.totalBilled)}
              </span>
            </div>
            <div>
              Total paid:{" "}
              <span className="font-semibold">
                {formatMoneyFromPesewas(summary.totalPaid)}
              </span>
            </div>
            <div>
              Total outstanding:{" "}
              <span className="font-semibold text-red-700">
                {formatMoneyFromPesewas(summary.totalBalance)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={btnPrimary}
              onClick={handleGenerateInvoices}
              disabled={
                generateLoading ||
                !tenant?.id ||
                !classroomId ||
                !term ||
                !academicYear
              }
            >
              {generateLoading ? "Generating…" : "Generate invoices for this class"}
            </button>
            <button
              className={btnOutline}
              onClick={loadInvoices}
              disabled={invoicesLoading || !tenant?.id || !term || !academicYear}
            >
              {invoicesLoading ? "Loading invoices…" : "Load invoices"}
            </button>
            <button
              className={btnDanger}
              onClick={() => {
                setInvoices([]);
                setInvoicesError(null);
                setInfo(
                  "Cleared invoice list in the browser view. You can reload them anytime."
                );
              }}
            >
              Clear view
            </button>
          </div>
        </div>

        {info && (
          <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {info}
          </div>
        )}
        {invoicesError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {invoicesError}
          </div>
        )}
      </section>

      {/* Invoices table */}
      <section className="border rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold">
            Invoices for{" "}
            <span className="font-semibold">
              {term}, {academicYear}
            </span>{" "}
            —{" "}
            {classOptions.find((c) => c.id === classroomId)?.label ||
              "all classes (filtered by class if selected)"}
          </h2>
          {invoicesLoading && (
            <span className="text-xs text-zinc-500">
              Loading invoices…
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm border rounded-xl overflow-hidden">
            <thead className="bg-zinc-50 text-[11px] md:text-xs text-zinc-600">
              <tr>
                <th className="px-3 py-2 text-left border-b">Learner</th>
                <th className="px-3 py-2 text-left border-b">Class</th>
                <th className="px-3 py-2 text-left border-b">Term / Year</th>
                <th className="px-3 py-2 text-right border-b">Billed</th>
                <th className="px-3 py-2 text-right border-b">Paid</th>
                <th className="px-3 py-2 text-right border-b">Balance</th>
                <th className="px-3 py-2 text-left border-b">Last payment</th>
                <th className="px-3 py-2 text-left border-b">Status</th>
                <th className="px-3 py-2 text-right border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: FeeInvoiceRow, index: number) => {
                const fullyPaid = inv.balancePesewas <= 0;
                const partiallyPaid =
                  inv.balancePesewas > 0 &&
                  inv.totalPaidPesewas > 0;
                const statusLabel = fullyPaid
                  ? "Paid"
                  : partiallyPaid
                  ? "Partially paid"
                  : "Not paid";

                const statusClasses = fullyPaid
                  ? "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-emerald-50 border-emerald-200 text-emerald-800"
                  : partiallyPaid
                  ? "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-amber-50 border-amber-200 text-amber-800"
                  : "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-red-50 border-red-200 text-red-800";

                return (
                  <tr
                    key={`${inv.invoiceId}-${index}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">
                        {inv.studentName || "Unnamed learner"}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {inv.classLabel || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {inv.term}, {inv.academicYear}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {formatMoneyFromPesewas(inv.amountBilledPesewas)}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {formatMoneyFromPesewas(inv.totalPaidPesewas)}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <span
                        className={
                          inv.balancePesewas > 0
                            ? "text-red-700 font-semibold"
                            : "text-emerald-700 font-semibold"
                        }
                      >
                        {formatMoneyFromPesewas(inv.balancePesewas)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {formatDateShort(inv.lastPaymentAt)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={statusClasses}>{statusLabel}</span>
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        className={btnPrimary}
                        onClick={() => openPaymentModal(inv)}
                        disabled={inv.balancePesewas <= 0}
                      >
                        {inv.balancePesewas <= 0
                          ? "Fully paid"
                          : "Record payment"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!invoices.length && !invoicesLoading && !invoicesError && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-4 text-sm text-zinc-600"
                  >
                    No invoices loaded yet. Choose a class, term, and year, then
                    click{" "}
                    <span className="font-semibold">
                      Generate invoices
                    </span>{" "}
                    or{" "}
                    <span className="font-semibold">
                      Load invoices
                    </span>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-zinc-500 max-w-3xl">
          This screen focuses on{" "}
          <span className="font-semibold">clarity and fairness</span>. It’s not
          for shaming families, but for gently tracking what is due, what has
          been paid, and what support might be needed.
        </p>
      </section>

      {/* Payment Modal */}
      {paymentModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Record payment — {paymentModal.studentName}
              </h2>
              <button
                className={btnOutline}
                onClick={closePaymentModal}
                disabled={paymentLoading}
              >
                Close
              </button>
            </div>
            {paymentModal.classLabel && (
              <p className="text-xs text-zinc-600">
                Class:{" "}
                <span className="font-semibold">
                  {paymentModal.classLabel}
                </span>
              </p>
            )}
            <p className="text-xs text-zinc-600">
              Current balance:{" "}
              <span className="font-semibold text-red-700">
                {formatMoneyFromPesewas(paymentModal.balancePesewas)}
              </span>
            </p>

            <div className="grid gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Amount (GH₵)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  className="w-full border rounded-xl h-9 px-2 text-sm"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 150.00"
                  disabled={paymentLoading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Method
                </label>
                <select
                  className="w-full border rounded-xl h-9 px-2 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={paymentLoading}
                >
                  <option value="cash">Cash</option>
                  <option value="paystack">Paystack</option>
                  <option value="hubtel">Hubtel</option>
                  <option value="bank">Bank transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Reference / receipt (optional)
                </label>
                <input
                  type="text"
                  className="w-full border rounded-xl h-9 px-2 text-sm"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  disabled={paymentLoading}
                  placeholder="Receipt no. / transaction ref."
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Channel
                </label>
                <select
                  className="w-full border rounded-xl h-9 px-2 text-sm"
                  value={paymentChannel}
                  onChange={(e) => setPaymentChannel(e.target.value)}
                  disabled={paymentLoading}
                >
                  <option value="office">Office</option>
                  <option value="online">Online</option>
                  <option value="pta">PTA desk</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {paymentError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {paymentError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                className={btnOutline}
                onClick={closePaymentModal}
                disabled={paymentLoading}
              >
                Cancel
              </button>
              <button
                className={btnPrimary}
                onClick={handleSubmitPayment}
                disabled={paymentLoading}
              >
                {paymentLoading ? "Recording…" : "Record payment"}
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 mt-1">
              Payments recorded here update the learner&apos;s balance
              immediately. Use this as a{" "}
              <span className="font-semibold">truthful ledger</span>, not as a
              tool for pressure.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
