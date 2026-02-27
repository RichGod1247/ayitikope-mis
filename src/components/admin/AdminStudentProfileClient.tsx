//src/components/admin/AdminStudentProfileClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

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
  // Clipboard API fails sometimes on non-HTTPS contexts; provide a fallback.
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

export default function AdminStudentProfileClient({ tenantName }: { tenantName: string }) {
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
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Attendance state (for selected student)
  const [attendanceItems, setAttendanceItems] = useState<AttendanceItem[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  // Health state (for selected student)
  const [healthItems, setHealthItems] = useState<HealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Health consent status
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentOk, setConsentOk] = useState<string | null>(null);

  // SMS opt-in status (informational)
  const [guardianSmsOptIn, setGuardianSmsOptIn] = useState<boolean | null>(null);
  const [guardianPhoneFromStatus, setGuardianPhoneFromStatus] = useState<string | null>(null);

  // Consent SMS actions state
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);
  const [lastSendLink, setLastSendLink] = useState<string | null>(null);
  const [lastSendText, setLastSendText] = useState<string | null>(null);

  // ---------------------------
  // Classrooms (ADMIN scoped, session tenant)
  // ---------------------------
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

  // ---------------------------
  // Load contacts for selected class (ADMIN scoped)
  // ---------------------------
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

  // ---------------------------
  // Load consent status
  // ---------------------------
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

      // Clear any prior “sent” preview when switching students
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

      // refresh snapshot
      void loadConsentStatus();
    } catch (e: any) {
      setConsentError(safeText(e?.message) || "Failed to update health consent.");
    } finally {
      setConsentLoading(false);
    }
  }

  // ---------------------------
  // Consent SMS actions
  // ---------------------------
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

  // ---------------------------
  // Load attendance (ADMIN scoped)
  // ---------------------------
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

  // ---------------------------
  // Load health (ADMIN scoped)
  // ---------------------------
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

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Student 360° Profile</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A single calm view where heads, SHEP, and class teachers can see a learner&apos;s{" "}
          <span className="font-semibold">basic details, guardian contacts, attendance, and daily health</span>{" "}
          — to support them early, not to punish.
        </p>
        <p className="text-xs text-zinc-500">
          School: <span className="font-semibold">{tenantName}</span>
        </p>
      </header>

      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Class Selection</div>
            <p className="text-xs text-zinc-600 max-w-md">
              Choose a class, load its learners, then pick any child on the left to see their profile on the right.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Mode</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`${btnOutline} h-8 px-3 ${mode === "single" ? "ring-2 ring-zinc-800" : ""}`}
                onClick={() => setMode("single")}
                disabled={classLoading}
              >
                Single-stream
              </button>
              <button
                type="button"
                className={`${btnOutline} h-8 px-3 ${mode === "multi" ? "ring-2 ring-zinc-800" : ""}`}
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
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Classroom</label>
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
              disabled={contactsLoading || !classroomId || classLoading}
            >
              {contactsLoading ? "Loading learners…" : "Load learners"}
            </button>
            <button
              type="button"
              className={btnOutline + " w-full"}
              onClick={() => void fetchClassOptions(mode)}
              disabled={classLoading}
            >
              Reload classes
            </button>
          </div>

          <div className="text-xs text-zinc-500 flex items-end">
            Tip: Use this view during{" "}
            <span className="font-semibold ml-1">welfare meetings, SHEP reviews, or PTA follow-ups</span>{" "}
            to look at a learner&apos;s situation calmly and holistically.
          </div>
        </div>

        {classError && (
          <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {classError}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 border rounded-xl p-4 bg-white flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Learners in {classLabel || "selected class"}</h2>
            {contactsLoading && <span className="text-[11px] text-zinc-500">Loading…</span>}
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
                const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed learner";
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
                      <div className="font-semibold truncate">{fullName}</div>
                      <div className="text-[11px] opacity-80">{c.classLabel || classLabel || "Class not set"}</div>
                      {c.guardianName && (
                        <div className="text-[11px] opacity-80 mt-0.5 truncate">Guardian: {c.guardianName}</div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="md:col-span-2 space-y-4">
          {!selectedStudent && (
            <div className="border rounded-xl p-4 bg-zinc-50">
              <h2 className="text-sm font-semibold mb-1">Select a learner on the left</h2>
              <p className="text-xs text-zinc-600 max-w-lg">
                When you click on a learner, their{" "}
                <span className="font-semibold">basic details, guardian contacts, attendance, and health history</span>{" "}
                will appear here.
              </p>
            </div>
          )}

          {selectedStudent && (
            <>
              <div className="border rounded-xl p-4 bg-white space-y-2">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold">
                      {[selectedStudent.firstName, selectedStudent.lastName].filter(Boolean).join(" ") || "Unnamed learner"}
                    </h2>
                    <div className="text-xs text-zinc-600">
                      Class:{" "}
                      <span className="font-semibold">{selectedStudent.classLabel || classLabel || "Unknown"}</span>
                    </div>
                    {selectedStudent.relationship && (
                      <div className="text-xs text-zinc-600">
                        Relationship: <span className="font-semibold">{selectedStudent.relationship}</span>
                      </div>
                    )}
                    {selectedStudent.notes && (
                      <div className="text-[11px] text-zinc-600 mt-1 max-w-lg">School note: {selectedStudent.notes}</div>
                    )}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="font-semibold text-zinc-700">Primary contact</div>

                    {selectedStudent.guardianName && (
                      <div className="text-zinc-600">
                        Name: <span className="font-semibold">{selectedStudent.guardianName}</span>
                      </div>
                    )}

                    {selectedStudent.guardianPhone ? (
                      <div className="text-zinc-600">
                        Phone:{" "}
                        <a href={`tel:${selectedStudent.guardianPhone}`} className="font-semibold underline underline-offset-2">
                          {selectedStudent.guardianPhone}
                        </a>
                      </div>
                    ) : (
                      <div className="text-zinc-500">No guardian phone number on record.</div>
                    )}

                    <div className="pt-2 border-t">
                      <div className="text-[11px] text-zinc-500">
                        Guardian SMS:{" "}
                        <span className="font-semibold">
                          {guardianSmsOptIn === null ? "—" : guardianSmsOptIn ? "ON" : "OFF"}
                        </span>
                        {guardianPhoneFromStatus ? (
                          <span className="ml-2 text-zinc-400">({guardianPhoneFromStatus})</span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-[11px] text-zinc-500">
                        Health consent:{" "}
                        <span className="font-semibold">{consentAt ? "GRANTED" : "NOT GRANTED"}</span>
                        {consentAt ? <span className="ml-2 text-zinc-400">{formatDateTime(consentAt)}</span> : null}
                      </div>

                      {consentError && (
                        <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                          {consentError}
                        </div>
                      )}
                      {consentOk && (
                        <div className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                          {consentOk}
                        </div>
                      )}

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

                      <div className="mt-3 border-t pt-3 space-y-2">
                        <div className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wide">
                          Request guardian consent
                        </div>

                        {sendError && (
                          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                            {sendError}
                          </div>
                        )}
                        {sendOk && (
                          <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                            {sendOk}
                          </div>
                        )}

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
                          <div className="rounded-xl border bg-zinc-50 p-3">
                            <div className="text-[11px] text-zinc-500 mb-1">Message preview</div>
                            <pre className="whitespace-pre-wrap text-[11px] text-zinc-800">{lastSendText}</pre>
                            {lastSendLink ? (
                              <div className="mt-2">
                                <a className="text-[11px] underline" href={lastSendLink} target="_blank" rel="noreferrer">
                                  Open consent link (preview)
                                </a>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <p className="text-[11px] text-zinc-500 max-w-sm">
                          Fever alerts require <span className="font-semibold">Health consent</span> +{" "}
                          <span className="font-semibold">Guardian SMS ON</span> + a guardian phone number.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500 max-w-lg">
                  Use this profile as a <span className="font-semibold">care lens</span> — for example, before calling home,
                  during SHEP or welfare meetings, or when planning support for a learner at risk.
                </p>
              </div>

              <div className="border rounded-xl p-4 bg-white space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                      Recent attendance (last 20 records)
                    </h3>
                    <p className="text-[11px] text-zinc-500 max-w-md">
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

                {attendanceError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {attendanceError}
                  </div>
                )}

                {!attendanceError && !attendanceLoading && !attendanceItems.length && (
                  <p className="text-xs text-zinc-600">
                    No recent attendance records found yet for this learner. Records will appear here as teachers take attendance.
                  </p>
                )}

                {!!attendanceItems.length && (
                  <ul className="space-y-1.5 text-xs mt-1">
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
                      } else if (item.status === "EXCUSED") {
                        badgeText = "Excused";
                        badgeClasses += " bg-blue-50 border-blue-200 text-blue-800";
                      }

                      return (
                        <li key={item.id} className="flex items-start justify-between gap-2 border-b last:border-b-0 pb-1.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{dateLabel}</span>
                              <span className={badgeClasses}>{badgeText}</span>
                            </div>
                            <div className="text-[11px] text-zinc-600">Class: {item.classLabel || "—"}</div>
                            {item.note && <div className="text-[11px] text-zinc-600 mt-0.5">Note: {item.note}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className="text-[11px] text-zinc-500 mt-1">
                  Attendance is shared to help <span className="font-semibold">notice patterns and support early</span>, not to blame families.
                </p>
              </div>

              <div className="border rounded-xl p-4 bg-white space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                      Recent health & temperature checks
                    </h3>
                    <p className="text-[11px] text-zinc-500 max-w-md">
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

                {healthError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {healthError}
                  </div>
                )}

                {!healthError && !healthLoading && !healthItems.length && (
                  <p className="text-xs text-zinc-600">
                    No health or temperature records found yet for this learner. When we check temperatures or record symptoms at school, they&apos;ll appear here.
                  </p>
                )}

                {!!healthItems.length && (
                  <ul className="space-y-1.5 text-xs mt-1">
                    {healthItems.map((h) => {
                      const dateLabel = formatDateShort(h.date);
                      const hasTemp = h.temperatureC !== null && typeof h.temperatureC === "number";
                      const tempLabel = hasTemp ? `${h.temperatureC!.toFixed(1)} °C` : "Not recorded";

                      const badgeClasses = h.isFever
                        ? "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-red-50 border-red-200 text-red-800"
                        : "inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-emerald-50 border-emerald-200 text-emerald-800";

                      const badgeText = h.isFever ? "Fever alert" : "Within range";

                      return (
                        <li key={h.id} className="flex items-start justify-between gap-2 border-b last:border-b-0 pb-1.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{dateLabel}</span>
                              <span className={badgeClasses}>{badgeText}</span>
                            </div>
                            <div className="text-[11px] text-zinc-600">
                              Temperature: <span className="font-semibold">{tempLabel}</span>
                            </div>
                            {h.symptoms && <div className="text-[11px] text-zinc-600 mt-0.5">Symptoms: {h.symptoms}</div>}
                            {h.notes && <div className="text-[11px] text-zinc-600 mt-0.5">Note: {h.notes}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className="text-[11px] text-zinc-500 mt-1">
                  Health data is shared to help you <span className="font-semibold">check on a child early</span> if patterns appear. It does not replace a hospital visit where needed.
                </p>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}