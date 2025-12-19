// src/components/ParentOtpLoginClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Step = "enterPhone" | "enterCode" | "verified";

type RequestResponse = {
  ok: boolean;
  token?: string;
  debugCode?: string;
  validForMinutes?: number;
  error?: string;
};

type VerifyResponse = {
  ok: boolean;
  error?: string;
};

type LinkedChild = {
  id: string;
  name: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  classroom?: {
    id: string;
    name?: string | null;
    grade?: string | null;
    arm?: string | null;
  } | null;
};

type ChildrenResponse = {
  ok: boolean;
  guardianPhone?: string;
  students?: LinkedChild[];
  count?: number;
  error?: string;
};

type FeeSummary = {
  totalBilled: number;
  totalPaid: number;
  balance: number;
  lastPaymentDate?: string | null;
  lastPaymentAmount?: number | null;
  note?: string | null;
};

type FeeSummaryResponse = {
  ok: boolean;
  studentId?: string;
  term?: string;
  academicYear?: string;
  summary?: FeeSummary;
  error?: string;
};

type GesRemark = {
  grade: number;
  label: string;
  band: string;
};

type SubjectAssessmentSummary = {
  subject: string;
  itemCount: number;
  totalObtained: number;
  totalMax: number;
  percentage: number | null;
  ges: GesRemark | null;
};

type AssessmentSummary = {
  totalItems: number;
  totalObtained: number;
  totalMax: number;
  percentage: number | null;
  ges: GesRemark | null;
  subjects: SubjectAssessmentSummary[];
  note?: string | null;
};

type AssessmentSummaryResponse = {
  ok: boolean;
  studentId?: string;
  term?: string;
  academicYear?: string;
  summary?: AssessmentSummary;
  error?: string;
};

type AttendanceSummary = {
  totalSessions: number;
  daysPresent: number;
  daysAbsent: number;
  daysLate: number;
  attendanceRate: number | null;
  note?: string | null;
};

type AttendanceSummaryResponse = {
  ok: boolean;
  studentId?: string;
  term?: string;
  academicYear?: string;
  summary?: AttendanceSummary;
  error?: string;
};

type SmsMessage = {
  id: string;
  sentAt: string;
  direction: "OUTBOUND" | "INBOUND" | "UNKNOWN";
  channel: string;
  status: string;
  category: string;
  textPreview: string;
};

type SmsSummaryResponse = {
  ok: boolean;
  guardianPhone?: string;
  studentId?: string | null;
  messages?: SmsMessage[];
  note?: string | null;
  error?: string;
};

type SettingsResponse = {
  ok: boolean;
  term?: string;
  academicYear?: string;
  error?: string;
};

// Fallback (used as initial value if settings API fails)
const FALLBACK_TERM = "1st Term";
const FALLBACK_ACADEMIC_YEAR = "2025/2026";

const ParentOtpLoginClient: React.FC = () => {
  const [step, setStep] = useState<Step>("enterPhone");

  const [guardianPhone, setGuardianPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [backendToken, setBackendToken] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Settings: current term & academic year
  const [currentTerm, setCurrentTerm] = useState(FALLBACK_TERM);
  const [currentAcademicYear, setCurrentAcademicYear] = useState(
    FALLBACK_ACADEMIC_YEAR
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Children state
  const [children, setChildren] = useState<LinkedChild[] | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  // Which learner is selected in the list
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    null
  );

  const selectedChild = useMemo(() => {
    if (!children || !selectedChildId) return null;
    return children.find((c) => c.id === selectedChildId) ?? null;
  }, [children, selectedChildId]);

  // Fee summary state for selected learner
  const [feeSummary, setFeeSummary] = useState<FeeSummary | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);

  // Assessment summary state for selected learner
  const [assessmentSummary, setAssessmentSummary] =
    useState<AssessmentSummary | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(
    null
  );

  // Attendance summary state for selected learner
  const [attendanceSummary, setAttendanceSummary] =
    useState<AttendanceSummary | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(
    null
  );

  // SMS summary state for guardian / selected learner
  const [smsMessages, setSmsMessages] = useState<SmsMessage[] | null>(
    null
  );
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsNote, setSmsNote] = useState<string | null>(null);

  // -------------------------
  // Helper: load current term/year settings (from API)
  // -------------------------
  async function loadCurrentTermSettings() {
    try {
      setSettingsError(null);

      const res = await fetch("/api/settings/current-term-year");
      const data: SettingsResponse = await res.json().catch(() => ({
        ok: false,
        error: "Invalid server response.",
      }));

      if (!res.ok || !data.ok || !data.term || !data.academicYear) {
        setSettingsError(
          data.error ||
            "Using default term and academic year settings for now."
        );
        // fall back to existing values
        return;
      }

      setCurrentTerm(data.term);
      setCurrentAcademicYear(data.academicYear);
    } catch (err) {
      console.error(
        "[ParentOtpLoginClient] loadCurrentTermSettings error",
        err
      );
      setSettingsError(
        "Could not load school term settings. Using defaults for now."
      );
    }
  }

  // Load settings once on mount
  useEffect(() => {
    void loadCurrentTermSettings();
  }, []);

  // -------------------------
  // Helper: load children for phone
  // -------------------------
  async function loadChildrenForGuardian(phone: string) {
    try {
      setChildrenLoading(true);
      setChildrenError(null);
      setChildren(null);
      setSelectedChildId(null);

      const params = new URLSearchParams({
        guardianPhone: phone.trim(),
      });

      const res = await fetch(
        `/api/parent/children?${params.toString()}`
      );

      const data: ChildrenResponse = await res.json().catch(() => ({
        ok: false,
        error: "Invalid server response.",
      }));

      if (!res.ok || !data.ok) {
        setChildrenError(
          data.error ||
            "Couldn't load learners for this phone number."
        );
        setChildren(null);
        return;
      }

      const list = data.students || [];
      setChildren(list);
      // Auto-select first child if any
      if (list.length > 0) {
        setSelectedChildId(list[0].id);
      } else {
        setSelectedChildId(null);
      }
    } catch (err) {
      console.error(
        "[ParentOtpLoginClient] loadChildrenForGuardian error",
        err
      );
      setChildrenError(
        "Something went wrong while loading learners. Please try again."
      );
      setChildren(null);
      setSelectedChildId(null);
    } finally {
      setChildrenLoading(false);
    }
  }

  // -------------------------
  // Helper: load fee summary for a learner (placeholder-backed)
  // -------------------------
  async function loadFeeSummaryForStudent(studentId: string) {
    try {
      setFeeLoading(true);
      setFeeError(null);
      setFeeSummary(null);

      const params = new URLSearchParams({
        studentId,
        term: currentTerm,
        academicYear: currentAcademicYear,
      });

      const res = await fetch(
        `/api/parent/fees/summary?${params.toString()}`
      );

      const data: FeeSummaryResponse = await res.json().catch(() => ({
        ok: false,
        error: "Invalid server response.",
      }));

      if (!res.ok || !data.ok || !data.summary) {
        setFeeError(
          data.error || "Could not load fee summary for this learner."
        );
        setFeeSummary(null);
        return;
      }

      setFeeSummary(data.summary);
    } catch (err) {
      console.error(
        "[ParentOtpLoginClient] loadFeeSummaryForStudent error",
        err
      );
      setFeeError(
        "Something went wrong while loading fees. Please try again."
      );
      setFeeSummary(null);
    } finally {
      setFeeLoading(false);
    }
  }

  // -------------------------
  // Helper: load assessment summary for a learner
  // -------------------------
  async function loadAssessmentSummaryForStudent(studentId: string) {
    try {
      setAssessmentLoading(true);
      setAssessmentError(null);
      setAssessmentSummary(null);

      const params = new URLSearchParams({
        studentId,
        term: currentTerm,
        academicYear: currentAcademicYear,
      });

      const res = await fetch(
        `/api/parent/assessment/summary?${params.toString()}`
      );

      const data: AssessmentSummaryResponse = await res
        .json()
        .catch(() => ({
          ok: false,
          error: "Invalid server response.",
        }));

      if (!res.ok || !data.ok || !data.summary) {
        setAssessmentError(
          data.error ||
            "Could not load assessment summary for this learner."
        );
        setAssessmentSummary(null);
        return;
      }

      setAssessmentSummary(data.summary);
    } catch (err) {
      console.error(
        "[ParentOtpLoginClient] loadAssessmentSummaryForStudent error",
        err
      );
      setAssessmentError(
        "Something went wrong while loading assessments. Please try again."
      );
      setAssessmentSummary(null);
    } finally {
      setAssessmentLoading(false);
    }
  }

  // -------------------------
  // Helper: load attendance summary for a learner (placeholder-backed)
  // -------------------------
  async function loadAttendanceSummaryForStudent(studentId: string) {
    try {
      setAttendanceLoading(true);
      setAttendanceError(null);
      setAttendanceSummary(null);

      const params = new URLSearchParams({
        studentId,
        term: currentTerm,
        academicYear: currentAcademicYear,
      });

      const res = await fetch(
        `/api/parent/attendance/summary?${params.toString()}`
      );

      const data: AttendanceSummaryResponse = await res
        .json()
        .catch(() => ({
          ok: false,
          error: "Invalid server response.",
        }));

      if (!res.ok || !data.ok || !data.summary) {
        setAttendanceError(
          data.error ||
            "Could not load attendance summary for this learner."
        );
        setAttendanceSummary(null);
        return;
      }

      setAttendanceSummary(data.summary);
    } catch (err) {
      console.error(
        "[ParentOtpLoginClient] loadAttendanceSummaryForStudent error",
        err
      );
      setAttendanceError(
        "Something went wrong while loading attendance. Please try again."
      );
      setAttendanceSummary(null);
    } finally {
      setAttendanceLoading(false);
    }
  }

  // -------------------------
  // Helper: load SMS summary for guardian (demo placeholder)
  // -------------------------
  async function loadSmsSummaryForGuardian(
    phone: string,
    studentId?: string | null
  ) {
    const trimmed = phone.trim();
    if (!trimmed) {
      setSmsMessages(null);
      setSmsError(
        "No guardian phone number on record. SMS alerts are not available."
      );
      setSmsNote(null);
      return;
    }

    try {
      setSmsLoading(true);
      setSmsError(null);
      setSmsMessages(null);
      setSmsNote(null);

      const params = new URLSearchParams({
        guardianPhone: trimmed,
      });
      if (studentId) {
        params.set("studentId", studentId);
      }

      const res = await fetch(
        `/api/parent/sms/summary?${params.toString()}`
      );

      const data: SmsSummaryResponse = await res.json().catch(() => ({
        ok: false,
        error: "Invalid server response.",
      }));

      if (!res.ok || !data.ok) {
        setSmsError(
          data.error ||
            "Could not load SMS alerts for this guardian."
        );
        setSmsMessages(null);
        setSmsNote(null);
        return;
      }

      const msgs = data.messages || [];
      setSmsMessages(msgs);
      setSmsNote(data.note || null);
    } catch (err) {
      console.error(
        "[ParentOtpLoginClient] loadSmsSummaryForGuardian error",
        err
      );
      setSmsError(
        "Something went wrong while loading SMS alerts. Please try again."
      );
      setSmsMessages(null);
      setSmsNote(null);
    } finally {
      setSmsLoading(false);
    }
  }

  // When selected child OR term/year changes (and we are verified),
  // load fee + assessment + attendance + SMS summary
  useEffect(() => {
    if (step !== "verified") return;

    if (!selectedChildId) {
      setFeeSummary(null);
      setFeeError(null);
      setFeeLoading(false);

      setAssessmentSummary(null);
      setAssessmentError(null);
      setAssessmentLoading(false);

      setAttendanceSummary(null);
      setAttendanceError(null);
      setAttendanceLoading(false);

      setSmsMessages(null);
      setSmsError(null);
      setSmsLoading(false);
      setSmsNote(null);
      return;
    }

    const child = children?.find((c) => c.id === selectedChildId);
    if (!child) {
      setFeeSummary(null);
      setFeeError(null);
      setFeeLoading(false);

      setAssessmentSummary(null);
      setAssessmentError(null);
      setAssessmentLoading(false);

      setAttendanceSummary(null);
      setAttendanceError(null);
      setAttendanceLoading(false);

      setSmsMessages(null);
      setSmsError(null);
      setSmsLoading(false);
      setSmsNote(null);
      return;
    }

    const phoneToUse =
      child.guardianPhone && child.guardianPhone.trim().length > 0
        ? child.guardianPhone
        : guardianPhone;

    void (async () => {
      await Promise.all([
        loadFeeSummaryForStudent(child.id),
        loadAssessmentSummaryForStudent(child.id),
        loadAttendanceSummaryForStudent(child.id),
        loadSmsSummaryForGuardian(phoneToUse, child.id),
      ]);
    })();
  }, [
    step,
    selectedChildId,
    children,
    guardianPhone,
    currentTerm,
    currentAcademicYear,
  ]);

  // -------------------------
  // Step 1: Request OTP
  // -------------------------
  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError(null);

    const trimmedPhone = guardianPhone.trim();
    if (!trimmedPhone) {
      setGlobalError("Please enter your phone number.");
      return;
    }

    try {
      setRequesting(true);

      const res = await fetch("/api/parent/otp/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ guardianPhone: trimmedPhone }),
      });

      const data: RequestResponse = await res.json().catch(() => ({
        ok: false,
        error: "Invalid server response.",
      }));

      if (!res.ok || !data.ok || !data.token) {
        setGlobalError(
          data.error || "Failed to send OTP. Please try again later."
        );
        return;
      }

      // Save the token returned by the backend
      setBackendToken(data.token);
      setDebugCode(data.debugCode || null);

      // Move to enterCode step
      setStep("enterCode");

      // Clear any old OTP
      setOtpCode("");
    } catch (err) {
      console.error("[ParentOtpLoginClient] handleRequestOtp error", err);
      setGlobalError("Something went wrong. Please try again.");
    } finally {
      setRequesting(false);
    }
  }

  // -------------------------
  // Step 2: Verify OTP
  // -------------------------
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError(null);

    const trimmedPhone = guardianPhone.trim();
    const trimmedCode = otpCode.trim();

    if (!trimmedPhone) {
      setGlobalError("Phone number is missing.");
      return;
    }
    if (!trimmedCode) {
      setGlobalError("Please enter the OTP code sent to your phone.");
      return;
    }
    if (!backendToken) {
      setGlobalError("Missing OTP token. Please request a new code.");
      return;
    }

    try {
      setVerifying(true);

      const res = await fetch("/api/parent/otp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          guardianPhone: trimmedPhone,
          code: trimmedCode,
          token: backendToken,
        }),
      });

      const data: VerifyResponse = await res.json().catch(() => ({
        ok: false,
        error: "Invalid server response.",
      }));

      if (!res.ok || !data.ok) {
        setGlobalError(
          data.error || "Failed to verify OTP. Please try again."
        );
        return;
      }

      // Success: mark as verified
      setStep("verified");
      setGlobalError(null);

      // Load children linked to this phone
      await loadChildrenForGuardian(trimmedPhone);
    } catch (err) {
      console.error("[ParentOtpLoginClient] handleVerifyOtp error", err);
      setGlobalError("Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  // -------------------------
  // UI Pieces
  // -------------------------
  function renderPhoneForm() {
    return (
      <form onSubmit={handleRequestOtp} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">
            Guardian phone number
          </label>
          <input
            type="tel"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. 0240000000"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
          />
          <p className="text-[11px] text-slate-500">
            Use the phone number registered with the school.
          </p>
        </div>

        <button
          type="submit"
          disabled={requesting}
          className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {requesting ? "Sending OTP…" : "Send OTP code"}
        </button>
      </form>
    );
  }

  function renderOtpForm() {
    return (
      <form onSubmit={handleVerifyOtp} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">
            OTP code
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 tracking-[0.3em]"
            placeholder="Enter the 6-digit code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
          />
          <p className="text-[11px] text-slate-500">
            Enter the code sent to your phone number{" "}
            <span className="font-semibold">{guardianPhone}</span>.
          </p>
        </div>

        {/* Dev helper: show debug code if available */}
        {debugCode && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            <div className="font-semibold">Development note</div>
            <div>
              OTP code from server:{" "}
              <span className="font-mono font-bold">{debugCode}</span>
            </div>
            <div>
              In production, this code will only be sent via SMS (not shown on
              screen).
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={verifying}
          className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? "Verifying…" : "Verify and continue"}
        </button>

        <button
          type="button"
          onClick={() => {
            // Allow parent to go back and request a new code
            setStep("enterPhone");
            setBackendToken(null);
            setDebugCode(null);
            setOtpCode("");
            setChildren(null);
            setChildrenError(null);
            setChildrenLoading(false);
            setSelectedChildId(null);

            setFeeSummary(null);
            setFeeError(null);
            setFeeLoading(false);

            setAssessmentSummary(null);
            setAssessmentError(null);
            setAssessmentLoading(false);

            setAttendanceSummary(null);
            setAttendanceError(null);
            setAttendanceLoading(false);

            setSmsMessages(null);
            setSmsError(null);
            setSmsLoading(false);
            setSmsNote(null);
          }}
          className="mt-1 w-full text-center text-xs font-medium text-blue-600 hover:underline"
        >
          Change phone number / request a new code
        </button>
      </form>
    );
  }

  function renderChildrenList() {
    if (childrenLoading) {
      return (
        <p className="text-xs text-slate-600">
          Loading your learner records…
        </p>
      );
    }

    if (childrenError) {
      return (
        <p className="text-xs text-red-600">
          {childrenError}
        </p>
      );
    }

    if (!children || children.length === 0) {
      return (
        <p className="text-xs text-slate-600">
          We couldn&apos;t find any learners linked to this phone number yet.
          Please confirm with the school that your number is correctly
          registered.
        </p>
      );
    }

    return (
      <div className="space-y-1.5">
        {children.map((child) => {
          const c = child.classroom;
          const classLabel = c
            ? [c.name, c.grade, c.arm].filter(Boolean).join(" • ")
            : "No classroom recorded yet";

          const isSelected = selectedChildId === child.id;

          return (
            <button
              key={child.id}
              type="button"
              onClick={() => setSelectedChildId(child.id)}
              className={[
                "w-full rounded-md border px-3 py-2 text-left text-xs transition",
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/70",
              ].join(" ")}
            >
              <div className="font-semibold text-slate-900">
                {child.name}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                {classLabel}
              </div>
              {child.guardianName && (
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Guardian on record: {child.guardianName}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function renderFeesPanel() {
    if (feeLoading) {
      return (
        <p className="mt-0.5 text-[11px] text-slate-600">
          Loading fee summary…
        </p>
      );
    }

    if (feeError) {
      return (
        <p className="mt-0.5 text-[11px] text-red-600">
          {feeError}
        </p>
      );
    }

    if (!feeSummary) {
      return (
        <>
          <p className="mt-0.5 text-[11px] text-slate-600">
            This panel will show fee balances, payments and outstanding amounts
            for the selected term and year.
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Current term: {currentTerm} • Academic year:{" "}
            {currentAcademicYear}
          </p>
        </>
      );
    }

    return (
      <>
        <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">Total billed</div>
            <div className="mt-0.5 font-semibold text-slate-900">
              ₵{feeSummary.totalBilled.toFixed(2)}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">Total paid</div>
            <div className="mt-0.5 font-semibold text-emerald-700">
              ₵{feeSummary.totalPaid.toFixed(2)}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">Balance</div>
            <div className="mt-0.5 font-semibold text-red-700">
              ₵{feeSummary.balance.toFixed(2)}
            </div>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Term: {currentTerm} • Academic year: {currentAcademicYear}
        </p>
        {feeSummary.lastPaymentDate && (
          <p className="mt-0.5 text-[10px] text-slate-500">
            Last payment: ₵
            {(feeSummary.lastPaymentAmount ?? 0).toFixed(2)} on{" "}
            {new Date(
              feeSummary.lastPaymentDate
            ).toLocaleDateString()}
          </p>
        )}
        {feeSummary.note && (
          <p className="mt-0.5 text-[10px] text-amber-700">
            {feeSummary.note}
          </p>
        )}
      </>
    );
  }

  function renderAssessmentPanel() {
    if (assessmentLoading) {
      return (
        <p className="mt-0.5 text-[11px] text-slate-600">
          Loading assessment summary…
        </p>
      );
    }

    if (assessmentError) {
      return (
        <p className="mt-0.5 text-[11px] text-red-600">
          {assessmentError}
        </p>
      );
    }

    if (!assessmentSummary) {
      return (
        <>
          <p className="mt-0.5 text-[11px] text-slate-600">
            This panel will summarise class tests, homework and exams to give
            you a simple picture of your learner&apos;s performance.
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Current term: {currentTerm} • Academic year:{" "}
            {currentAcademicYear}
          </p>
        </>
      );
    }

    const overall = assessmentSummary;
    const ges = overall.ges;

    return (
      <>
        <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">
              Total CA items
            </div>
            <div className="mt-0.5 font-semibold text-slate-900">
              {overall.totalItems}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">
              Overall percentage
            </div>
            <div className="mt-0.5 font-semibold text-slate-900">
              {overall.percentage != null
                ? `${overall.percentage.toFixed(1)}%`
                : "N/A"}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">GES grade</div>
            <div className="mt-0.5 font-semibold text-slate-900">
              {ges
                ? `Grade ${ges.grade} – ${ges.label}`
                : "Not available"}
            </div>
          </div>
        </div>

        {overall.subjects.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="text-[10px] font-semibold text-slate-700">
              Subject breakdown
            </div>
            {overall.subjects.map((s) => (
              <div
                key={s.subject}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px]"
              >
                <div className="font-medium text-slate-900">
                  {s.subject}
                </div>
                <div className="text-right text-slate-600">
                  <div>
                    {s.percentage != null
                      ? `${s.percentage.toFixed(1)}%`
                      : "N/A"}
                  </div>
                  {s.ges && (
                    <div className="text-[9px]">
                      Grade {s.ges.grade} – {s.ges.label}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {overall.note && (
          <p className="mt-1 text-[10px] text-slate-500">
            {overall.note}
          </p>
        )}
      </>
    );
  }

  function renderAttendancePanel() {
    if (attendanceLoading) {
      return (
        <p className="mt-0.5 text-[11px] text-slate-600">
          Loading attendance summary…
        </p>
      );
    }

    if (attendanceError) {
      return (
        <p className="mt-0.5 text-[11px] text-red-600">
          {attendanceError}
        </p>
      );
    }

    if (!attendanceSummary) {
      return (
        <>
          <p className="mt-0.5 text-[11px] text-slate-600">
            This panel will show how many days your learner has been present,
            absent or late this term.
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Current term: {currentTerm} • Academic year:{" "}
            {currentAcademicYear}
          </p>
        </>
      );
    }

    const s = attendanceSummary;

    return (
      <>
        <div className="mt-1 grid grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">
              Total sessions
            </div>
            <div className="mt-0.5 font-semibold text-slate-900">
              {s.totalSessions}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">Present</div>
            <div className="mt-0.5 font-semibold text-emerald-700">
              {s.daysPresent}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">Absent</div>
            <div className="mt-0.5 font-semibold text-red-700">
              {s.daysAbsent}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">Late</div>
            <div className="mt-0.5 font-semibold text-amber-700">
              {s.daysLate}
            </div>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Attendance rate:{" "}
          {s.attendanceRate != null
            ? `${s.attendanceRate.toFixed(1)}%`
            : "N/A"}
        </p>
        {s.note && (
          <p className="mt-0.5 text-[10px] text-slate-500">
            {s.note}
          </p>
        )}
      </>
    );
  }

  function renderSmsPanel() {
    if (smsLoading) {
      return (
        <p className="mt-0.5 text-[11px] text-slate-600">
          Loading SMS alerts…
        </p>
      );
    }

    if (smsError) {
      return (
        <p className="mt-0.5 text-[11px] text-red-600">
          {smsError}
        </p>
      );
    }

    if (!smsMessages || smsMessages.length === 0) {
      return (
        <>
          <p className="mt-0.5 text-[11px] text-slate-600">
            This panel will list recent SMS alerts sent to your phone about
            fees, health and attendance.
          </p>
          {smsNote && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              {smsNote}
            </p>
          )}
        </>
      );
    }

    return (
      <>
        <div className="mt-1 space-y-1.5 text-[11px]">
          {smsMessages.map((msg) => (
            <div
              key={msg.id}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-slate-900">
                  {msg.category || "SMS"}
                </div>
                <div className="text-[10px] text-slate-500">
                  {new Date(msg.sentAt).toLocaleString()}
                </div>
              </div>
              <div className="mt-0.5 text-[10px] text-slate-600">
                {msg.textPreview}
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-500">
                <span>
                  {msg.channel} • {msg.direction} • {msg.status}
                </span>
              </div>
            </div>
          ))}
        </div>
        {smsNote && (
          <p className="mt-0.5 text-[10px] text-slate-500">
            {smsNote}
          </p>
        )}
      </>
    );
  }

  function renderSelectedChildPanel() {
    if (childrenLoading) {
      return (
        <p className="text-xs text-slate-600">
          Preparing your learner&apos;s overview…
        </p>
      );
    }

    if (!children || children.length === 0) {
      return (
        <p className="text-xs text-slate-600">
          Once the school links learners to your phone number, this section will
          show their attendance, assessments, fees and health summary.
        </p>
      );
    }

    if (!selectedChild) {
      return (
        <p className="text-xs text-slate-600">
          Select a learner on the left to see their overview.
        </p>
      );
    }

    const c = selectedChild.classroom;
    const classLabel = c
      ? [c.name, c.grade, c.arm].filter(Boolean).join(" • ")
      : "No classroom recorded yet";

    return (
      <div className="space-y-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold text-slate-900">
            {selectedChild.name}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-600">
            Classroom: <span className="font-medium">{classLabel}</span>
          </div>
          {selectedChild.guardianName && (
            <div className="mt-0.5 text-[11px] text-slate-500">
              Guardian on record: {selectedChild.guardianName}
            </div>
          )}
          {selectedChild.guardianPhone && (
            <div className="mt-0.5 text-[11px] text-slate-500">
              Phone on record: {selectedChild.guardianPhone}
            </div>
          )}
        </div>

        {/* Overview panels: Attendance, Assessment, Fees, Health, SMS */}
        <div className="space-y-2">
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs font-semibold text-slate-900">
              Attendance snapshot
            </div>
            {renderAttendancePanel()}
          </div>

          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs font-semibold text-slate-900">
              Assessment snapshot
            </div>
            {renderAssessmentPanel()}
          </div>

          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs font-semibold text-slate-900">
              Fees & payments
            </div>
            {renderFeesPanel()}
          </div>

          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs font-semibold text-slate-900">
              Health & wellbeing
            </div>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Later, this panel will highlight any important health notes or
              alerts recorded by the school, so you can follow up quickly.
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs font-semibold text-slate-900">
              Recent SMS alerts
            </div>
            {renderSmsPanel()}
          </div>
        </div>
      </div>
    );
  }

  function renderVerifiedState() {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <div className="font-semibold">Login successful</div>
          <p className="text-xs mt-1">
            You are now verified as a guardian. Below are the learners we have
            linked to your phone number in the school records.
          </p>
        </div>

        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] text-slate-600">
              Phone:{" "}
              <span className="font-semibold text-slate-900">
                {guardianPhone}
              </span>
            </div>
            {children && (
              <div className="text-[11px] text-slate-600">
                Learners found:{" "}
                <span className="font-semibold">
                  {children.length}
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-slate-800 mb-1">
                Your learners
              </div>
              {renderChildrenList()}
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-slate-800 mb-1">
                Selected learner overview
              </div>
              {renderSelectedChildPanel()}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setStep("enterPhone");
            setBackendToken(null);
            setDebugCode(null);
            setOtpCode("");
            setGuardianPhone("");
            setChildren(null);
            setChildrenError(null);
            setChildrenLoading(false);
            setSelectedChildId(null);

            setFeeSummary(null);
            setFeeError(null);
            setFeeLoading(false);

            setAssessmentSummary(null);
            setAssessmentError(null);
            setAssessmentLoading(false);

            setAttendanceSummary(null);
            setAttendanceError(null);
            setAttendanceLoading(false);

            setSmsMessages(null);
            setSmsError(null);
            setSmsLoading(false);
            setSmsNote(null);
          }}
          className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Log out and start again
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 space-y-1">
          <h1 className="text-base font-semibold text-slate-900">
            Parent login (OTP)
          </h1>
          <p className="text-xs text-slate-600">
            Quick, password-free login for parents and guardians using their
            registered phone number.
          </p>
          {settingsError && (
            <p className="text-[11px] text-amber-700">
              {settingsError}
            </p>
          )}
        </div>

        {globalError && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            {globalError}
          </div>
        )}

        {step === "enterPhone" && renderPhoneForm()}
        {step === "enterCode" && renderOtpForm()}
        {step === "verified" && renderVerifiedState()}

        <div className="mt-5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <p>
            Built as part of <span className="font-semibold">EduLife OS</span>{" "}
            to connect school and home with transparency and care.
          </p>
          <p>
            Current term: {currentTerm} • Academic year:{" "}
            {currentAcademicYear}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ParentOtpLoginClient;
