// src/app/admin/tools/sms-templates/attendance-health/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

const DEFAULT_SAMPLE_TEMPLATE = `
Dear Parent/Guardian, this is {{schoolName}}.

{{studentName}}'s attendance for {{classLabel}} on {{date}} was recorded as: {{statusLabel}}. {{temperature}} {{symptoms}}

This message is for your awareness only. Please check on your child and contact the class teacher if you have any questions. Thank you.
`.trim();

type MeTenant = { id: string; name: string; slug?: string | null };

type TemplateResponse = {
  ok: boolean;
  tenantId?: string;
  tenantName?: string;
  template?: string;
  usesDefault?: boolean;
  isDefault?: boolean;
  error?: string;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeTenant(x: any): MeTenant | null {
  const id = cleanStr(x?.id ?? x?.tenantId);
  if (!id) return null;
  const name = cleanStr(x?.name ?? x?.tenantName) || "School";
  const slug = (x?.slug ?? x?.tenantSlug ?? null) as string | null;
  return { id, name, slug };
}

function extractTenantsFromMe(j: any): MeTenant[] {
  const memberships =
    (Array.isArray(j?.memberships) && j.memberships) ||
    (Array.isArray(j?.user?.memberships) && j.user.memberships) ||
    [];

  const list: MeTenant[] = [];

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
  const out: MeTenant[] = [];
  for (const t of list) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

function pickActiveTenantFromMe(j: any): MeTenant | null {
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

function renderPreview(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => String(vars[key] ?? ""));
}

async function readJson(res: Response) {
  return (await res.json().catch(() => null)) as any;
}

function looksLikeTenantRequired(err: any) {
  const s = String(err?.error ?? err?.message ?? err ?? "");
  return /tenantid/i.test(s) || /tenant.*required/i.test(s);
}

export default function AttendanceHealthTemplatePage() {
  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [templateText, setTemplateText] = useState(DEFAULT_SAMPLE_TEMPLATE);

  const [loading, setLoading] = useState(false);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Bootstrap tenant from /api/me (session-scoped)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTenantLoading(true);
      setError(null);

      try {
        const r = await fetch("/api/me", {
          cache: "no-store",
          credentials: "include",
          headers: { "Cache-Control": "no-store" },
        });

        if (r.status === 401) {
          if (!cancelled) setError("You must be signed in to manage SMS templates.");
          return;
        }

        const j = await r.json().catch(() => ({}));
        const t = pickActiveTenantFromMe(j);

        if (!t?.id) {
          if (!cancelled) {
            setError("Could not determine your active school/tenant. Ensure your account is assigned to a school.");
          }
          return;
        }

        if (!cancelled) {
          setTenantId(t.id);
          setTenantName(t.name || "School");
        }
      } catch {
        if (!cancelled) setError("Failed to load your school context.");
      } finally {
        if (!cancelled) setTenantLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadTemplate() {
    if (!tenantId) return;

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      // session-scoped first
      let r = await fetch("/api/admin/sms/templates/attendance-health", {
        cache: "no-store",
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });
      let j = (await readJson(r)) as TemplateResponse;

      // backward compat: retry with tenantId if required
      if (!r.ok && looksLikeTenantRequired(j)) {
        const params = new URLSearchParams();
        params.set("tenantId", tenantId);
        r = await fetch(`/api/admin/sms/templates/attendance-health?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
          headers: { "Cache-Control": "no-store" },
        });
        j = (await readJson(r)) as TemplateResponse;
      }

      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to load attendance/health template. Please try again.");
        return;
      }

      if (j.tenantName) setTenantName(j.tenantName);
      setTemplateText(j.template || DEFAULT_SAMPLE_TEMPLATE);

      const usesDefault = !!(j.usesDefault ?? j.isDefault);
      setInfo(usesDefault ? "Using default template. You can customise it below and click Save." : null);
    } catch {
      setError("Network or server error loading attendance/health template. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tenantId) loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleSave() {
    if (!tenantId) {
      setError("Tenant is not ready yet. Please reload the page.");
      return;
    }

    const trimmed = templateText.trim();
    if (!trimmed) {
      setError("Template body must not be empty.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      // session-scoped first
      let r = await fetch("/api/admin/sms/templates/attendance-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ template: trimmed }),
      });
      let j = await readJson(r);

      // backward compat: retry with tenantId if required
      if (!r.ok && looksLikeTenantRequired(j)) {
        r = await fetch("/api/admin/sms/templates/attendance-health", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenantId, template: trimmed }),
        });
        j = await readJson(r);
      }

      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to save attendance/health template. Please try again.");
        return;
      }

      setInfo("Template saved successfully.");
    } catch {
      setError("Network or server error saving attendance/health template. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const previewText = useMemo(() => {
    const sampleVars: Record<string, string> = {
      schoolName: tenantName || "Ayitikope M/A Basic School",
      studentName: "Test Student",
      status: "ABSENT",
      statusLabel: "ABSENT",
      classLabel: "JHS 1",
      date: "14/11/2025",
      temperature: "38.2 deg C",
      symptoms: "Headache, Cough",
    };
    return renderPreview(templateText || DEFAULT_SAMPLE_TEMPLATE, sampleVars);
  }, [templateText, tenantName]);

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">SMS Template – Attendance & Daily Health Alerts</h1>
        <p className="text-sm text-zinc-600 max-w-3xl wrap-break-word">
          This template controls the{" "}
          <span className="font-semibold">SMS sent to parents when a child is absent or has a fever</span>{" "}
          (via the teacher attendance page). Messages are designed to be{" "}
          <span className="font-semibold">gentle, non-shaming, and awareness-focused</span>.
        </p>
      </header>

      <section className="border rounded-xl p-4 space-y-4 bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Context</div>
            <div className="text-sm">
              Tenant / School:{" "}
              <span className="font-semibold">{tenantLoading ? "Loading..." : tenantName || "School"}</span>
            </div>
          </div>
          <button className={btnOutline} onClick={loadTemplate} disabled={loading || tenantLoading || !tenantId}>
            {loading ? "Reloading…" : "Reload Template"}
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>
        )}
        {info && !error && (
          <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">{info}</div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Template Body</h2>
              <span className="text-xs text-zinc-500">
                Tags:&nbsp;
                <code className="bg-zinc-100 px-1 rounded">{"{{schoolName}}"}</code>,{" "}
                <code className="bg-zinc-100 px-1 rounded">{"{{studentName}}"}</code>,{" "}
                <code className="bg-zinc-100 px-1 rounded">{"{{classLabel}}"}</code>,{" "}
                <code className="bg-zinc-100 px-1 rounded">{"{{date}}"}</code>,{" "}
                <code className="bg-zinc-100 px-1 rounded">{"{{status}}"}</code>,{" "}
                <code className="bg-zinc-100 px-1 rounded">{"{{statusLabel}}"}</code>,{" "}
                <code className="bg-zinc-100 px-1 rounded">{"{{temperature}}"}</code>,{" "}
                <code className="bg-zinc-100 px-1 rounded">{"{{symptoms}}"}</code>
              </span>
            </div>

            <textarea
              className="w-full min-h-[260px] border rounded-xl p-3 text-sm font-mono leading-relaxed"
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              disabled={tenantLoading || loading}
            />

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-500 max-w-sm wrap-break-word">
                <span className="font-semibold">Ethics guardrail:</span> Avoid blame or fear. Aim for calm awareness and early support.
              </p>
              <button className={btnPrimary} onClick={handleSave} disabled={saving || loading || tenantLoading || !tenantId}>
                {saving ? "Saving…" : "Save Template"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Preview (example data)</h2>
            <div className="border rounded-xl p-3 bg-zinc-50 text-sm whitespace-pre-wrap wrap-break-word">{previewText}</div>
            <p className="text-xs text-zinc-500 max-w-sm wrap-break-word">
              Preview uses sample data. Actual SMS uses real attendance + health entries.
            </p>
          </div>
        </div>

        <p className="text-xs text-zinc-500 max-w-3xl wrap-break-word">
          Note: Messages currently send in <span className="font-semibold">test mode</span> to your configured{" "}
          <code className="bg-zinc-100 px-1 rounded">TEST_SMS_TO</code> number until you switch modes intentionally.
        </p>
      </section>
    </main>
  );
}
