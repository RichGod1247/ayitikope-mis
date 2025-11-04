// src/app/app/classrooms/ClientBits.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Keep this in sync with page.tsx
export type ClassroomItem = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
  note: string | null;
  createdAt: string;
};

export default function ClientBits({
  items,
  tenantSlug,
}: {
  items: ClassroomItem[];
  tenantSlug: string;
}) {
  const router = useRouter();

  // Form state
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [arm, setArm] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Please enter classroom name");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/classrooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          grade: grade.trim() || null,
          arm: arm.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to create classroom");
      }
      // Clear form and refresh list
      setName("");
      setGrade("");
      setArm("");
      setNote("");
      router.refresh();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this classroom?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/classrooms/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Delete failed");
      }
      router.refresh();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form
        onSubmit={onCreate}
        className="rounded-xl border p-4 space-y-3 bg-white"
      >
        <h2 className="font-semibold">Add Classroom</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Name *</span>
            <input
              className="border rounded-md px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., JHS 1"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Grade</span>
            <input
              className="border rounded-md px-3 py-2"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g., JHS"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Arm</span>
            <input
              className="border rounded-md px-3 py-2"
              value={arm}
              onChange={(e) => setArm(e.target.value)}
              placeholder="e.g., A"
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm text-gray-600">Note</span>
            <input
              className="border rounded-md px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="rounded-md border px-4 py-2 disabled:opacity-60"
        >
          {busy ? "Saving..." : "Add Classroom"}
        </button>
      </form>

      {/* List */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-gray-500">No classrooms yet.</p>
        ) : (
          items.map((c) => (
            <div key={c.id} className="rounded-xl border p-4 space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{c.name}</h3>
                <button
                  className="rounded border px-3 py-1 text-sm"
                  onClick={() => onDelete(c.id)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
              <div className="text-sm text-gray-600">
                {[
                  c.grade ? `Grade: ${c.grade}` : null,
                  c.arm ? `Arm: ${c.arm}` : null,
                  c.note ? `Note: ${c.note}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </div>
              <div className="text-xs text-gray-400">
                Created: {new Date(c.createdAt).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
