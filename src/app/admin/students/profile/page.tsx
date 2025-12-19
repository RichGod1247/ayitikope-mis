// src/app/admin/students/profile/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
};

type ClassroomOption = {
  id: string;
  label: string;
};

type StudentContact = {
  id: string; // studentId
  firstName: string;
  lastName: string;
  classLabel?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  relationship?: string | null;
  notes?: string | null;
};

type AttendanceItem = {
  id: string;
  date: string; // ISO date string
  classLabel?: string | null;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
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

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
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

export default function AdminStudentProfilePage() {
  // Tenant
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  // Classrooms
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [classOptions, setClassOptions] = useState<ClassroomOption[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [classroomId, setClassroomId] = useState<string>("");

  // Students / contacts
  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  // Which student is selected on the right panel
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null
  );

  // Attendance state (for selected student)
  const [attendanceItems, setAttendanceItems] = useState<AttendanceItem[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  // Health state (for selected student)
  const [healthItems, setHealthItems] = useState<HealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

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
  // Classrooms
  // ---------------------------
  async function fetchClassOptions(tid: string, m: "single" | "multi") {
    setClassLoading(true);
    setClassError(null);
    try {
      const url = `/api/classrooms/list?tenantId=${encodeURIComponent(
        tid
      )}&mode=${m}`;
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));

      let items: ClassroomOption[] = [];
      if (r.ok && Array.isArray(j?.items)) {
        items = j.items.map((x: any) => ({
          id: x.id as string,
          label: (x.label as string) || "",
        }));
      }

      setClassOptions(items);
      if (!items.length) {
        setClassroomId("");
        setClassError(
          "No classrooms found. Use the seeding tools on other admin pages to create standard KG–JHS classes."
        );
      } else {
        const existing = items.find((c) => c.id === classroomId);
        setClassroomId(existing ? existing.id : items[0].id);
      }
    } catch {
      setClassOptions([]);
      setClassroomId("");
      setClassError("Failed to load classrooms.");
    } finally {
      setClassLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id) {
      fetchClassOptions(tenant.id, mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, mode]);

  // ---------------------------
  // Load contacts for selected class
  // ---------------------------
  async function loadContacts() {
    if (!tenant?.id || !classroomId) return;
    setContactsLoading(true);
    setContactsError(null);
    setContacts([]);
    setSelectedStudentId(null);
    setAttendanceItems([]);
    setAttendanceError(null);
    setHealthItems([]);
    setHealthError(null);

    try {
      const params = new URLSearchParams();
      params.set("tenantId", tenant.id);
      params.set("classroomId", classroomId);

      const r = await fetch(
        `/api/students/contacts/list?${params.toString()}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setContacts([]);
        setContactsError(
          j?.error ||
            "Failed to load learners for this class. Please try again or contact the administrator."
        );
        return;
      }

      const items = Array.isArray(j.items)
        ? (j.items as StudentContact[])
        : ([] as StudentContact[]);
      setContacts(items);

      // Auto-select the first learner, if available
      if (items.length) {
        setSelectedStudentId(items[0].id);
      }
    } catch {
      setContacts([]);
      setContactsError(
        "Network or server error while loading learners for this class."
      );
    } finally {
      setContactsLoading(false);
    }
  }

  const selectedStudent = useMemo(
    () => contacts.find((c) => c.id === selectedStudentId) || null,
    [contacts, selectedStudentId]
  );

  const classLabel = useMemo(() => {
    const found = classOptions.find((c) => c.id === classroomId);
    return found?.label ?? "";
  }, [classOptions, classroomId]);

  // ---------------------------
  // Load attendance for selected student
  // ---------------------------
  async function loadAttendance() {
    if (!tenant?.id || !selectedStudentId) return;

    setAttendanceItems([]);
    setAttendanceError(null);
    setAttendanceLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("studentId", selectedStudentId);
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
  // Load health for selected student
  // ---------------------------
  async function loadHealth() {
    if (!tenant?.id || !selectedStudentId) return;

    setHealthItems([]);
    setHealthError(null);
    setHealthLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("studentId", selectedStudentId);
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
  // UI
  // ---------------------------
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Student 360° Profile</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A single calm view where heads, SHEP, and class teachers can see a
          learner&apos;s{" "}
          <span className="font-semibold">
            basic details, guardian contacts, attendance, and daily health
          </span>{" "}
          — to support them early, not to punish.
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

      {/* Class + load learners */}
      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Class Selection
            </div>
            <p className="text-xs text-zinc-600 max-w-md">
              Choose a class, load its learners, then pick any child on the left
              to see their profile on the right.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Mode
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`${btnOutline} h-8 px-3 ${
                  mode === "single" ? "ring-2 ring-zinc-800" : ""
                }`}
                onClick={() => setMode("single")}
                disabled={classLoading}
              >
                Single-stream
              </button>
              <button
                type="button"
                className={`${btnOutline} h-8 px-3 ${
                  mode === "multi" ? "ring-2 ring-zinc-800" : ""
                }`}
                onClick={() => setMode("multi")}
                disabled={classLoading}
              >
                Multi-stream (A–D)
              </button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Classroom
            </label>
            {classLoading ? (
              <div className="h-10 rounded-xl border bg-zinc-50 animate-pulse" />
            ) : classOptions.length ? (
              <select
                className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
              >
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="border rounded-xl p-3 text-sm text-zinc-700">
                {classError || "No classrooms available yet."}
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              className={btnPrimary + " w-full"}
              onClick={loadContacts}
              disabled={
                contactsLoading || !tenant?.id || !classroomId || classLoading
              }
            >
              {contactsLoading ? "Loading learners…" : "Load learners"}
            </button>
            <button
              type="button"
              className={btnOutline + " w-full"}
              onClick={() => {
                if (!tenant?.id) return;
                fetchClassOptions(tenant.id, mode);
              }}
              disabled={!tenant?.id || classLoading}
            >
              Reload classes
            </button>
          </div>

          <div className="text-xs text-zinc-500 flex items-end">
            Tip: Use this view during{" "}
            <span className="font-semibold ml-1">
              welfare meetings, SHEP reviews, or PTA follow-ups
            </span>{" "}
            to look at a learner&apos;s situation calmly and holistically.
          </div>
        </div>

        {classError && (
          <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {classError}
          </div>
        )}
      </section>

      {/* Main 2-column layout: left = list, right = profile */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: learners list */}
        <div className="md:col-span-1 border rounded-xl p-4 bg-white flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">
              Learners in {classLabel || "selected class"}
            </h2>
            {contactsLoading && (
              <span className="text-[11px] text-zinc-500">Loading…</span>
            )}
          </div>

          {contactsError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
              {contactsError}
            </div>
          )}

          {!contactsLoading && !contactsError && !contacts.length && (
            <p className="text-xs text-zinc-600">
              No learners are loaded yet. Choose a class above and click{" "}
              <span className="font-semibold">Load learners</span>.
            </p>
          )}

          {contacts.length > 0 && (
            <ul className="mt-1 space-y-1 max-h-[500px] overflow-y-auto pr-1">
              {contacts.map((c) => {
                const fullName =
                  [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                  "Unnamed learner";
                const isSelected = selectedStudentId === c.id;

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`w-full text-left rounded-lg px-3 py-2 text-xs border ${
                        isSelected
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50"
                      }`}
                      onClick={() => {
                        setSelectedStudentId(c.id);
                        setAttendanceItems([]);
                        setAttendanceError(null);
                        setHealthItems([]);
                        setHealthError(null);
                      }}
                    >
                      <div className="font-semibold truncate">{fullName}</div>
                      <div className="text-[11px] opacity-80">
                        {c.classLabel || classLabel || "Class not set"}
                      </div>
                      {c.guardianName && (
                        <div className="text-[11px] opacity-80 mt-0.5 truncate">
                          Guardian: {c.guardianName}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right: profile details */}
        <div className="md:col-span-2 space-y-4">
          {!selectedStudent && (
            <div className="border rounded-xl p-4 bg-zinc-50">
              <h2 className="text-sm font-semibold mb-1">
                Select a learner on the left
              </h2>
              <p className="text-xs text-zinc-600 max-w-lg">
                When you click on a learner, their{" "}
                <span className="font-semibold">
                  basic details, guardian contacts, attendance, and health
                  history
                </span>{" "}
                will appear here.
              </p>
            </div>
          )}

          {selectedStudent && (
            <>
              {/* Basic profile card */}
              <div className="border rounded-xl p-4 bg-white space-y-2">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold">
                      {[
                        selectedStudent.firstName,
                        selectedStudent.lastName,
                      ]
                        .filter(Boolean)
                        .join(" ") || "Unnamed learner"}
                    </h2>
                    <div className="text-xs text-zinc-600">
                      Class:{" "}
                      <span className="font-semibold">
                        {selectedStudent.classLabel || classLabel || "Unknown"}
                      </span>
                    </div>
                    {selectedStudent.relationship && (
                      <div className="text-xs text-zinc-600">
                        Relationship:{" "}
                        <span className="font-semibold">
                          {selectedStudent.relationship}
                        </span>
                      </div>
                    )}
                    {selectedStudent.notes && (
                      <div className="text-[11px] text-zinc-600 mt-1 max-w-lg">
                        School note: {selectedStudent.notes}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="font-semibold text-zinc-700">
                      Primary contact
                    </div>
                    {selectedStudent.guardianName && (
                      <div className="text-zinc-600">
                        Name:{" "}
                        <span className="font-semibold">
                          {selectedStudent.guardianName}
                        </span>
                      </div>
                    )}
                    {selectedStudent.guardianPhone ? (
                      <div className="text-zinc-600">
                        Phone:{" "}
                        <a
                          href={`tel:${selectedStudent.guardianPhone}`}
                          className="font-semibold underline underline-offset-2"
                        >
                          {selectedStudent.guardianPhone}
                        </a>
                      </div>
                    ) : (
                      <div className="text-zinc-500">
                        No guardian phone number on record.
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500 max-w-lg">
                  Use this profile as a{" "}
                  <span className="font-semibold">care lens</span> — for
                  example, before calling home, during SHEP or welfare
                  meetings, or when planning support for a learner at risk.
                </p>
              </div>

              {/* Attendance card */}
              <div className="border rounded-xl p-4 bg-white space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                      Recent attendance (last 20 records)
                    </h3>
                    <p className="text-[11px] text-zinc-500 max-w-md">
                      Shows how often this learner has been present, absent,
                      late, or excused in recent days.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={loadAttendance}
                    disabled={attendanceLoading || !selectedStudentId}
                  >
                    {attendanceLoading ? "Loading…" : "Load / refresh"}
                  </button>
                </div>

                {attendanceError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {attendanceError}
                  </div>
                )}

                {!attendanceError &&
                  !attendanceLoading &&
                  !attendanceItems.length && (
                    <p className="text-xs text-zinc-600">
                      No recent attendance records found yet for this learner.
                      Records will appear here as teachers take attendance.
                    </p>
                  )}

                {!!attendanceItems.length && (
                  <ul className="space-y-1.5 text-xs mt-1">
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
                              <span className="font-medium">{dateLabel}</span>
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
                  Attendance is shared to help{" "}
                  <span className="font-semibold">
                    notice patterns and support early
                  </span>
                  , not to blame families. Use it alongside your own knowledge
                  of the learner&apos;s situation.
                </p>
              </div>

              {/* Health card */}
              <div className="border rounded-xl p-4 bg-white space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                      Recent health & temperature checks
                    </h3>
                    <p className="text-[11px] text-zinc-500 max-w-md">
                      Shows temperature readings and any recorded symptoms when
                      school checked on this learner.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={loadHealth}
                    disabled={healthLoading || !selectedStudentId}
                  >
                    {healthLoading ? "Loading…" : "Load / refresh"}
                  </button>
                </div>

                {healthError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {healthError}
                  </div>
                )}

                {!healthError && !healthLoading && !healthItems.length && (
                  <p className="text-xs text-zinc-600">
                    No health or temperature records found yet for this learner.
                    When we check temperatures or record symptoms at school,
                    they&apos;ll appear here.
                  </p>
                )}

                {!!healthItems.length && (
                  <ul className="space-y-1.5 text-xs mt-1">
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
                              <span className="font-medium">{dateLabel}</span>
                              <span className={badgeClasses}>{badgeText}</span>
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
                  Health data is shared to help you{" "}
                  <span className="font-semibold">check on a child early</span>{" "}
                  if patterns appear (for example, frequent fever). It does not
                  replace a hospital visit where needed.
                </p>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
