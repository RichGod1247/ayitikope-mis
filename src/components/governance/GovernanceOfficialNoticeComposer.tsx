//src/components/governance/GovernanceOfficialNoticeComposer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type OfficialNoticeTargetRole = "SISSO" | "HEADTEACHER" | "TEACHER";
type OfficialNoticePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type OfficialNoticeScopeMode = "ZONE" | "SCHOOL";
type OfficialNoticeSectorTarget = "PUBLIC" | "PRIVATE" | "ALL_AUTHORIZED";
type OfficialNoticeKind =
  | "INFORMATION_ONLY"
  | "ACKNOWLEDGEMENT_REQUIRED"
  | "RESPONSE_REQUIRED"
  | "URGENT_DIRECTIVE";

export type GovernanceNoticeAssignment = {
  id: string;
  role: string;
  zoneId: string;
  zoneName: string;
  zoneLevel: number;
  zoneTypeName: string;
  parentZoneName?: string | null;
};

export type GovernanceNoticeSchool = {
  id: string;
  name: string;
  schoolCode: string | null;
  status: string;
  schoolSector?: "PUBLIC" | "PRIVATE" | string;
};

type NoticeSendResponse =
  | {
      ok: true;
      reused?: boolean;
      duplicateSafe?: boolean;
      item?: {
        reused?: boolean;
        recipients?: unknown[];
      };
    }
  | { ok: false; error: string };

function makeDraftKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function targetRoleLabel(role: OfficialNoticeTargetRole) {
  if (role === "SISSO") return "SISSOs / Circuit Supervisors";
  if (role === "HEADTEACHER") return "Headteachers";
  return "Teachers";
}

function noticeKindLabel(kind: OfficialNoticeKind) {
  if (kind === "INFORMATION_ONLY") return "Information only";
  if (kind === "ACKNOWLEDGEMENT_REQUIRED") {
    return "Acknowledgement required";
  }
  if (kind === "RESPONSE_REQUIRED") return "Response required";
  return "Urgent directive";
}

function sectorTargetLabel(target: OfficialNoticeSectorTarget) {
  if (target === "PUBLIC") return "Public schools only";
  if (target === "PRIVATE") return "Private schools only";
  return "All authorized schools";
}

function schoolSectorLabel(value?: string | null) {
  if (value === "PRIVATE") return "Private";
  if (value === "PUBLIC") return "Public";
  return "Unspecified sector";
}

function roleLabel(role: string) {
  if (role === "SISSO") return "SISSO";
  if (role === "CIRCUIT_SUPERVISOR") return "Circuit Supervisor";
  if (role === "DISTRICT_DIRECTOR") return "District Director";
  if (role === "DISTRICT_MIS_OFFICER") return "District MIS/Data Officer";
  if (role === "DISTRICT_SHEP_OFFICER") {
    return "District SHEP/Health Officer";
  }
  if (role === "DISTRICT_ASSESSMENT_OFFICER") {
    return "District Assessment Officer";
  }

  return role.replaceAll("_", " ");
}

function DeliveryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning";
}) {
  const className =
    tone === "success"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : "border-amber-300/20 bg-amber-400/10 text-amber-100";

  return (
    <span className={`rounded-xl border px-3 py-2 text-xs ${className}`}>
      {label}: <b className="text-white">{value}</b>
    </span>
  );
}

export default function GovernanceOfficialNoticeComposer({
  isDistrictView,
  isCircuitView,
  assignments,
  schools,
}: {
  isDistrictView: boolean;
  isCircuitView: boolean;
  assignments: GovernanceNoticeAssignment[];
  schools: GovernanceNoticeSchool[];
}) {
  const targetRoles = useMemo<OfficialNoticeTargetRole[]>(
    () =>
      isDistrictView
        ? ["SISSO", "HEADTEACHER", "TEACHER"]
        : ["HEADTEACHER", "TEACHER"],
    [isDistrictView],
  );

  const [targetRole, setTargetRole] = useState<OfficialNoticeTargetRole>(
    isDistrictView ? "SISSO" : "HEADTEACHER",
  );
  const [scopeMode, setScopeMode] =
    useState<OfficialNoticeScopeMode>("ZONE");
  const [sectorTarget, setSectorTarget] =
    useState<OfficialNoticeSectorTarget>("PUBLIC");
  const [targetZoneId, setTargetZoneId] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [priority, setPriority] =
    useState<OfficialNoticePriority>("MEDIUM");
  const [noticeKind, setNoticeKind] = useState<OfficialNoticeKind>(
    "ACKNOWLEDGEMENT_REQUIRED",
  );
  const [deadlineAt, setDeadlineAt] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draftKey, setDraftKey] = useState(makeDraftKey);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const assignmentOptions = useMemo(
    () => assignments.filter((assignment) => Boolean(assignment.zoneId)),
    [assignments],
  );

  const schoolOptions = useMemo(
    () =>
      schools
        .filter((school) => school.status !== "ARCHIVED")
        .filter((school) => {
          if (sectorTarget === "ALL_AUTHORIZED") return true;
          return school.schoolSector === sectorTarget;
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [schools, sectorTarget],
  );

  const selectedAssignment =
    assignmentOptions.find(
      (assignment) => assignment.zoneId === targetZoneId,
    ) ??
    assignmentOptions[0] ??
    null;

  const selectedSchool =
    schoolOptions.find((school) => school.id === selectedSchoolId) ?? null;

  const canTargetSchool = targetRole !== "SISSO" && schoolOptions.length > 0;
  const requiresAcknowledgement = noticeKind !== "INFORMATION_ONLY";
  const requiresResponse =
    noticeKind === "RESPONSE_REQUIRED" || noticeKind === "URGENT_DIRECTIVE";

  useEffect(() => {
    if (!targetRoles.includes(targetRole)) {
      setTargetRole(targetRoles[0] ?? "HEADTEACHER");
    }
  }, [targetRole, targetRoles]);

  useEffect(() => {
    if (!targetZoneId && assignmentOptions[0]?.zoneId) {
      setTargetZoneId(assignmentOptions[0].zoneId);
    }
  }, [assignmentOptions, targetZoneId]);

  useEffect(() => {
    if (targetRole === "SISSO") {
      setScopeMode("ZONE");
      setSelectedSchoolId("");
    }
  }, [targetRole]);

  useEffect(() => {
    if (!selectedSchoolId) return;

    const stillAllowed = schoolOptions.some(
      (school) => school.id === selectedSchoolId,
    );

    if (!stillAllowed) setSelectedSchoolId("");
  }, [schoolOptions, selectedSchoolId]);

  const targetSummary =
    scopeMode === "SCHOOL" && selectedSchool
      ? `${selectedSchool.name} (${selectedSchool.schoolCode ?? "no code"})`
      : selectedAssignment
        ? `${selectedAssignment.zoneName} ${selectedAssignment.zoneTypeName}`
        : "your authorized scope";

  async function sendOfficialNotice() {
    setSendError(null);
    setSendSuccess(null);

    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (cleanTitle.length < 6) {
      setSendError("Write a clear notice title of at least 6 characters.");
      return;
    }

    if (cleanBody.length < 20) {
      setSendError(
        "Write a fuller official notice body of at least 20 characters.",
      );
      return;
    }

    if (scopeMode === "ZONE" && !targetZoneId) {
      setSendError(
        "No authorized governance zone is available for this notice.",
      );
      return;
    }

    if (scopeMode === "SCHOOL" && !selectedSchoolId) {
      setSendError("Select the school that should receive this notice.");
      return;
    }

    setBusy(true);

    try {
      const scopeLabel = isDistrictView
        ? "DISTRICT"
        : isCircuitView
          ? "CIRCUIT"
          : "GOVERNANCE";

      const targetId =
        scopeMode === "SCHOOL"
          ? selectedSchoolId
          : targetZoneId || selectedAssignment?.zoneId || "scope";

      const idempotencyKey =
        `b7-official:${scopeLabel}:${targetRole}:${scopeMode}:${sectorTarget}:${targetId}:${draftKey}`.slice(
          0,
          220,
        );

      const res = await fetch("/api/governance/notices/send", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          tenantId: scopeMode === "SCHOOL" ? selectedSchoolId : undefined,
          zoneId: scopeMode === "ZONE" ? targetZoneId : undefined,
          title: cleanTitle,
          body: cleanBody,
          priority,
          channels: ["IN_APP", "SMS", "EMAIL"],
          targetRoles: [targetRole],
          idempotencyKey,
          idempotencyScope: "B7_OFFICIAL_COMMUNICATION",
          metadata: {
            source: "B7-official-governance-communication",
            noticeIntent: "OFFICIAL_COMMUNICATION",
            composer: "B7C-governance-command-notice-composer",
            scopeLabel,
            scopeMode,
            targetAudience: targetRole,
            targetLabel: targetSummary,
            governanceSectorTarget: sectorTarget,
            schoolSectorTarget: sectorTarget,
            sectorTarget,
            sectorRule:
              "Public/private targeting is enforced server-side before recipients are created.",
            noticeKind,
            requiresAcknowledgement,
            requiresResponse,
            deadlineAt: deadlineAt || null,
            securityRule:
              "EduLife OS portal is the source of truth. SMS and email are alerts/copies. WhatsApp is not authoritative without a matching EduLife OS notice reference.",
          },
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | NoticeSendResponse
        | null;

      if (!res.ok || !json?.ok) {
        setSendError(
          json && !json.ok
            ? json.error
            : `Failed to send official notice (${res.status}).`,
        );
        return;
      }

      const reused = Boolean(json.reused || json.item?.reused);
      const recipientCount = Array.isArray(json.item?.recipients)
        ? json.item.recipients.length
        : null;

      setSendSuccess(
        reused
          ? "This notice was already sent; duplicate delivery was safely suppressed."
          : `Official notice sent to ${targetRoleLabel(targetRole)}${
              recipientCount !== null
                ? ` (${recipientCount} recipient(s))`
                : ""
            }.`,
      );

      setTitle("");
      setBody("");
      setDeadlineAt("");
      setDraftKey(makeDraftKey());
    } catch {
      setSendError("Network/server error while sending official notice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-indigo-300/20 bg-indigo-500/10 p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">
            Official Notices
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">
            Send a verified EduLife OS notice
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-indigo-100/80">
            Choose the recipients, write the instruction, and send. EduLife OS
            remains the official record; SMS and email are alerts.
          </p>
        </div>

        <div className="w-fit rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-slate-200">
          <b className="text-white">Sending to:</b> {targetSummary}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-300">
            Recipients
          </span>
          <select
            value={targetRole}
            onChange={(event) =>
              setTargetRole(event.target.value as OfficialNoticeTargetRole)
            }
            className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
          >
            {targetRoles.map((role) => (
              <option key={role} value={role}>
                {targetRoleLabel(role)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-300">Scope</span>
          <select
            value={scopeMode}
            onChange={(event) =>
              setScopeMode(event.target.value as OfficialNoticeScopeMode)
            }
            disabled={targetRole === "SISSO"}
            className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50 disabled:opacity-60"
          >
            <option value="ZONE">
              {isDistrictView ? "Whole authorized district" : "Whole circuit"}
            </option>
            {canTargetSchool ? (
              <option value="SCHOOL">One selected school</option>
            ) : null}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-300">
            School sector
          </span>
          <select
            value={sectorTarget}
            onChange={(event) =>
              setSectorTarget(event.target.value as OfficialNoticeSectorTarget)
            }
            disabled={targetRole === "SISSO"}
            className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50 disabled:opacity-60"
          >
            <option value="PUBLIC">Public schools only</option>
            <option value="PRIVATE">Private schools only</option>
            <option value="ALL_AUTHORIZED">All authorized schools</option>
          </select>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            {targetRole === "SISSO"
              ? "Sector selection does not change SISSO recipients."
              : sectorTargetLabel(sectorTarget)}
          </p>
        </label>

        {scopeMode === "ZONE" ? (
          <label className="block">
            <span className="text-xs font-semibold text-slate-300">
              Authorized area
            </span>
            <select
              value={targetZoneId}
              onChange={(event) => setTargetZoneId(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
            >
              {assignmentOptions.length ? (
                assignmentOptions.map((assignment) => (
                  <option key={assignment.zoneId} value={assignment.zoneId}>
                    {assignment.zoneName} · {roleLabel(assignment.role)}
                  </option>
                ))
              ) : (
                <option value="">No governance assignment found</option>
              )}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="text-xs font-semibold text-slate-300">
              School
            </span>
            <select
              value={selectedSchoolId}
              onChange={(event) => setSelectedSchoolId(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
            >
              <option value="">Select school</option>
              {schoolOptions.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name} · {school.schoolCode ?? "no code"} ·{" "}
                  {schoolSectorLabel(school.schoolSector)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-300">
            Notice type
          </span>
          <select
            value={noticeKind}
            onChange={(event) =>
              setNoticeKind(event.target.value as OfficialNoticeKind)
            }
            className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
          >
            {(
              [
                "INFORMATION_ONLY",
                "ACKNOWLEDGEMENT_REQUIRED",
                "RESPONSE_REQUIRED",
                "URGENT_DIRECTIVE",
              ] as OfficialNoticeKind[]
            ).map((kind) => (
              <option key={kind} value={kind}>
                {noticeKindLabel(kind)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-300">
            Priority
          </span>
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as OfficialNoticePriority)
            }
            className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
          >
            {(
              ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as OfficialNoticePriority[]
            ).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-300">
            Action deadline
          </span>
          <input
            type="date"
            value={deadlineAt}
            onChange={(event) => setDeadlineAt(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold text-slate-300">Title</span>
        <input
          value={title}
          maxLength={180}
          onChange={(event) => {
            setTitle(event.target.value);
            setSendError(null);
            setSendSuccess(null);
          }}
          placeholder="Example: Urgent directive on teacher attendance"
          className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-300/50"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-semibold text-slate-300">
          Official instruction
        </span>
        <textarea
          value={body}
          maxLength={5000}
          rows={5}
          onChange={(event) => {
            setBody(event.target.value);
            setSendError(null);
            setSendSuccess(null);
          }}
          placeholder="State what must be done, who must do it, and by when."
          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-indigo-300/50"
        />
      </label>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <DeliveryPill label="In-app" value="Official record" tone="success" />
        <DeliveryPill label="SMS" value="Alert" tone="warning" />
        <DeliveryPill label="Email" value="Copy / alert" tone="warning" />
      </div>

      {sendError ? (
        <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
          {sendError}
        </div>
      ) : null}

      {sendSuccess ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
          {sendSuccess}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-400">
          Recipients are resolved from verified EduLife OS roles inside your
          authorized scope. Manual phone numbers and email addresses are not
          accepted.
        </p>

        <button
          type="button"
          onClick={() => void sendOfficialNotice()}
          disabled={busy}
          className="min-h-12 rounded-2xl border border-indigo-300/25 bg-indigo-500/20 px-5 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-50"
        >
          {busy ? "Sending..." : "Send official notice"}
        </button>
      </div>
    </section>
  );
}