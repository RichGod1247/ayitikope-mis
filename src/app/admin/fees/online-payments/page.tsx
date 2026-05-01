// src/app/admin/fees/online-payments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Bank = {
  name: string;
  code: string;
  slug: string | null;
  type: string | null;
  currency: string | null;
};

type SettlementAccount = {
  id: string;
  provider: string;
  providerSubaccountCode: string | null;
  bankName: string | null;
  accountName: string;
  accountNumberLast4: string | null;
  currency: string;
  status: string;
  isPrimary: boolean;
  approvedAt: string | null;
  createdAt: string;
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function bankKey(bank: Bank) {
  return `${bank.code}::${bank.slug || bank.name}::${bank.currency || "GHS"}`;
}

export default function AdminOnlinePaymentsPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankValue, setBankValue] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [created, setCreated] = useState<SettlementAccount | null>(null);

  const selectedBank = useMemo(() => {
    if (!bankValue) return null;
    return banks.find((b) => bankKey(b) === bankValue) ?? null;
  }, [bankValue, banks]);

  async function loadBanks() {
    setLoadingBanks(true);
    setMsg(null);

    try {
      const r = await fetch("/api/admin/paystack/banks", { cache: "no-store" });
      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setMsg(j?.error || `Failed to load banks (${r.status})`);
        setBanks([]);
        return;
      }

      const safeBanks: Bank[] = Array.isArray(j.items)
        ? j.items
            .map((b: any) => ({
              name: clean(b.name),
              code: clean(b.code),
              slug: clean(b.slug) || null,
              type: clean(b.type) || null,
              currency: clean(b.currency) || "GHS",
            }))
            .filter((b: Bank) => b.name && b.code && b.currency === "GHS")
        : [];

      setBanks(safeBanks);
    } catch {
      setMsg("Network/server error loading banks.");
      setBanks([]);
    } finally {
      setLoadingBanks(false);
    }
  }

  async function submit() {
    setMsg(null);
    setCreated(null);

    if (!selectedBank) {
      setMsg("Choose your school bank.");
      return;
    }

    const digits = accountNumber.replace(/\D/g, "");
    const acctName = clean(accountName);

    if (digits.length < 6 || digits.length > 20) {
      setMsg("Enter a valid account number.");
      return;
    }

    if (!acctName) {
      setMsg("Enter the account name exactly as held by the bank.");
      return;
    }

    setSubmitting(true);

    try {
      const r = await fetch("/api/admin/paystack/create-subaccount", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bankCode: selectedBank.code,
          bankName: selectedBank.name,
          accountNumber: digits,
          accountName: acctName,
        }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setMsg(j?.message || j?.error || `Setup failed (${r.status})`);
        return;
      }

      setCreated(j.settlementAccount);
      setMsg("Online fee payments have been enabled for your school.");
      setBankValue("");
      setAccountNumber("");
      setAccountName("");
    } catch {
      setMsg("Network/server error enabling online payments.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    loadBanks();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Fees · Online Payments
          </p>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
            Enable Parent Online Fee Payments
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Connect your school’s bank account so parent fee payments can be routed
            through EduLife OS into the school’s own settlement destination.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Choose your bank by name. EduLife OS will handle the Paystack bank code
            safely in the background. Do not enter someone else’s account details.
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              School bank
            </label>

            <select
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
              value={bankValue}
              onChange={(e) => setBankValue(e.target.value)}
              disabled={loadingBanks || submitting}
            >
              <option value="">
                {loadingBanks
                  ? "Loading banks…"
                  : banks.length === 0
                    ? "No Ghana banks available"
                    : "Select bank"}
              </option>

              {banks.map((bank) => (
                <option key={bankKey(bank)} value={bankKey(bank)}>
                  {bank.name}
                </option>
              ))}
            </select>

            <p className="text-[11px] text-slate-500">
              Bank codes are loaded securely from Paystack and never typed manually.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Account number
              </label>
              <input
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Enter school account number"
                inputMode="numeric"
                autoComplete="off"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Account name
              </label>
              <input
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Account name as held by bank"
                autoComplete="organization"
                disabled={submitting}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={submitting || loadingBanks || banks.length === 0}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? "Enabling…" : "Enable Online Fee Payments"}
          </button>

          {msg ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {msg}
            </div>
          ) : null}

          {created ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <div className="font-semibold">Settlement account created</div>
              <div className="mt-2">
                Bank: {created.bankName || "—"}
                <br />
                Account: {created.accountName} · ****
                {created.accountNumberLast4 || "—"}
                <br />
                Status: {created.status}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}