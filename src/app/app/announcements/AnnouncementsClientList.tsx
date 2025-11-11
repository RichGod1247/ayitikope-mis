// src/app/app/announcements/AnnouncementsClientList.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Item = {
  id: string;
  title: string;
  body: string;
  createdAt: string; // ISO string from server
};

export default function AnnouncementsClientList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; body: string }>({
    title: "",
    body: "",
  });
  const [busy, setBusy] = useState(false);

  function startEdit(item: Item) {
    setEditingId(item.id);
    setForm({ title: item.title, body: item.body });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ title: "", body: "" });
  }

  async function saveEdit(id: string) {
    try {
      setBusy(true);
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, body: form.body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Update failed");
        return;
      }
      cancelEdit();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this announcement?")) return;
    try {
      setBusy(true);
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Delete failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-gray-500">No announcements yet.</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((a) => {
        const isEditing = editingId === a.id;
        return (
          <div key={a.id} className="rounded-xl border p-4 space-y-2">
            <div className="text-xs text-gray-500">
              {new Date(a.createdAt).toLocaleString()}
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <input
                  className="w-full rounded border px-3 py-2"
                  placeholder="Title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  disabled={busy}
                />
                <textarea
                  className="w-full rounded border px-3 py-2"
                  placeholder="Body"
                  rows={4}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  disabled={busy}
                />
                <div className="flex gap-2">
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => saveEdit(a.id)}
                    disabled={busy}
                  >
                    {busy ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="rounded border px-3 py-1"
                    onClick={cancelEdit}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-lg">{a.title}</h3>
                <p className="mt-1">{a.body}</p>
                <div className="flex gap-2 pt-2">
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => startEdit(a)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => onDelete(a.id)}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
