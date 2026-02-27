// src/app/parents/my-children/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
};

type ParentChild = {
  studentId: string;
  studentName: string;
  classLabel?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type AttendanceItem = {
  id: string;
  date: string;
  classLabel?: string | null;
  status: AttendanceStatus;
  note?: string | null;
};

type HealthItem = {
  id: string;
  date: string;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
  isFever: boolean;
};

type FeePaymentItem = {
  id: string;
  amountPesewas: number;
  method: string;
  reference: string | null;
  channel: string | null;
  paidAt: string;
};

type FeeSummaryItem = {
  invoiceId: string;
  term: string;
  academicYear: string;
  billedPesewas: number;
  waivedPesewas: number;
  netBilledPesewas: number;
  paidPesewas: number;
  balancePesewas: number;
  note: string | null;
  lastPaymentAt: string | null;
  lastPaymentAmountPesewas: number | null;
  payments: FeePaymentItem[];
};

type MeOk = {
  ok: true;
  tenantId: string;
  tenant?: { id: string; name: string; slug: string | null } | null;
};

type MeFail = { ok: false; error: string };

const btnBase =
  "inline-flex items-center justify-center h-8 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

function formatDateShort(iso: string) {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatMoneyFromPesewas(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" && Number.isFinite(pesewas) ? pesewas : 0;
  const cedis = value / 100;
  return cedis.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function fetchTenantFromMe(signal?: AbortSignal): Promise<
  | { ok: true; tenant: Tenant }
  | { ok: false; error: "UNAUTHENTICATED" | "TENANT_REQUIRED" | "ME_FAILED" }
> {
  const r = await fetch("/api/me", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
    headers: { "Cache-Control": "no-store" },
    signal,
  });

  const j = (await r.json().catch(() => null)) as (MeOk | MeFail) | null;

  if (!r.ok || !j || typeof j !== "object") {
    const err = (j as any)?.error;
    if (err === "UNAUTHENTICATED") return { ok: false, error: "UNAUTHENTICATED" };
    if (err === "TENANT_REQUIRED") return { ok: false, error: "TENANT_REQUIRED" };
    return { ok: false, error: "ME_FAILED" };
  }

  if (!("ok" in j) || j.ok !== true) {
    const err = (j as any)?.error;
    if (err === "UNAUTHENTICATED") return { ok: false, error: "UNAUTHENTICATED" };
    if (err === "TENANT_REQUIRED") return { ok: false, error: "TENANT_REQUIRED" };
    return { ok: false, error: "ME_FAILED" };
  }

  const tid = j.tenantId;
  if (!tid) return { ok: false, error: "TENANT_REQUIRED" };

  const name = j.tenant?.name || "School";
  const slug = j.tenant?.slug ?? null;

  return { ok: true, tenant: { id: tid, name, slug } };
}

function pickError(j: any, fallback: string) {
  const e = j?.error;
  if (typeof e === "string" && e.trim()) return e;
  return fallback;
}

export default function ParentMyChildrenPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tenantNeedsPick, setTenantNeedsPick] = useState(false);
  const [tenantNeedsLogin, setTenantNeedsLogin] = useState(false);

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  const [attendanceItems, setAttendanceItems] = useState<AttendanceItem[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceStudentId, setAttendanceStudentId] = useState<string | null>(null);

  const [healthItems, setHealthItems] = useState<HealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthStudentId, setHealthStudentId] = useState<string | null>(null);

  const [feesStudentId, setFeesStudentId] = useState<string | null>(null);
  const [feesItem, setFeesItem] = useState<FeeSummaryItem | null>(null);
  const [feesMessage, setFeesMessage] = useState<string | null>(null);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState<string | null>(null);

  const [feesTerm, setFeesTerm] = useState<string>("1st Term");
  const [feesAcademicYear, setFeesAcademicYear] = useState<string>("2025/2026");

  const childrenAbortRef = useRef<AbortController | null>(null);
  const attendanceAbortRef = useRef<AbortController | null>(null);
  const healthAbortRef = useRef<AbortController | null>(null);
  const feesAbortRef = useRef<AbortController | null>(null);

  // Bootstrap tenant (production: /api/me only)
  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      setTenantLoading(true);
      setTenantError(null);
      setTenantNeedsPick(false);
      setTenantNeedsLogin(false);

      try {
        const res = await fetchTenantFromMe(ac.signal);

        if (res.ok) {
          setTenant(res.tenant);
          return;
        }

        if (res.error === "UNAUTHENTICATED") {
          setTenantNeedsLogin(true);
          setTenantError("Please sign in to view your children.");
          return;
        }

        if (res.error === "TENANT_REQUIRED") {
          setTenantNeedsPick(true);
          setTenantError("Select your school to continue.");
          return;
        }

        setTenantError("Failed to load school context. Please try again.");
      } catch {
        if (!ac.signal.aborted) setTenantError("Failed to load school context. Please try again.");
      } finally {
        if (!ac.signal.aborted) setTenantLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  // Load children (NO tenantId param — server derives tenant from session/JWT)
  useEffect(() => {
    if (!tenant?.id) return;

    // cancel any in-flight children request
    childrenAbortRef.current?.abort();
    const ac = new AbortController();
    childrenAbortRef.current = ac;

    (async () => {
      setChildrenLoading(true);
      setChildrenError(null);

      // Reset detail panes when tenant changes (prevents cross-tenant stale UI)
      attendanceAbortRef.current?.abort();
      setAttendanceStudentId(null);
      setAttendanceItems([]);
      setAttendanceError(null);
      setAttendanceLoading(false);

      healthAbortRef.current?.abort();
      setHealthStudentId(null);
      setHealthItems([]);
      setHealthError(null);
      setHealthLoading(false);

      feesAbortRef.current?.abort();
      setFeesStudentId(null);
      setFeesItem(null);
      setFeesMessage(null);
      setFeesError(null);
      setFeesLoading(false);

      try {
        const r = await fetch(`/api/parents/my-children/list`, {
          signal: ac.signal,
          cache: "no-store",
          credentials: "include",
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok || !j?.ok) {
          setChildren([]);
          setChildrenError(pickError(j, "Failed to load linked learners."));
          return;
        }

        const items = Array.isArray(j.items) ? (j.items as ParentChild[]) : [];
        setChildren(items);
      } catch {
        if (!ac.signal.aborted) {
          setChildren([]);
          setChildrenError("Network/server error while loading linked learners.");
        }
      } finally {
        if (!ac.signal.aborted) setChildrenLoading(false);
      }
    })();

    return () => ac.abort();
  }, [tenant?.id]);

  async function loadAttendanceFor(studentId: string) {
    if (!tenant?.id) return;

    // toggle close
    if (attendanceStudentId === studentId) {
      attendanceAbortRef.current?.abort();
      setAttendanceStudentId(null);
      setAttendanceItems([]);
      setAttendanceError(null);
      setAttendanceLoading(false);
      return;
    }

    attendanceAbortRef.current?.abort();
    const ac = new AbortController();
    attendanceAbortRef.current = ac;

    setAttendanceStudentId(studentId);
    setAttendanceItems([]);
    setAttendanceError(null);
    setAttendanceLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("studentId", studentId);

      const r = await fetch(`/api/parents/my-children/attendance?${params.toString()}`, {
        signal: ac.signal,
        cache: "no-store",
        credentials: "include",
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setAttendanceItems([]);
        setAttendanceError(pickError(j, "Failed to load attendance history."));
        return;
      }

      const items = Array.isArray(j.items) ? (j.items as AttendanceItem[]) : [];
      setAttendanceItems(items);
    } catch {
      if (!ac.signal.aborted) {
        setAttendanceItems([]);
        setAttendanceError("Network/server error while loading attendance history.");
      }
    } finally {
      if (!ac.signal.aborted) setAttendanceLoading(false);
    }
  }

  async function loadHealthFor(studentId: string) {
    if (!tenant?.id) return;

    // toggle close
    if (healthStudentId === studentId) {
      healthAbortRef.current?.abort();
      setHealthStudentId(null);
      setHealthItems([]);
      setHealthError(null);
      setHealthLoading(false);
      return;
    }

    healthAbortRef.current?.abort();
    const ac = new AbortController();
    healthAbortRef.current = ac;

    setHealthStudentId(studentId);
    setHealthItems([]);
    setHealthError(null);
    setHealthLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("studentId", studentId);

      const r = await fetch(`/api/parents/my-children/health?${params.toString()}`, {
        signal: ac.signal,
        cache: "no-store",
        credentials: "include",
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setHealthItems([]);
        setHealthError(pickError(j, "Failed to load health records."));
        return;
      }

      const items = Array.isArray(j.items) ? (j.items as HealthItem[]) : [];
      setHealthItems(items);
    } catch {
      if (!ac.signal.aborted) {
        setHealthItems([]);
        setHealthError("Network/server error while loading health records.");
      }
    } finally {
      if (!ac.signal.aborted) setHealthLoading(false);
    }
  }

  async function loadFeesFor(studentId: string) {
    if (!tenant?.id) return;

    const term = feesTerm.trim();
    const year = feesAcademicYear.trim();

    if (!term || !year) {
      setFeesError("Please choose both term and academic year.");
      setFeesStudentId(null);
      setFeesItem(null);
      setFeesMessage(null);
      setFeesLoading(false);
      return;
    }

    // toggle close
    if (feesStudentId === studentId) {
      feesAbortRef.current?.abort();
      setFeesStudentId(null);
      setFeesItem(null);
      setFeesMessage(null);
      setFeesError(null);
      setFeesLoading(false);
      return;
    }

    feesAbortRef.current?.abort();
    const ac = new AbortController();
    feesAbortRef.current = ac;

    setFeesStudentId(studentId);
    setFeesItem(null);
    setFeesMessage(null);
    setFeesError(null);
    setFeesLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("studentId", studentId);
      params.set("term", term);
      params.set("academicYear", year);

      const r = await fetch(`/api/parents/my-children/fees?${params.toString()}`, {
        signal: ac.signal,
        cache: "no-store",
        credentials: "include",
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setFeesItem(null);
        setFeesMessage(null);
        setFeesError(pickError(j, "Failed to load fees information."));
        return;
      }

      if (!j.item) {
        setFeesItem(null);
        setFeesMessage(typeof j.message === "string" ? j.message : "No invoice generated yet for this term/year.");
        return;
      }

      setFeesItem(j.item as FeeSummaryItem);
    } catch {
      if (!ac.signal.aborted) {
        setFeesItem(null);
        setFeesMessage(null);
        setFeesError("Network/server error while loading fees info.");
      }
    } finally {
      if (!ac.signal.aborted) setFeesLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">My Children</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A gentle window into your children&apos;s{" "}
          <span className="font-semibold">class, attendance, health and school fees</span>{" "}
          so we can work together — home and school — for their safety, growth, and stability.
        </p>

        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}

        {tenantLoading && <p className="text-xs text-zinc-500">Loading school information…</p>}

        {tenantError && (
          <div className="space-y-2">
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {tenantError}
            </p>

            {tenantNeedsLogin && (
              <a
                href="/auth/signin"
                className="inline-flex text-xs underline underline-offset-2 text-zinc-700"
              >
                Go to sign in
              </a>
            )}

            {tenantNeedsPick && (
              <a
                href="/app/dashboard"
                className="inline-flex text-xs underline underline-offset-2 text-zinc-700"
              >
                Go to school selector
              </a>
            )}
          </div>
        )}
      </header>

      <section className="space-y-2 border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-semibold">Choose term & academic year for fees</h2>
        <p className="text-xs text-zinc-600 max-w-3xl">
          When you open <span className="font-semibold">school fees</span>, we use this term/year to find the invoice.
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="fees-term" className="text-xs font-medium text-zinc-700">
              Term
            </label>
            <select
              id="fees-term"
              className="h-8 rounded-xl border border-zinc-300 px-2 text-xs md:text-sm bg-white"
              value={feesTerm}
              onChange={(e) => setFeesTerm(e.target.value)}
            >
              <option value="">Select term</option>
              <option value="1st Term">1st Term</option>
              <option value="2nd Term">2nd Term</option>
              <option value="3rd Term">3rd Term</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="fees-academic-year" className="text-xs font-medium text-zinc-700">
              Academic year
            </label>
            <input
              id="fees-academic-year"
              type="text"
              className="h-8 rounded-xl border border-zinc-300 px-2 text-xs md:text-sm bg-white"
              placeholder="e.g. 2025/2026"
              value={feesAcademicYear}
              onChange={(e) => setFeesAcademicYear(e.target.value)}
            />
          </div>
        </div>
        {feesError && !feesStudentId && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {feesError}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Linked learners</h2>
          {childrenLoading && <span className="text-xs text-zinc-500">Loading learners…</span>}
        </div>

        {childrenError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {childrenError}
          </div>
        )}

        {!childrenLoading && !childrenError && !children.length && (
          <p className="text-sm text-zinc-600">
            No learners are currently linked to this parent profile. Contact the school office if this is a mistake.
          </p>
        )}

        <div className="space-y-4">
          {children.map((child) => {
            const isAttendanceOpen = attendanceStudentId === child.studentId;
            const isHealthOpen = healthStudentId === child.studentId;
            const isFeesOpen = feesStudentId === child.studentId;

            let attendanceSummary: { PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number } | null = null;
            if (isAttendanceOpen && attendanceItems.length > 0) {
              attendanceSummary = attendanceItems.reduce(
                (acc, item) => {
                  (acc as any)[item.status] = ((acc as any)[item.status] || 0) + 1;
                  return acc;
                },
                { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as any
              );
            }

            let healthSummary: { count: number; feverCount: number; maxTemp: number | null } | null = null;
            if (isHealthOpen && healthItems.length > 0) {
              let count = 0;
              let feverCount = 0;
              let maxTemp: number | null = null;

              for (const h of healthItems) {
                count += 1;
                if (h.isFever) feverCount += 1;
                if (typeof h.temperatureC === "number" && !Number.isNaN(h.temperatureC)) {
                  if (maxTemp === null || h.temperatureC > maxTemp) maxTemp = h.temperatureC;
                }
              }
              healthSummary = { count, feverCount, maxTemp };
            }

            return (
              <div key={child.studentId} className="border rounded-xl p-4 bg-white space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-0.5">
                    <div className="text-base font-semibold">{child.studentName || "Unnamed learner"}</div>
                    <div className="text-xs text-zinc-600">
                      Class: <span className="font-semibold">{child.classLabel || "Not available"}</span>
                    </div>
                    {child.guardianName && (
                      <div className="text-xs text-zinc-600">
                        Primary contact: <span className="font-semibold">{child.guardianName}</span>
                      </div>
                    )}
                    {child.guardianPhone && (
                      <div className="text-xs text-zinc-600">
                        Phone:{" "}
                        <a href={`tel:${child.guardianPhone}`} className="font-semibold underline underline-offset-2">
                          {child.guardianPhone}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className={btnOutline}
                      onClick={() => loadAttendanceFor(child.studentId)}
                      disabled={attendanceLoading && isAttendanceOpen}
                    >
                      {isAttendanceOpen ? "Hide recent attendance" : "View recent attendance"}
                    </button>
                    <button
                      className={btnOutline}
                      onClick={() => loadHealthFor(child.studentId)}
                      disabled={healthLoading && isHealthOpen}
                    >
                      {isHealthOpen ? "Hide health & temperature" : "View health & temperature"}
                    </button>
                    <button
                      className={btnOutline}
                      onClick={() => loadFeesFor(child.studentId)}
                      disabled={feesLoading && isFeesOpen}
                    >
                      {isFeesOpen ? "Hide school fees" : "View school fees"}
                    </button>
                    {child.guardianPhone && (
                      <a href={`tel:${child.guardianPhone}`} className={btnPrimary}>
                        Call school contact
                      </a>
                    )}
                  </div>
                </div>

                {/* Attendance */}
                {isAttendanceOpen && (
                  <div className="mt-2 border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                        Recent attendance (last 20 records)
                      </h3>
                      {attendanceLoading && <span className="text-[11px] text-zinc-500">Loading…</span>}
                    </div>

                    {attendanceSummary && (
                      <p className="text-[11px] text-zinc-600">
                        Present <span className="font-semibold">{attendanceSummary.PRESENT}</span> • Absent{" "}
                        <span className="font-semibold">{attendanceSummary.ABSENT}</span> • Late{" "}
                        <span className="font-semibold">{attendanceSummary.LATE}</span> • Excused{" "}
                        <span className="font-semibold">{attendanceSummary.EXCUSED}</span>
                      </p>
                    )}

                    {attendanceError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        {attendanceError}
                      </div>
                    )}

                    {!attendanceError && !attendanceItems.length && !attendanceLoading && (
                      <p className="text-xs text-zinc-600">No recent attendance records found yet for this learner.</p>
                    )}

                    {!!attendanceItems.length && (
                      <ul className="space-y-1.5 text-xs">
                        {attendanceItems.map((item) => {
                          const dateLabel = formatDateShort(item.date);
                          let badgeText = "";
                          let badgeClasses = "inline-flex px-2 py-0.5 rounded-full border text-[11px]";

                          if (item.status === "PRESENT") {
                            badgeText = "Present";
                            badgeClasses += " bg-emerald-50 border-emerald-200 text-emerald-800";
                          } else if (item.status === "ABSENT") {
                            badgeText = "Absent";
                            badgeClasses += " bg-red-50 border-red-200 text-red-800";
                          } else if (item.status === "LATE") {
                            badgeText = "Late";
                            badgeClasses += " bg-amber-50 border-amber-200 text-amber-800";
                          } else {
                            badgeText = "Excused";
                            badgeClasses += " bg-blue-50 border-blue-200 text-blue-800";
                          }

                          return (
                            <li key={item.id} className="border-b last:border-b-0 pb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{dateLabel}</span>
                                <span className={badgeClasses}>{badgeText}</span>
                              </div>
                              <div className="text-[11px] text-zinc-600">Class: {item.classLabel || "—"}</div>
                              {item.note && <div className="text-[11px] text-zinc-600 mt-0.5">Note: {item.note}</div>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Health */}
                {isHealthOpen && (
                  <div className="mt-2 border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                        Recent health & temperature checks
                      </h3>
                      {healthLoading && <span className="text-[11px] text-zinc-500">Loading…</span>}
                    </div>

                    {healthSummary && (
                      <p className="text-[11px] text-zinc-600">
                        Fever flagged <span className="font-semibold">{healthSummary.feverCount}</span> time
                        {healthSummary.feverCount === 1 ? "" : "s"}
                        {typeof healthSummary.maxTemp === "number" && (
                          <>
                            {" "}
                            • highest <span className="font-semibold">{healthSummary.maxTemp.toFixed(1)} °C</span>
                          </>
                        )}
                      </p>
                    )}

                    {healthError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        {healthError}
                      </div>
                    )}

                    {!healthError && !healthItems.length && !healthLoading && (
                      <p className="text-xs text-zinc-600">No health or temperature records found yet for this learner.</p>
                    )}

                    {!!healthItems.length && (
                      <ul className="space-y-1.5 text-xs">
                        {healthItems.map((h) => {
                          const dateLabel = formatDateShort(h.date);
                          const hasTemp = h.temperatureC !== null && typeof h.temperatureC === "number";
                          const tempLabel = hasTemp ? `${h.temperatureC!.toFixed(1)} °C` : "Not recorded";

                          const badgeClasses = h.isFever
                            ? "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-red-50 border-red-200 text-red-800"
                            : "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-emerald-50 border-emerald-200 text-emerald-800";

                          return (
                            <li key={h.id} className="border-b last:border-b-0 pb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{dateLabel}</span>
                                <span className={badgeClasses}>{h.isFever ? "Fever alert" : "Within range"}</span>
                              </div>
                              <div className="text-[11px] text-zinc-600">
                                Temperature: <span className="font-semibold">{tempLabel}</span>
                              </div>
                              {h.symptoms && <div className="text-[11px] text-zinc-600 mt-0.5">Symptoms: {h.symptoms}</div>}
                              {h.notes && <div className="text-[11px] text-zinc-600 mt-0.5">Note: {h.notes}</div>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Fees */}
                {isFeesOpen && (
                  <div className="mt-2 border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                        School fees for {feesTerm || "…"} ({feesAcademicYear || "choose year"})
                      </h3>
                      {feesLoading && <span className="text-[11px] text-zinc-500">Loading…</span>}
                    </div>

                    {feesError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        {feesError}
                      </div>
                    )}

                    {feesMessage && !feesItem && !feesError && <p className="text-xs text-zinc-600">{feesMessage}</p>}

                    {feesItem && !feesError && (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
                            <p className="text-[11px] text-zinc-600">Total billed</p>
                            <p className="text-sm font-semibold">GHS {formatMoneyFromPesewas(feesItem.billedPesewas)}</p>
                          </div>
                          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
                            <p className="text-[11px] text-zinc-600">Total paid</p>
                            <p className="text-sm font-semibold">GHS {formatMoneyFromPesewas(feesItem.paidPesewas)}</p>
                          </div>
                          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
                            <p className="text-[11px] text-zinc-600">Balance</p>
                            <p
                              className={
                                "text-sm font-semibold " +
                                (feesItem.balancePesewas <= 0 ? "text-emerald-700" : "text-red-700")
                              }
                            >
                              GHS {formatMoneyFromPesewas(feesItem.balancePesewas)}
                            </p>
                          </div>
                        </div>

                        {feesItem.note && (
                          <p className="text-[11px] text-zinc-600">
                            Fee description: <span className="font-semibold">{feesItem.note}</span>
                          </p>
                        )}

                        {feesItem.lastPaymentAt && (
                          <p className="text-[11px] text-zinc-600">
                            Last payment on <span className="font-semibold">{formatDateShort(feesItem.lastPaymentAt)}</span>{" "}
                            for{" "}
                            <span className="font-semibold">
                              GHS {formatMoneyFromPesewas(feesItem.lastPaymentAmountPesewas)}
                            </span>
                            .
                          </p>
                        )}

                        {feesItem.payments?.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-zinc-700">Payment history</p>
                            <ul className="space-y-1.5">
                              {feesItem.payments.map((p) => (
                                <li key={p.id} className="border-b last:border-b-0 pb-1.5">
                                  <div className="text-[11px] text-zinc-600">
                                    {formatDateShort(p.paidAt)} —{" "}
                                    <span className="font-semibold">GHS {formatMoneyFromPesewas(p.amountPesewas)}</span>
                                  </div>
                                  <div className="text-[11px] text-zinc-500">
                                    Method: {p.method}
                                    {p.channel && ` · Channel: ${p.channel}`}
                                    {p.reference && ` · Ref: ${p.reference}`}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
