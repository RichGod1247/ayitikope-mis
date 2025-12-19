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

type TemplateResponse = {
  ok: boolean;
  tenantId?: string;
  tenantName?: string;
  template?: string;
  usesDefault?: boolean;
  error?: string;
};

function renderPreview(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
    const v = vars[key] ?? "";
    return String(v);
  });
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

  // Bootstrap tenant from /api/test/tenants (same pattern as other pages)
  useEffect(() => {
    (async () => {
      setTenantLoading(true);
      try {
        const r = await fetch("/api/test/tenants");
        const j = await r.json().catch(() => ({}));
        const t = j?.tenants?.[0];

        if (t?.id) {
          setTenantId(t.id);
          setTenantName(t.name || "School");
        } else {
          setError(
            "Could not determine default tenant. Please configure tenants first."
          );
        }
      } catch {
        setError("Failed to load tenants.");
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  async function loadTemplate(tid: string) {
    if (!tid) return;
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const params = new URLSearchParams();
      params.set("tenantId", tid);

      const r = await fetch(
        `/api/admin/sms/templates/attendance-health?${params.toString()}`
      );
      const j = (await r.json().catch(() => ({}))) as TemplateResponse;

      if (!r.ok || !j.ok) {
        setError(
          j.error ||
            "Failed to load attendance/health template. Please try again or contact admin."
        );
        return;
      }

      if (j.tenantName) setTenantName(j.tenantName);
      setTemplateText(j.template || DEFAULT_SAMPLE_TEMPLATE);

      if (j.usesDefault) {
        setInfo(
          "Using default template. You can customise it below and click Save."
        );
      } else {
        setInfo(null);
      }
    } catch {
      setError(
        "Network or server error loading attendance/health template. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // Auto-load template once tenant is known
  useEffect(() => {
    if (tenantId) {
      loadTemplate(tenantId);
    }
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
      const r = await fetch("/api/admin/sms/templates/attendance-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          template: trimmed,
        }),
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setError(
          j?.error ||
            "Failed to save attendance/health template. Please try again."
        );
        return;
      }

      setInfo("Template saved successfully.");
    } catch {
      setError(
        "Network or server error saving attendance/health template. Please try again."
      );
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
        <h1 className="text-2xl font-bold">
          SMS Template – Attendance & Daily Health Alerts
        </h1>
        <p className="text-sm text-zinc-600 max-w-3xl wrap-break-word">
          This template controls the{" "}
          <span className="font-semibold">
            SMS sent to parents when a child is absent or has a fever
          </span>{" "}
          (via the teacher attendance page). Messages are designed to be{" "}
          <span className="font-semibold">
            gentle, non-shaming, and awareness-focused
          </span>{" "}
          rather than punitive.
        </p>
      </header>

      <section className="border rounded-xl p-4 space-y-4 bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Context
            </div>
            <div className="text-sm">
              Tenant / School:{" "}
              <span className="font-semibold">
                {tenantLoading ? "Loading..." : tenantName || "School"}
              </span>
            </div>
          </div>
          <button
            className={btnOutline}
            onClick={() => tenantId && loadTemplate(tenantId)}
            disabled={loading || tenantLoading || !tenantId}
          >
            {loading ? "Reloading…" : "Reload Template"}
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
            {info}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* Template editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Template Body</h2>
              <span className="text-xs text-zinc-500">
                Available tags:&nbsp;
                <code className="bg-zinc-100 px-1 rounded">
                  {"{{schoolName}}"}
                </code>
                ,{" "}
                <code className="bg-zinc-100 px-1 rounded">
                  {"{{studentName}}"}
                </code>
                ,{" "}
                <code className="bg-zinc-100 px-1 rounded">
                  {"{{classLabel}}"}
                </code>
                ,{" "}
                <code className="bg-zinc-100 px-1 rounded">
                  {"{{date}}"}
                </code>
                ,{" "}
                <code className="bg-zinc-100 px-1 rounded">
                  {"{{status}}"}
                </code>
                ,{" "}
                <code className="bg-zinc-100 px-1 rounded">
                  {"{{statusLabel}}"}
                </code>
                ,{" "}
                <code className="bg-zinc-100 px-1 rounded">
                  {"{{temperature}}"}
                </code>
                ,{" "}
                <code className="bg-zinc-100 px-1 rounded">
                  {"{{symptoms}}"}
                </code>
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
                <span className="font-semibold">Ethics guardrail:</span> Avoid
                blame or fear. Keep the tone calm, caring, and encouraging. The
                goal is{" "}
                <span className="font-semibold">
                  awareness and early support
                </span>
                , not pressure.
              </p>
              <button
                className={btnPrimary}
                onClick={handleSave}
                disabled={saving || loading || tenantLoading || !tenantId}
              >
                {saving ? "Saving…" : "Save Template"}
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Preview (example data)</h2>
            <div className="border rounded-xl p-3 bg-zinc-50 text-sm whitespace-pre-wrap wrap-break-word">
              {previewText}
            </div>
            <p className="text-xs text-zinc-500 max-w-sm wrap-break-word">
              Preview uses a sample student (
              <span className="font-semibold">Test Student</span>, JHS 1,
              38.2&nbsp;deg&nbsp;C, headache &amp; cough). Actual SMS content
              will use real data from the attendance/health entries the teacher
              records.
            </p>
          </div>
        </div>

        <p className="text-xs text-zinc-500 max-w-3xl wrap-break-word">
          Note: Messages currently send in{" "}
          <span className="font-semibold">test mode</span> to your configured{" "}
          <code className="bg-zinc-100 px-1 rounded">TEST_SMS_TO</code> number.
          No real parents receive alerts until you intentionally switch from
          test mode.
        </p>
      </section>
    </main>
  );
}
