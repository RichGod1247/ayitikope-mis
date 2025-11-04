// src/app/app/announcements/NewAnnouncementForm.tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props = { tenantSlug: string };

export default function NewAnnouncementForm({ tenantSlug }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, title, body }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error || "Failed to create announcement.");
      } else {
        setMsg("Announcement posted!");
        setTitle("");
        setBody("");
        router.refresh(); // reload the server data list
      }
    } catch (err: any) {
      setMsg(String(err?.message || err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border p-4 space-y-3">
      <h2 className="font-semibold">Create Announcement</h2>
      <input
        type="text"
        placeholder="Title"
        className="w-full rounded border px-3 py-2"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={160}
      />
      <textarea
        placeholder="Body"
        className="w-full rounded border px-3 py-2"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {submitting ? "Posting..." : "Post"}
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
      <div className="text-xs text-gray-500">tenantSlug: {tenantSlug}</div>
    </form>
  );
}
