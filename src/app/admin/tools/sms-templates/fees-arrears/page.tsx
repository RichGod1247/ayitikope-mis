// src/app/admin/tools/sms-templates/fees-arrears/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TenantOption = {
  id: string;
  name: string;
};

const btnBase =
  "inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

// For preview only
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

export default function FeesArrearsTemplatePage() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState<string | null>(null);

  const [template, setTemplate] = useState("");
  const [isDefault, setIsDefault] = useState<boolean | null>(null);

  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load tenants the same way test endpoints do: /api/test/tenants
  useEffect(() => {
    (async () => {
      setLoadingTenants(true);
      setError(null);
      try {
        const r = await fetch("/api/test/tenants");
        const j = await r.json().catch(() => ({}));

        const items: TenantOption[] = Array.isArray(j?.tenants)
          ? j.tenants.map((t: any) => ({
              id: String(t.id),
              name: t.name || "Unnamed tenant",
            }))
          : [];

        setTenants(items);
        if (items.length && !tenantId) {
          setTenantId(items[0].id);
          setTenantName(items[0].name);
        }
      } catch {
        setError("Failed to load tenants.");
      } finally {
        setLoadingTenants(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load template for selected tenant
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoadingTemplate(true);
      setError(null);
      setMsg(null);
      try {
        const url = `/api/admin/sms/templates/fees-arrears?tenantId=${encodeURIComponent(
          tenantId
        )}`;
        const r = await fetch(url);
        const j = await r.json().catch(() => ({}));

        if (!r.ok || !j?.ok) {
          setError(j?.error || "Failed to load template.");
          return;
        }

        setTemplate(j.template || "");
        setIsDefault(!!j.isDefault);
        setTenantName(j.tenantName || null);
      } catch {
        setError("Failed to load template.");
      } finally {
        setLoadingTemplate(false);
      }
    })();
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
      const r = await fetch("/api/admin/sms/templates/fees-arrears", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          template,
        }),
      });

      const j = await r.json().catch(() => ({}));

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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">
          SMS Template — Fees Arrears Reminder
        </h1>
        <p className="text-sm text-zinc-600">
          Here you define the{" "}
          <span className="font-semibold">exact wording</span> used when EduLife
          OS sends fee arrears reminders to parents/guardians.
        </p>
        <p className="text-xs text-zinc-500">
          Goal: <span className="font-semibold">inform</span> without shame,{" "}
          <span className="font-semibold">encourage</span> without fear, and
          keep families{" "}
          <span className="font-semibold">
            emotionally, mentally, and financially safe
          </span>
          — even as the school stays financially healthy.
        </p>
      </header>

      {/* Tenant selector */}
      <section className="border rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold mb-1">Select tenant</div>
            <p className="text-xs text-zinc-600">
              In future, this lets you manage templates for multiple schools.
              For now, it will default to your Ayitikope tenant.
            </p>
          </div>
          <div className="min-w-[220px]">
            {loadingTenants ? (
              <div className="h-10 rounded-xl border bg-zinc-50 animate-pulse" />
            ) : tenants.length ? (
              <select
                className="w-full border rounded-xl p-2 h-10 text-sm"
                value={tenantId}
                onChange={(e) => {
                  setTenantId(e.target.value);
                  const t = tenants.find((x) => x.id === e.target.value);
                  setTenantName(t?.name ?? null);
                }}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-red-600">
                No tenants found. Ensure /api/test/tenants works.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Template editor + preview */}
      <section className="border rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold mb-1">
              Fees arrears SMS template
            </div>
            <p className="text-xs text-zinc-600">
              You can use the following placeholders to keep messages personal
              but respectful:
            </p>
            <ul className="text-xs text-zinc-600 list-disc list-inside mt-1">
              <li>
                <code className="font-mono text-[0.7rem]">
                  {"{{studentName}}"}
                </code>{" "}
                – student&apos;s full name
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">
                  {"{{className}}"}
                </code>{" "}
                – e.g., &quot;JHS 1&quot;
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">
                  {"{{term}}"}
                </code>{" "}
                – e.g., &quot;3rd Term 2025&quot;
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">
                  {"{{amountDue}}"}
                </code>{" "}
                – e.g., &quot;150.00&quot;
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">
                  {"{{dueDate}}"}
                </code>{" "}
                – e.g., &quot;30/11/2025&quot;
              </li>
              <li>
                <code className="font-mono text-[0.7rem]">
                  {"{{schoolName}}"}
                </code>{" "}
                – the school&apos;s name
              </li>
            </ul>
          </div>
          <div className="text-right text-xs text-zinc-500">
            {tenantName && (
              <div>
                Editing template for:{" "}
                <span className="font-semibold">{tenantName}</span>
              </div>
            )}
            {isDefault === true && (
              <div className="mt-1 text-amber-700">
                Currently using the <span className="font-semibold">default</span>{" "}
                template.
              </div>
            )}
            {isDefault === false && (
              <div className="mt-1 text-emerald-700">
                Using a <span className="font-semibold">custom</span> template.
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Editor */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Template text
              <span className="ml-1 text-xs font-normal text-zinc-500">
                (approx. SMS body)
              </span>
            </label>
            <textarea
              className="w-full border rounded-xl p-3 h-64 text-sm font-mono leading-relaxed"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Write a kind, encouraging reminder to parents here..."
            />
            <p className="text-xs text-zinc-500">
              Tip: Avoid threats, deadlines with fear, or shaming language.
              Speak like a{" "}
              <span className="font-semibold">partner in the child&apos;s
              success</span>, not a debt collector.
            </p>
            <div className="flex gap-2">
              <button
                className={btnPrimary}
                onClick={handleSave}
                disabled={saving || !template.trim() || !tenantId}
              >
                {saving ? "Saving..." : "Save template"}
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">
                Preview (with sample data)
              </label>
              <div className="text-xs text-zinc-500">
                This is{" "}
                <span className="font-semibold">
                  how a parent might see it
                </span>{" "}
                on their phone.
              </div>
            </div>
            <div className="border rounded-xl p-3 bg-zinc-50 text-sm whitespace-pre-wrap">
              {previewText || (
                <span className="text-zinc-400">
                  Start typing a template to see a live preview…
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-500">
              Sample values: {SAMPLE_VARS.studentName}, {SAMPLE_VARS.className},{" "}
              {SAMPLE_VARS.term}, GHS {SAMPLE_VARS.amountDue}, {SAMPLE_VARS.dueDate},{" "}
              {SAMPLE_VARS.schoolName}.
            </div>
          </div>
        </div>

        {msg && (
          <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {msg}
          </div>
        )}
        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 wrap-break-word">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}
