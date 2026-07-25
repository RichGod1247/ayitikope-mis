// src/app/district/director-feedback/DirectorFeedbackRequestClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ChannelSummary = {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  skipped: number;
  failed: number;
  dead: number;
  cancelled: number;
};

type RequestStatus = {
  cycle: null | {
    id: string;
    status: string;
    directorName: string | null;
    jurisdictionName: string | null;
    openedAt: string | null;
    deadlineAt: string | null;
    responseWindowDays: number;
    minimumResponses: number;
    participantCount: number;
    finalizedResponses: number;
    circuitCount: number;
    extensionCount: number;
    canRequestNewCycle: boolean;
  };
  notifications: {
    totalParticipants: number;
    invitedParticipants: number;
    channels: {
      inApp: ChannelSummary;
      sms: ChannelSummary;
      email: ChannelSummary;
    };
  };
};

type ApiResponse =
  | {
      ok: true;
      reqId: string;
      outcome?: "CREATED" | "EXISTING_MATCH" | "EXISTING_ACTIVE";
      status: RequestStatus;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] ${extra}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function friendlyError(code: string) {
  switch (code) {
    case "DIRECTOR_FEEDBACK_REQUEST_CONFIRMATION_REQUIRED":
      return "Confirm the request before opening the feedback exercise.";
    case "DIRECTOR_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS":
      return "A Director feedback exercise is already active.";
    case "DIRECTOR_FEEDBACK_NO_ELIGIBLE_HEADTEACHERS":
      return "No eligible active headteachers were found in your jurisdiction.";
    case "DIRECTOR_FEEDBACK_ACTIVE_ASSIGNMENT_NOT_FOUND":
      return "Your active Director jurisdiction assignment could not be confirmed.";
    case "DIRECTOR_FEEDBACK_PUBLISHED_INSTRUMENT_NOT_FOUND":
      return "The official Director feedback form is not available.";
    case "UNAUTHORIZED":
    case "GOVERNANCE_FORBIDDEN":
      return "Your Director session is not authorized for this action.";
    default:
      return "The request could not be completed. Check the connection and try again.";
  }
}

function newIdempotencyKey() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Metric(props: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0A1628] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8F98A8]">
        {props.label}
      </div>
      <div className="mt-2 text-2xl font-bold text-[#F7F4ED]">
        {props.value}
      </div>
      {props.helper ? (
        <div className="mt-1 text-xs leading-5 text-[#C9CDD6]">
          {props.helper}
        </div>
      ) : null}
    </div>
  );
}

export default function DirectorFeedbackRequestClient() {
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const cycle = status?.cycle ?? null;
  const isActive = cycle
    ? ["DRAFT", "PENDING_APPROVAL", "OPEN", "UNDER_REVIEW"].includes(
        cycle.status,
      )
    : false;

  const canRequest = !cycle || cycle.canRequestNewCycle;

  const notificationTotals = useMemo(() => {
    const notifications = status?.notifications;

    return {
      inAppReady: notifications?.channels.inApp.sent ?? 0,
      smsQueued:
        (notifications?.channels.sms.pending ?? 0) +
        (notifications?.channels.sms.processing ?? 0),
      smsUnavailable: notifications?.channels.sms.skipped ?? 0,
      emailQueued:
        (notifications?.channels.email.pending ?? 0) +
        (notifications?.channels.email.processing ?? 0),
      emailUnavailable: notifications?.channels.email.skipped ?? 0,
    };
  }, [status]);

  useEffect(() => {
    setIdempotencyKey(newIdempotencyKey());

    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);

    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/district/director-feedback", {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_LOAD_DIRECTOR_FEEDBACK_REQUEST",
          ),
        );
        return;
      }

      setStatus(payload.status);
    } catch {
      setError("The request status could not load. Check the connection.");
    } finally {
      setLoading(false);
    }
  }

  async function requestFeedback() {
    if (!confirmed) {
      setError("Confirm the consequences before requesting feedback.");
      return;
    }

    if (!online) {
      setError("You are offline. Reconnect before opening the exercise.");
      return;
    }

    const key = idempotencyKey || newIdempotencyKey();
    if (!idempotencyKey) setIdempotencyKey(key);

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/district/director-feedback", {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Idempotency-Key": key,
        },
        body: JSON.stringify({
          confirm: true,
          idempotencyKey: key,
          requestReason: null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_OPEN_DIRECTOR_FEEDBACK_REQUEST",
          ),
        );
        return;
      }

      setStatus(payload.status);
      setConfirmed(false);
      setNotice(
        payload.outcome === "CREATED"
          ? "The confidential feedback exercise was opened safely."
          : "The existing feedback exercise and its notifications were verified safely.",
      );
    } catch {
      setError(
        "The server response could not be confirmed. Do not worry: retrying uses the same request key and cannot create a duplicate cycle.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className={panel("p-5 sm:p-7")}>
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
          District Director • Confidential accountability
        </div>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
          Request Director Feedback
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
          Respondent identities and schools will remain protected.
        </p>
      </header>

      {!online ? (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          You are offline. Existing information remains visible, but a new
          request cannot be opened until the connection returns.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <section className={panel("p-5 text-sm text-[#C9CDD6]")}>
          Checking whether a feedback exercise is already open…
        </section>
      ) : cycle ? (
        <section className={panel("p-5")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#57D6C4]">
                {isActive ? "Exercise active" : `Status: ${cycle.status}`}
              </div>
              <h2 className="mt-2 text-xl font-bold">
                {cycle.directorName ?? "Municipal Director"}
              </h2>
              <p className="mt-1 text-sm text-[#C9CDD6]">
                {cycle.jurisdictionName ?? "Authorized municipality"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A1628] px-4 py-3">
              <div className="text-[11px] text-[#8F98A8]">Deadline</div>
              <div className="mt-1 text-sm font-bold">
                {formatDate(cycle.deadlineAt)}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="Headteachers"
              value={cycle.participantCount}
              helper="Frozen at opening"
            />
            <Metric
              label="Circuits"
              value={cycle.circuitCount || "—"}
              helper="Count only; no identities"
            />
            <Metric
              label="Responses"
              value={cycle.finalizedResponses}
              helper="Municipal total only"
            />
            <Metric
              label="Window"
              value={`${cycle.responseWindowDays} days`}
              helper="Director cannot extend it"
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric
              label="In-app ready"
              value={notificationTotals.inAppReady}
              helper="Feedback tile activated"
            />
            <Metric
              label="SMS queued"
              value={notificationTotals.smsQueued}
              helper={`${notificationTotals.smsUnavailable} unavailable or opted out`}
            />
            <Metric
              label="Email queued"
              value={notificationTotals.emailQueued}
              helper={`${notificationTotals.emailUnavailable} unavailable`}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/8 p-4 text-sm leading-6 text-cyan-50">
            You can see only safe municipal totals. Names, schools, contact
            details, response order and individual answers remain hidden.
          </div>

          <button
            type="button"
            className="mt-4 min-h-12 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-bold text-[#F7F4ED] hover:bg-white/10 disabled:opacity-55"
            disabled={loading}
            onClick={() => void loadStatus()}
          >
            Refresh safe totals
          </button>
        </section>
      ) : null}

      {canRequest ? (
        <section className={panel("p-5")}>
          <h2 className="text-lg font-bold">
            Before opening feedback
          </h2>

          <p className="mt-3 text-sm leading-6 text-[#D9DEE8]">
            All active headteachers will be notified in-app, by SMS and email. The request stays open for 7 days.
          </p>

          <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-[#0A1628] p-4">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span className="text-sm leading-6">
              I agree to the terms.
            </span>
          </label>

          <button
            type="button"
            disabled={!confirmed || submitting || !online}
            onClick={() => void requestFeedback()}
            className="mt-5 min-h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-5 py-3 text-sm font-bold text-[#071A3D] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            {submitting ? "Opening safely…" : "Request for Appraisal"}
          </button>
        </section>
      ) : null}

      <Link
        href="/district/dashboard"
        className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-bold text-[#F7F4ED] hover:bg-white/10"
      >
        Back to district dashboard
      </Link>
    </div>
  );
}
