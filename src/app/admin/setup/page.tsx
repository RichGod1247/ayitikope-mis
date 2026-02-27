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

const inputBase = "w-full border rounded-xl p-2 h-10 bg-white";
const labelBase = "block text-sm font-medium text-zinc-700 mb-1";
const card = "border rounded-2xl p-4 bg-white shadow-sm";

function toNumOrNull(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeNextPath(raw: string | null, fallback = "/admin/dashboard") {
  const v = String(raw ?? "").trim();
  if (!v) return fallback;
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//")) return fallback;
  if (v.includes("://")) return fallback;
  return v;
}

export default function AdminSetupPage() {
  const sp = useSearchParams();
  const next = useMemo(() => safeNextPath(sp.get("next"), "/admin/dashboard"), [sp]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [tenantName, setTenantName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");

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
      const r = await fetch("/api/admin/setup/load", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as any;

      // Accept both shapes:
      // (A) { ok:true, tenant, settings }  OR (B) { tenant, settings }
      const ok = r.ok && (j?.ok === undefined ? true : Boolean(j?.ok));
      if (!ok || !j?.tenant || !j?.settings) {
        setMsg(j?.error || `Failed to load (${r.status})`);
        return;
      }

      const data = j as LoadResp;

      setTenantName(data.tenant.name || "");
      setSchoolCode(data.tenant.schoolCode || "");

      setCurrentAcademicYear(data.settings.currentAcademicYear || "");
      setCurrentTerm(data.settings.currentTerm || "");

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
        currentTerm: currentTerm.trim(),

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
      });

      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setMsg(j?.error || `Failed to save (${r.status})`);
        return;
      }

      if (j.setupComplete) {
        setMsg("Setup complete ✅ Redirecting…");
        window.location.href = next;
      } else {
        setMsg("Saved (draft). Setup is NOT complete yet — please finish required fields.");
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Setup</h1>
        <p className="text-sm text-zinc-600">Fill this once per school. You can edit later.</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          After completion you’ll be redirected to: <span className="font-mono">{next}</span>
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-600">Loading…</div>
      ) : (
        <>
          <div className={card}>
            <h2 className="text-lg font-semibold mb-3">School</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className={labelBase}>School Name (read-only for now)</label>
                <input className={inputBase} value={tenantName} disabled />
              </div>
              <div>
                <label className={labelBase}>School Code (read-only)</label>
                <input className={inputBase} value={schoolCode} disabled />
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold mb-3">Academic</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className={labelBase}>Current Academic Year (e.g. 2025/2026)</label>
                <input className={inputBase} value={currentAcademicYear} onChange={(e) => setCurrentAcademicYear(e.target.value)} placeholder="2025/2026" />
              </div>
              <div>
                <label className={labelBase}>Current Term (e.g. Term 2)</label>
                <input className={inputBase} value={currentTerm} onChange={(e) => setCurrentTerm(e.target.value)} placeholder="Term 1" />
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-3 gap-4">
              <div>
                <div className="font-medium text-sm mb-2">Term 1</div>
                <label className={labelBase}>Start</label>
                <input className={inputBase} value={term1Start} onChange={(e) => setTerm1Start(e.target.value)} placeholder="YYYY-MM-DD" />
                <label className={labelBase + " mt-2"}>End</label>
                <input className={inputBase} value={term1End} onChange={(e) => setTerm1End(e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
              <div>
                <div className="font-medium text-sm mb-2">Term 2</div>
                <label className={labelBase}>Start</label>
                <input className={inputBase} value={term2Start} onChange={(e) => setTerm2Start(e.target.value)} placeholder="YYYY-MM-DD" />
                <label className={labelBase + " mt-2"}>End</label>
                <input className={inputBase} value={term2End} onChange={(e) => setTerm2End(e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
              <div>
                <div className="font-medium text-sm mb-2">Term 3</div>
                <label className={labelBase}>Start</label>
                <input className={inputBase} value={term3Start} onChange={(e) => setTerm3Start(e.target.value)} placeholder="YYYY-MM-DD" />
                <label className={labelBase + " mt-2"}>End</label>
                <input className={inputBase} value={term3End} onChange={(e) => setTerm3End(e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold mb-3">Attendance</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className={labelBase}>Start Time (HH:MM)</label>
                <input className={inputBase} value={attendanceStartTime} onChange={(e) => setAttendanceStartTime(e.target.value)} placeholder="07:30" />
              </div>
              <div>
                <label className={labelBase}>End Time (HH:MM)</label>
                <input className={inputBase} value={attendanceEndTime} onChange={(e) => setAttendanceEndTime(e.target.value)} placeholder="14:30" />
              </div>
              <div>
                <label className={labelBase}>Late Cutoff Minutes</label>
                <input className={inputBase} value={lateCutoffMinutes} onChange={(e) => setLateCutoffMinutes(e.target.value)} placeholder="15" />
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-lg font-semibold mb-3">Health</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className={labelBase}>Fever Threshold (°C)</label>
                <input className={inputBase} value={feverThreshold} onChange={(e) => setFeverThreshold(e.target.value)} placeholder="37.8" />
                <p className="text-xs text-zinc-500 mt-2">Valid range: 30.0–45.0 (enforced server-side).</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <button
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm bg-black text-white border-black hover:bg-zinc-800 disabled:opacity-50"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Setup"}
            </button>

            <button
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl border shadow-sm bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
              onClick={load}
              disabled={saving}
            >
              Reload
            </button>

            {msg && <div className="text-sm text-zinc-700">{msg}</div>}
          </div>
        </>
      )}
    </div>
  );
}