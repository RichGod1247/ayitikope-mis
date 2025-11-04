// src/app/app/announcements/EditAnnouncementForm.tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  initialTitle: string;
  initialBody: string;
  onClose: () => void;
};

export default function EditAnnouncementForm({
  id,
  initialTitle,
  initialBody,
  onClose,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const j = await res.json();
      if (!res.ok) setMsg(j?.error || "Failed to update.");
      else {
        setMsg("Saved!");
        router.refresh();
        onClose();
      }
    } catch (err: any) {
      setMsg(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border p-4 space-y-3">
      <h3 className="font-semibold">Edit Announcement</h3>
      <input
        type="text"
        className="w-full rounded border px-3 py-2"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={160}
      />
      <textarea
        className="w-full rounded border px-3 py-2"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border px-4 py-2"
        >
          Cancel
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </form>
  );
}
