// src/app/teacher/health/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ApiErr = { ok: false; error: string };

type Item = {
  studentId: string;
  name: string;

  guardianName: string | null;
  guardianPhone: string | null;
  guardianSmsOptIn: boolean;
  healthConsentAt: string | null;

  recordId: string | null;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
  isFever: boolean;
};

type ApiOk = {
  ok: true;
  dateISO: string;
  classroom: { id: string; label: string };
  feverThreshold: number;
  feverCount: number;
  count: number;
  items: Item[];
};

type ApiResp = ApiOk | ApiErr;

type Draft = {
  temperatureC: string; // keep as string for input
  symptoms: string;
  notes: string;
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseTemp(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatDT(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

export default function TeacherHealthDailyPage() {
  const [dateISO, setDateISO] = useState<string>(isoToday());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [classLabel, setClassLabel] = useState<string>("—");
  const [feverThreshold, setFeverThreshold] = useState<number>(37.8);

  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string | null>>({});
  const [rowOk, setRowOk] = useState<Record<string, string | null>>({});

  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [saveAllMsg, setSaveAllMsg] = useState<string | null>(null);

  const hasItems = items.length > 0;

  function initDrafts(from: Item[]) {
    const next: Record<string, Draft> = {};
    for (const it of from) {
      next[it.studentId] = {
        temperatureC: it.temperatureC == null ? "" : String(it.temperatureC),
        symptoms: it.symptoms ?? "",
        notes: it.notes ?? "",
      };
    }
    setDrafts(next);
  }

  async function load() {
    setLoading(true);
    setErr(null);
    setSaveAllMsg(null);

    try {
      const r = await fetch(
        `/api/teacher/health/student-daily?date=${encodeURIComponent(dateISO)}`,
        { cache: "no-store" }
      );
      const j: ApiResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setClassLabel(j.classroom?.label ?? "—");
      setFeverThreshold(typeof j.feverThreshold === "number" ? j.feverThreshold : 37.8);
      setItems(Array.isArray(j.items) ? j.items : []);
      initDrafts(Array.isArray(j.items) ? j.items : []);
      setRowError({});
      setRowOk({});
      setSaving({});
    } catch (e: any) {
      setItems([]);
      setDrafts({});
      setClassLabel("—");
      setErr(safeText(e?.message) || "Failed to load health list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO]);

  function pill(label: string, tone: "ok" | "warn" | "bad" | "muted") {
    const base = "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold";
    if (tone === "ok") return <span className={`${base} bg-emerald-50 border-emerald-200 text-emerald-800`}>{label}</span>;
    if (tone === "warn") return <span className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>{label}</span>;
    if (tone === "bad") return <span className={`${base} bg-rose-50 border-rose-200 text-rose-800`}>{label}</span>;
    return <span className={`${base} bg-zinc-50 border-zinc-200 text-zinc-700`}>{label}</span>;
  }

  function rowStatus(it: Item) {
    const consent = !!it.healthConsentAt;
    const sms = !!it.guardianSmsOptIn;
    const phone = !!(it.guardianPhone && it.guardianPhone.trim());

    const fever = it.isFever;
    if (fever && consent) return pill("FEVER", "bad");
    if (fever && !consent) return pill("FEVER (no consent)", "warn");
    return pill("OK", "ok");
  }

  function updateDraft(studentId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? { temperatureC: "", symptoms: "", notes: "" }), ...patch },
    }));
  }

  function hasChanged(it: Item): boolean {
    const d = drafts[it.studentId];
    if (!d) return false;

    const t = parseTemp(d.temperatureC);
    const oT = it.temperatureC == null ? null : it.temperatureC;
    const oS = (it.symptoms ?? "").trim();
    const oN = (it.notes ?? "").trim();
    const nS = (d.symptoms ?? "").trim();
    const nN = (d.notes ?? "").trim();

    return (t ?? null) !== (oT ?? null) || nS !== oS || nN !== oN;
  }

  async function saveOne(studentId: string) {
    const it = items.find((x) => x.studentId === studentId);
    const d = drafts[studentId];
    if (!it || !d) return;

    setRowError((p) => ({ ...p, [studentId]: null }));
    setRowOk((p) => ({ ...p, [studentId]: null }));
    setSaving((p) => ({ ...p, [studentId]: true }));

    try {
      const tempN = parseTemp(d.temperatureC);
      if (tempN != null && (tempN < 30 || tempN > 45)) {
        throw new Error("Temperature must be between 30 and 45.");
      }

      const body = {
        studentId,
        dateISO,
        temperatureC: tempN,
        symptoms: (d.symptoms ?? "").trim() ? (d.symptoms ?? "").trim() : null,
        notes: (d.notes ?? "").trim() ? (d.notes ?? "").trim() : null,
      };

      const r = await fetch("/api/teacher/health/student-daily", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const j: any = await r.json().catch(() => ({ ok: false, error: "Failed to parse save response." }));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      // update local item row
      setItems((prev) =>
        prev.map((x) =>
          x.studentId !== studentId
            ? x
            : {
                ...x,
                temperatureC: typeof j.temperatureC === "number" ? j.temperatureC : null,
                symptoms: j.symptoms ?? null,
                notes: j.notes ?? null,
                isFever: !!j.isFever,
              }
        )
      );

      setRowOk((p) => ({ ...p, [studentId]: "Saved." }));
    } catch (e: any) {
      setRowError((p) => ({ ...p, [studentId]: safeText(e?.message) || "Save failed." }));
    } finally {
      setSaving((p) => ({ ...p, [studentId]: false }));
    }
  }

  async function clearOne(studentId: string) {
    if (!confirm("Clear today's health record for this learner?")) return;

    setRowError((p) => ({ ...p, [studentId]: null }));
    setRowOk((p) => ({ ...p, [studentId]: null }));
    setSaving((p) => ({ ...p, [studentId]: true }));

    try {
      const r = await fetch("/api/teacher/health/student-daily", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, dateISO, clear: true }),
      });

      const j: any = await r.json().catch(() => ({ ok: false, error: "Failed to parse clear response." }));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      setItems((prev) =>
        prev.map((x) =>
          x.studentId !== studentId
            ? x
            : { ...x, recordId: null, temperatureC: null, symptoms: null, notes: null, isFever: false }
        )
      );

      setDrafts((prev) => ({
        ...prev,
        [studentId]: { temperatureC: "", symptoms: "", notes: "" },
      }));

      setRowOk((p) => ({ ...p, [studentId]: "Cleared." }));
    } catch (e: any) {
      setRowError((p) => ({ ...p, [studentId]: safeText(e?.message) || "Clear failed." }));
    } finally {
      setSaving((p) => ({ ...p, [studentId]: false }));
    }
  }

  async function saveAll() {
    setSaveAllLoading(true);
    setSaveAllMsg(null);

    try {
      const changed = items.filter((it) => hasChanged(it));
      if (!changed.length) {
        setSaveAllMsg("No changes to save.");
        return;
      }

      for (const it of changed) {
        // sequential saves to keep it simple + avoid rate limits
        // (and because class size is small in pilots)
        // eslint-disable-next-line no-await-in-loop
        await saveOne(it.studentId);
      }

      setSaveAllMsg(`Saved ${changed.length} change(s).`);
    } finally {
      setSaveAllLoading(false);
    }
  }

  const helper = useMemo(() => {
    return `Fever threshold: ${feverThreshold.toFixed(1)}°C. Fever SMS requires: health consent + guardian SMS ON + guardian phone.`;
  }, [feverThreshold]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8 space-y-5">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Health checks</h1>
              <p className="mt-1 text-sm text-zinc-600">
                Record temperature and symptoms for your primary class (Option A).
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{helper}</p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/teacher/dashboard"
                className={`${btnOutline} h-9`}
              >
                Back
              </Link>
            </div>
          </div>
        </section>

        {err ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {err}
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-zinc-700">Date</label>
              <input
                type="date"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="text-sm text-zinc-700">
              <div className="text-[11px] text-zinc-500">Class</div>
              <div className="font-semibold">{loading ? "Loading..." : classLabel}</div>
            </div>

            <div className="flex gap-2">
              <button type="button" className={btnOutline} onClick={() => void load()} disabled={loading}>
                Refresh
              </button>
              <button type="button" className={btnPrimary} onClick={() => void saveAll()} disabled={saveAllLoading || loading || !hasItems}>
                {saveAllLoading ? "Saving..." : "Save all changes"}
              </button>
            </div>
          </div>

          {saveAllMsg ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              {saveAllMsg}
            </div>
          ) : null}

          {!loading && !items.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No learners found for your primary class. Add learners in <b>Admin - Students</b>.
            </div>
          ) : null}

          {items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Learner</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Temp (C)</th>
                    <th className="py-2 pr-3">Symptoms</th>
                    <th className="py-2 pr-3">Notes</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((it) => {
                    const d = drafts[it.studentId] ?? { temperatureC: "", symptoms: "", notes: "" };
                    const changed = hasChanged(it);

                    const consent = !!it.healthConsentAt;
                    const sms = !!it.guardianSmsOptIn;
                    const phone = !!(it.guardianPhone && it.guardianPhone.trim());

                    return (
                      <tr key={it.studentId} className="align-top">
                        <td className="py-3 pr-3 min-w-[220px]">
                          <div className="font-semibold text-zinc-900">{it.name}</div>
                          <div className="mt-1 text-[11px] text-zinc-600">
                            {pill(consent ? "CONSENT" : "NO CONSENT", consent ? "ok" : "muted")}{" "}
                            {pill(sms ? "SMS ON" : "SMS OFF", sms ? "ok" : "muted")}{" "}
                            {pill(phone ? "PHONE" : "NO PHONE", phone ? "ok" : "warn")}
                          </div>
                          {it.healthConsentAt ? (
                            <div className="mt-1 text-[11px] text-zinc-500">
                              Consent: {formatDT(it.healthConsentAt)}
                            </div>
                          ) : null}
                        </td>

                        <td className="py-3 pr-3 min-w-[160px]">
                          <div>{rowStatus(it)}</div>
                          {changed ? <div className="mt-1 text-[11px] text-amber-700">Unsaved changes</div> : null}
                          {rowError[it.studentId] ? (
                            <div className="mt-1 text-[11px] text-rose-700">{rowError[it.studentId]}</div>
                          ) : null}
                          {rowOk[it.studentId] ? (
                            <div className="mt-1 text-[11px] text-emerald-700">{rowOk[it.studentId]}</div>
                          ) : null}
                        </td>

                        <td className="py-3 pr-3 min-w-[120px]">
                          <input
                            inputMode="decimal"
                            placeholder="e.g. 37.5"
                            value={d.temperatureC}
                            onChange={(e) => updateDraft(it.studentId, { temperatureC: e.target.value })}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                          />
                          <div className="mt-1 text-[11px] text-zinc-500">Blank = not recorded</div>
                        </td>

                        <td className="py-3 pr-3 min-w-[220px]">
                          <input
                            placeholder="e.g. cough, headache"
                            value={d.symptoms}
                            onChange={(e) => updateDraft(it.studentId, { symptoms: e.target.value })}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                            maxLength={240}
                          />
                        </td>

                        <td className="py-3 pr-3 min-w-[240px]">
                          <input
                            placeholder="optional note"
                            value={d.notes}
                            onChange={(e) => updateDraft(it.studentId, { notes: e.target.value })}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                            maxLength={500}
                          />
                        </td>

                        <td className="py-3 pr-3 min-w-[210px]">
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              className={btnPrimary}
                              onClick={() => void saveOne(it.studentId)}
                              disabled={!!saving[it.studentId] || loading}
                            >
                              {saving[it.studentId] ? "Saving..." : "Save"}
                            </button>

                            <button
                              type="button"
                              className={btnOutline}
                              onClick={() => void clearOne(it.studentId)}
                              disabled={!!saving[it.studentId] || loading}
                            >
                              Clear today
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">How to test Fever SMS end-to-end</h2>
          <ol className="mt-2 list-decimal pl-5 text-sm text-zinc-700 space-y-1">
            <li>Admin - Students - toggle Guardian SMS ON for a learner (and ensure they have a phone).</li>
            <li>Admin - Student 360 - grant Health consent for that learner.</li>
            <li>Teacher - Health checks - record temperature at or above the threshold.</li>
            <li>Teacher - Attendance - mark ABSENT (optional) and close the session.</li>
            <li>Trigger notify: POST /api/teacher/attendance/notify-parents with the sessionId.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
