// src/components/attendance/AttendanceSessionClient.tsx
"use client";

import QrCameraScanner from "@/components/attendance/QrCameraScanner";
import { useEffect, useMemo, useRef, useState } from "react";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type ManualAttendanceStatus = "PRESENT" | "ABSENT";
type AttendanceDisplayStatus = AttendanceStatus | "UNMARKED";

type ApiErr = { ok: false; error: string };

type SessionDTO = {
  id: string;
  tenantId: string;
  classroomId: string;
  date: string;
  dateISO?: string;
  isClosed: boolean;
  closedAt: string | null;
  certifiedAt: string | null;
  certifiedByUserId?: string | null;
  takenByUserId: string | null;
  isHoliday: boolean;
  holidayReason: string | null;
  holidayDeclaredAt: string | null;
  holidayDeclaredByUserId: string | null;
};

type SessionAcademicCalendarDTO = {
  configured: boolean;
  academicYear: string | null;
  term: string | null;
  termNumber: 1 | 2 | 3 | null;
  startDateISO: string | null;
  endDateISO: string | null;
  reason: string | null;
  allowed: boolean;
  code: "OK" | "CALENDAR_NOT_CONFIGURED" | "DATE_OUTSIDE_CURRENT_TERM" | "WEEKEND" | "INVALID_DATE";
  message: string;
  weekNumber: number | null;
  weekStartDateISO: string | null;
  weekEndDateISO: string | null;
  expectedSchoolDays: number;
};

type ClassroomDTO = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

type StudentRowDTO = {
  id: string;
  firstName: string;
  lastName: string;
  name?: string;
  guardianName: string | null;
  guardianPhone: string | null;
  essentialAlertSmsEligible: boolean;
  essentialAlertEligibility:
    | "ELIGIBLE"
    | "NO_PHONE"
    | "NOT_ENROLLED"
    | "PHONE_CHANGED"
    | "POLICY_VERSION_MISMATCH"
    | "CONSENT_EVIDENCE_MISMATCH"
    | "PURPOSE_NOT_ALLOWED";
  healthConsentAt?: string | null;
  attendance: {
    markId?: string | null;
    isMarked?: boolean;
    status: AttendanceDisplayStatus;
    note: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
};

type SessionSummaryDTO = {
  students: number;
  total?: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

type PhysicalRegisterGender = "BOYS" | "GIRLS" | "UNCLASSIFIED";
type PhysicalRegisterPeriodKey = "TODAY" | "WEEK" | "TERM";

type PhysicalRegisterPeriodDTO = {
  label: string;
  startDateISO: string;
  endDateISO: string;
  timesOpened: number;
  boys: { present: number; absent: number };
  girls: { present: number; absent: number };
  unclassified: { present: number; absent: number };
  totalPresent: number;
  totalAbsent: number;
  legacyOtherOccurrences: number;
};

type PhysicalRegisterLearnerDTO = {
  studentId: string;
  name: string;
  gender: PhysicalRegisterGender;
  week: { present: number; timesOpened: number };
  term: { present: number; timesOpened: number };
};

type PhysicalRegisterDTO = {
  available: boolean;
  reason: string | null;
  asOfDateISO: string;
  academicYear: string | null;
  term: string | null;
  weekNumber: number | null;
  today: PhysicalRegisterPeriodDTO;
  week: PhysicalRegisterPeriodDTO;
  termToDate: PhysicalRegisterPeriodDTO;
  learners: PhysicalRegisterLearnerDTO[];
};

type GetOk = {
  ok: true;
  mode?: string;
  healthCaptureEnabled?: boolean;
  session: SessionDTO;
  classroom: ClassroomDTO | null;
  classLabel: string;
  academicCalendar: SessionAcademicCalendarDTO;
  holidayAuthority?: {
    roleName: string;
    canDeclareBeforeCertification: boolean;
    canSupersedeCertified: boolean;
  };
  summary?: SessionSummaryDTO;
  physicalRegister: PhysicalRegisterDTO;
  students: StudentRowDTO[];
};

type GetResponse = GetOk | ApiErr;

type SaveMarksOk = {
  ok: true;
  count: number;
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  correctionCount?: number;
};

type SaveMarksResponse = SaveMarksOk | ApiErr;

type MutateOk = { ok: true; session: SessionDTO };
type MutateResponse = MutateOk | ApiErr;

type HolidayOk = {
  ok: true;
  alreadyHoliday: boolean;
  supersededCertifiedAttendance: boolean;
  officialAttendanceExcluded: boolean;
  notificationExcluded: boolean;
  session: SessionDTO;
};
type HolidayResponse = HolidayOk | ApiErr;

type NotifyOk = {
  ok: true;
  alreadyNotified?: boolean;
  notifiedAt?: string;
  absentCount: number;
  eligibleCount: number;
  successCount: number;
  sentCount?: number;
  skippedCount: number;
  failedCount: number;
  skippedNoOptIn: number;
  skippedNoPhone: number;
  skippedNotActive?: number;
  brand?: string;
  testMode?: boolean;
  summaryText?: string;
  note?: string;
};

type NotifyResponse = NotifyOk | ApiErr;

type QrScanOk = {
  ok: true;
  status: "ACCEPTED" | "DUPLICATE" | "REJECTED";
  duplicate?: boolean;
  studentId?: string;
  studentName?: string;
  attendanceStatus?: AttendanceStatus;
  message?: string;
};

type QrScanResponse = QrScanOk | ApiErr;

type MarkState = {
  status: AttendanceDisplayStatus;
  note: string | null;
};

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const tinyFieldClass =
  "w-full rounded-lg border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 disabled:opacity-60";
const primaryBtn =
  "inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
const ghostBtn =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function fullName(s: { firstName: string; lastName: string; name?: string }) {
  return (
    s.name ||
    [s.firstName, s.lastName].filter(Boolean).join(" ").trim() ||
    "Unnamed learner"
  );
}

function isRealAttendanceStatus(
  status: AttendanceDisplayStatus,
): status is AttendanceStatus {
  return (
    status === "PRESENT" ||
    status === "ABSENT" ||
    status === "LATE" ||
    status === "EXCUSED"
  );
}

function Banner(props: {
  tone: "ok" | "error" | "info" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    props.tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : props.tone === "error"
        ? "border-rose-300/20 bg-rose-400/12 text-rose-100"
        : props.tone === "warn"
          ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
          : "border-white/10 bg-white/5 text-[#D7DCE5]";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      {props.children}
    </div>
  );
}

function CountChip(props: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  let cls = "border-white/10 bg-white/5 text-[#D7DCE5]";
  if (props.tone === "good")
    cls = "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  if (props.tone === "warn")
    cls = "border-amber-300/20 bg-amber-400/12 text-amber-100";
  if (props.tone === "bad")
    cls = "border-rose-300/20 bg-rose-400/12 text-rose-100";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] ${cls}`}
    >
      <span>{props.label}:</span>
      <span className="font-semibold">{props.value}</span>
    </span>
  );
}

function statusButtonClass(active: boolean, status: ManualAttendanceStatus) {
  if (!active)
    return "border-white/10 bg-white/5 text-[#D7DCE5] hover:bg-white/10";

  if (status === "PRESENT")
    return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";

  return "border-rose-300/20 bg-rose-400/12 text-rose-100";
}

function notifyLine(j: NotifyOk) {
  if (j.alreadyNotified) {
    return `Already notified${j.notifiedAt ? ` at ${new Date(j.notifiedAt).toLocaleString()}` : ""}.`;
  }

  const sent = j.sentCount ?? j.successCount;
  return (
    j.summaryText ||
    `Absent: ${j.absentCount}. SMS eligible: ${j.eligibleCount}. Sent: ${sent}. Skipped: ${j.skippedCount}. Failed: ${j.failedCount}.`
  );
}


function AttendanceStatusButtons({
  status,
  disabled,
  onChange,
  mobile = false,
}: {
  status: AttendanceDisplayStatus;
  disabled: boolean;
  onChange: (status: ManualAttendanceStatus) => void;
  mobile?: boolean;
}) {
  const legacyStatus =
    status === "LATE" ? "Late" : status === "EXCUSED" ? "Excused" : null;

  return (
    <div data-attendance-manual-statuses="present-absent-v1" className="space-y-2">
      {legacyStatus ? (
        <div className="text-[10px] font-medium text-amber-200">
          Previous status: {legacyStatus}. Choose Present or Absent when correcting it.
        </div>
      ) : null}

      <div className={mobile ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2"}>
        {(["PRESENT", "ABSENT"] as ManualAttendanceStatus[]).map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={[
              "border font-semibold transition disabled:opacity-60",
              mobile
                ? "min-h-11 rounded-xl px-3 py-2 text-xs"
                : "rounded-full px-4 py-1.5 text-xs",
              statusButtonClass(status === option, option),
            ].join(" ")}
          >
            {option === "PRESENT" ? "Present" : "Absent"}
          </button>
        ))}
      </div>
    </div>
  );
}

function GuideStep({
  number,
  label,
  shortLabel,
  state,
}: {
  number: number;
  label: string;
  shortLabel: string;
  state: "done" | "current" | "pending";
}) {
  const cls =
    state === "done"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : state === "current"
        ? "border-[#E8C96A]/35 bg-[#D4AF37]/14 text-[#F6E5A6]"
        : "border-white/10 bg-white/5 text-[#AEB6C4]";

  return (
    <div
      aria-current={state === "current" ? "step" : undefined}
      className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 ${cls}`}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/20 text-[10px] font-bold">
        {state === "done" ? "✓" : number}
      </span>
      <span className="truncate text-[10px] font-semibold sm:hidden">{shortLabel}</span>
      <span className="hidden truncate text-[10px] font-semibold sm:inline xl:text-[11px]">
        {label}
      </span>
    </div>
  );
}

export default function AttendanceSessionClient(props: {
  sessionId: string;
  initialClassName: string;
}) {
  const { sessionId } = props;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [classLabel, setClassLabel] = useState<string>(
    props.initialClassName || "Class",
  );
  const [students, setStudents] = useState<StudentRowDTO[]>([]);
  const [academicCalendar, setAcademicCalendar] =
    useState<SessionAcademicCalendarDTO | null>(null);
  const [holidayAuthority, setHolidayAuthority] = useState({
    roleName: "",
    canDeclareBeforeCertification: false,
    canSupersedeCertified: false,
  });
  const [marks, setMarks] = useState<Record<string, MarkState>>({});
  const baselineMarksRef = useRef<Record<string, MarkState>>({});

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [lastSaveAt, setLastSaveAt] = useState<string | null>(null);

  const [mutating, setMutating] = useState(false);
  const [mutMsg, setMutMsg] = useState<string | null>(null);
  const [mutErr, setMutErr] = useState<string | null>(null);

  const [holidayChecked, setHolidayChecked] = useState(false);
  const [holidayReason, setHolidayReason] = useState("");
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayMsg, setHolidayMsg] = useState<string | null>(null);
  const [holidayErr, setHolidayErr] = useState<string | null>(null);

  const [notifying, setNotifying] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [notifyErr, setNotifyErr] = useState<string | null>(null);

  const [qrToken, setQrToken] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [qrMsg, setQrMsg] = useState<string | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);
  const [showBadgeScanner, setShowBadgeScanner] = useState(false);
  const [showAttendanceSummary, setShowAttendanceSummary] = useState(false);
  const [physicalRegister, setPhysicalRegister] = useState<PhysicalRegisterDTO | null>(null);
  const [registerPeriod, setRegisterPeriod] = useState<PhysicalRegisterPeriodKey>("TODAY");
  const [showLearnerBreakdown, setShowLearnerBreakdown] = useState(false);

  const isCertified = !!session?.certifiedAt;
  const isClosed = !!session?.isClosed;
  const isHoliday = !!session?.isHoliday;
  const calendarMutationLocked = academicCalendar?.allowed !== true;
  const locked = isHoliday || isCertified || isClosed || calendarMutationLocked;

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(
        `/api/teacher/attendance/sessions/get?sessionId=${encodeURIComponent(sessionId)}`,
        {
          cache: "no-store",
        },
      );

      const j: GetResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse session response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setSession(j.session);
      setClassLabel(j.classLabel || props.initialClassName || "Class");
      setAcademicCalendar(j.academicCalendar);
      setHolidayAuthority(
        j.holidayAuthority ?? {
          roleName: "",
          canDeclareBeforeCertification: false,
          canSupersedeCertified: false,
        },
      );
      setStudents(Array.isArray(j.students) ? j.students : []);
      setPhysicalRegister(j.physicalRegister ?? null);

      const nextMarks: Record<string, MarkState> = {};

      for (const student of j.students) {
        const status = student.attendance?.status ?? "UNMARKED";
        nextMarks[student.id] = {
          status,
          note: student.attendance?.note ?? null,
        };
      }

      setMarks(nextMarks);
      baselineMarksRef.current = nextMarks;

      setSaveMsg(null);
      setSaveErr(null);
      setMutMsg(null);
      setMutErr(null);
      setHolidayChecked(false);
      setHolidayReason("");
      setHolidayMsg(null);
      setHolidayErr(null);
      setNotifyMsg(null);
      setNotifyErr(null);
      setQrMsg(null);
      setQrErr(null);
      setShowLearnerBreakdown(false);
    } catch (e: unknown) {
      const msg =
        safeText((e as { message?: unknown })?.message) ||
        "Failed to load session.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const dirty = useMemo(() => {
    const baseline = baselineMarksRef.current;

    for (const student of students) {
      const id = student.id;
      const current = marks[id] ?? { status: "UNMARKED", note: null };
      const old = baseline[id] ?? { status: "UNMARKED", note: null };

      if (current.status !== old.status) return true;
      if ((current.note ?? "") !== (old.note ?? "")) return true;
    }

    return false;
  }, [students, marks]);

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    let unmarked = 0;

    for (const student of students) {
      const status = marks[student.id]?.status ?? "UNMARKED";

      if (status === "PRESENT") present += 1;
      else if (status === "ABSENT") absent += 1;
      else if (status === "LATE") late += 1;
      else if (status === "EXCUSED") excused += 1;
      else unmarked += 1;
    }

    const total = students.length;
    const marked = present + absent + late + excused;

    return { total, marked, unmarked, present, absent, late, excused };
  }, [students, marks]);

  const selectedRegisterPeriod = useMemo(() => {
    if (!physicalRegister) return null;
    if (registerPeriod === "WEEK") return physicalRegister.week;
    if (registerPeriod === "TERM") return physicalRegister.termToDate;
    return physicalRegister.today;
  }, [physicalRegister, registerPeriod]);

  const registerSummaryTitle =
    registerPeriod === "TODAY"
      ? "Today's register summary"
      : registerPeriod === "WEEK"
        ? "This week's register summary"
        : "Term-to-date register summary";

  const selectedLearnerWindow = registerPeriod === "TERM" ? "term" : "week";

  const selectedLearners = useMemo(() => {
    if (!physicalRegister || registerPeriod === "TODAY") return [];

    return physicalRegister.learners.map((learner) => ({
      ...learner,
      selected: learner[selectedLearnerWindow],
    }));
  }, [physicalRegister, registerPeriod, selectedLearnerWindow]);

  function markRemainingPresent() {
    if (locked || loading || students.length === 0 || counts.unmarked === 0)
      return;

    setSaveErr(null);
    setSaveMsg(null);
    setMutErr(null);
    setMutMsg(null);

    setMarks((prev) => {
      const next: Record<string, MarkState> = { ...prev };

      for (const student of students) {
        const current = next[student.id] ?? { status: "UNMARKED", note: null };

        // Bank-grade safety:
        // Only UNMARKED learners are moved to PRESENT.
        // Existing ABSENT/LATE/EXCUSED marks are never overwritten.
        if (current.status === "UNMARKED") {
          next[student.id] = {
            ...current,
            status: "PRESENT",
          };
        }
      }

      return next;
    });
  }

  const alertPreview = useMemo(() => {
    const absentees = students.filter(
      (student) => marks[student.id]?.status === "ABSENT",
    );
    const eligible = absentees.filter(
      (student) => student.essentialAlertSmsEligible,
    );
    const skippedNoPhone = absentees.filter(
      (student) =>
        !student.essentialAlertSmsEligible &&
        student.essentialAlertEligibility === "NO_PHONE",
    ).length;
    const skippedNotEnabled = absentees.filter(
      (student) =>
        !student.essentialAlertSmsEligible &&
        student.essentialAlertEligibility !== "NO_PHONE",
    ).length;

    return {
      absentees,
      eligible,
      total: absentees.length,
      skippedNotEnabled,
      skippedNoPhone,
    };
  }, [students, marks]);

  const canSave = !!session && !loading && !saving && !locked && dirty;

  const canClose =
    !!session &&
    academicCalendar?.allowed === true &&
    !loading &&
    !mutating &&
    !saving &&
    !isHoliday &&
    !isCertified &&
    !isClosed &&
    !dirty &&
    !saveErr &&
    counts.unmarked === 0;

  const canCertify =
    !!session &&
    academicCalendar?.allowed === true &&
    !loading &&
    !mutating &&
    !saving &&
    !isHoliday &&
    !isCertified &&
    isClosed &&
    !dirty &&
    !saveErr &&
    counts.unmarked === 0;

  const canReopen =
    !!session &&
    academicCalendar?.allowed === true &&
    !loading &&
    !mutating &&
    !saving &&
    !isHoliday &&
    !isCertified &&
    isClosed;

  const canNotify =
    !!session &&
    academicCalendar?.allowed === true &&
    !loading &&
    !notifying &&
    !mutating &&
    !saving &&
    !isHoliday &&
    (isClosed || isCertified) &&
    !dirty &&
    !saveErr &&
    alertPreview.total > 0;

  const canStartHoliday =
    !!session &&
    !isHoliday &&
    academicCalendar?.allowed === true &&
    !loading &&
    !holidaySaving &&
    !saving &&
    !mutating &&
    !notifying &&
    !dirty &&
    (isCertified
      ? holidayAuthority.canSupersedeCertified
      : holidayAuthority.canDeclareBeforeCertification && counts.marked === 0);

  const holidayDisabledReason = (() => {
    if (!session) return "Session not loaded.";
    if (isHoliday) return "Holiday already recorded.";
    if (calendarMutationLocked)
      return academicCalendar?.message || "Academic calendar does not allow changes to this register.";
    if (isCertified && !holidayAuthority.canSupersedeCertified)
      return "Only the Headteacher or an authorized school administrator can correct a certified day to a holiday.";
    if (!isCertified && !holidayAuthority.canDeclareBeforeCertification)
      return "You cannot declare Holiday for this session.";
    if (!isCertified && counts.marked > 0)
      return "Clear or correct learner marks before declaring Holiday.";
    if (dirty) return "Clear unsaved learner changes before declaring Holiday.";
    if (holidaySaving || saving || mutating || notifying) return "Another attendance action is in progress.";
    return null;
  })();

  const qrBaseBlockReason = qrBaseDisabledReason();
  const canUseQrCamera = !!session && !qrBaseBlockReason;

  const canScanQr = canUseQrCamera && !qrBusy && qrToken.trim().length >= 16;

  function closeDisabledReason(): string | null {
    if (!session) return "Session not loaded.";
    if (calendarMutationLocked)
      return academicCalendar?.message || "Academic calendar does not allow changes to this register.";
    if (locked) return "Session is already locked.";
    if (dirty) return "Save changes first.";
    if (saveErr) return "Last save failed.";
    if (counts.unmarked > 0)
      return `${counts.unmarked} learner(s) are still unmarked.`;
    if (saving) return "Saving…";
    if (mutating) return "Processing…";
    return null;
  }

  function notifyDisabledReason(): string | null {
    if (!session) return "Session not loaded.";
    if (loading) return "Loading session…";
    if (calendarMutationLocked)
      return academicCalendar?.message || "Academic calendar does not allow notifications for this register.";
    if (isHoliday) return "Holiday sessions do not send attendance notifications.";
    if (!(isClosed || isCertified))
      return "Close or certify the session first.";
    if (dirty) return "You have unsaved changes. Save first.";
    if (saveErr) return "Last save failed. Fix save first.";
    if (alertPreview.total === 0) return "No absent learners to notify.";
    if (saving) return "Saving…";
    if (mutating) return "Processing…";
    if (notifying) return "Notifying…";
    return null;
  }

  function qrBaseDisabledReason(): string | null {
    if (!session) return "Session not loaded.";
    if (loading) return "Loading session…";
    if (calendarMutationLocked)
      return academicCalendar?.message || "Academic calendar does not allow changes to this register.";
    if (isHoliday) return "Holiday sessions cannot accept register seal scans.";
    if (locked)
      return "Closed or certified sessions cannot accept register seal scans.";
    if (dirty) return "Save manual changes before scanning.";
    if (saveErr) return "Last save failed. Fix save first.";
    if (saving) return "Saving…";
    if (mutating) return "Processing…";
    return null;
  }

  function qrDisabledReason(): string | null {
    const baseReason = qrBaseDisabledReason();
    if (baseReason) return baseReason;
    if (qrBusy) return "Scanning…";
    if (qrToken.trim().length < 16)
      return "Scan or paste a valid register seal payload.";
    return null;
  }

  async function saveAll(): Promise<boolean> {
    if (!session) return false;

    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);

    try {
      if (calendarMutationLocked) {
        throw new Error(
          academicCalendar?.message || "Academic calendar does not allow changes to this register.",
        );
      }
      if (isHoliday) throw new Error("This day is recorded as a holiday. Learner marks are locked.");
      if (locked) throw new Error("Session is locked (closed/certified).");

      const markItems = students
        .map((student) => ({
          studentId: student.id,
          status: marks[student.id]?.status ?? "UNMARKED",
          note: trimOrNull(marks[student.id]?.note),
        }))
        .filter(
          (
            item,
          ): item is {
            studentId: string;
            status: AttendanceStatus;
            note: string | null;
          } => isRealAttendanceStatus(item.status),
        );

      if (!markItems.length) {
        throw new Error(
          "No learners have been marked yet. Mark at least one learner before saving.",
        );
      }

      const r = await fetch("/api/teacher/attendance/marks/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, items: markItems }),
      });

      const j: SaveMarksResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse marks save response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      const now = new Date();
      setLastSaveAt(now.toLocaleTimeString());
      setSaveMsg(
        `Saved ${j.count} mark(s). Created: ${j.createdCount ?? 0}, updated: ${
          j.updatedCount ?? 0
        }, unchanged: ${j.unchangedCount ?? 0}.`,
      );

      await load();
      return true;
    } catch (e: unknown) {
      const msg =
        safeText((e as { message?: unknown })?.message) || "Save failed.";
      setSaveErr(msg);
      setSaveMsg(null);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function mutate(
    action: "close" | "certify" | "reopen",
  ): Promise<boolean> {
    if (!session) return false;

    setMutating(true);
    setMutMsg(null);
    setMutErr(null);

    try {
      if (calendarMutationLocked) {
        throw new Error(
          academicCalendar?.message || "Academic calendar does not allow changes to this register.",
        );
      }
      if ((action === "close" || action === "certify") && dirty) {
        throw new Error(
          "You have unsaved changes. Save before closing/certifying.",
        );
      }

      if ((action === "close" || action === "certify") && saveErr) {
        throw new Error("Last save failed. Fix save first.");
      }

      if ((action === "close" || action === "certify") && counts.unmarked > 0) {
        throw new Error(`${counts.unmarked} learner(s) are still unmarked.`);
      }

      let payload: { sessionId: string; reason?: string } = {
        sessionId: session.id,
      };

      if (action === "reopen") {
        const reason = window.prompt(
          "Why are you reopening this attendance session?",
        );
        const cleanReason = reason?.trim() ?? "";

        if (!cleanReason) {
          throw new Error("Reopen cancelled. A reason is required.");
        }

        if (cleanReason.length < 8) {
          throw new Error("A clearer reopen reason is required.");
        }

        payload = { sessionId: session.id, reason: cleanReason };
      }

      const r = await fetch(`/api/teacher/attendance/sessions/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j: MutateResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse session mutate response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setSession(j.session);
      setMutMsg(
        action === "close"
          ? "Session closed."
          : action === "certify"
            ? "Session certified."
            : "Session reopened.",
      );

      await load();
      return true;
    } catch (e: unknown) {
      setMutErr(
        safeText((e as { message?: unknown })?.message) || "Action failed.",
      );
      return false;
    } finally {
      setMutating(false);
    }
  }

  async function saveHoliday(): Promise<boolean> {
    if (!session) return false;

    setHolidaySaving(true);
    setHolidayMsg(null);
    setHolidayErr(null);

    try {
      if (calendarMutationLocked) {
        throw new Error(
          academicCalendar?.message ||
            "Academic calendar does not allow changes to this register.",
        );
      }

      if (!holidayChecked) {
        throw new Error("Tick Holiday first.");
      }

      const reason = holidayReason.trim();
      if (reason.length < 4) {
        throw new Error("Enter a clear holiday reason.");
      }

      if (!isCertified) {
        if (dirty) {
          throw new Error(
            "Unsaved learner marks exist. Clear them before saving Holiday.",
          );
        }
        if (counts.marked > 0) {
          throw new Error(
            "Holiday can be saved before certification only when there are no learner marks.",
          );
        }
      } else if (!holidayAuthority.canSupersedeCertified) {
        throw new Error(
          "Only the Headteacher or an authorized school administrator can correct a certified day to a holiday.",
        );
      }

      let confirmCertifiedSupersession = false;
      if (isCertified) {
        confirmCertifiedSupersession = window.confirm(
          "Correct this certified day to Holiday? Original learner marks and certification will be preserved as evidence, but the day will be excluded from official attendance totals and future attendance notifications.",
        );

        if (!confirmCertifiedSupersession) {
          throw new Error("Holiday correction cancelled.");
        }
      }

      const r = await fetch("/api/teacher/attendance/sessions/holiday", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          reason,
          confirmCertifiedSupersession,
        }),
      });

      const j: HolidayResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse holiday response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setSession(j.session);
      const successMessage = j.supersededCertifiedAttendance
        ? "Certified attendance preserved as evidence. This day is now excluded from official attendance as a holiday."
        : "Holiday saved. No Times Opened or learner attendance will be counted for this day.";

      await load();
      setHolidayMsg(successMessage);
      return true;
    } catch (e: unknown) {
      setHolidayErr(
        safeText((e as { message?: unknown })?.message) ||
          "Failed to save holiday.",
      );
      return false;
    } finally {
      setHolidaySaving(false);
    }
  }

  async function notifyParents(): Promise<boolean> {
    if (!session) return false;

    setNotifying(true);
    setNotifyMsg(null);
    setNotifyErr(null);

    try {
      if (calendarMutationLocked) {
        throw new Error(
          academicCalendar?.message || "Academic calendar does not allow notifications for this register.",
        );
      }
      if (session.isHoliday) {
        throw new Error("Holiday sessions do not send attendance notifications.");
      }
      if (!session.isClosed && !session.certifiedAt) {
        throw new Error("Close or certify the session before notifications.");
      }

      if (dirty) throw new Error("You have unsaved changes. Save first.");
      if (saveErr) throw new Error("Last save failed. Fix save first.");
      if (alertPreview.total === 0)
        throw new Error("No absent learners to notify.");

      const r = await fetch("/api/teacher/attendance/notify-parents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });

      const j: NotifyResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse notify response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setNotifyMsg(`${notifyLine(j)}${j.testMode ? " (TEST MODE)" : ""}`);

      await load();
      return true;
    } catch (e: unknown) {
      setNotifyErr(
        safeText((e as { message?: unknown })?.message) || "Notify failed.",
      );
      return false;
    } finally {
      setNotifying(false);
    }
  }

  async function submitQrPayload(rawPayload: string) {
    if (!session) return;

    const token = rawPayload.trim();

    setQrBusy(true);
    setQrMsg(null);
    setQrErr(null);

    try {
      const baseReason = qrBaseDisabledReason();
      if (baseReason) throw new Error(baseReason);

      if (token.length < 16) {
        throw new Error("Scan or paste a valid register seal payload.");
      }

      const r = await fetch("/api/teacher/attendance/qr/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, token }),
      });

      const j: QrScanResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse register seal scan response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      const successMessage =
        j.message || `${j.studentName || "Learner"} scanned successfully.`;

      setQrToken("");
      await load();

      // load() clears QR banners, so set the final message after refresh.
      setQrMsg(successMessage);
    } catch (e: unknown) {
      setQrErr(
        safeText((e as { message?: unknown })?.message) ||
          "Register seal scan failed.",
      );
    } finally {
      setQrBusy(false);
    }
  }

  async function scanQrBadge() {
    await submitQrPayload(qrToken);
  }

  function statusPill() {
    const base =
      "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold";
    if (isHoliday)
      return `${base} border-sky-300/20 bg-sky-400/12 text-sky-100`;
    if (isCertified)
      return `${base} border-indigo-300/20 bg-indigo-400/12 text-indigo-100`;
    if (isClosed)
      return `${base} border-rose-300/20 bg-rose-400/12 text-rose-100`;
    return `${base} border-amber-300/20 bg-amber-400/12 text-amber-100`;
  }


  const allLearnersMarked = counts.total > 0 && counts.unmarked === 0;
  const marksSaved = allLearnersMarked && !dirty && !saveErr;
  const registerClosed = isClosed || isCertified;
  const legacyStatusCount = counts.late + counts.excused;

  const guideCurrentStep = isHoliday
    ? 4
    : isCertified
      ? 4
      : registerClosed
      ? 4
      : !allLearnersMarked
        ? 1
        : !marksSaved
          ? 2
          : 3;

  const guideMessage = isHoliday
    ? session?.certifiedAt
      ? "Holiday correction saved. Original certified marks are preserved as evidence and excluded from official totals."
      : "Holiday saved. Do not mark learners; this day does not count as Times Opened."
    : isCertified
      ? alertPreview.total > 0
      ? `Certified. ${alertPreview.total} absent learner(s) can now be notified.`
      : "Certified. Attendance is complete."
    : registerClosed
      ? "Register closed. Certify attendance next."
      : !allLearnersMarked
        ? `Mark every learner Present or Absent. ${counts.unmarked} still unmarked.`
        : dirty
          ? "All learners are marked. Save marks next."
          : "Marks are saved. Close the register next.";

  return (
    <section className="space-y-4">
      <section className={`${shellCard} p-4 md:p-5`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
              EduLife OS · Manual Attendance
            </div>

            <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#F7F4ED] md:text-2xl">
              Attendance Session
            </h1>

            {session ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#D7DCE5]">
                <span className="font-semibold text-[#F7F4ED]">{classLabel}</span>
                <span>•</span>
                <span>{session.date}</span>
                {academicCalendar?.weekNumber ? (
                  <span className="rounded-full border border-[#E8C96A]/20 bg-[#D4AF37]/10 px-2 py-0.5 text-[10px] font-semibold text-[#E8C96A]">
                    Week {academicCalendar.weekNumber}
                  </span>
                ) : null}
                <span className={statusPill()}>
                  {isHoliday
                    ? "HOLIDAY"
                    : isCertified
                      ? "CERTIFIED"
                      : isClosed
                        ? "CLOSED"
                        : "OPEN"}
                </span>
                {dirty ? (
                  <span className="text-[11px] font-semibold text-amber-200">
                    Unsaved changes
                  </span>
                ) : null}
                {lastSaveAt ? (
                  <span className="text-[11px] text-[#8F98A8]">
                    Saved {lastSaveAt}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[#AEB6C4]">Loading session…</p>
            )}
          </div>

          {!locked ? (
            <button
              type="button"
              onClick={() => setShowBadgeScanner((current) => !current)}
              disabled={!session || loading}
              className={ghostBtn}
              aria-expanded={showBadgeScanner}
              aria-controls="attendance-badge-scanner"
            >
              {showBadgeScanner ? "Hide badge scanner" : "Scan learner badge"}
            </button>
          ) : null}
        </div>
      </section>

      {err ? <Banner tone="error">{err}</Banner> : null}

      {academicCalendar && !academicCalendar.allowed ? (
        <Banner tone="warn">
          <b>Read-only register.</b> {academicCalendar.message} Existing attendance history is preserved.
        </Banner>
      ) : null}

      {counts.unmarked > 0 && !locked ? (
        <Banner tone="warn">
          <b>{counts.unmarked} learner(s) are still unmarked.</b> Mark every learner
          before closing the register.
        </Banner>
      ) : null}

      {saveErr ? (
        <Banner tone="error">
          <b>Save failed:</b> {saveErr}
          <div className="mt-1 text-[11px] text-rose-200">
            Fix this before closing or certifying.
          </div>
        </Banner>
      ) : null}

      {saveMsg ? <Banner tone="ok">{saveMsg}</Banner> : null}
      {mutErr ? <Banner tone="error">{mutErr}</Banner> : null}
      {mutMsg ? <Banner tone="info">{mutMsg}</Banner> : null}
      {holidayErr ? <Banner tone="error">{holidayErr}</Banner> : null}
      {holidayMsg ? <Banner tone="ok">{holidayMsg}</Banner> : null}
      {isHoliday && session ? (
        <Banner tone="info">
          <b>Holiday:</b> {session.holidayReason || "School closed."} This day is excluded from Times Opened, official attendance totals and future attendance notifications.
          {session.certifiedAt ? (
            <span className="block mt-1 text-[11px]">Original certified learner marks remain preserved as audit evidence.</span>
          ) : null}
        </Banner>
      ) : null}
      {notifyErr ? <Banner tone="error">{notifyErr}</Banner> : null}
      {notifyMsg ? <Banner tone="info">{notifyMsg}</Banner> : null}
      {qrErr ? <Banner tone="error">{qrErr}</Banner> : null}
      {qrMsg ? <Banner tone="ok">{qrMsg}</Banner> : null}

      <section
        data-attendance-bbc-guide="v1"
        data-attendance-guide-sticky="compact-v2"
        className="sticky top-[var(--teacher-sticky-top)] z-30 rounded-2xl border border-[#E8C96A]/20 bg-[rgba(8,12,19,0.96)] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.34)] backdrop-blur-xl"
      >
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 xl:max-w-[36%]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#F7F4ED]">What to do</span>
              <span className="rounded-full border border-[#E8C96A]/20 bg-[#D4AF37]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#E8C96A]">
                {isHoliday ? "Holiday" : `Step ${guideCurrentStep} of 4`}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] leading-4 text-[#C9CDD6] sm:whitespace-normal">
              {guideMessage}
            </p>
          </div>

          {isHoliday ? (
            <div className="rounded-xl border border-sky-300/20 bg-sky-400/10 px-4 py-2 text-[11px] font-semibold text-sky-100 xl:min-w-[300px]">
              ✓ Holiday recorded · No learner attendance required
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 xl:min-w-[500px]">
              <GuideStep
                number={1}
                label="Mark learners"
                shortLabel="Mark"
                state={
                  allLearnersMarked
                    ? "done"
                    : guideCurrentStep === 1
                      ? "current"
                      : "pending"
                }
              />
              <GuideStep
                number={2}
                label="Save marks"
                shortLabel="Save"
                state={
                  marksSaved
                    ? "done"
                    : guideCurrentStep === 2
                      ? "current"
                      : "pending"
                }
              />
              <GuideStep
                number={3}
                label="Close register"
                shortLabel="Close"
                state={
                  registerClosed
                    ? "done"
                    : guideCurrentStep === 3
                      ? "current"
                      : "pending"
                }
              />
              <GuideStep
                number={4}
                label="Certify"
                shortLabel="Certify"
                state={
                  isCertified
                    ? "done"
                    : guideCurrentStep === 4
                      ? "current"
                      : "pending"
                }
              />
            </div>
          )}
        </div>

        {session && !isHoliday && (
          (!isCertified && holidayAuthority.canDeclareBeforeCertification) ||
          (isCertified && holidayAuthority.canSupersedeCertified)
        ) ? (
          <div
            data-attendance-holiday-control="v1"
            className="mt-2 rounded-xl border border-sky-300/15 bg-sky-400/8 p-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <label
                className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-sky-100"
                title={holidayDisabledReason ?? undefined}
              >
                <input
                  type="checkbox"
                  checked={holidayChecked}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setHolidayChecked(checked);
                    if (!checked) {
                      setHolidayReason("");
                      setHolidayErr(null);
                    }
                  }}
                  disabled={!canStartHoliday && !holidayChecked}
                  className="h-4 w-4 rounded border-white/20 bg-[#07111F]"
                />
                Holiday / school closed
              </label>

              {!holidayChecked && holidayDisabledReason ? (
                <span className="text-[10px] text-sky-100/70">
                  {holidayDisabledReason}
                </span>
              ) : null}
            </div>

            {holidayChecked ? (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={holidayReason}
                  onChange={(event) => setHolidayReason(event.target.value)}
                  maxLength={500}
                  placeholder={
                    isCertified
                      ? "Reason for correcting this certified day to Holiday"
                      : "Reason, e.g. Public holiday"
                  }
                  className={`${tinyFieldClass} flex-1`}
                  disabled={holidaySaving}
                  aria-label="Holiday reason"
                />
                <button
                  type="button"
                  onClick={() => void saveHoliday()}
                  disabled={
                    holidaySaving ||
                    holidayReason.trim().length < 4 ||
                    !canStartHoliday
                  }
                  className="inline-flex items-center justify-center rounded-lg bg-sky-200 px-3 py-2 text-[11px] font-semibold text-[#071A3D] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {holidaySaving
                    ? "Saving…"
                    : isCertified
                      ? "Correct to Holiday"
                      : "Save Holiday"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
          {!locked ? (
            <>
              <button
                type="button"
                onClick={markRemainingPresent}
                disabled={loading || saving || mutating || counts.unmarked === 0}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                title="Only unmarked learners are changed to PRESENT. Existing marks are never overwritten."
              >
                Mark remaining Present{counts.unmarked > 0 ? ` (${counts.unmarked})` : ""}
              </button>

              <button
                type="button"
                onClick={() => void saveAll()}
                disabled={!canSave}
                className="inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-1.5 text-[11px] font-semibold text-[#071A3D] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save marks"}
              </button>

              <button
                type="button"
                onClick={() => void mutate("close")}
                disabled={!canClose}
                className={canClose
                  ? "inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-1.5 text-[11px] font-semibold text-[#071A3D] transition hover:brightness-105"
                  : "inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-[#AEB6C4] disabled:cursor-not-allowed disabled:opacity-50"}
                title={closeDisabledReason() ?? "Close register"}
              >
                Close register
              </button>
            </>
          ) : null}

          {isClosed && !isCertified ? (
            <>
              <button
                type="button"
                onClick={() => void mutate("certify")}
                disabled={!canCertify}
                className="inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-1.5 text-[11px] font-semibold text-[#071A3D] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                title={counts.unmarked > 0 ? "Mark all learners first." : "Certify attendance"}
              >
                Certify attendance
              </button>

              <button
                type="button"
                onClick={() => void mutate("reopen")}
                disabled={!canReopen}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                title="Reopen only when you need to correct a mark"
              >
                Reopen to correct
              </button>
            </>
          ) : null}

          {isCertified && !isHoliday ? (
            <span className="inline-flex items-center rounded-lg border border-emerald-300/20 bg-emerald-400/12 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">
              ✓ Certified
            </span>
          ) : null}

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:min-w-fit">
            <button
              type="button"
              onClick={() => setShowAttendanceSummary((current) => !current)}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
              aria-expanded={showAttendanceSummary}
              aria-controls="attendance-summary-panel"
            >
              Register summary {showAttendanceSummary ? "▴" : "▾"}
            </button>

            {!isHoliday ? (
              <button
                type="button"
                onClick={() => void notifyParents()}
                disabled={!canNotify}
                className="inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-1.5 text-[11px] font-semibold text-[#071A3D] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                title={notifyDisabledReason() ?? "Notify eligible parents"}
              >
                {notifying ? "Notifying…" : "Notify parents"}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {showAttendanceSummary ? (
        <section
          id="attendance-summary-panel"
          data-attendance-summary-ui="physical-register-v1"
          className={`${shellCard} p-4`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-[#F7F4ED]">
                {registerSummaryTitle}
              </div>
              <p className="mt-1 text-[10px] leading-4 text-[#AEB6C4]">
                Official figures count certified, non-holiday sessions only.
              </p>
            </div>

            <div
              data-attendance-register-periods="today-week-term-v1"
              className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-[#05070B] p-1"
            >
              {([
                ["TODAY", "Today"],
                ["WEEK", "This week"],
                ["TERM", "Term to date"],
              ] as Array<[PhysicalRegisterPeriodKey, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={registerPeriod === key}
                  onClick={() => {
                    setRegisterPeriod(key);
                    setShowLearnerBreakdown(false);
                  }}
                  className={`rounded-lg px-2 py-2 text-[10px] font-semibold sm:px-3 ${
                    registerPeriod === key
                      ? "bg-[#D4AF37] text-[#071A3D]"
                      : "text-[#C9CDD6] hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!physicalRegister?.available ? (
            <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
              {physicalRegister?.reason ||
                "Official register totals are not available for this date."}
            </div>
          ) : selectedRegisterPeriod ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[#F7F4ED]">
                  {selectedRegisterPeriod.label}
                </span>
                <span className="text-[10px] text-[#8F98A8]">
                  {selectedRegisterPeriod.startDateISO}
                  {selectedRegisterPeriod.startDateISO !== selectedRegisterPeriod.endDateISO
                    ? ` → ${selectedRegisterPeriod.endDateISO}`
                    : ""}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-xl border border-[#E8C96A]/20 bg-[#D4AF37]/10 px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wide text-[#E8C96A]">Times Opened</div>
                  <div className="mt-1 text-lg font-semibold text-[#F7F4ED]">
                    {selectedRegisterPeriod.timesOpened}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2">
                  <div className="text-[9px] text-emerald-100/80">Male Present</div>
                  <div className="mt-1 text-base font-semibold text-emerald-100">
                    {selectedRegisterPeriod.boys.present}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2">
                  <div className="text-[9px] text-rose-100/80">Male Absent</div>
                  <div className="mt-1 text-base font-semibold text-rose-100">
                    {selectedRegisterPeriod.boys.absent}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2">
                  <div className="text-[9px] text-emerald-100/80">Female Present</div>
                  <div className="mt-1 text-base font-semibold text-emerald-100">
                    {selectedRegisterPeriod.girls.present}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2">
                  <div className="text-[9px] text-rose-100/80">Female Absent</div>
                  <div className="mt-1 text-base font-semibold text-rose-100">
                    {selectedRegisterPeriod.girls.absent}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[9px] text-[#AEB6C4]">Total Present</div>
                  <div className="mt-1 text-base font-semibold text-[#F7F4ED]">
                    {selectedRegisterPeriod.totalPresent}
                  </div>
                </div>
              </div>

              {registerPeriod === "TODAY" && selectedRegisterPeriod.timesOpened === 0 ? (
                <p className="mt-3 text-[10px] leading-4 text-[#AEB6C4]">
                  This day is not in official totals yet. A normal school day counts as Times Opened only after certification; a Holiday never counts.
                </p>
              ) : null}

              {selectedRegisterPeriod.unclassified.present > 0 ||
              selectedRegisterPeriod.unclassified.absent > 0 ? (
                <p className="mt-2 text-[10px] leading-4 text-amber-200">
                  Unclassified sex/gender: {selectedRegisterPeriod.unclassified.present} Present ·{" "}
                  {selectedRegisterPeriod.unclassified.absent} Absent. EduLife OS never guesses a learner&apos;s sex/gender.
                </p>
              ) : null}

              {selectedRegisterPeriod.legacyOtherOccurrences > 0 ? (
                <p className="mt-2 text-[10px] leading-4 text-amber-200">
                  {selectedRegisterPeriod.legacyOtherOccurrences} historical Late/Excused occurrence(s) are preserved but are not reclassified as Present or Absent.
                </p>
              ) : null}

              {registerPeriod !== "TODAY" ? (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowLearnerBreakdown((current) => !current)}
                    className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
                    aria-expanded={showLearnerBreakdown}
                  >
                    Learner breakdown {showLearnerBreakdown ? "▴" : "▾"}
                  </button>

                  {showLearnerBreakdown ? (
                    <div
                      data-attendance-learner-times-opened="x-out-of-y-v1"
                      className="mt-2 max-h-72 divide-y divide-white/10 overflow-y-auto rounded-xl border border-white/10 bg-[#07111F]/70"
                    >
                      {selectedLearners.map((learner) => (
                        <div
                          key={learner.studentId}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[#F7F4ED]">
                              {learner.name}
                            </div>
                            <div className="text-[9px] text-[#8F98A8]">
                              {learner.gender === "BOYS"
                                ? "Male"
                                : learner.gender === "GIRLS"
                                  ? "Female"
                                  : "Unclassified"}
                            </div>
                          </div>
                          <div className="shrink-0 text-right font-semibold text-[#D7DCE5]">
                            Present {learner.selected.present} out of {learner.selected.timesOpened} times opened
                          </div>
                        </div>
                      ))}

                      {selectedLearners.length === 0 ? (
                        <div className="px-3 py-4 text-center text-[11px] text-[#AEB6C4]">
                          No active learners are currently attached to this register.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8F98A8]">
              Current session evidence
            </div>
            {isHoliday ? (
              <p className="mt-1 text-[10px] leading-4 text-sky-100">
                Preserved marks below are historical evidence only and are excluded from official totals.
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <CountChip label="Total" value={counts.total} />
              <CountChip label="Marked" value={counts.marked} />
              <CountChip
                label="Unmarked"
                value={counts.unmarked}
                tone={counts.unmarked ? "warn" : "good"}
              />
              <CountChip label="Present" value={counts.present} tone="good" />
              <CountChip label="Absent" value={counts.absent} tone="bad" />
              {legacyStatusCount > 0 ? (
                <CountChip label="Previous status" value={legacyStatusCount} tone="warn" />
              ) : null}
            </div>

            <p className="mt-3 text-[11px] leading-5 text-[#AEB6C4]">
              Parent alerts: <b>{alertPreview.absentees.length}</b> absent •{" "}
              <b>{alertPreview.eligible.length}</b> Essential Alerts eligible •{" "}
              <b>{alertPreview.skippedNotEnabled}</b> not enabled •{" "}
              <b>{alertPreview.skippedNoPhone}</b> no phone
            </p>
          </div>
        </section>
      ) : null}

      {showBadgeScanner && !locked ? (
        <section
          id="attendance-badge-scanner"
          data-attendance-scanner-ui="collapsed-v1"
          className={`${shellCard} p-4 md:p-5`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#F7F4ED]">
                Scan learner badge
              </div>
              <p className="mt-1 text-[11px] leading-5 text-[#C9CDD6]">
                Scan an EduLife attendance badge with the camera, a keyboard scanner,
                or paste its seal. A valid badge marks that learner Present. Manual
                corrections remain available below.
              </p>

              <input
                type="text"
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canScanQr) void scanQrBadge();
                }}
                disabled={locked || loading || qrBusy}
                className={`${tinyFieldClass} mt-3 font-mono`}
                placeholder="Scan or paste learner badge"
                autoComplete="off"
              />

              <QrCameraScanner
                disabled={!canUseQrCamera}
                disabledReason={qrBaseBlockReason}
                scanBusy={qrBusy}
                onPayload={(payload) => submitQrPayload(payload)}
              />
            </div>

            <button
              type="button"
              onClick={() => void scanQrBadge()}
              disabled={!canScanQr}
              className={primaryBtn}
              title={qrDisabledReason() ?? "Mark learner Present by badge"}
            >
              {qrBusy ? "Scanning…" : "Use scanned badge"}
            </button>
          </div>

          {!canScanQr ? (
            <p className="mt-3 text-[11px] text-[#AEB6C4]">
              {qrDisabledReason() || "Badge scanning is ready."}
            </p>
          ) : null}
        </section>
      ) : null}

      <section
        data-attendance-register-ui="primary-v1"
        className={`${shellCard} overflow-hidden`}
      >
        <div className="border-b border-white/10 px-4 py-4 md:px-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#F7F4ED]">
                Learner register
              </h2>
              <p className="mt-1 text-[11px] text-[#AEB6C4]">
                Tap Present or Absent for every learner. Mark note is optional.
              </p>
            </div>

            {!locked && counts.unmarked > 0 ? (
              <span className="rounded-full border border-amber-300/20 bg-amber-400/12 px-3 py-1 text-[11px] font-semibold text-amber-100">
                {counts.unmarked} still unmarked
              </span>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-[#C9CDD6]">Loading learners…</div>
        ) : students.length === 0 ? (
          <div className="p-4 text-sm text-[#C9CDD6]">
            No learners found for this classroom.
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/10 md:hidden">
              {students.map((student) => {
                const mark = marks[student.id] ?? {
                  status: "UNMARKED",
                  note: null,
                };
                const unmarked = mark.status === "UNMARKED";

                return (
                  <article key={student.id} className="space-y-3 p-4">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-[#F7F4ED]">
                          {fullName(student)}
                        </div>
                        {unmarked ? (
                          <span className="shrink-0 rounded-lg border border-amber-300/20 bg-amber-400/12 px-2 py-1 text-[10px] font-semibold text-amber-100">
                            UNMARKED
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-[11px] leading-5 text-[#8F98A8]">
                        {student.guardianName || "No guardian name"} •{" "}
                        {student.guardianPhone || "No phone"}
                        {student.essentialAlertSmsEligible
                          ? ""
                          : student.essentialAlertEligibility === "NO_PHONE"
                            ? " • no phone"
                            : " • Essential Alerts not enabled"}
                      </div>
                    </div>

                    <AttendanceStatusButtons
                      status={mark.status}
                      disabled={locked}
                      mobile
                      onChange={(status) =>
                        setMarks((prev) => ({
                          ...prev,
                          [student.id]: { ...mark, status },
                        }))
                      }
                    />

                    <input
                      type="text"
                      disabled={locked}
                      className={tinyFieldClass}
                      value={mark.note ?? ""}
                      onChange={(e) =>
                        setMarks((prev) => ({
                          ...prev,
                          [student.id]: {
                            ...mark,
                            note: e.target.value || null,
                          },
                        }))
                      }
                      placeholder={locked ? "Locked" : "Optional note"}
                    />
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[860px] w-full text-sm">
                <thead className="bg-white/5">
                  <tr className="[&>th]:px-3 [&>th]:py-3 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold text-[#C9CDD6]">
                    <th>Learner</th>
                    <th>Status</th>
                    <th>Mark note</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {students.map((student) => {
                    const mark = marks[student.id] ?? {
                      status: "UNMARKED",
                      note: null,
                    };
                    const unmarked = mark.status === "UNMARKED";

                    return (
                      <tr
                        key={student.id}
                        className="[&>td]:px-3 [&>td]:py-3 align-top odd:bg-transparent even:bg-white/[0.02]"
                      >
                        <td>
                          <div className="font-medium text-[#F7F4ED]">
                            {fullName(student)}
                          </div>
                          <div className="text-[11px] text-[#8F98A8]">
                            {student.guardianName || "—"} •{" "}
                            {student.guardianPhone || "—"}
                            {student.essentialAlertSmsEligible
                              ? ""
                              : student.essentialAlertEligibility === "NO_PHONE"
                                ? " • (no phone)"
                                : " • (Essential Alerts not enabled)"}
                          </div>

                          {unmarked ? (
                            <div className="mt-1 inline-flex rounded-lg border border-amber-300/20 bg-amber-400/12 px-2 py-0.5 text-[11px] text-amber-100">
                              UNMARKED
                            </div>
                          ) : null}
                        </td>

                        <td className="min-w-[220px]">
                          <AttendanceStatusButtons
                            status={mark.status}
                            disabled={locked}
                            onChange={(status) =>
                              setMarks((prev) => ({
                                ...prev,
                                [student.id]: { ...mark, status },
                              }))
                            }
                          />
                        </td>

                        <td className="min-w-[240px]">
                          <input
                            type="text"
                            disabled={locked}
                            className={tinyFieldClass}
                            value={mark.note ?? ""}
                            onChange={(e) =>
                              setMarks((prev) => ({
                                ...prev,
                                [student.id]: {
                                  ...mark,
                                  note: e.target.value || null,
                                },
                              }))
                            }
                            placeholder={
                              locked ? "Locked" : "Optional attendance note"
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
