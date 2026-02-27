// src/app/admin/tools/sms-templates/fees-arrears/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TenantOption = { id: string; name: string };

type MeOk = { ok: true; tenantId: string; tenant?: { name: string } | null };
type MeFail = { ok: false; error: string };

const btnBase =
  "inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;

const SAMPLE_VARS = {
  studentName: "Test Student",
  className: "JHS 1",
  term: "3rd Term 2025",
  amountDue: "150.00",
  dueDate: "30/11/2025",
  schoolName: "Ayitikope M/A Basic School",
};

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => vars[key] ?? "");
}

async function readJson(res: Response) {
  return (await res.json().catch(() => null)) as any;
}

function looksLikeTenantRequired(err: any) {
  const s = String(err?.error ?? err?.message ?? err ?? "");
  return /tenantid/i.test(s) || /tenant.*required/i.test(s);
}

export default function FeesArrearsTemplatePage() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState<string | null>(null);

  const [template, setTemplate] = useState("");
  const [isDefault, setIsDefault] = useState<boolean | null>(null);

  const [loadingCtx, setLoadingCtx] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [needsPick, setNeedsPick] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  // Load active tenant from /api/me (session-scoped)
  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      setLoadingCtx(true);
      setError(null);
      setMsg(null);
      setNeedsPick(false);
      setNeedsLogin(false);

      try {
        const r = await fetch("/api/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Cache-Control": "no-store" },
          signal: ac.signal,
        });

        const j = (await r.json().catch(() => null)) as (MeOk | MeFail) | null;

        if (!r.ok || !j || typeof j !== "object") {
          setError("Failed to load tenant context.");
          return;
        }

        if ((j as any).ok !== true) {
          const err = (j as any).error;
          if (err === "UNAUTHENTICATED") {
            setNeedsLogin(true);
            setError("Please sign in to manage templates.");
            return;
          }
          if (err === "TENANT_REQUIRED") {
            setNeedsPick(true);
            setError("Select your school to continue.");
            return;
          }
          setError(err || "Failed to load tenant context.");
          return;
        }

        const tid = (j as any).tenantId as string;
        if (!tid) {
          setNeedsPick(true);
          setError("Select your school to continue.");
          return;
        }

        const tname = (j as any)?.tenant?.name ?? "School";
        setTenantId(tid);
        setTenantName(tname);
        setTenants([{ id: tid, name: tname }]); // MVP: active tenant only
      } catch {
        if (!ac.signal.aborted) setError("Failed to load tenant context.");
      } finally {
        if (!ac.signal.aborted) setLoadingCtx(false);
      }
    })();

    return () => ac.abort();
  }, []);

  async function loadTemplateForTenant(tid: string) {
    if (!tid) return;

    setLoadingTemplate(true);
    setError(null);
    setMsg(null);

    try {
      // Try session-scoped endpoint first (no tenantId param)
      let r = await fetch("/api/admin/sms/templates/fees-arrears", {
        cache: "no-store",
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });
      let j = await readJson(r);

      // Backward compat: if server still requires tenantId, retry with it
      if (!r.ok && looksLikeTenantRequired(j)) {
        const url = `/api/admin/sms/templates/fees-arrears?tenantId=${encodeURIComponent(tid)}`;
        r = await fetch(url, { cache: "no-store", credentials: "include", headers: { "Cache-Control": "no-store" } });
        j = await readJson(r);
      }

      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to load template.");
        return;
      }

      setTemplate(j.template || "");
      setIsDefault(!!(j.isDefault ?? j.usesDefault));
      setTenantName(j.tenantName || tenantName || null);
    } catch {
      setError("Failed to load template.");
    } finally {
      setLoadingTemplate(false);
    }
  }

  useEffect(() => {
    if (tenantId) loadTemplateForTenant(tenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const previewText = useMemo(() => {
    if (!template) return "";
    return applyTemplate(template, SAMPLE_VARS);
  }, [template]);

  async function handleSave() {
    if (!tenantId || !template.trim()) {
      setError("Template cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);
    setMsg(null);

    try {
      // Try session-scoped first (no tenantId in body)
      let r = await fetch("/api/admin/sms/templates/fees-arrears", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ template }),
      });

      let j = await readJson(r);

      // Backward compat: retry with tenantId if server still requires it
      if (!r.ok && looksLikeTenantRequired(j)) {
        r = await fetch("/api/admin/sms/templates/fees-arrears", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenantId, template }),
        });
        j = await readJson(r);
      }

      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to save template.");
        return;
      }

      setMsg("Template saved successfully.");
      setIsDefault(false);
    } catch {
      setError("Network or server error while saving template.");
    } finally {
      setSaving(false);
    }
  }

  if (needsLogin) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-2">
        <div className="text-sm text-red-700">{error}</div>
        <a className="text-sm underline" href="/auth/signin">
          Go to sign in
        </a>
      </div>
    );
  }

  if (needsPick) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-2">
        <div className="text-sm text-zinc-700">{error}</div>
        <a className="text-sm underline" href="/app/dashboard">
          Go to school selector
        </a>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">SMS Template — Fees Arrears Reminder</h1>
        <p className="text-sm text-zinc-600">
          Define the <span className="font-semibold">exact wording</span> used when EduLife OS sends fee arrears reminders to parents/guardians.
        </p>
        <p className="text-xs text-zinc-500">
          Goal: <span className="font-semibold">inform</span> without shame, <span className="font-semibold">encourage</span> without fear, and keep families safe — even as the school stays financially healthy.
        </p>
      </header>

      <section className="border rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold mb-1">Tenant</div>
            <p className="text-xs text-zinc-600">
              MVP rule: templates are edited for your <span className="font-semibold">active school</span>.
            </p>
          </div>
          <div className="min-w-[220px]">
            {loadingCtx ? (
              <div className="h-10 rounded-xl border bg-zinc-50 animate-pulse" />
            ) : tenants.length ? (
              <select className="w-full border rounded-xl p-2 h-10 text-sm" value={tenantId} disabled>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-red-600">No tenant context found.</div>
            )}
          </div>
        </div>
      </section>

      <section className="border rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold mb-1">Fees arrears SMS template</div>
            <p className="text-xs text-zinc-600">Placeholders you can use:</p>
            <ul className="text-xs text-zinc-600 list-disc list-inside mt-1">
              <li>
                <code className="font-mono text-[0.7rem]">{"{{studentName}}"}</code> – student&apos;s full name
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">{"{{className}}"}</code> – e.g., &quot;JHS 1&quot;
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">{"{{term}}"}</code> – e.g., &quot;3rd Term 2025&quot;
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">{"{{amountDue}}"}</code> – e.g., &quot;150.00&quot;
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">{"{{dueDate}}"}</code> – e.g., &quot;30/11/2025&quot;
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">{"{{schoolName}}"}</code> – the school&apos;s name
              </li>
            </ul>
          </div>
          <div className="text-right text-xs text-zinc-500">
            {tenantName && (
              <div>
                Editing template for: <span className="font-semibold">{tenantName}</span>
              </div>
            )}
            {isDefault === true && <div className="mt-1 text-amber-700">Currently using the <span className="font-semibold">default</span> template.</div>}
            {isDefault === false && <div className="mt-1 text-emerald-700">Using a <span className="font-semibold">custom</span> template.</div>}
            {loadingTemplate && <div className="mt-1 text-zinc-500">Loading template…</div>}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Template text <span className="ml-1 text-xs font-normal text-zinc-500">(approx. SMS body)</span>
            </label>
            <textarea
              className="w-full border rounded-xl p-3 h-64 text-sm font-mono leading-relaxed"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Write a kind, encouraging reminder to parents here..."
            />
            <p className="text-xs text-zinc-500">
              Tip: avoid threats, fear, or shaming language. Speak like a partner in the child&apos;s success.
            </p>
            <div className="flex gap-2">
              <button className={btnPrimary} onClick={handleSave} disabled={saving || !template.trim() || !tenantId}>
                {saving ? "Saving..." : "Save template"}
              </button>
              <button className={btnBase} onClick={() => tenantId && loadTemplateForTenant(tenantId)} disabled={!tenantId || loadingTemplate}>
                {loadingTemplate ? "Reloading..." : "Reload"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">Preview (with sample data)</label>
              <div className="text-xs text-zinc-500">How a parent might see it on their phone.</div>
            </div>
            <div className="border rounded-xl p-3 bg-zinc-50 text-sm whitespace-pre-wrap">
              {previewText || <span className="text-zinc-400">Start typing a template to see a live preview…</span>}
            </div>
            <div className="text-xs text-zinc-500">
              Sample values: {SAMPLE_VARS.studentName}, {SAMPLE_VARS.className}, {SAMPLE_VARS.term}, GHS{" "}
              {SAMPLE_VARS.amountDue}, {SAMPLE_VARS.dueDate}, {SAMPLE_VARS.schoolName}.
            </div>
          </div>
        </div>

        {msg && <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</div>}
        {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-words">{error}</div>}
      </section>
    </div>
  );
}
