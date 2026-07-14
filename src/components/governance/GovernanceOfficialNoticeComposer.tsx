//src/components/governance/GovernanceOfficialNoticeComposer.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type StoredOfficialNoticeDraft = {
  version: 1;
  targetRole: OfficialNoticeTargetRole;
  scopeMode: OfficialNoticeScopeMode;
  sectorTarget: OfficialNoticeSectorTarget;
  targetZoneId: string;
  selectedSchoolId: string;
  priority: OfficialNoticePriority;
  noticeKind: OfficialNoticeKind;
  deadlineAt: string;
  title: string;
  body: string;
  draftKey: string;
};

function isScopeMode(value: unknown): value is OfficialNoticeScopeMode {
  return value === "ZONE" || value === "SCHOOL";
}

function isSectorTarget(
  value: unknown,
): value is OfficialNoticeSectorTarget {
  return (
    value === "PUBLIC" ||
    value === "PRIVATE" ||
    value === "ALL_AUTHORIZED"
  );
}

function isNoticePriority(
  value: unknown,
): value is OfficialNoticePriority {
  return (
    value === "LOW" ||
    value === "MEDIUM" ||
    value === "HIGH" ||
    value === "CRITICAL"
  );
}

function isNoticeKind(value: unknown): value is OfficialNoticeKind {
  return (
    value === "INFORMATION_ONLY" ||
    value === "ACKNOWLEDGEMENT_REQUIRED" ||
    value === "RESPONSE_REQUIRED" ||
    value === "URGENT_DIRECTIVE"
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

const draftStorageKey = useMemo(() => {
  const view = isDistrictView
    ? "district"
    : isCircuitView
      ? "circuit"
      : "governance";

  const assignmentKey =
    assignments
      .map((assignment) => assignment.id)
      .sort()
      .join(",") || "unassigned";

  return `edulifeos:official-notice-draft:v1:${view}:${assignmentKey}`;
}, [assignments, isCircuitView, isDistrictView]);

const restoredDraftKeyRef = useRef<string | null>(null);

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => {
  if (typeof window === "undefined") return;

  restoredDraftKeyRef.current = null;

  try {
    const raw = window.sessionStorage.getItem(draftStorageKey);

    if (!raw) return;

    const saved = JSON.parse(raw) as Partial<StoredOfficialNoticeDraft>;

    if (
      typeof saved.targetRole === "string" &&
      targetRoles.includes(saved.targetRole as OfficialNoticeTargetRole)
    ) {
      setTargetRole(saved.targetRole as OfficialNoticeTargetRole);
    }

    if (isScopeMode(saved.scopeMode)) {
      setScopeMode(saved.scopeMode);
    }

    if (isSectorTarget(saved.sectorTarget)) {
      setSectorTarget(saved.sectorTarget);
    }

    if (typeof saved.targetZoneId === "string") {
      setTargetZoneId(saved.targetZoneId.slice(0, 200));
    }

    if (typeof saved.selectedSchoolId === "string") {
      setSelectedSchoolId(saved.selectedSchoolId.slice(0, 200));
    }

    if (isNoticePriority(saved.priority)) {
      setPriority(saved.priority);
    }

    if (isNoticeKind(saved.noticeKind)) {
      setNoticeKind(saved.noticeKind);
    }

    if (
      typeof saved.deadlineAt === "string" &&
      (!saved.deadlineAt ||
        /^\d{4}-\d{2}-\d{2}$/.test(saved.deadlineAt))
    ) {
      setDeadlineAt(saved.deadlineAt);
    }

    if (typeof saved.title === "string") {
      setTitle(saved.title.slice(0, 180));
    }

    if (typeof saved.body === "string") {
      setBody(saved.body.slice(0, 5000));
    }

    if (
      typeof saved.draftKey === "string" &&
      saved.draftKey.length >= 8 &&
      saved.draftKey.length <= 220
    ) {
      setDraftKey(saved.draftKey);
    }
  } catch {
    window.sessionStorage.removeItem(draftStorageKey);
  } finally {
    restoredDraftKeyRef.current = draftStorageKey;
  }
}, [draftStorageKey, targetRoles]);

useEffect(() => {
  if (
    typeof window === "undefined" ||
    restoredDraftKeyRef.current !== draftStorageKey
  ) {
    return;
  }

  const timer = window.setTimeout(() => {
    const draft: StoredOfficialNoticeDraft = {
      version: 1,
      targetRole,
      scopeMode,
      sectorTarget,
      targetZoneId,
      selectedSchoolId,
      priority,
      noticeKind,
      deadlineAt,
      title,
      body,
      draftKey,
    };

    try {
      window.sessionStorage.setItem(
        draftStorageKey,
        JSON.stringify(draft),
      );
    } catch {
      // Draft recovery is helpful but must never block notice composition.
    }
  }, 250);

  return () => window.clearTimeout(timer);
}, [
  body,
  deadlineAt,
  draftKey,
  draftStorageKey,
  noticeKind,
  priority,
  scopeMode,
  sectorTarget,
  selectedSchoolId,
  targetRole,
  targetZoneId,
  title,
]);

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

if (typeof window !== "undefined") {
  window.sessionStorage.removeItem(draftStorageKey);
}

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
  <section className="rounded-[28px] border border-indigo-300/20 bg-indigo-500/10 p-3 sm:p-4 md:p-5">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-200">
        Official notices
      </p>

      <h2 className="mt-1 text-lg font-bold text-white">
        Send an official notice
      </h2>

      <p className="mt-1 max-w-3xl text-sm leading-6 text-indigo-100/80">
        Follow the three simple steps below. EduLife OS keeps the official
        record; SMS and email only alert recipients.
      </p>

      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-200">
        <span className="font-semibold text-white">Currently sending to:</span>{" "}
        {targetRoleLabel(targetRole)} in {targetSummary}
      </div>
    </div>

    <div className="mt-4 space-y-4">
      <section className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-300/30 bg-indigo-500/20 text-sm font-bold text-indigo-100">
            1
          </span>

          <div>
            <h3 className="text-base font-bold text-white">
              Choose who should receive it
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Select the staff group and the area or school.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-300">
              Recipients
            </span>

            <select
              value={targetRole}
              onChange={(event) => {
                setTargetRole(
                  event.target.value as OfficialNoticeTargetRole,
                );
                setSendError(null);
                setSendSuccess(null);
              }}
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
            <span className="text-xs font-semibold text-slate-300">
              Where
            </span>

            <select
              value={scopeMode}
              onChange={(event) => {
                setScopeMode(
                  event.target.value as OfficialNoticeScopeMode,
                );
                setSendError(null);
                setSendSuccess(null);
              }}
              disabled={targetRole === "SISSO"}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="ZONE">
                {isDistrictView
                  ? "Whole authorized district"
                  : "Whole authorized circuit"}
              </option>

              {canTargetSchool ? (
                <option value="SCHOOL">
                  One selected school
                </option>
              ) : null}
            </select>
          </label>

          {scopeMode === "ZONE" ? (
            <label className="block md:col-span-2">
              <span className="text-xs font-semibold text-slate-300">
                Authorized area
              </span>

              <select
                value={targetZoneId}
                onChange={(event) => {
                  setTargetZoneId(event.target.value);
                  setSendError(null);
                  setSendSuccess(null);
                }}
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
              >
                {assignmentOptions.length ? (
                  assignmentOptions.map((assignment) => (
                    <option
                      key={assignment.zoneId}
                      value={assignment.zoneId}
                    >
                      {assignment.zoneName} ·{" "}
                      {roleLabel(assignment.role)}
                    </option>
                  ))
                ) : (
                  <option value="">
                    No authorized area found
                  </option>
                )}
              </select>
            </label>
          ) : (
            <label className="block md:col-span-2">
              <span className="text-xs font-semibold text-slate-300">
                Select school
              </span>

              <select
                value={selectedSchoolId}
                onChange={(event) => {
                  setSelectedSchoolId(event.target.value);
                  setSendError(null);
                  setSendSuccess(null);
                }}
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
              >
                <option value="">
                  Choose a school
                </option>

                {schoolOptions.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name} ·{" "}
                    {school.schoolCode ?? "no code"} ·{" "}
                    {schoolSectorLabel(school.schoolSector)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-300/30 bg-indigo-500/20 text-sm font-bold text-indigo-100">
            2
          </span>

          <div>
            <h3 className="text-base font-bold text-white">
              Write the notice
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Use a short title and a clear instruction.
            </p>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-slate-300">
            Notice title
          </span>

          <input
            value={title}
            maxLength={180}
            onChange={(event) => {
              setTitle(event.target.value);
              setSendError(null);
              setSendSuccess(null);
            }}
            placeholder="Example: Teacher attendance meeting on Friday"
            className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-300/50"
          />

          <p className="mt-1 text-right text-[11px] text-slate-500">
            {title.length}/180
          </p>
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-semibold text-slate-300">
            Official instruction
          </span>

          <textarea
            value={body}
            maxLength={5000}
            rows={6}
            onChange={(event) => {
              setBody(event.target.value);
              setSendError(null);
              setSendSuccess(null);
            }}
            placeholder="State what should be done, who should do it, and when it should be completed."
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-indigo-300/50"
          />

          <div className="mt-1 flex flex-col gap-1 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Your text remains here if the network fails while sending.
            </span>
            <span>{body.length}/5000</span>
          </div>
        </label>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-300/30 bg-indigo-500/20 text-sm font-bold text-indigo-100">
            3
          </span>

          <div>
            <h3 className="text-base font-bold text-white">
              Choose the required action
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Tell recipients whether they only need to read, acknowledge or
              respond.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                value: "INFORMATION_ONLY",
                title: "Read only",
                help: "No acknowledgement or response is required.",
              },
              {
                value: "ACKNOWLEDGEMENT_REQUIRED",
                title: "Acknowledge",
                help: "Recipients must confirm that they received it.",
              },
              {
                value: "RESPONSE_REQUIRED",
                title: "Send a response",
                help: "Recipients must write back with an answer or update.",
              },
              {
                value: "URGENT_DIRECTIVE",
                title: "Urgent action",
                help: "Immediate action and a written response are required.",
              },
            ] as Array<{
              value: OfficialNoticeKind;
              title: string;
              help: string;
            }>
          ).map((option) => {
            const selected = noticeKind === option.value;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setNoticeKind(option.value);
                  setSendError(null);
                  setSendSuccess(null);
                }}
                className={`min-h-20 rounded-2xl border p-3 text-left ${
                  selected
                    ? "border-indigo-300/50 bg-indigo-500/25"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                      selected
                        ? "border-indigo-200 bg-indigo-300"
                        : "border-slate-500 bg-transparent"
                    }`}
                  />

                  <div>
                    <p className="text-sm font-bold text-white">
                      {option.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {option.help}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>

    <div className="mt-4">
      <button
        type="button"
        onClick={() => setShowAdvanced((current) => !current)}
        aria-expanded={showAdvanced}
        className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-white/[0.08]"
      >
        <span className="flex items-center justify-between gap-3">
          <span>
            {showAdvanced ? "Hide more options" : "More options"}
          </span>
          <span aria-hidden="true">
            {showAdvanced ? "−" : "+"}
          </span>
        </span>
      </button>

      {showAdvanced ? (
        <section className="mt-3 rounded-2xl border border-white/10 bg-slate-950/35 p-3 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Optional settings
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {targetRole !== "SISSO" ? (
              <label className="block">
                <span className="text-xs font-semibold text-slate-300">
                  School sector
                </span>

                <select
                  value={sectorTarget}
                  onChange={(event) => {
                    setSectorTarget(
                      event.target.value as OfficialNoticeSectorTarget,
                    );
                    setSendError(null);
                    setSendSuccess(null);
                  }}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
                >
                  <option value="PUBLIC">
                    Public schools only
                  </option>
                  <option value="PRIVATE">
                    Private schools only
                  </option>
                  <option value="ALL_AUTHORIZED">
                    All authorized schools
                  </option>
                </select>

                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  {sectorTargetLabel(sectorTarget)}
                </p>
              </label>
            ) : null}

            <label className="block">
              <span className="text-xs font-semibold text-slate-300">
                Priority
              </span>

              <select
                value={priority}
                onChange={(event) => {
                  setPriority(
                    event.target.value as OfficialNoticePriority,
                  );
                  setSendError(null);
                  setSendSuccess(null);
                }}
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Normal</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-300">
                Deadline
              </span>

              <input
                type="date"
                value={deadlineAt}
                onChange={(event) => {
                  setDeadlineAt(event.target.value);
                  setSendError(null);
                  setSendSuccess(null);
                }}
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
              />
            </label>
          </div>
        </section>
      ) : null}
    </div>

    <section className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 sm:p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
        Check before sending
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
          <p className="text-slate-400">Recipients</p>
          <p className="mt-1 font-semibold text-white">
            {targetRoleLabel(targetRole)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
          <p className="text-slate-400">Area</p>
          <p className="mt-1 break-words font-semibold text-white">
            {targetSummary}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
          <p className="text-slate-400">Required action</p>
          <p className="mt-1 font-semibold text-white">
            {noticeKindLabel(noticeKind)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
          <p className="text-slate-400">Priority</p>
          <p className="mt-1 font-semibold text-white">
            {priority === "MEDIUM" ? "Normal" : priority}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <DeliveryPill
          label="EduLife OS"
          value="Official record"
          tone="success"
        />
        <DeliveryPill
          label="SMS"
          value="Alert"
          tone="warning"
        />
        <DeliveryPill
          label="Email"
          value="Copy"
          tone="warning"
        />
      </div>
    </section>

    {sendError ? (
      <div
        role="alert"
        className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm leading-6 text-red-100"
      >
        <p className="font-semibold">
          Notice not sent
        </p>
        <p className="mt-1">
          {sendError}
        </p>
        <p className="mt-1 text-xs text-red-100/75">
          Your title and instruction are still on this screen. Check the
          connection and press Send once again.
        </p>
      </div>
    ) : null}

    {sendSuccess ? (
      <div
        role="status"
        className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm leading-6 text-emerald-100"
      >
        {sendSuccess}
      </div>
    ) : null}

    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs leading-5 text-slate-400">
        Press Send once and wait. Duplicate delivery is safely blocked if the
        same request is retried.
      </p>

      <button
        type="button"
        onClick={() => void sendOfficialNotice()}
        disabled={busy}
        className="min-h-14 w-full rounded-2xl border border-indigo-300/30 bg-indigo-500/25 px-5 py-3 text-base font-bold text-white hover:bg-indigo-500/35 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-56"
      >
        {busy ? "Sending—please wait" : "Send official notice"}
      </button>
    </div>
  </section>
);
}