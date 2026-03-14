// src/components/HeadteacherResultsReleaseClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Classroom = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

type Props = {
  classrooms: Classroom[];
  defaultTerm: string;
  defaultAcademicYear: string;
};

type ReleaseStatusResp =
  | {
      ok: true;
      term: string;
      academicYear: string;
      school: { releasedAt: string } | null;
      classroomReleaseMap: Record<string, { releasedAt: string }>;
    }
  | { ok: false; error: string; role?: string; path?: string };

type NotifyStatus = {
  ok: boolean;
  error?: string;
  job?: unknown;
  remaining?: number;
  batch?: { sent: number; failed: number };
  done?: boolean;
};

type StreamMode = "single" | "multi";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeStageBucket(raw: unknown): string | null {
  const compact = cleanStr(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;

  let m =
    compact.match(/^KG([12])(?:[A-Z].*)?$/) ||
    compact.match(/^KINDERGARTEN([12])(?:[A-Z].*)?$/);
  if (m) return `KG ${m[1]}`;

  m = compact.match(/^(PRIMARY|PRI|P)([1-6])(?:[A-Z].*)?$/);
  if (m) return `PRIMARY ${m[2]}`;

  m = compact.match(/^(BASIC|B)([1-9])(?:[A-Z].*)?$/);
  if (m) {
    const n = Number(m[2]);
    if (n >= 1 && n <= 6) return `PRIMARY ${n}`;
    if (n === 7) return "JHS 1";
    if (n === 8) return "JHS 2";
    if (n === 9) return "JHS 3";
  }

  m = compact.match(/^JHS([1-3])(?:[A-Z].*)?$/);
  if (m) return `JHS ${m[1]}`;

  return null;
}

function getStageBucketForClassroom(c: Classroom) {
  return normalizeStageBucket(c.grade) ?? normalizeStageBucket(c.name);
}

function hasDuplicateStageBuckets(list: Classroom[]) {
  const seen = new Set<string>();
  for (const c of list) {
    const bucket = getStageBucketForClassroom(c);
    if (!bucket) continue;
    if (seen.has(bucket)) return true;
    seen.add(bucket);
  }
  return false;
}

function fullClassLabel(c: Classroom) {
  const name = cleanStr(c.name);
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (grade) return `${name}${grade ? ` (${grade}${arm ? ` ${arm}` : ""})` : ""}`;
  return name || "Class";
}

function singleStreamLabel(c: Classroom) {
  return getStageBucketForClassroom(c) || fullClassLabel(c);
}

function chooseRepresentativeClass(
  group: Classroom[],
  preferredClassroomId: string | null
) {
  return (
    group.find((x) => x.id === preferredClassroomId) ??
    group.find((x) => !cleanStr(x.arm)) ??
    group[0]
  );
}

function buildSingleStreamClassrooms(
  list: Classroom[],
  preferredClassroomId: string | null
): Classroom[] {
  const orderedBuckets = [
    "KG 1",
    "KG 2",
    "PRIMARY 1",
    "PRIMARY 2",
    "PRIMARY 3",
    "PRIMARY 4",
    "PRIMARY 5",
    "PRIMARY 6",
    "JHS 1",
    "JHS 2",
    "JHS 3",
  ] as const;

  const grouped = new Map<string, Classroom[]>();
  const others: Classroom[] = [];

  for (const c of list) {
    const bucket = getStageBucketForClassroom(c);
    if (!bucket) {
      others.push(c);
      continue;
    }

    const arr = grouped.get(bucket) ?? [];
    arr.push(c);
    grouped.set(bucket, arr);
  }

  const picked: Classroom[] = [];

  for (const bucket of orderedBuckets) {
    const group = grouped.get(bucket) ?? [];
    if (!group.length) continue;
    picked.push(chooseRepresentativeClass(group, preferredClassroomId));
  }

  return [...picked, ...others];
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function HeadteacherResultsReleaseClient({
  classrooms,
  defaultTerm,
  defaultAcademicYear,
}: Props) {
  const [term, setTerm] = useState(defaultTerm);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);

  const [scope, setScope] = useState<"SCHOOL" | "CLASSROOM">("SCHOOL");
  const [classroomId, setClassroomId] = useState<string>(classrooms[0]?.id ?? "");
  const [streamMode, setStreamMode] = useState<StreamMode>("single");

  const [status, setStatus] = useState<ReleaseStatusResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [batchSize, setBatchSize] = useState<number>(25);
  const [notify, setNotify] = useState<NotifyStatus | null>(null);

  const canToggleMultiStream = useMemo(() => {
    return hasDuplicateStageBuckets(classrooms);
  }, [classrooms]);

  const visibleClassrooms = useMemo(() => {
    if (!canToggleMultiStream) return classrooms;
    if (streamMode === "multi") return classrooms;
    return buildSingleStreamClassrooms(classrooms, classroomId || null);
  }, [classrooms, canToggleMultiStream, streamMode, classroomId]);

  useEffect(() => {
    if (!visibleClassrooms.length) {
      if (classroomId) setClassroomId("");
      return;
    }

    if (visibleClassrooms.some((c) => c.id === classroomId)) return;

    const current = classrooms.find((c) => c.id === classroomId);
    const currentBucket = current ? getStageBucketForClassroom(current) : null;

    if (currentBucket) {
      const sameBucketVisible = visibleClassrooms.find(
        (c) => getStageBucketForClassroom(c) === currentBucket
      );
      if (sameBucketVisible) {
        setClassroomId(sameBucketVisible.id);
        return;
      }
    }

    setClassroomId(visibleClassrooms[0].id);
  }, [visibleClassrooms, classrooms, classroomId]);

  async function loadStatus() {
    setBusy("status");
    try {
      const qs = new URLSearchParams({ term, academicYear });
      const res = await fetch(
        `/api/headteacher/results/release/status?${qs.toString()}`,
        { cache: "no-store" }
      );
      const json =
        (await safeJson<ReleaseStatusResp>(res)) ??
        ({ ok: false, error: "Invalid JSON" } as ReleaseStatusResp);
      setStatus(json);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, academicYear]);

  const isReleased = useMemo(() => {
    if (!status || status.ok !== true) return false;
    if (scope === "SCHOOL") return !!status.school;
    return !!status.classroomReleaseMap?.[classroomId];
  }, [status, scope, classroomId]);

  async function doRelease() {
    setBusy("release");
    setNotify(null);

    try {
      const res = await fetch("/api/headteacher/results/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          term,
          academicYear,
          classroomId: scope === "CLASSROOM" ? classroomId : null,
        }),
      });

      const json = await safeJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !json?.ok) {
        window.alert(json?.error || `Release failed (HTTP ${res.status})`);
        return;
      }

      await loadStatus();
    } finally {
      setBusy(null);
    }
  }

  async function doUnrelease() {
    setBusy("unrelease");
    setNotify(null);

    try {
      const res = await fetch("/api/headteacher/results/release", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          term,
          academicYear,
          classroomId: scope === "CLASSROOM" ? classroomId : null,
        }),
      });

      const json = await safeJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !json?.ok) {
        window.alert(json?.error || `Unrelease failed (HTTP ${res.status})`);
        return;
      }

      await loadStatus();
    } finally {
      setBusy(null);
    }
  }

  async function sendNextBatch() {
    setBusy("notify");

    try {
      const res = await fetch("/api/headteacher/results/release/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          term,
          academicYear,
          classroomId: scope === "CLASSROOM" ? classroomId : null,
          batchSize,
        }),
      });

      const json =
        (await safeJson<NotifyStatus>(res)) ??
        ({ ok: false, error: "Invalid JSON from server" } as NotifyStatus);

      setNotify(json);

      if (!res.ok || !json.ok) {
        window.alert(json.error || `Notify failed (HTTP ${res.status})`);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[#F7F4ED]">
            Parent result release
          </h2>
          <p className="mt-1 text-[11px] text-[#C9CDD6]">
            For current practice, use this after{" "}
            <span className="font-semibold text-[#F7F4ED]">end-of-term exam results</span> are
            finalized. This is not your teacher continuous-assessment workflow.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#C9CDD6]">
              Term
            </label>
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
            >
              <option value="1st Term">1st Term</option>
              <option value="2nd Term">2nd Term</option>
              <option value="3rd Term">3rd Term</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[#C9CDD6]">
              Academic year
            </label>
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
              placeholder="e.g. 2025/2026"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadStatus()}
              disabled={busy === "status"}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
            >
              {busy === "status" ? "Refreshing…" : "Refresh status"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 px-3 py-3 text-[11px] text-[#C9CDD6]">
          <div className="font-semibold text-[#F7F4ED]">Scope</div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScope("SCHOOL")}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold border ${
                scope === "SCHOOL"
                  ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                  : "border-white/10 bg-white/5 text-[#D7DCE5]"
              }`}
            >
              Whole school
            </button>

            <button
              type="button"
              onClick={() => setScope("CLASSROOM")}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold border ${
                scope === "CLASSROOM"
                  ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                  : "border-white/10 bg-white/5 text-[#D7DCE5]"
              }`}
            >
              Per class
            </button>
          </div>

          {scope === "CLASSROOM" ? (
            <div className="mt-3 space-y-2">
              <select
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#05070B] px-3 py-2 text-[11px] text-[#F7F4ED]"
              >
                {visibleClassrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {streamMode === "single"
                      ? singleStreamLabel(c)
                      : fullClassLabel(c)}
                  </option>
                ))}
              </select>

              {canToggleMultiStream ? (
                <label className="inline-flex items-center gap-2 text-[11px] text-[#AEB6C4]">
                  <input
                    type="checkbox"
                    checked={streamMode === "multi"}
                    onChange={(e) =>
                      setStreamMode(e.target.checked ? "multi" : "single")
                    }
                  />
                  Show multistream classes
                </label>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void doRelease()}
            disabled={busy === "release"}
            className="rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-[11px] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] disabled:opacity-60"
          >
            {busy === "release" ? "Releasing…" : "Release parent access"}
          </button>

          <button
            type="button"
            onClick={() => void doUnrelease()}
            disabled={busy === "unrelease"}
            className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-4 py-2 text-[11px] font-semibold text-rose-100 hover:bg-rose-400/16 disabled:opacity-60"
          >
            {busy === "unrelease" ? "Turning off…" : "Turn release off"}
          </button>

          <span className="text-[11px] text-[#C9CDD6]">
            Status:{" "}
            <span
              className={`font-semibold ${
                isReleased ? "text-emerald-100" : "text-[#F7F4ED]"
              }`}
            >
              {isReleased ? "Released" : "Not released"}
            </span>{" "}
            for <span className="font-semibold text-[#F7F4ED]">{term}</span> ·{" "}
            <span className="font-semibold text-[#F7F4ED]">{academicYear}</span>
          </span>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl space-y-2">
        <div>
          <p className="text-sm font-semibold text-[#F7F4ED]">
            Notify parents by SMS (batched)
          </p>
          <p className="max-w-2xl text-[11px] text-[#C9CDD6]">
            Sends to guardians with <span className="font-semibold text-[#F7F4ED]">SMS consent = true</span>.
            One batch per click keeps delivery safer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-[#C9CDD6]">Batch size</label>
          <input
            type="number"
            value={batchSize}
            onChange={(e) =>
              setBatchSize(Math.max(5, Math.min(60, Number(e.target.value || 25))))
            }
            className="w-24 rounded-lg border border-white/10 bg-[#07111F] px-3 py-1.5 text-[11px] text-[#F7F4ED]"
          />

          <button
            type="button"
            onClick={() => void sendNextBatch()}
            disabled={busy === "notify" || !isReleased}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
          >
            {busy === "notify" ? "Sending…" : "Send next batch"}
          </button>

          {!isReleased ? (
            <span className="text-[11px] text-rose-200">
              Release must be ON before notifying.
            </span>
          ) : null}
        </div>

        {notify?.ok ? (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-[11px] text-emerald-100">
            <div className="font-semibold">Batch result</div>
            <div className="mt-1">
              Sent: <span className="font-semibold">{notify.batch?.sent ?? 0}</span> ·
              Failed: <span className="font-semibold"> {notify.batch?.failed ?? 0}</span> ·
              Remaining: <span className="font-semibold"> {notify.remaining ?? "—"}</span>
            </div>
            {notify.done ? <div className="mt-1 font-semibold">Done ✅</div> : null}
          </div>
        ) : notify?.error ? (
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-[11px] text-rose-100">
            {notify.error}
          </div>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <p className="text-sm font-semibold text-[#F7F4ED]">
          Release overview (this term/year)
        </p>

        {!status ? (
          <p className="mt-2 text-[11px] text-[#C9CDD6]">Loading…</p>
        ) : status.ok !== true ? (
          <p className="mt-2 text-[11px] text-rose-200">
            {status.error || "Failed to load status."}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Class
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Released?
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
                    Released at
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleClassrooms.map((c, idx) => {
                  const zebra = idx % 2 === 1 ? "bg-white/[0.03]" : "bg-transparent";
                  const m = status.classroomReleaseMap?.[c.id] ?? null;

                  return (
                    <tr key={c.id} className={zebra}>
                      <td className="px-2 py-2 font-semibold text-[#F7F4ED]">
                        {streamMode === "single"
                          ? singleStreamLabel(c)
                          : fullClassLabel(c)}
                      </td>
                      <td className="px-2 py-2 text-[#C9CDD6]">{m ? "Yes" : "No"}</td>
                      <td className="px-2 py-2 text-[#AEB6C4]">
                        {m?.releasedAt ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}