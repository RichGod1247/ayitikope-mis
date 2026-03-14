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
  temperatureC: string;
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

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const innerCard = "rounded-[22px] border border-white/10 bg-[#07111F]/80";
const fieldClass =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 disabled:opacity-60";
const tinyText = "text-[11px] text-[#AEB6C4]";
const labelClass = "block text-[11px] font-medium text-[#C9CDD6]";

const btnBase =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs md:text-sm shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary =
  `${btnBase} border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105`;
const btnOutline =
  `${btnBase} border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10`;

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
}) {
  const base = "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  const cls =
    tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
        : tone === "bad"
          ? "border-rose-300/20 bg-rose-400/12 text-rose-100"
          : "border-white/10 bg-white/5 text-[#D7DCE5]";

  return <span className={`${base} ${cls}`}>{label}</span>;
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "error" | "info";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : tone === "error"
        ? "border-rose-300/20 bg-rose-400/12 text-rose-100"
        : "border-white/10 bg-white/5 text-[#D7DCE5]";

  return <section className={`rounded-2xl border p-4 text-sm ${cls}`}>{children}</section>;
}

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

  function rowStatus(it: Item) {
    const consent = !!it.healthConsentAt;

    if (it.isFever && consent) return <Pill label="FEVER" tone="bad" />;
    if (it.isFever && !consent) return <Pill label="FEVER (no consent)" tone="warn" />;
    return <Pill label="OK" tone="ok" />;
  }

  function updateDraft(studentId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? { temperatureC: "", symptoms: "", notes: "" }),
        ...patch,
      },
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

  async function saveOne(studentId: string): Promise<boolean> {
    const it = items.find((x) => x.studentId === studentId);
    const d = drafts[studentId];
    if (!it || !d) return false;

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

      const j: any = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse save response.",
      }));

      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

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
      return true;
    } catch (e: any) {
      setRowError((p) => ({ ...p, [studentId]: safeText(e?.message) || "Save failed." }));
      return false;
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

      const j: any = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse clear response.",
      }));

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

      let successCount = 0;
      for (const it of changed) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await saveOne(it.studentId);
        if (ok) successCount += 1;
      }

      setSaveAllMsg(
        successCount === changed.length
          ? `Saved ${successCount} change(s).`
          : `Saved ${successCount} of ${changed.length} change(s). Check rows with errors.`
      );
    } finally {
      setSaveAllLoading(false);
    }
  }

  const helper = useMemo(() => {
    return `Fever threshold: ${feverThreshold.toFixed(
      1
    )}°C. Fever SMS requires health consent, guardian SMS ON, and guardian phone.`;
  }, [feverThreshold]);

  return (
    <section className="space-y-5">
      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
              EduLife OS · Teacher Health
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#F7F4ED]">
              Health checks
            </h1>

            <p className="mt-1 text-sm text-[#C9CDD6]">
              Record temperature and symptoms for your class.
            </p>

            <p className="mt-1 text-[11px] text-[#AEB6C4]">{helper}</p>
          </div>

          <div className="flex gap-2">
            <Link href="/teacher/dashboard" className={btnOutline}>
              Back
            </Link>
          </div>
        </div>
      </section>

      {err ? <Banner tone="error">{err}</Banner> : null}

      <section className={`${shellCard} p-5 md:p-6 space-y-4`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <label className={labelClass}>Date</label>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
              className={`${fieldClass} md:w-[220px]`}
            />
          </div>

          <div className="text-sm">
            <div className="text-[11px] text-[#AEB6C4]">Class</div>
            <div className="font-semibold text-[#F7F4ED]">{loading ? "Loading..." : classLabel}</div>
          </div>

          <div className="flex gap-2">
            <button type="button" className={btnOutline} onClick={() => void load()} disabled={loading}>
              Refresh
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void saveAll()}
              disabled={saveAllLoading || loading || !hasItems}
            >
              {saveAllLoading ? "Saving..." : "Save all changes"}
            </button>
          </div>
        </div>

        {saveAllMsg ? <Banner tone="info">{saveAllMsg}</Banner> : null}

        {!loading && !items.length ? (
          <Banner tone="info">
            No learners found for your primary class. Add learners in <b>Admin → Students</b>.
          </Banner>
        ) : null}

        {items.length ? (
          <div className={`${innerCard} overflow-x-auto`}>
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-white/5 text-left text-[11px] uppercase tracking-wide text-[#AEB6C4]">
                <tr className="border-b border-white/10">
                  <th className="py-3 pr-3 pl-4">Learner</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3">Temp (°C)</th>
                  <th className="py-3 pr-3">Symptoms</th>
                  <th className="py-3 pr-3">Notes</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {items.map((it, idx) => {
                  const d = drafts[it.studentId] ?? { temperatureC: "", symptoms: "", notes: "" };
                  const changed = hasChanged(it);

                  const consent = !!it.healthConsentAt;
                  const sms = !!it.guardianSmsOptIn;
                  const phone = !!(it.guardianPhone && it.guardianPhone.trim());

                  return (
                    <tr key={it.studentId} className={idx % 2 ? "bg-white/[0.02]" : "bg-transparent"}>
                      <td className="py-3 pr-3 pl-4 align-top min-w-[240px]">
                        <div className="font-semibold text-[#F7F4ED]">{it.name}</div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Pill label={consent ? "CONSENT" : "NO CONSENT"} tone={consent ? "ok" : "muted"} />
                          <Pill label={sms ? "SMS ON" : "SMS OFF"} tone={sms ? "ok" : "muted"} />
                          <Pill label={phone ? "PHONE" : "NO PHONE"} tone={phone ? "ok" : "warn"} />
                        </div>

                        <div className="mt-2 text-[11px] text-[#8F98A8]">
                          Guardian: {it.guardianName || "—"} • {it.guardianPhone || "—"}
                        </div>

                        {it.healthConsentAt ? (
                          <div className="mt-1 text-[11px] text-[#8F98A8]">
                            Consent: {formatDT(it.healthConsentAt)}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 pr-3 align-top min-w-[180px]">
                        <div>{rowStatus(it)}</div>

                        {changed ? (
                          <div className="mt-2 text-[11px] text-amber-200">Unsaved changes</div>
                        ) : null}

                        {rowError[it.studentId] ? (
                          <div className="mt-2 text-[11px] text-rose-200">{rowError[it.studentId]}</div>
                        ) : null}

                        {rowOk[it.studentId] ? (
                          <div className="mt-2 text-[11px] text-emerald-200">{rowOk[it.studentId]}</div>
                        ) : null}
                      </td>

                      <td className="py-3 pr-3 align-top min-w-[130px]">
                        <input
                          inputMode="decimal"
                          placeholder="e.g. 37.5"
                          value={d.temperatureC}
                          onChange={(e) => updateDraft(it.studentId, { temperatureC: e.target.value })}
                          className={fieldClass}
                        />
                        <div className="mt-1 text-[11px] text-[#8F98A8]">Blank = not recorded</div>
                      </td>

                      <td className="py-3 pr-3 align-top min-w-[240px]">
                        <input
                          placeholder="e.g. cough, headache"
                          value={d.symptoms}
                          onChange={(e) => updateDraft(it.studentId, { symptoms: e.target.value })}
                          className={fieldClass}
                          maxLength={240}
                        />
                      </td>

                      <td className="py-3 pr-3 align-top min-w-[260px]">
                        <input
                          placeholder="optional note"
                          value={d.notes}
                          onChange={(e) => updateDraft(it.studentId, { notes: e.target.value })}
                          className={fieldClass}
                          maxLength={500}
                        />
                      </td>

                      <td className="py-3 pr-4 align-top min-w-[210px]">
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

      <section className={`${shellCard} p-5 md:p-6`}>
        <h2 className="text-sm font-semibold text-[#F7F4ED]">How to test fever SMS end-to-end</h2>

        <ol className="mt-3 list-decimal pl-5 text-sm text-[#D7DCE5] space-y-1.5">
          <li>Admin → Students → turn Guardian SMS ON for a learner and make sure they have a phone.</li>
          <li>Admin → Student 360 → grant Health consent for that learner.</li>
          <li>Teacher → Health checks → record temperature at or above the threshold.</li>
          <li>Teacher → Attendance → mark ABSENT if needed and close the session.</li>
          <li>Trigger notify with the attendance session.</li>
        </ol>
      </section>
    </section>
  );
}