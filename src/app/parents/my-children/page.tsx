// src/app/parents/my-children/page.tsx
"use client";

import { useEffect, useState } from "react";

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
  date: string; // ISO string from the API
  classLabel?: string | null;
  status: AttendanceStatus;
  note?: string | null;
};

type HealthItem = {
  id: string;
  date: string; // ISO
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
  paidAt: string; // ISO string from the API
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
  const value = typeof pesewas === "number" ? pesewas : 0;
  const cedis = value / 100;
  return cedis.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ParentMyChildrenPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  // Attendance state
  const [attendanceItems, setAttendanceItems] = useState<AttendanceItem[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceStudentId, setAttendanceStudentId] = useState<string | null>(
    null
  );

  // Health state
  const [healthItems, setHealthItems] = useState<HealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthStudentId, setHealthStudentId] = useState<string | null>(null);

  // Fees state (per term/year, one learner open at a time)
  const [feesStudentId, setFeesStudentId] = useState<string | null>(null);
  const [feesItem, setFeesItem] = useState<FeeSummaryItem | null>(null);
  const [feesMessage, setFeesMessage] = useState<string | null>(null);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState<string | null>(null);

  // Global term & year filters for fees
  const [feesTerm, setFeesTerm] = useState<string>("1st Term");
  const [feesAcademicYear, setFeesAcademicYear] =
    useState<string>("2025/2026");

  // ---------------------------
  // Bootstrap tenant
  // ---------------------------
  useEffect(() => {
    (async () => {
      setTenantLoading(true);
      setTenantError(null);
      try {
        const r = await fetch("/api/test/tenants");
        const j = await r.json().catch(() => ({}));
        const t = j?.tenants?.[0];

        if (t?.id) {
          setTenant({
            id: t.id,
            name: t.name || "School",
            slug: t.slug ?? null,
          });
        } else {
          setTenantError(
            "No tenant/school configured. Please contact the administrator."
          );
        }
      } catch {
        setTenantError(
          "Failed to load school context. Please check your connection or contact the school."
        );
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  // ---------------------------
  // Load children for this tenant
  // ---------------------------
  useEffect(() => {
    if (!tenant?.id) return;

    (async () => {
      setChildrenLoading(true);
      setChildrenError(null);
      try {
        const params = new URLSearchParams();
        params.set("tenantId", tenant.id);

        const r = await fetch(
          `/api/parents/my-children/list?${params.toString()}`
        );
        const j = await r.json().catch(() => ({}));

        if (!r.ok || !j?.ok) {
          setChildren([]);
          setChildrenError(
            j?.error ||
              "Failed to load linked learners. Please try again or contact the school."
          );
          return;
        }

        const items = Array.isArray(j.items)
          ? (j.items as ParentChild[])
          : ([] as ParentChild[]);
        setChildren(items);
      } catch {
        setChildren([]);
        setChildrenError(
          "Network or server error while loading linked learners."
        );
      } finally {
        setChildrenLoading(false);
      }
    })();
  }, [tenant?.id]);

  // ---------------------------
  // Load ATTENDANCE for a single learner
  // ---------------------------
  async function loadAttendanceFor(studentId: string) {
    if (!tenant?.id) return;

    // Toggle: if already open for this learner, close it.
    if (attendanceStudentId === studentId) {
      setAttendanceStudentId(null);
      setAttendanceItems([]);
      setAttendanceError(null);
      return;
    }

    setAttendanceStudentId(studentId);
    setAttendanceItems([]);
    setAttendanceError(null);
    setAttendanceLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("studentId", studentId);
      params.set("tenantId", tenant.id);

      const r = await fetch(
        `/api/parents/my-children/attendance?${params.toString()}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setAttendanceItems([]);
        setAttendanceError(
          j?.error ||
            "Failed to load attendance history for this learner. Please try again or contact the school."
        );
        return;
      }

      const items = Array.isArray(j.items)
        ? (j.items as AttendanceItem[])
        : ([] as AttendanceItem[]);
      setAttendanceItems(items);
    } catch {
      setAttendanceItems([]);
      setAttendanceError(
        "Network or server error while loading attendance history."
      );
    } finally {
      setAttendanceLoading(false);
    }
  }

  // ---------------------------
  // Load HEALTH for a single learner
  // ---------------------------
  async function loadHealthFor(studentId: string) {
    if (!tenant?.id) return;

    // Toggle: if already open for this learner, close it.
    if (healthStudentId === studentId) {
      setHealthStudentId(null);
      setHealthItems([]);
      setHealthError(null);
      return;
    }

    setHealthStudentId(studentId);
    setHealthItems([]);
    setHealthError(null);
    setHealthLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("studentId", studentId);
      params.set("tenantId", tenant.id);

      const r = await fetch(
        `/api/parents/my-children/health?${params.toString()}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setHealthItems([]);
        setHealthError(
          j?.error ||
            "Failed to load health & temperature records for this learner. Please try again or contact the school."
        );
        return;
      }

      const items = Array.isArray(j.items)
        ? (j.items as HealthItem[])
        : ([] as HealthItem[]);
      setHealthItems(items);
    } catch {
      setHealthItems([]);
      setHealthError(
        "Network or server error while loading health & temperature records."
      );
    } finally {
      setHealthLoading(false);
    }
  }

  // ---------------------------
  // Load FEES for a single learner (for chosen term/year)
  // ---------------------------
  async function loadFeesFor(studentId: string) {
    if (!tenant?.id) return;

    // If term/year not chosen, show a gentle error message.
    if (!feesTerm.trim() || !feesAcademicYear.trim()) {
      setFeesError(
        "Please choose both term and academic year at the top before viewing fees."
      );
      setFeesStudentId(null);
      setFeesItem(null);
      setFeesMessage(null);
      return;
    }

    // Toggle: if already open for this learner, close it.
    if (feesStudentId === studentId) {
      setFeesStudentId(null);
      setFeesItem(null);
      setFeesMessage(null);
      setFeesError(null);
      return;
    }

    setFeesStudentId(studentId);
    setFeesItem(null);
    setFeesMessage(null);
    setFeesError(null);
    setFeesLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("tenantId", tenant.id);
      params.set("studentId", studentId);
      params.set("term", feesTerm);
      params.set("academicYear", feesAcademicYear);

      const r = await fetch(
        `/api/parents/my-children/fees?${params.toString()}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setFeesItem(null);
        setFeesMessage(null);
        setFeesError(
          j?.error ||
            "Failed to load school fees information for this learner. Please try again or contact the school."
        );
        return;
      }

      // If no invoice yet for this learner/term/year
      if (!j.item) {
        setFeesItem(null);
        setFeesMessage(
          j.message ||
            "No fee invoice has been generated yet for this learner for the selected term and academic year."
        );
        return;
      }

      const item = j.item as FeeSummaryItem;
      setFeesItem(item);
    } catch {
      setFeesItem(null);
      setFeesMessage(null);
      setFeesError(
        "Network or server error while loading fee information. Please try again."
      );
    } finally {
      setFeesLoading(false);
    }
  }

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">My Children</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A gentle window into your children&apos;s{" "}
          <span className="font-semibold">
            class, attendance, health and school fees
          </span>{" "}
          so we can work together as one team — home and school — for their
          safety, growth, and stability.
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && (
          <p className="text-xs text-zinc-500">Loading school information…</p>
        )}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {tenantError}
          </p>
        )}
      </header>

      {/* Term + academic year picker for fees */}
      <section className="space-y-2 border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-semibold">
          Choose term & academic year for fees
        </h2>
        <p className="text-xs text-zinc-600 max-w-3xl">
          When you open <span className="font-semibold">school fees</span> for
          any child below, we will use this term and academic year to look up
          their invoice. You can change it at any time.
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div className="flex items-center gap-2">
            <label
              htmlFor="fees-term"
              className="text-xs font-medium text-zinc-700"
            >
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
            <label
              htmlFor="fees-academic-year"
              className="text-xs font-medium text-zinc-700"
            >
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

      {/* Children list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Linked learners</h2>
          {childrenLoading && (
            <span className="text-xs text-zinc-500">Loading learners…</span>
          )}
        </div>

        {childrenError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {childrenError}
          </div>
        )}

        {!childrenLoading && !childrenError && !children.length && (
          <p className="text-sm text-zinc-600">
            No learners are currently linked to this parent profile. Please
            contact the school office if you believe this is an error.
          </p>
        )}

        <div className="space-y-4">
          {children.map((child, idx) => {
            const isAttendanceOpen = attendanceStudentId === child.studentId;
            const isHealthOpen = healthStudentId === child.studentId;
            const isFeesOpen = feesStudentId === child.studentId;

            // Per-child attendance summary (for the currently open learner)
            let attendanceSummary: {
              PRESENT: number;
              ABSENT: number;
              LATE: number;
              EXCUSED: number;
            } | null = null;

            if (isAttendanceOpen && attendanceItems.length > 0) {
              attendanceSummary = attendanceItems.reduce(
                (acc, item) => {
                  acc[item.status] = (acc[item.status] || 0) + 1;
                  return acc;
                },
                {
                  PRESENT: 0,
                  ABSENT: 0,
                  LATE: 0,
                  EXCUSED: 0,
                } as {
                  PRESENT: number;
                  ABSENT: number;
                  LATE: number;
                  EXCUSED: number;
                }
              );
            }

            // Per-child health summary (for the currently open learner)
            let healthSummary: {
              count: number;
              feverCount: number;
              maxTemp: number | null;
            } | null = null;

            if (isHealthOpen && healthItems.length > 0) {
              let count = 0;
              let feverCount = 0;
              let maxTemp: number | null = null;

              for (const h of healthItems) {
                count += 1;
                if (h.isFever) feverCount += 1;
                if (
                  typeof h.temperatureC === "number" &&
                  !Number.isNaN(h.temperatureC)
                ) {
                  if (maxTemp === null || h.temperatureC > maxTemp) {
                    maxTemp = h.temperatureC;
                  }
                }
              }

              healthSummary = { count, feverCount, maxTemp };
            }

            return (
              <div
                key={`${child.studentId}-${idx}`}
                className="border rounded-xl p-4 bg-white space-y-3"
              >
                {/* Top row: identity + quick info */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-0.5">
                    <div className="text-base font-semibold">
                      {child.studentName || "Unnamed learner"}
                    </div>
                    <div className="text-xs text-zinc-600">
                      Class:{" "}
                      <span className="font-semibold">
                        {child.classLabel || "Not available"}
                      </span>
                    </div>
                    {child.guardianName && (
                      <div className="text-xs text-zinc-600">
                        Primary contact:{" "}
                        <span className="font-semibold">
                          {child.guardianName}
                        </span>
                      </div>
                    )}
                    {child.guardianPhone && (
                      <div className="text-xs text-zinc-600">
                        Phone:{" "}
                        <a
                          href={`tel:${child.guardianPhone}`}
                          className="font-semibold underline underline-offset-2"
                        >
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
                      {isAttendanceOpen
                        ? "Hide recent attendance"
                        : "View recent attendance"}
                    </button>
                    <button
                      className={btnOutline}
                      onClick={() => loadHealthFor(child.studentId)}
                      disabled={healthLoading && isHealthOpen}
                    >
                      {isHealthOpen
                        ? "Hide health & temperature"
                        : "View health & temperature"}
                    </button>
                    <button
                      className={btnOutline}
                      onClick={() => loadFeesFor(child.studentId)}
                      disabled={feesLoading && isFeesOpen}
                    >
                      {isFeesOpen ? "Hide school fees" : "View school fees"}
                    </button>
                    {child.guardianPhone && (
                      <a
                        href={`tel:${child.guardianPhone}`}
                        className={btnPrimary}
                      >
                        Call school contact
                      </a>
                    )}
                  </div>
                </div>

                {/* Attendance panel */}
                {isAttendanceOpen && (
                  <div className="mt-2 border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                        Recent attendance (last 20 records)
                      </h3>
                      {attendanceLoading && (
                        <span className="text-[11px] text-zinc-500">
                          Loading…
                        </span>
                      )}
                    </div>

                    {attendanceSummary && (
                      <p className="text-[11px] text-zinc-600">
                        In the last {attendanceItems.length} record
                        {attendanceItems.length === 1 ? "" : "s"} for this
                        learner:{" "}
                        <span className="font-semibold">
                          Present {attendanceSummary.PRESENT}
                        </span>{" "}
                        •{" "}
                        <span className="font-semibold">
                          Absent {attendanceSummary.ABSENT}
                        </span>{" "}
                        •{" "}
                        <span className="font-semibold">
                          Late {attendanceSummary.LATE}
                        </span>{" "}
                        •{" "}
                        <span className="font-semibold">
                          Excused {attendanceSummary.EXCUSED}
                        </span>
                        .
                      </p>
                    )}

                    {attendanceError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        {attendanceError}
                      </div>
                    )}

                    {!attendanceError &&
                      !attendanceItems.length &&
                      !attendanceLoading && (
                        <p className="text-xs text-zinc-600">
                          No recent attendance records found yet for this
                          learner.
                        </p>
                      )}

                    {!!attendanceItems.length && (
                      <ul className="space-y-1.5 text-xs">
                        {attendanceItems.map((item) => {
                          const dateLabel = formatDateShort(item.date);
                          let badgeText = "";
                          let badgeClasses =
                            "inline-flex px-2 py-0.5 rounded-full border text-[11px]";

                          if (item.status === "PRESENT") {
                            badgeText = "Present";
                            badgeClasses +=
                              " bg-emerald-50 border-emerald-200 text-emerald-800";
                          } else if (item.status === "ABSENT") {
                            badgeText = "Absent";
                            badgeClasses +=
                              " bg-red-50 border-red-200 text-red-800";
                          } else if (item.status === "LATE") {
                            badgeText = "Late";
                            badgeClasses +=
                              " bg-amber-50 border-amber-200 text-amber-800";
                          } else if (item.status === "EXCUSED") {
                            badgeText = "Excused";
                            badgeClasses +=
                              " bg-blue-50 border-blue-200 text-blue-800";
                          }

                          return (
                            <li
                              key={item.id}
                              className="flex items-start justify-between gap-2 border-b last:border-b-0 pb-1.5"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {dateLabel}
                                  </span>
                                  <span className={badgeClasses}>
                                    {badgeText}
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-600">
                                  Class: {item.classLabel || "—"}
                                </div>
                                {item.note && (
                                  <div className="text-[11px] text-zinc-600 mt-0.5">
                                    Note: {item.note}
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <p className="text-[11px] text-zinc-500 mt-1">
                      Attendance is shared to help you track patterns and
                      support your child. It is{" "}
                      <span className="font-semibold">not</span> for
                      punishment, but for gentle early intervention.
                    </p>
                  </div>
                )}

                {/* Health panel */}
                {isHealthOpen && (
                  <div className="mt-2 border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                        Recent health & temperature checks
                      </h3>
                      {healthLoading && (
                        <span className="text-[11px] text-zinc-500">
                          Loading…
                        </span>
                      )}
                    </div>

                    {healthSummary && (
                      <p className="text-[11px] text-zinc-600">
                        From {healthSummary.count} recorded check
                        {healthSummary.count === 1 ? "" : "s"}:{" "}
                        <span className="font-semibold">
                          fever flagged {healthSummary.feverCount} time
                          {healthSummary.feverCount === 1 ? "" : "s"}
                        </span>
                        {typeof healthSummary.maxTemp === "number" && (
                          <>
                            {" "}
                            • highest temperature{" "}
                            <span className="font-semibold">
                              {healthSummary.maxTemp.toFixed(1)} °C
                            </span>
                            .
                          </>
                        )}
                      </p>
                    )}

                    {healthError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        {healthError}
                      </div>
                    )}

                    {!healthError &&
                      !healthItems.length &&
                      !healthLoading && (
                        <p className="text-xs text-zinc-600">
                          No health or temperature records found yet for this
                          learner. When we check temperatures or record symptoms
                          at school, they&apos;ll appear here.
                        </p>
                      )}

                    {!!healthItems.length && (
                      <ul className="space-y-1.5 text-xs">
                        {healthItems.map((h) => {
                          const dateLabel = formatDateShort(h.date);
                          const hasTemp =
                            h.temperatureC !== null &&
                            typeof h.temperatureC === "number";
                          const tempLabel = hasTemp
                            ? `${h.temperatureC!.toFixed(1)} °C`
                            : "Not recorded";

                          const badgeClasses = h.isFever
                            ? "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-red-50 border-red-200 text-red-800"
                            : "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-emerald-50 border-emerald-200 text-emerald-800";

                          const badgeText = h.isFever
                            ? "Fever alert"
                            : "Within range";

                          return (
                            <li
                              key={h.id}
                              className="flex items-start justify-between gap-2 border-b last:border-b-0 pb-1.5"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {dateLabel}
                                  </span>
                                  <span className={badgeClasses}>
                                    {badgeText}
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-600">
                                  Temperature:{" "}
                                  <span className="font-semibold">
                                    {tempLabel}
                                  </span>
                                </div>
                                {h.symptoms && (
                                  <div className="text-[11px] text-zinc-600 mt-0.5">
                                    Symptoms: {h.symptoms}
                                  </div>
                                )}
                                {h.notes && (
                                  <div className="text-[11px] text-zinc-600 mt-0.5">
                                    Note: {h.notes}
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <p className="text-[11px] text-zinc-500 mt-1">
                      Health data is shared so you can{" "}
                      <span className="font-semibold">
                        check on your child early
                      </span>{" "}
                      if we notice patterns (for example, repeated fever or
                      headaches). It is not a diagnosis and does not replace a
                      hospital visit when needed.
                    </p>
                  </div>
                )}

                {/* Fees panel */}
                {isFeesOpen && (
                  <div className="mt-2 border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                        School fees for {feesTerm || "…"} (
                        {feesAcademicYear || "choose year"})
                      </h3>
                      {feesLoading && (
                        <span className="text-[11px] text-zinc-500">
                          Loading…
                        </span>
                      )}
                    </div>

                    {feesError && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        {feesError}
                      </div>
                    )}

                    {feesMessage && !feesItem && !feesError && (
                      <p className="text-xs text-zinc-600">{feesMessage}</p>
                    )}

                    {feesItem && !feesError && (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
                            <p className="text-[11px] text-zinc-600">
                              Total billed
                            </p>
                            <p className="text-sm font-semibold">
                              GHS{" "}
                              {formatMoneyFromPesewas(
                                feesItem.billedPesewas
                              )}
                            </p>
                          </div>
                          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
                            <p className="text-[11px] text-zinc-600">
                              Total paid
                            </p>
                            <p className="text-sm font-semibold">
                              GHS{" "}
                              {formatMoneyFromPesewas(feesItem.paidPesewas)}
                            </p>
                          </div>
                          <div className="border rounded-xl px-3 py-2 bg-zinc-50">
                            <p className="text-[11px] text-zinc-600">
                              Balance
                            </p>
                            <p
                              className={
                                "text-sm font-semibold " +
                                (feesItem.balancePesewas <= 0
                                  ? "text-emerald-700"
                                  : "text-red-700")
                              }
                            >
                              GHS{" "}
                              {formatMoneyFromPesewas(
                                feesItem.balancePesewas
                              )}
                            </p>
                          </div>
                        </div>

                        {feesItem.note && (
                          <p className="text-[11px] text-zinc-600">
                            Fee description:{" "}
                            <span className="font-semibold">
                              {feesItem.note}
                            </span>
                          </p>
                        )}

                        {feesItem.lastPaymentAt && (
                          <p className="text-[11px] text-zinc-600">
                            Last payment on{" "}
                            <span className="font-semibold">
                              {formatDateShort(feesItem.lastPaymentAt)}
                            </span>{" "}
                            for{" "}
                            <span className="font-semibold">
                              GHS{" "}
                              {formatMoneyFromPesewas(
                                feesItem.lastPaymentAmountPesewas
                              )}
                            </span>
                            .
                          </p>
                        )}

                        {feesItem.payments && feesItem.payments.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-zinc-700">
                              Payment history
                            </p>
                            <ul className="space-y-1.5">
                              {feesItem.payments.map((p) => (
                                <li
                                  key={p.id}
                                  className="flex items-start justify-between gap-2 border-b last:border-b-0 pb-1.5"
                                >
                                  <div>
                                    <div className="text-[11px] text-zinc-600">
                                      {formatDateShort(p.paidAt)} —{" "}
                                      <span className="font-semibold">
                                        GHS{" "}
                                        {formatMoneyFromPesewas(
                                          p.amountPesewas
                                        )}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-zinc-500">
                                      Method: {p.method}
                                      {p.channel && ` · Channel: ${p.channel}`}
                                      {p.reference &&
                                        ` · Ref: ${p.reference}`}
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-[11px] text-zinc-500 mt-1">
                      Fee information is shared for{" "}
                      <span className="font-semibold">
                        openness and planning
                      </span>
                      . For any questions or to discuss payment options, please
                      contact the school office directly.
                    </p>
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
