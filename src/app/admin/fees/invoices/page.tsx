// src/app/admin/fees/invoices/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

// Match /api/me payload (only fields we use)
type MeResponse =
  | {
      ok: true;
      tenantId: string;
      tenant?: { name?: string | null; slug?: string | null } | null;
      roleName?: string | null;
      effectiveRole?: string | null;
    }
  | { ok: false; error?: string };

// Match /api/admin/setup/load (only fields we use)
type SetupLoadResponse =
  | {
      tenant: any;
      settings: {
        currentAcademicYear?: string | null;
        currentTerm?: string | null;
        setupComplete?: boolean;
      };
    }
  | { error: string };

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;
const btnDanger = `${btnBase} bg-red-600 text-white border-red-600 hover:bg-red-700`;

function formatMoneyFromPesewas(p: number) {
  const n = typeof p === "number" && Number.isFinite(p) ? p : 0;
  return `GH₵ ${(n / 100).toFixed(2)}`;
}

function formatDateShort(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

async function safeJson(r: Response) {
  return (await r.json().catch(() => ({}))) as any;
}

async function loadSetupDefaults(): Promise<
  | { ok: true; currentTerm: string; currentAcademicYear: string; setupComplete: boolean }
  | { ok: false; error: string }
> {
  const r = await fetch("/api/admin/setup/load", { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as SetupLoadResponse;

  if (!r.ok) return { ok: false, error: (j as any)?.error || "Failed to load admin setup." };

  const settings = (j as any)?.settings || {};
  return {
    ok: true,
    currentTerm: String(settings.currentTerm ?? "").trim(),
    currentAcademicYear: String(settings.currentAcademicYear ?? "").trim(),
    setupComplete: !!settings.setupComplete,
  };
}

export default function AdminFeesInvoicesPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  const [mode, setMode] = useState<"single" | "multi">("single");
  const [classOptions, setClassOptions] = useState<ClassroomOption[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [classroomId, setClassroomId] = useState<string>("");

  // UI defaults (will be overridden by tenant setup if present)
  const [term, setTerm] = useState<string>("1st Term");
  const [academicYear, setAcademicYear] = useState<string>("2025/2026");

  const [structures, setStructures] = useState<FeeStructureSummary[]>([]);
  const [structuresLoading, setStructuresLoading] = useState(false);
  const [structuresError, setStructuresError] = useState<string | null>(null);
  const [selectedStructureId, setSelectedStructureId] = useState<string>("");

  const [invoices, setInvoices] = useState<FeeInvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
  // Bootstrap tenant from /api/me (bank-grade)
  // ---------------------------
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

  // ---------------------------
  // Bootstrap term/year from TenantSettings (/api/admin/setup/load)
  // ---------------------------
  useEffect(() => {
    if (!tenant?.id) return;

    let alive = true;
    (async () => {
      try {
        const setup = await loadSetupDefaults();
        if (!alive) return;

        if (!setup.ok) {
          // Keep UI defaults; show a soft hint only (don't block page)
          setSetupComplete(null);
          return;
        }

        setSetupComplete(setup.setupComplete);

        // Only override if configured
        if (setup.currentTerm) setTerm(setup.currentTerm);
        if (setup.currentAcademicYear) setAcademicYear(setup.currentAcademicYear);
      } catch {
        if (!alive) return;
        setSetupComplete(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenant?.id]);

  // ---------------------------
  // Classrooms (prefer server-derived tenant, fallback to tenantId)
  // ---------------------------
  const fetchClassOptions = useCallback(async (tid: string, m: "single" | "multi") => {
    setClassLoading(true);
    setClassError(null);

    try {
      // Prefer: server infers tenant
      let r = await fetch(`/api/classrooms/list?mode=${encodeURIComponent(m)}`, { cache: "no-store" });
      let j = await safeJson(r);

      // Fallback: old API expects tenantId
      if ((!r.ok || !Array.isArray(j?.items)) && tid) {
        const url = `/api/classrooms/list?tenantId=${encodeURIComponent(tid)}&mode=${encodeURIComponent(m)}`;
        r = await fetch(url, { cache: "no-store" });
        j = await safeJson(r);
      }

      let items: ClassroomOption[] = [];
      if (r.ok && Array.isArray(j?.items)) {
        items = j.items.map((x: any) => ({
          id: String(x.id),
          label: String(x.label || ""),
        }));
      }

      setClassOptions(items);

      if (!items.length) {
        setClassroomId("");
        setClassError("No classrooms found. Use the class seeding tools to create KG–JHS classes.");
      } else {
        setClassroomId((prev) => {
          const existing = items.find((c) => c.id === prev);
          return existing ? existing.id : items[0].id;
        });
      }
    } catch {
      setClassOptions([]);
      setClassroomId("");
      setClassError("Failed to load classrooms.");
    } finally {
      setClassLoading(false);
    }
  }, []);

  const seedClasses = useCallback(
    async (modeToSeed: "single" | "multi") => {
      if (!tenant?.id) return;

      setClassLoading(true);
      setClassError(null);

      try {
        // Prefer: no tenantId
        let r = await fetch("/api/classrooms/seed-canonical", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: modeToSeed }),
        });
        let j = await safeJson(r);

        // Fallback: old API expects tenantId
        if (!r.ok) {
          r = await fetch("/api/classrooms/seed-canonical", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tenantId: tenant.id, mode: modeToSeed }),
          });
          j = await safeJson(r);
        }

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
    },
    [tenant?.id, mode, fetchClassOptions]
  );

  useEffect(() => {
    if (tenant?.id) fetchClassOptions(tenant.id, mode);
  }, [tenant?.id, mode, fetchClassOptions]);

  // ---------------------------
  // Fee structures (prefer server-derived tenant, fallback to tenantId)
  // ---------------------------
  const loadStructures = useCallback(async () => {
    if (!tenant?.id) return;

    setStructuresLoading(true);
    setStructuresError(null);

    try {
      // Prefer: server infers tenant
      const params1 = new URLSearchParams();
      params1.set("term", term);
      params1.set("academicYear", academicYear);

      let r = await fetch(`/api/admin/fees/structures/list?${params1.toString()}`, { cache: "no-store" });
      let j = await safeJson(r);

      // Fallback: old API expects tenantId
      if ((!r.ok || !j?.ok) && tenant.id) {
        const params2 = new URLSearchParams();
        params2.set("tenantId", tenant.id);
        params2.set("term", term);
        params2.set("academicYear", academicYear);

        r = await fetch(`/api/admin/fees/structures/list?${params2.toString()}`, { cache: "no-store" });
        j = await safeJson(r);
      }

      if (!r.ok || !j?.ok) {
        setStructures([]);
        setSelectedStructureId("");
        setStructuresError(j?.error || "Failed to load fee structures for this term/year. Please try again.");
        return;
      }

      const items = Array.isArray(j.items) ? (j.items as FeeStructureSummary[]) : [];
      setStructures(items);

      if (!items.length) {
        setSelectedStructureId("");
      } else {
        setSelectedStructureId((prev) => {
          const stillExists = items.find((s) => s.id === prev);
          return stillExists ? prev : items[0].id;
        });
      }
    } catch {
      setStructures([]);
      setSelectedStructureId("");
      setStructuresError("Network or server error while loading fee structures.");
    } finally {
      setStructuresLoading(false);
    }
  }, [tenant?.id, term, academicYear]);

  useEffect(() => {
    if (tenant?.id) loadStructures();
  }, [tenant?.id, term, academicYear, loadStructures]);

  // ---------------------------
  // Invoices list (prefer server-derived tenant, fallback to tenantId)
  // ---------------------------
  const loadInvoices = useCallback(async () => {
    if (!tenant?.id || !term || !academicYear) return;

    setInvoicesLoading(true);
    setInvoicesError(null);
    setInfo(null);

    try {
      // Prefer: server infers tenant
      const params1 = new URLSearchParams();
      params1.set("term", term);
      params1.set("academicYear", academicYear);
      if (classroomId) params1.set("classroomId", classroomId);

      let r = await fetch(`/api/admin/fees/invoices/list?${params1.toString()}`, { cache: "no-store" });
      let j = await safeJson(r);

      // Fallback: old API expects tenantId
      if ((!r.ok || !j?.ok) && tenant.id) {
        const params2 = new URLSearchParams();
        params2.set("tenantId", tenant.id);
        params2.set("term", term);
        params2.set("academicYear", academicYear);
        if (classroomId) params2.set("classroomId", classroomId);

        r = await fetch(`/api/admin/fees/invoices/list?${params2.toString()}`, { cache: "no-store" });
        j = await safeJson(r);
      }

      if (!r.ok || !j?.ok) {
        setInvoices([]);
        setInvoicesError(j?.error || "Failed to load fee invoices. Please try again.");
        return;
      }

      const items = Array.isArray(j.items) ? (j.items as FeeInvoiceRow[]) : [];
      setInvoices(items);

      if (!items.length) {
        setInfo("No invoices found for this class/term/year yet. Generate invoices above.");
      }
    } catch {
      setInvoices([]);
      setInvoicesError("Network or server error while loading fee invoices.");
    } finally {
      setInvoicesLoading(false);
    }
  }, [tenant?.id, term, academicYear, classroomId]);

  // Auto-load invoices when ready (DO NOT require classroomId; list supports all/optional filter)
  useEffect(() => {
    if (tenant?.id && term && academicYear) loadInvoices();
  }, [tenant?.id, classroomId, term, academicYear, loadInvoices]);

  // ---------------------------
  // Generate invoices (prefer server-derived tenant, fallback to tenantId)
  // ---------------------------
  async function handleGenerateInvoices() {
    if (!tenant?.id || !classroomId || !term || !academicYear) return;

    if (!selectedStructureId) {
      setInfo("Please choose a fee structure for this term and year before generating invoices.");
      return;
    }

    setGenerateLoading(true);
    setInfo(null);
    setInvoicesError(null);

    try {
      // NOTE: server ignores term/year here; it derives from FeeStructure (correct).
      // Keep for back-compat / future UI logic.
      let body: any = { classroomId, term, academicYear, feeStructureId: selectedStructureId };

      // Prefer: no tenantId
      let r = await fetch("/api/admin/fees/invoices/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      let j = await safeJson(r);

      // Fallback: old API expects tenantId
      if ((!r.ok || !j?.ok) && tenant.id) {
        body = { ...body, tenantId: tenant.id };
        r = await fetch("/api/admin/fees/invoices/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        j = await safeJson(r);
      }

      if (!r.ok || !j?.ok) {
        setInvoicesError(j?.error || "Failed to generate fee invoices. Please try again.");
        return;
      }

      setInfo(
        `Invoices generated using "${j.structureName}" for ${term}, ${academicYear}. Created: ${
          j.createdCount ?? 0
        }, already existed: ${j.existingCount ?? 0}, learners: ${j.totalLearners ?? 0}.`
      );

      await loadInvoices();
    } catch {
      setInvoicesError("Network or server error while generating invoices.");
    } finally {
      setGenerateLoading(false);
    }
  }

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
      classLabel: inv.classLabel ?? undefined,
      balancePesewas: inv.balancePesewas || 0,
    });
  }

  function closePaymentModal() {
    setPaymentModal((prev) => ({ ...prev, open: false }));
  }

  // ---------------------------
  // Record payment (prefer server-derived tenant, fallback to tenantId)
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

    if (pesewas > (paymentModal.balancePesewas || 0)) {
      setPaymentError("Payment is larger than the remaining balance. Adjust the amount.");
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);

    try {
      // Prefer: no tenantId
      let body: any = {
        invoiceId: paymentModal.invoiceId,
        amountPesewas: pesewas,
        method: paymentMethod || "cash",
        reference: paymentReference || undefined,
        channel: paymentChannel || "office",
      };

      let r = await fetch("/api/admin/fees/payments/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      let j = await safeJson(r);

      // Fallback: old API expects tenantId
      if ((!r.ok || !j?.ok) && tenant.id) {
        body = { ...body, tenantId: tenant.id };
        r = await fetch("/api/admin/fees/payments/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        j = await safeJson(r);
      }

      if (!r.ok || !j?.ok) {
        setPaymentError(j?.error || "Failed to record payment. Please try again.");
        return;
      }

      closePaymentModal();
      await loadInvoices();
      setInfo("Payment recorded successfully and balances updated.");
    } catch {
      setPaymentError("Network or server error while recording payment.");
    } finally {
      setPaymentLoading(false);
    }
  }

  const summary = useMemo(() => {
    const totalInvoices = invoices.length;
    const totalBilled = invoices.reduce((sum, inv) => sum + (inv.amountBilledPesewas || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.totalPaidPesewas || 0), 0);
    const totalBalance = invoices.reduce((sum, inv) => sum + (inv.balancePesewas || 0), 0);
    return { totalInvoices, totalBilled, totalPaid, totalBalance };
  }, [invoices]);

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Fees — Invoices &amp; Payments</h1>
        <p className="text-sm text-[#C9CDD6] max-w-3xl">
          Create and manage per-learner invoices, track payments, and see clear balances — calm and transparent.
        </p>

        {tenant && (
          <p className="text-xs text-[#8F98A8]">
            School: <span className="font-semibold text-[#C9CDD6]">{tenant.name}</span>
          </p>
        )}

        {tenantLoading && <p className="text-xs text-[#8F98A8]">Loading school context…</p>}

        {tenantError && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded-xl px-3 py-2">{tenantError}</p>
        )}

        {setupComplete === false && (
          <p className="text-xs text-amber-300 bg-amber-900/20 border border-amber-500/30 rounded-xl px-3 py-2">
            Admin setup is not completed yet. Term/academic year defaults may be wrong. Complete Admin → Setup to lock
            them properly.
          </p>
        )}
      </header>

      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Term &amp; Academic Year</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-900 mb-1">Term</label>
                <select
                  className="border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  <option>1st Term</option>
                  <option>2nd Term</option>
                  <option>3rd Term</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-900 mb-1">Academic year</label>
                <input
                  type="text"
                  className="border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="e.g. 2025/2026"
                />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 max-w-md">
              These filters control both the fee structures and invoices shown below.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Class selection</div>
            <div className="flex items-center gap-2 mb-2">
              <button
                className={`${btnOutline} h-8 px-3 ${mode === "single" ? "ring-2 ring-zinc-800" : ""}`}
                onClick={() => setMode("single")}
                disabled={classLoading}
                type="button"
              >
                Single-stream
              </button>
              <button
                className={`${btnOutline} h-8 px-3 ${mode === "multi" ? "ring-2 ring-zinc-800" : ""}`}
                onClick={() => setMode("multi")}
                disabled={classLoading}
                type="button"
              >
                Multi-stream (A–D)
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-900 mb-1">Classroom</label>
                {classLoading ? (
                  <div className="h-9 rounded-xl border bg-zinc-50 animate-pulse" />
                ) : classOptions.length ? (
                  <select
                    className="w-full border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400"
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
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Quick seeding</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={btnOutline}
                    onClick={() => seedClasses("single")}
                    disabled={!tenant?.id || classLoading}
                    type="button"
                  >
                    Seed KG1 → JHS3 (single)
                  </button>
                  <button
                    className={btnOutline}
                    onClick={() => seedClasses("multi")}
                    disabled={!tenant?.id || classLoading}
                    type="button"
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

        <div className="border-t pt-3 mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Fee structure for this term/year
            </div>
            <button className={btnOutline} onClick={loadStructures} disabled={structuresLoading || !tenant?.id} type="button">
              Reload structures
            </button>
          </div>

          {structuresError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {structuresError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {structuresLoading && <span className="text-xs text-zinc-500">Loading fee structures…</span>}

            {!structuresLoading && !structures.length && !structuresError && (
              <p className="text-xs text-zinc-900">
                No fee structures found yet for{" "}
                <span className="font-semibold">
                  {term}, {academicYear}
                </span>
                . Create them first under Fees → Structures.
              </p>
            )}

            {!!structures.length && (
              <div className="flex flex-wrap gap-2">
                {structures.map((s) => {
                  const selected = s.id === selectedStructureId;
                  return (
                    <button
                      key={s.id}
                      className={`${btnOutline} ${selected ? "ring-2 ring-zinc-800" : ""}`}
                      onClick={() => setSelectedStructureId(s.id)}
                      type="button"
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

      <section className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1 text-sm text-zinc-900">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Invoice Summary</div>
            <div>
              Total invoices in view: <span className="font-semibold">{summary.totalInvoices}</span>
            </div>
            <div>
              Total billed: <span className="font-semibold">{formatMoneyFromPesewas(summary.totalBilled)}</span>
            </div>
            <div>
              Total paid: <span className="font-semibold">{formatMoneyFromPesewas(summary.totalPaid)}</span>
            </div>
            <div>
              Total outstanding:{" "}
              <span className="font-semibold text-red-700">{formatMoneyFromPesewas(summary.totalBalance)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={btnPrimary}
              onClick={handleGenerateInvoices}
              disabled={generateLoading || !tenant?.id || !classroomId || !term || !academicYear}
              type="button"
            >
              {generateLoading ? "Generating…" : "Generate invoices for this class"}
            </button>

            <button
              className={btnOutline}
              onClick={loadInvoices}
              disabled={invoicesLoading || !tenant?.id || !term || !academicYear}
              type="button"
            >
              {invoicesLoading ? "Loading…" : "Reload invoices"}
            </button>

            <button
              className={btnDanger}
              onClick={() => {
                setInvoices([]);
                setInvoicesError(null);
                setInfo("Cleared invoice list in the browser view. You can reload anytime.");
              }}
              type="button"
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

      <section className="border rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Invoices for <span className="font-semibold">{term}, {academicYear}</span> —{" "}
            {classOptions.find((c) => c.id === classroomId)?.label || "selected class"}
          </h2>
          {invoicesLoading && <span className="text-xs text-zinc-500">Loading invoices…</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm border rounded-xl overflow-hidden text-zinc-900">
            <thead className="bg-zinc-50 text-[11px] md:text-xs text-zinc-700">
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
              {invoices.map((inv) => {
                const fullyPaid = inv.balancePesewas <= 0;
                const partiallyPaid = inv.balancePesewas > 0 && inv.totalPaidPesewas > 0;
                const statusLabel = fullyPaid ? "Paid" : partiallyPaid ? "Partially paid" : "Not paid";

                const statusClasses = fullyPaid
                  ? "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-emerald-50 border-emerald-200 text-emerald-800"
                  : partiallyPaid
                  ? "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-amber-50 border-amber-200 text-amber-800"
                  : "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-red-50 border-red-200 text-red-800";

                return (
                  <tr key={inv.invoiceId} className="border-b last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">{inv.studentName || "Unnamed learner"}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-900">{inv.classLabel || "—"}</td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-900">
                      {inv.term}, {inv.academicYear}
                    </td>
                    <td className="px-3 py-2 align-top text-right">{formatMoneyFromPesewas(inv.amountBilledPesewas)}</td>
                    <td className="px-3 py-2 align-top text-right">{formatMoneyFromPesewas(inv.totalPaidPesewas)}</td>
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
                    <td className="px-3 py-2 align-top text-xs text-zinc-900">{formatDateShort(inv.lastPaymentAt)}</td>
                    <td className="px-3 py-2 align-top">
                      <span className={statusClasses}>{statusLabel}</span>
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        className={btnPrimary}
                        onClick={() => openPaymentModal(inv)}
                        disabled={inv.balancePesewas <= 0}
                        type="button"
                      >
                        {inv.balancePesewas <= 0 ? "Fully paid" : "Record payment"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!invoices.length && !invoicesLoading && !invoicesError && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-sm text-zinc-600">
                    No invoices in view. Generate invoices or adjust filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-zinc-500 max-w-3xl">
          This screen is a truthful ledger. Use it for clarity and planning, not pressure.
        </p>
      </section>

      {paymentModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Record payment — {paymentModal.studentName}</h2>
              <button className={btnOutline} onClick={closePaymentModal} disabled={paymentLoading} type="button">
                Close
              </button>
            </div>

            {paymentModal.classLabel && (
              <p className="text-xs text-zinc-900">
                Class: <span className="font-semibold">{paymentModal.classLabel}</span>
              </p>
            )}

            <p className="text-xs text-zinc-600">
              Current balance:{" "}
              <span className="font-semibold text-red-700">{formatMoneyFromPesewas(paymentModal.balancePesewas)}</span>
            </p>

            <div className="grid gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-900 mb-1">Amount (GH₵)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  className="w-full border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 150.00"
                  disabled={paymentLoading}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-900 mb-1">Method</label>
                <select
                  className="w-full border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400"
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
                <label className="block text-xs font-medium text-zinc-900 mb-1">Reference / receipt (optional)</label>
                <input
                  type="text"
                  className="w-full border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  disabled={paymentLoading}
                  placeholder="Receipt no. / transaction ref."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-900 mb-1">Channel</label>
                <select
                  className="w-full border border-zinc-300 rounded-xl h-9 px-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400"
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
              <button className={btnOutline} onClick={closePaymentModal} disabled={paymentLoading} type="button">
                Cancel
              </button>
              <button className={btnPrimary} onClick={handleSubmitPayment} disabled={paymentLoading} type="button">
                {paymentLoading ? "Recording…" : "Record payment"}
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 mt-1">Payments recorded here update balances immediately.</p>
          </div>
        </div>
      )}
    </main>
  );
}
