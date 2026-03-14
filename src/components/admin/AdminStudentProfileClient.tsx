//src/components/admin/AdminStudentProfileClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ClassroomOption = {
  id: string;
  label: string;
};

type StudentContact = {
  id: string;
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
  date: string;
  classLabel?: string | null;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
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

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error: string };

type ClassroomsResp = ApiOk<{ items: ClassroomOption[] }> | ApiErr;
type ContactsResp = ApiOk<{ items: StudentContact[] }> | ApiErr;
type AttendanceResp = ApiOk<{ items: AttendanceItem[] }> | ApiErr;
type HealthResp = ApiOk<{ items: HealthItem[] }> | ApiErr;

type ConsentStatusResp =
  | {
      ok: true;
      studentId: string;
      healthConsentAt: string | null;
      guardianSmsOptIn: boolean;
      guardianPhone: string | null;
    }
  | { ok: false; error: string };

type ConsentPatchResp =
  | { ok: true; studentId: string; healthConsentAt: string | null }
  | { ok: false; error: string };

type ConsentSendResp =
  | { ok: true; studentId: string; to: string; link: string; text: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

type ConsentTextResp =
  | { ok: true; text: string; link: string }
  | { ok: false; error: string };

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";

const innerCard =
  "rounded-2xl border border-white/10 bg-[#07111F]/80";

const btnBase =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs md:text-sm transition disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary =
  `${btnBase} border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105`;
const btnOutline =
  `${btnBase} border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10`;

const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";

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

function formatDateTime(iso: string) {
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

function safeText(v: unknown) {
  return typeof v === "string" ? v : "";
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function StatusChip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "ok" | "warn" | "bad" | "info";
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : tone === "warn"
      ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
      : tone === "bad"
      ? "border-rose-300/20 bg-rose-400/12 text-rose-100"
      : tone === "info"
      ? "border-sky-300/20 bg-sky-400/12 text-sky-100"
      : "border-white/10 bg-white/5 text-[#D7DCE5]";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export default function AdminStudentProfileClient({ tenantName }: { tenantName: string }) {
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [classOptions, setClassOptions] = useState<ClassroomOption[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [classroomId, setClassroomId] = useState<string>("");

  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [attendanceItems, setAttendanceItems] = useState<AttendanceItem[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  const [healthItems, setHealthItems] = useState<HealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentOk, setConsentOk] = useState<string | null>(null);

  const [guardianSmsOptIn, setGuardianSmsOptIn] = useState<boolean | null>(null);
  const [guardianPhoneFromStatus, setGuardianPhoneFromStatus] = useState<string | null>(null);

  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);
  const [lastSendLink, setLastSendLink] = useState<string | null>(null);
  const [lastSendText, setLastSendText] = useState<string | null>(null);

  async function fetchClassOptions(m: "single" | "multi") {
    setClassLoading(true);
    setClassError(null);
    try {
      const url = `/api/admin/classrooms/list?mode=${encodeURIComponent(m)}`;
      const r = await fetch(url, { cache: "no-store" });
      const j: ClassroomsResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse classrooms response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      const items = Array.isArray(j.items) ? j.items : [];
      setClassOptions(items);

      if (!items.length) {
        setClassroomId("");
        setClassError("No classrooms found. Create classrooms in Admin → Classes first.");
      } else {
        const existing = items.find((c) => c.id === classroomId);
        setClassroomId(existing ? existing.id : items[0].id);
      }
    } catch (e: any) {
      setClassOptions([]);
      setClassroomId("");
      setClassError(safeText(e?.message) || "Failed to load classrooms.");
    } finally {
      setClassLoading(false);
    }
  }

  useEffect(() => {
    void fetchClassOptions(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function loadContacts() {
    if (!classroomId) return;

    setContactsLoading(true);
    setContactsError(null);
    setContacts([]);
    setSelectedStudentId(null);

    setAttendanceItems([]);
    setAttendanceError(null);

    setHealthItems([]);
    setHealthError(null);

    setConsentAt(null);
    setConsentError(null);
    setConsentOk(null);
    setGuardianSmsOptIn(null);
    setGuardianPhoneFromStatus(null);

    setSendError(null);
    setSendOk(null);
    setLastSendLink(null);
    setLastSendText(null);

    try {
      const r = await fetch(
        `/api/admin/students/contacts/list?classroomId=${encodeURIComponent(classroomId)}`,
        { cache: "no-store" }
      );
      const j: ContactsResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse contacts response.",
      }));

      if (!r.ok || !j.ok) {
        setContacts([]);
        setContactsError(j.ok ? `HTTP ${r.status}` : j.error);
        return;
      }

      const items = Array.isArray(j.items) ? (j.items as StudentContact[]) : [];
      setContacts(items);

      if (items.length) setSelectedStudentId(items[0].id);
    } catch (e: any) {
      setContacts([]);
      setContactsError(safeText(e?.message) || "Network/server error while loading learners.");
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

  async function loadConsentStatus() {
    if (!selectedStudentId) return;

    setConsentLoading(true);
    setConsentError(null);
    setConsentOk(null);

    try {
      const r = await fetch(
        `/api/admin/students/health-consent?studentId=${encodeURIComponent(selectedStudentId)}`,
        { cache: "no-store" }
      );

      const j: ConsentStatusResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse consent status response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setConsentAt(j.healthConsentAt);
      setGuardianSmsOptIn(j.guardianSmsOptIn);
      setGuardianPhoneFromStatus(j.guardianPhone);

      setSendError(null);
      setSendOk(null);
      setLastSendLink(null);
      setLastSendText(null);
    } catch (e: any) {
      setConsentAt(null);
      setGuardianSmsOptIn(null);
      setGuardianPhoneFromStatus(null);
      setConsentError(safeText(e?.message) || "Failed to load health consent status.");
    } finally {
      setConsentLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedStudentId) return;

    setAttendanceItems([]);
    setAttendanceError(null);
    setHealthItems([]);
    setHealthError(null);

    void loadConsentStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  async function toggleHealthConsent() {
    if (!selectedStudentId) return;

    setConsentLoading(true);
    setConsentError(null);
    setConsentOk(null);

    try {
      const r = await fetch("/api/admin/students/health-consent", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: selectedStudentId }),
      });

      const j: ConsentPatchResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse consent update response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setConsentAt(j.healthConsentAt);
      setConsentOk(j.healthConsentAt ? "Health consent granted." : "Health consent revoked.");

      void loadConsentStatus();
    } catch (e: any) {
      setConsentError(safeText(e?.message) || "Failed to update health consent.");
    } finally {
      setConsentLoading(false);
    }
  }

  async function sendConsentSms() {
    if (!selectedStudentId) return;

    setSendLoading(true);
    setSendError(null);
    setSendOk(null);
    setLastSendLink(null);
    setLastSendText(null);

    try {
      const r = await fetch("/api/admin/students/consent/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: selectedStudentId }),
      });

      const j: ConsentSendResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse send response.",
      }));

      if (!r.ok || !j.ok) {
        const retry = (j as any)?.retryAfterSeconds
          ? ` Try again in ${(j as any).retryAfterSeconds}s.`
          : "";
        throw new Error((j as any)?.error ? `${(j as any).error}${retry}` : `HTTP ${r.status}`);
      }

      setSendOk(`Sent consent link to ${j.to}`);
      setLastSendLink(j.link);
      setLastSendText(j.text);
    } catch (e: any) {
      setSendError(safeText(e?.message) || "Failed to send consent SMS.");
    } finally {
      setSendLoading(false);
    }
  }

  async function copyConsentMessage() {
    if (!selectedStudentId) return;

    setSendLoading(true);
    setSendError(null);
    setSendOk(null);
    setLastSendLink(null);
    setLastSendText(null);

    try {
      const r = await fetch(
        `/api/consent/optin/sms-text?studentId=${encodeURIComponent(selectedStudentId)}`,
        { cache: "no-store" }
      );

      const j: ConsentTextResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse sms text response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      const ok = await copyToClipboard(j.text);
      if (!ok) throw new Error("Clipboard blocked by browser. Copy manually from preview below.");

      setSendOk("Consent message copied.");
      setLastSendLink(j.link);
      setLastSendText(j.text);
    } catch (e: any) {
      setSendError(safeText(e?.message) || "Failed to copy consent message.");
    } finally {
      setSendLoading(false);
    }
  }

  async function loadAttendance() {
    if (!selectedStudentId) return;

    setAttendanceItems([]);
    setAttendanceError(null);
    setAttendanceLoading(true);

    try {
      const r = await fetch(
        `/api/admin/students/attendance?studentId=${encodeURIComponent(selectedStudentId)}`,
        { cache: "no-store" }
      );

      const j: AttendanceResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse attendance response.",
      }));

      if (!r.ok || !j.ok) {
        setAttendanceItems([]);
        setAttendanceError(j.ok ? `HTTP ${r.status}` : j.error);
        return;
      }

      setAttendanceItems(Array.isArray(j.items) ? j.items : []);
    } catch (e: any) {
      setAttendanceItems([]);
      setAttendanceError(safeText(e?.message) || "Network/server error while loading attendance.");
    } finally {
      setAttendanceLoading(false);
    }
  }

  async function loadHealth() {
    if (!selectedStudentId) return;

    setHealthItems([]);
    setHealthError(null);
    setHealthLoading(true);

    try {
      const r = await fetch(
        `/api/admin/students/health?studentId=${encodeURIComponent(selectedStudentId)}`,
        { cache: "no-store" }
      );

      const j: HealthResp = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse health response.",
      }));

      if (!r.ok || !j.ok) {
        setHealthItems([]);
        setHealthError(j.ok ? `HTTP ${r.status}` : j.error);
        return;
      }

      setHealthItems(Array.isArray(j.items) ? j.items : []);
    } catch (e: any) {
      setHealthItems([]);
      setHealthError(safeText(e?.message) || "Network/server error while loading health records.");
    } finally {
      setHealthLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <header className={shellCard}>
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/12 px-3 py-1 text-[11px] font-medium text-emerald-100">
            EduLife OS · Admin · Student 360°
          </div>
          <h1 className="text-2xl font-semibold text-[#F7F4ED]">Student 360° Profile</h1>
          <p className="max-w-3xl text-sm text-[#C9CDD6]">
            A single calm view where heads, SHEP, and class teachers can see a learner&apos;s{" "}
            <span className="font-semibold text-[#F7F4ED]">basic details, guardian contacts, attendance, and daily health</span>{" "}
            to support early, not to punish.
          </p>
          <p className="text-xs text-[#8F98A8]">
            School: <span className="font-semibold text-[#F7F4ED]">{tenantName}</span>
          </p>
        </div>
      </header>

      <section className={shellCard}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Class Selection
            </div>
            <p className="max-w-md text-xs text-[#C9CDD6]">
              Choose a class, load its learners, then pick any child on the left to see their profile on the right.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Mode
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={
                  mode === "single"
                    ? btnPrimary
                    : btnOutline
                }
                onClick={() => setMode("single")}
                disabled={classLoading}
              >
                Single-stream
              </button>
              <button
                type="button"
                className={
                  mode === "multi"
                    ? btnPrimary
                    : btnOutline
                }
                onClick={() => setMode("multi")}
                disabled={classLoading}
              >
                Multi-stream (A–D)
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 pt-2 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#C9CDD6]">Classroom</label>
            {classLoading ? (
              <div className="h-10 rounded-xl border border-white/10 bg-white/5 animate-pulse" />
            ) : classOptions.length ? (
              <select
                className={inputClass}
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
              >
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#05070B] text-[#F7F4ED]">
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className={`${innerCard} px-3 py-3 text-sm text-[#D7DCE5]`}>
                {classError || "No classrooms available yet."}
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              className={`${btnPrimary} w-full`}
              onClick={loadContacts}
              disabled={contactsLoading || !classroomId || classLoading}
            >
              {contactsLoading ? "Loading learners…" : "Load learners"}
            </button>
            <button
              type="button"
              className={`${btnOutline} w-full`}
              onClick={() => void fetchClassOptions(mode)}
              disabled={classLoading}
            >
              Reload classes
            </button>
          </div>

          <div className="flex items-end text-xs text-[#8F98A8]">
            Tip: Use this view during{" "}
            <span className="ml-1 font-semibold text-[#F7F4ED]">welfare meetings, SHEP reviews, or PTA follow-ups</span>
            {" "}to look at a learner&apos;s situation calmly and holistically.
          </div>
        </div>

        {classError ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-xs text-rose-100">
            {classError}
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`${shellCard} md:col-span-1 flex flex-col`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#F7F4ED]">
              Learners in {classLabel || "selected class"}
            </h2>
            {contactsLoading ? <span className="text-[11px] text-[#8F98A8]">Loading…</span> : null}
          </div>

          {contactsError ? (
            <div className="mb-2 rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-xs text-rose-100">
              {contactsError}
            </div>
          ) : null}

          {!contactsLoading && !contactsError && !contacts.length ? (
            <p className="text-xs text-[#C9CDD6]">
              No learners are loaded yet. Choose a class above and click{" "}
              <span className="font-semibold text-[#F7F4ED]">Load learners</span>.
            </p>
          ) : null}

          {contacts.length > 0 ? (
            <ul className="mt-1 max-h-[500px] space-y-2 overflow-y-auto pr-1">
              {contacts.map((c) => {
                const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed learner";
                const isSelected = selectedStudentId === c.id;

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={[
                        "w-full rounded-2xl border px-3 py-3 text-left text-xs transition",
                        isSelected
                          ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                          : "border-white/10 bg-[#07111F]/80 text-[#F7F4ED] hover:bg-white/10",
                      ].join(" ")}
                      onClick={() => {
                        setSelectedStudentId(c.id);
                        setConsentAt(null);
                        setConsentError(null);
                        setConsentOk(null);
                        setGuardianSmsOptIn(null);
                        setGuardianPhoneFromStatus(null);
                        setSendError(null);
                        setSendOk(null);
                        setLastSendLink(null);
                        setLastSendText(null);
                      }}
                    >
                      <div className="truncate font-semibold">{fullName}</div>
                      <div className="mt-1 text-[11px] opacity-80">
                        {c.classLabel || classLabel || "Class not set"}
                      </div>
                      {c.guardianName ? (
                        <div className="mt-1 truncate text-[11px] opacity-80">
                          Guardian: {c.guardianName}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="space-y-4 md:col-span-2">
          {!selectedStudent ? (
            <div className={shellCard}>
              <h2 className="mb-1 text-sm font-semibold text-[#F7F4ED]">Select a learner on the left</h2>
              <p className="max-w-lg text-xs text-[#C9CDD6]">
                When you click on a learner, their{" "}
                <span className="font-semibold text-[#F7F4ED]">basic details, guardian contacts, attendance, and health history</span>{" "}
                will appear here.
              </p>
            </div>
          ) : null}

          {selectedStudent ? (
            <>
              <div className={shellCard}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-[#F7F4ED]">
                      {[selectedStudent.firstName, selectedStudent.lastName].filter(Boolean).join(" ") || "Unnamed learner"}
                    </h2>
                    <div className="text-xs text-[#C9CDD6]">
                      Class:{" "}
                      <span className="font-semibold text-[#F7F4ED]">
                        {selectedStudent.classLabel || classLabel || "Unknown"}
                      </span>
                    </div>
                    {selectedStudent.relationship ? (
                      <div className="text-xs text-[#C9CDD6]">
                        Relationship:{" "}
                        <span className="font-semibold text-[#F7F4ED]">{selectedStudent.relationship}</span>
                      </div>
                    ) : null}
                    {selectedStudent.notes ? (
                      <div className="mt-1 max-w-lg text-[11px] text-[#C9CDD6]">
                        School note: {selectedStudent.notes}
                      </div>
                    ) : null}
                  </div>

                  <div className={`${innerCard} space-y-2 px-4 py-3 text-xs`}>
                    <div className="font-semibold text-[#F7F4ED]">Primary contact</div>

                    {selectedStudent.guardianName ? (
                      <div className="text-[#C9CDD6]">
                        Name: <span className="font-semibold text-[#F7F4ED]">{selectedStudent.guardianName}</span>
                      </div>
                    ) : null}

                    {selectedStudent.guardianPhone ? (
                      <div className="text-[#C9CDD6]">
                        Phone:{" "}
                        <a
                          href={`tel:${selectedStudent.guardianPhone}`}
                          className="font-semibold text-[#F7F4ED] underline underline-offset-2"
                        >
                          {selectedStudent.guardianPhone}
                        </a>
                      </div>
                    ) : (
                      <div className="text-[#8F98A8]">No guardian phone number on record.</div>
                    )}

                    <div className="border-t border-white/10 pt-2">
                      <div className="text-[11px] text-[#8F98A8]">
                        Guardian SMS:{" "}
                        <span className="font-semibold text-[#F7F4ED]">
                          {guardianSmsOptIn === null ? "—" : guardianSmsOptIn ? "ON" : "OFF"}
                        </span>
                        {guardianPhoneFromStatus ? (
                          <span className="ml-2 text-[#738095]">({guardianPhoneFromStatus})</span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-[11px] text-[#8F98A8]">
                        Health consent:{" "}
                        <span className="font-semibold text-[#F7F4ED]">
                          {consentAt ? "GRANTED" : "NOT GRANTED"}
                        </span>
                        {consentAt ? (
                          <span className="ml-2 text-[#738095]">{formatDateTime(consentAt)}</span>
                        ) : null}
                      </div>

                      {consentError ? (
                        <div className="mt-2 rounded-xl border border-rose-300/20 bg-rose-400/12 px-2 py-1 text-[11px] text-rose-100">
                          {consentError}
                        </div>
                      ) : null}
                      {consentOk ? (
                        <div className="mt-2 rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-2 py-1 text-[11px] text-emerald-100">
                          {consentOk}
                        </div>
                      ) : null}

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={btnOutline}
                          onClick={toggleHealthConsent}
                          disabled={consentLoading || !selectedStudentId}
                          title="Required before fever SMS alerts can be sent."
                        >
                          {consentLoading ? "Saving…" : consentAt ? "Revoke health consent" : "Grant health consent"}
                        </button>

                        <button
                          type="button"
                          className={btnOutline}
                          onClick={loadConsentStatus}
                          disabled={consentLoading || !selectedStudentId}
                        >
                          Refresh status
                        </button>
                      </div>

                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#E8C96A]">
                          Request guardian consent
                        </div>

                        {sendError ? (
                          <div className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-2 py-1 text-[11px] text-rose-100">
                            {sendError}
                          </div>
                        ) : null}
                        {sendOk ? (
                          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-2 py-1 text-[11px] text-emerald-100">
                            {sendOk}
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={btnOutline}
                            onClick={sendConsentSms}
                            disabled={sendLoading || !selectedStudentId}
                            title="Sends a one-time consent link (rate-limited)."
                          >
                            {sendLoading ? "Sending…" : "Send consent SMS"}
                          </button>

                          <button
                            type="button"
                            className={btnOutline}
                            onClick={copyConsentMessage}
                            disabled={sendLoading || !selectedStudentId}
                            title="Copies the consent message so you can send via WhatsApp/SMS manually."
                          >
                            {sendLoading ? "Working…" : "Copy consent message"}
                          </button>
                        </div>

                        {lastSendText ? (
                          <div className="rounded-2xl border border-white/10 bg-[#05070B] p-3">
                            <div className="mb-1 text-[11px] text-[#8F98A8]">Message preview</div>
                            <pre className="whitespace-pre-wrap text-[11px] text-[#F7F4ED]">
                              {lastSendText}
                            </pre>
                            {lastSendLink ? (
                              <div className="mt-2">
                                <a
                                  className="text-[11px] text-[#F7F4ED] underline"
                                  href={lastSendLink}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open consent link (preview)
                                </a>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <p className="max-w-sm text-[11px] text-[#8F98A8]">
                          Fever alerts require <span className="font-semibold text-[#F7F4ED]">Health consent</span> +{" "}
                          <span className="font-semibold text-[#F7F4ED]">Guardian SMS ON</span> + a guardian phone number.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="max-w-lg text-[11px] text-[#8F98A8]">
                  Use this profile as a <span className="font-semibold text-[#F7F4ED]">care lens</span> for example, before calling home,
                  during SHEP or welfare meetings, or when planning support for a learner at risk.
                </p>
              </div>

              <div className={shellCard}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#E8C96A]">
                      Recent attendance (last 20 records)
                    </h3>
                    <p className="max-w-md text-[11px] text-[#8F98A8]">
                      Shows how often this learner has been present, absent, late, or excused in recent days.
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

                {attendanceError ? (
                  <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-xs text-rose-100">
                    {attendanceError}
                  </div>
                ) : null}

                {!attendanceError && !attendanceLoading && !attendanceItems.length ? (
                  <p className="text-xs text-[#C9CDD6]">
                    No recent attendance records found yet for this learner. Records will appear here as teachers take attendance.
                  </p>
                ) : null}

                {!!attendanceItems.length ? (
                  <ul className="mt-1 space-y-2 text-xs">
                    {attendanceItems.map((item) => {
                      const dateLabel = formatDateShort(item.date);
                      let tone: "ok" | "bad" | "warn" | "info" = "ok";
                      let badgeText = "Present";

                      if (item.status === "ABSENT") {
                        tone = "bad";
                        badgeText = "Absent";
                      } else if (item.status === "LATE") {
                        tone = "warn";
                        badgeText = "Late";
                      } else if (item.status === "EXCUSED") {
                        tone = "info";
                        badgeText = "Excused";
                      }

                      return (
                        <li key={item.id} className={`${innerCard} px-3 py-3`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[#F7F4ED]">{dateLabel}</span>
                                <StatusChip tone={tone}>{badgeText}</StatusChip>
                              </div>
                              <div className="mt-1 text-[11px] text-[#C9CDD6]">
                                Class: {item.classLabel || "—"}
                              </div>
                              {item.note ? (
                                <div className="mt-1 text-[11px] text-[#C9CDD6]">Note: {item.note}</div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <p className="mt-1 text-[11px] text-[#8F98A8]">
                  Attendance is shared to help <span className="font-semibold text-[#F7F4ED]">notice patterns and support early</span>, not to blame families.
                </p>
              </div>

              <div className={shellCard}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#E8C96A]">
                      Recent health & temperature checks
                    </h3>
                    <p className="max-w-md text-[11px] text-[#8F98A8]">
                      Shows temperature readings and any recorded symptoms when school checked on this learner.
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

                {healthError ? (
                  <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-xs text-rose-100">
                    {healthError}
                  </div>
                ) : null}

                {!healthError && !healthLoading && !healthItems.length ? (
                  <p className="text-xs text-[#C9CDD6]">
                    No health or temperature records found yet for this learner. When temperatures or symptoms are recorded at school, they will appear here.
                  </p>
                ) : null}

                {!!healthItems.length ? (
                  <ul className="mt-1 space-y-2 text-xs">
                    {healthItems.map((h) => {
                      const dateLabel = formatDateShort(h.date);
                      const hasTemp = h.temperatureC !== null && typeof h.temperatureC === "number";
                      const tempLabel = hasTemp ? `${h.temperatureC!.toFixed(1)} °C` : "Not recorded";

                      return (
                        <li key={h.id} className={`${innerCard} px-3 py-3`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[#F7F4ED]">{dateLabel}</span>
                                <StatusChip tone={h.isFever ? "bad" : "ok"}>
                                  {h.isFever ? "Fever alert" : "Within range"}
                                </StatusChip>
                              </div>
                              <div className="mt-1 text-[11px] text-[#C9CDD6]">
                                Temperature: <span className="font-semibold text-[#F7F4ED]">{tempLabel}</span>
                              </div>
                              {h.symptoms ? (
                                <div className="mt-1 text-[11px] text-[#C9CDD6]">Symptoms: {h.symptoms}</div>
                              ) : null}
                              {h.notes ? (
                                <div className="mt-1 text-[11px] text-[#C9CDD6]">Note: {h.notes}</div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <p className="mt-1 text-[11px] text-[#8F98A8]">
                  Health data is shared to help you <span className="font-semibold text-[#F7F4ED]">check on a child early</span> if patterns appear. It does not replace a hospital visit where needed.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </section>
  );
}