//src/app/admin/platform/invite-school/invite-school-client.tsx
"use client";

import { useMemo, useState } from "react";

type Resp =
  | {
      ok: true;
      reservedSchoolCode: string;
      reservedSlug: string;
      expiresAt: string;
      inviteUrl: string | null;
      inviteToken: string | null;
      delivery: any;
    }
  | { ok: false; error: string };

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

export default function InviteSchoolClient() {
  const [schoolName, setSchoolName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [created, setCreated] = useState<Resp | null>(null);

  const canSubmit = useMemo(() => {
    return cleanEmail(contactEmail).includes("@") && !loading;
  }, [contactEmail, loading]);

  async function submit() {
    setMsg(null);
    setCreated(null);

    const payload = {
      schoolName: clean(schoolName) || undefined,
      contactEmail: cleanEmail(contactEmail),
      contactPhone: clean(contactPhone) || undefined,
      brand: "EDULIFEOS",
    };

    setLoading(true);
    try {
      const r = await fetch("/api/admin/tenant-bootstrap/invites/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = (await r.json().catch(() => null)) as Resp | null;
      if (!j) {
        setMsg("Invalid server response.");
        return;
      }
      if (!r.ok || !j.ok) {
        setMsg((j as any)?.error || `Failed (${r.status})`);
        return;
      }

      setCreated(j);
      setContactPhone("");
      setSchoolName("");
      setContactEmail("");
    } catch {
      setMsg("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
      {msg ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {msg}
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-zinc-700">School name (optional)</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm text-zinc-700">School contact email</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="school@example.com"
          />
        </div>

        <div>
          <label className="text-sm text-zinc-700">
            School contact phone (optional but recommended)
          </label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="0553690424"
          />
        </div>

        <div className="flex items-end">
          <button
            disabled={!canSubmit}
            onClick={submit}
            className="w-full rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>

      {created && created.ok ? (
        <div className="rounded-xl border bg-zinc-50 p-4 space-y-2">
          <div className="text-sm font-semibold text-zinc-900">
            Invite sent for <span className="font-mono">{created.reservedSchoolCode}</span>
          </div>
          <div className="text-xs text-zinc-600">
            Expires:{" "}
            <span className="font-medium">
              {new Date(created.expiresAt).toLocaleString()}
            </span>
          </div>

          {created.inviteUrl ? (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={created.inviteUrl}
                className="flex-1 rounded-lg border px-3 py-2 text-xs bg-white"
              />
              <button
                onClick={() => copy(created.inviteUrl!)}
                className="rounded-lg border px-3 py-2 text-xs hover:bg-white"
              >
                Copy link
              </button>
            </div>
          ) : created.inviteToken ? (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={created.inviteToken}
                className="flex-1 rounded-lg border px-3 py-2 text-xs bg-white"
              />
              <button
                onClick={() => copy(created.inviteToken!)}
                className="rounded-lg border px-3 py-2 text-xs hover:bg-white"
              >
                Copy token
              </button>
            </div>
          ) : null}

          <div className="text-xs text-zinc-500">
            The recipient enrolls at: <span className="font-mono">/tenant/enroll</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}