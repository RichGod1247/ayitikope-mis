// src/app/admin/setup/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type LoadResp = {
  ok?: boolean;
  error?: string;
  tenant: {
    id: string;
    name: string;
    schoolCode: string;
    slug: string;
    district: string | null;
    circuit: string | null;
    region: string | null;
    emisCode: string | null;
    gpsAddress: string | null;
    timezone: string | null;
    locale: string | null;
  };
  settings: {
    currentAcademicYear: string;
    currentTerm: string;

    term1Start: string;
    term1End: string;
    term2Start: string;
    term2End: string;
    term3Start: string;
    term3End: string;

    attendanceStartTime: string;
    attendanceEndTime: string;
    lateCutoffMinutes: number | null;

    feverThreshold: number | null;

    setupCompletedAt?: string | null;
    setupComplete?: boolean;
  };
};

type SaveResp = {
  ok?: boolean;
  error?: string;
  setupComplete?: boolean;
  setupCompletedAt?: string | null;
};

type MsgTone = "ok" | "error" | "info";

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const sectionCard =
  "rounded-[24px] border border-white/10 bg-[#07111F]/80 p-5 shadow-[0_12px_34px_rgba(0,0,0,0.18)]";
const inputBase =
  "h-10 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
const labelBase = "mb-1 block text-sm font-medium text-[#C9CDD6]";
const helperBase = "mt-2 text-xs text-[#8F98A8]";
const btnBase =
  "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary =
  `${btnBase} border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105`;
const btnOutline =
  `${btnBase} border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10`;

function toNumOrNull(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeNextPath(raw: string | null, fallback = "/admin/setup") {
  const v = String(raw ?? "").trim();
  if (!v) return fallback;
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//")) return fallback;
  if (v.includes("://")) return fallback;
  return v;
}

function normalizeTerm(raw: string) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "1st term" || v === "term 1" || v === "term1" || v === "1" || v === "first term") return "1st Term";
  if (v === "2nd term" || v === "term 2" || v === "term2" || v === "2" || v === "second term") return "2nd Term";
  if (v === "3rd term" || v === "term 3" || v === "term3" || v === "3" || v === "third term") return "3rd Term";
  return raw.trim();
}

function msgClasses(tone: MsgTone) {
  if (tone === "ok") return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  if (tone === "error") return "border-rose-300/20 bg-rose-400/12 text-rose-100";
  return "border-sky-300/20 bg-sky-400/12 text-sky-100";
}

function statusChip(label: string, tone: "ok" | "muted" = "muted") {
  const cls =
    tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : "border-white/10 bg-white/5 text-[#D7DCE5]";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export default function AdminSetupPage() {
  const sp = useSearchParams();

  const next = useMemo(() => safeNextPath(sp.get("next"), "/admin/setup"), [sp]);
  const explicitNext = useMemo(() => safeNextPath(sp.get("next"), ""), [sp]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<MsgTone>("info");

  const [tenantName, setTenantName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [setupCompletedAt, setSetupCompletedAt] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);

  const [currentAcademicYear, setCurrentAcademicYear] = useState("");
  const [currentTerm, setCurrentTerm] = useState("");

  const [term1Start, setTerm1Start] = useState("");
  const [term1End, setTerm1End] = useState("");
  const [term2Start, setTerm2Start] = useState("");
  const [term2End, setTerm2End] = useState("");
  const [term3Start, setTerm3Start] = useState("");
  const [term3End, setTerm3End] = useState("");

  const [attendanceStartTime, setAttendanceStartTime] = useState("");
  const [attendanceEndTime, setAttendanceEndTime] = useState("");
  const [lateCutoffMinutes, setLateCutoffMinutes] = useState<string>("");

  const [feverThreshold, setFeverThreshold] = useState<string>("");

  async function load() {
    setLoading(true);
    setMsg(null);

    try {
      const r = await fetch("/api/admin/setup/load", {
        cache: "no-store",
        credentials: "include",
      });

      const j = (await r.json().catch(() => ({}))) as any;

      const ok = r.ok && (j?.ok === undefined ? true : Boolean(j?.ok));
      if (!ok || !j?.tenant || !j?.settings) {
        setMsgTone("error");
        setMsg(j?.error || `Failed to load (${r.status})`);
        return;
      }

      const data = j as LoadResp;

      setTenantName(data.tenant.name || "");
      setSchoolCode(data.tenant.schoolCode || "");

      setCurrentAcademicYear(data.settings.currentAcademicYear || "");
      setCurrentTerm(normalizeTerm(data.settings.currentTerm || ""));

      setTerm1Start(data.settings.term1Start || "");
      setTerm1End(data.settings.term1End || "");
      setTerm2Start(data.settings.term2Start || "");
      setTerm2End(data.settings.term2End || "");
      setTerm3Start(data.settings.term3Start || "");
      setTerm3End(data.settings.term3End || "");

      setAttendanceStartTime(data.settings.attendanceStartTime || "");
      setAttendanceEndTime(data.settings.attendanceEndTime || "");
      setLateCutoffMinutes(data.settings.lateCutoffMinutes == null ? "" : String(data.settings.lateCutoffMinutes));
      setFeverThreshold(data.settings.feverThreshold == null ? "" : String(data.settings.feverThreshold));

      setSetupCompletedAt(data.settings.setupCompletedAt ?? null);
      setSetupComplete(Boolean(data.settings.setupComplete || data.settings.setupCompletedAt));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);

    try {
      const payload = {
        currentAcademicYear: currentAcademicYear.trim(),
        currentTerm: normalizeTerm(currentTerm),

        term1Start: term1Start.trim(),
        term1End: term1End.trim(),
        term2Start: term2Start.trim(),
        term2End: term2End.trim(),
        term3Start: term3Start.trim(),
        term3End: term3End.trim(),

        attendanceStartTime: attendanceStartTime.trim(),
        attendanceEndTime: attendanceEndTime.trim(),
        lateCutoffMinutes: toNumOrNull(lateCutoffMinutes),

        feverThreshold: toNumOrNull(feverThreshold),
      };

      const r = await fetch("/api/admin/setup/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const j = (await r.json().catch(() => ({}))) as SaveResp;

      if (!r.ok || !j?.ok) {
        setMsgTone("error");
        setMsg(j?.error || `Failed to save (${r.status})`);
        return;
      }

      const complete = Boolean(j.setupComplete);
      setSetupComplete(complete);
      if (j.setupCompletedAt !== undefined) setSetupCompletedAt(j.setupCompletedAt ?? null);

      if (complete && explicitNext && explicitNext !== "/admin/setup") {
        setMsgTone("ok");
        setMsg("Academic settings saved. Redirecting…");
        window.location.assign(next);
        return;
      }

      setMsgTone("ok");
      setMsg(
        complete
          ? "Academic settings saved."
          : "Saved as draft. Setup is not complete yet — finish required fields."
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="space-y-6">
      <header className={shellCard}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {statusChip("EduLife OS · Admin · Academic Settings", "ok")}
            {setupComplete ? statusChip("Setup completed", "ok") : statusChip("Setup in progress")}
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-[#F7F4ED]">Academic Settings</h1>
            <p className="mt-1 max-w-3xl text-sm text-[#C9CDD6]">
              Configure the school year, term dates, attendance window, and fever threshold.
              This is now a reusable settings page, not a one-time trapdoor.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-[11px] text-[#8F98A8]">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Redirect target: <span className="font-mono text-[#D7DCE5]">{next}</span>
            </span>
            {setupCompletedAt ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Completed at: <span className="text-[#D7DCE5]">{new Date(setupCompletedAt).toLocaleString()}</span>
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {msg ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${msgClasses(msgTone)}`}>
          {msg}
        </div>
      ) : null}

      {loading ? (
        <div className={`${sectionCard} text-sm text-[#C9CDD6]`}>Loading settings…</div>
      ) : (
        <>
          <section className={sectionCard}>
            <h2 className="mb-4 text-lg font-semibold text-[#F7F4ED]">School</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelBase}>School Name</label>
                <input className={`${inputBase} opacity-80`} value={tenantName} disabled />
              </div>
              <div>
                <label className={labelBase}>School Code</label>
                <input className={`${inputBase} opacity-80`} value={schoolCode} disabled />
              </div>
            </div>
          </section>

          <section className={sectionCard}>
            <h2 className="mb-4 text-lg font-semibold text-[#F7F4ED]">Academic</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelBase}>Current Academic Year</label>
                <input
                  className={inputBase}
                  value={currentAcademicYear}
                  onChange={(e) => setCurrentAcademicYear(e.target.value)}
                  placeholder="2025/2026"
                />
              </div>

              <div>
                <label className={labelBase}>Current Term</label>
                <select
                  className={inputBase}
                  value={currentTerm}
                  onChange={(e) => setCurrentTerm(e.target.value)}
                >
                  <option value="" className="bg-[#05070B] text-[#F7F4ED]">
                    — Select term —
                  </option>
                  <option value="1st Term" className="bg-[#05070B] text-[#F7F4ED]">
                    1st Term
                  </option>
                  <option value="2nd Term" className="bg-[#05070B] text-[#F7FED]">
                    2nd Term
                  </option>
                  <option value="3rd Term" className="bg-[#05070B] text-[#F7F4ED]">
                    3rd Term
                  </option>
                </select>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#05070B] p-4">
                <div className="mb-3 text-sm font-semibold text-[#F7F4ED]">Term 1</div>
                <label className={labelBase}>Start</label>
                <input
                  type="date"
                  className={inputBase}
                  value={term1Start}
                  onChange={(e) => setTerm1Start(e.target.value)}
                />
                <label className={`${labelBase} mt-3`}>End</label>
                <input
                  type="date"
                  className={inputBase}
                  value={term1End}
                  onChange={(e) => setTerm1End(e.target.value)}
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#05070B] p-4">
                <div className="mb-3 text-sm font-semibold text-[#F7F4ED]">Term 2</div>
                <label className={labelBase}>Start</label>
                <input
                  type="date"
                  className={inputBase}
                  value={term2Start}
                  onChange={(e) => setTerm2Start(e.target.value)}
                />
                <label className={`${labelBase} mt-3`}>End</label>
                <input
                  type="date"
                  className={inputBase}
                  value={term2End}
                  onChange={(e) => setTerm2End(e.target.value)}
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#05070B] p-4">
                <div className="mb-3 text-sm font-semibold text-[#F7F4ED]">Term 3</div>
                <label className={labelBase}>Start</label>
                <input
                  type="date"
                  className={inputBase}
                  value={term3Start}
                  onChange={(e) => setTerm3Start(e.target.value)}
                />
                <label className={`${labelBase} mt-3`}>End</label>
                <input
                  type="date"
                  className={inputBase}
                  value={term3End}
                  onChange={(e) => setTerm3End(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className={sectionCard}>
            <h2 className="mb-4 text-lg font-semibold text-[#F7F4ED]">Attendance</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className={labelBase}>Start Time</label>
                <input
                  type="time"
                  className={inputBase}
                  value={attendanceStartTime}
                  onChange={(e) => setAttendanceStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className={labelBase}>End Time</label>
                <input
                  type="time"
                  className={inputBase}
                  value={attendanceEndTime}
                  onChange={(e) => setAttendanceEndTime(e.target.value)}
                />
              </div>
              <div>
                <label className={labelBase}>Late Cutoff Minutes</label>
                <input
                  type="number"
                  min={0}
                  className={inputBase}
                  value={lateCutoffMinutes}
                  onChange={(e) => setLateCutoffMinutes(e.target.value)}
                  placeholder="15"
                />
              </div>
            </div>
          </section>

          <section className={sectionCard}>
            <h2 className="mb-4 text-lg font-semibold text-[#F7F4ED]">Health</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelBase}>Fever Threshold (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  min={30}
                  max={45}
                  className={inputBase}
                  value={feverThreshold}
                  onChange={(e) => setFeverThreshold(e.target.value)}
                  placeholder="37.8"
                />
                <p className={helperBase}>Valid range: 30.0–45.0. Server still enforces the final rule.</p>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Settings"}
            </button>

            <button className={btnOutline} onClick={load} disabled={saving}>
              Reload
            </button>

            <span className="text-xs text-[#8F98A8]">
              This page remains editable after initial setup.
            </span>
          </div>
        </>
      )}
    </section>
  );
}