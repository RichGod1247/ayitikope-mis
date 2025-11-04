// src/app/app/announcements/AnnouncementsClientList.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import EditAnnouncementForm from "./EditAnnouncementForm";

type Item = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

export default function AnnouncementsClientList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  async function onDelete(id: string) {
    if (!confirm("Delete this announcement?")) return;
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Delete failed");
        return;
      }
      router.refresh();
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="text-gray-500">No announcements yet.</p>
      ) : (
        items.map((a) => (
          <div key={a.id} className="rounded-xl border p-4 space-y-2">
            <div className="text-sm text-gray-500">
              {new Date(a.createdAt).toLocaleString()}
            </div>

            {editingId === a.id ? (
              <EditAnnouncementForm
                id={a.id}
                initialTitle={a.title}
                initialBody={a.body}
                onClose={() => setEditingId(null)}
              />
            ) : (
              <>
                <h3 className="font-semibold text-lg">{a.title}</h3>
                <p className="mt-1">{a.body}</p>
                <div className="flex gap-2 pt-2">
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => setEditingId(a.id)}
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
        ))
      )}
    </div>
  );
}
