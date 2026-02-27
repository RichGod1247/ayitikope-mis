// src/app/app/complete-profile/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TeacherPhase = "KG" | "PRIMARY" | "JHS";

type ApiOk = {
  ok: true;
  user: { id: string; email: string | null; name: string | null; phone: string | null; phoneNorm: string | null };
  tenantId: string;
  roleName: string | null;
  teacherProfile: {
    id: string;
    tenantId: string;
    userId: string;
    phone: string;
    phase: TeacherPhase;
    classLevel: string | null;
    jhsAssignments: unknown | null;
    additionalDuties: string[];
    primaryClassroomId: string | null;
  } | null;
};

type ApiFail = { ok: false; error: string; fieldErrors?: Record<string, string> };
type ApiResp = ApiOk | ApiFail;

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

export default function CompleteProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<TeacherPhase>("PRIMARY");
  const [classLevel, setClassLevel] = useState("");
  const [jhsAssignmentsJson, setJhsAssignmentsJson] = useState(""); // optional

  const [me, setMe] = useState<ApiOk | null>(null);

  const showJhs = useMemo(() => phase === "JHS", [phase]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetch("/api/me/profile/teacher", { cache: "no-store" });
        const j = (await r.json()) as ApiResp;

        if (!alive) return;

        if (!j.ok) {
          setErr(j.error || "FAILED_TO_LOAD");
          setLoading(false);
          return;
        }

        setMe(j);

        // Pre-fill from TeacherProfile if present; else from User.phone
        const existingPhone = j.teacherProfile?.phone ?? j.user.phone ?? "";
        setPhone(existingPhone);

        const existingPhase = (j.teacherProfile?.phase ?? "PRIMARY") as TeacherPhase;
        setPhase(existingPhase);

        setClassLevel(j.teacherProfile?.classLevel ?? "");

        const existingJhs = j.teacherProfile?.jhsAssignments ?? null;
        setJhsAssignmentsJson(existingJhs ? JSON.stringify(existingJhs, null, 2) : "");

        setLoading(false);
      } catch {
        if (!alive) return;
        setErr("NETWORK_ERROR");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setErr(null);

    const p = cleanStr(phone);
    if (!p) {
      setErr("PHONE_REQUIRED");
      return;
    }

    let parsedJhs: unknown | undefined = undefined;
    if (showJhs) {
      const raw = cleanStr(jhsAssignmentsJson);
      if (raw) {
        try {
          parsedJhs = JSON.parse(raw);
        } catch {
          setErr("JHS_ASSIGNMENTS_JSON_INVALID");
          return;
        }
      }
    }

    try {
      setSaving(true);

      const res = await fetch("/api/me/profile/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: p,
          phase,
          classLevel: cleanStr(classLevel) || null,
          jhsAssignments: showJhs ? parsedJhs ?? null : null,
        }),
      });

      const j = (await res.json()) as ApiResp;

      if (!j.ok) {
        setErr(j.error || "SAVE_FAILED");
        setSaving(false);
        return;
      }

      // Go back through the gateway so enforcement is consistent
      router.replace("/app");
    } catch {
      setErr("NETWORK_ERROR");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50">
        <div className="max-w-xl mx-auto px-4 py-10">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-700">Loading profile…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-zinc-900">Complete your teacher profile</h1>
          <p className="text-sm text-zinc-600">
            This is required once so your account is bank-grade and never returns nulls again.
          </p>
          {me?.tenantId ? (
            <p className="text-[11px] text-zinc-500">Tenant: {me.tenantId}</p>
          ) : null}
        </header>

        <form onSubmit={onSubmit} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          {err ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
              {err}
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">Phone (Ghana)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0241234567 or +233241234567"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
            <p className="text-[11px] text-zinc-500">We normalize to +233… internally for matching and uniqueness.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">Phase</label>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value as TeacherPhase)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            >
              <option value="KG">KG</option>
              <option value="PRIMARY">PRIMARY</option>
              <option value="JHS">JHS</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">Class level (optional)</label>
            <input
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              placeholder='e.g. "B4", "JHS 2", "KG2"'
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          {showJhs ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700">JHS assignments (optional JSON)</label>
              <textarea
                value={jhsAssignmentsJson}
                onChange={(e) => setJhsAssignmentsJson(e.target.value)}
                placeholder='Example: {"Math": ["JHS 1"], "RME": ["JHS 2","JHS 3"]}'
                rows={6}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 font-mono"
              />
              <p className="text-[11px] text-zinc-500">
                Leave empty if you’re not using structured assignments yet.
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center rounded-xl border border-black bg-black px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-900 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>

          <p className="text-[11px] text-zinc-500">
            Rule: identities never travel in URLs. Tenant + role come from session only.
          </p>
        </form>
      </div>
    </main>
  );
}
