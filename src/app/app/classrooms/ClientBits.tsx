// src/app/app/classrooms/ClientBits.tsx
"use client";

import { useState } from "react";

type ClassroomItem = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
  capacity: number | null;
  note: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export default function ClientBits({
  items,
  tenantSlug,
}: {
  items: ClassroomItem[];
  tenantSlug: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function safeDate(v: unknown): Date | null {
    if (!v) return null;
    const d = new Date(v as any);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(v: unknown): string {
    const d = safeDate(v);
    if (!d) return "—";
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: false,
      timeZone: "Africa/Accra",
    }).format(d);
  }

  async function handleCreate(formData: FormData) {
    if (creating) return;
    setCreating(true);
    try {
      formData.set("tenantSlug", tenantSlug || "");
      const res = await fetch("/api/classrooms", { method: "POST", body: formData });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Create failed");
        return;
      }
      location.reload();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this classroom?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/classrooms/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Delete failed");
        return;
      }
      location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdate(
    id: string,
    payload: {
      name: string;
      grade?: string | null;
      arm?: string | null;
      capacity?: number | null;
      note?: string | null;
    }
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/classrooms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Update failed");
        return;
      }
      location.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form className="space-y-3" action={handleCreate}>
        <div className="rounded-xl border p-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-600">Name</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="e.g., JHS 1"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Grade</label>
            <input
              name="grade"
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="e.g., JHS 1 / P6"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Arm/Section</label>
            <input
              name="arm"
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="e.g., A"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Capacity</label>
            <input
              name="capacity"
              type="number"
              min={0}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="e.g., 45"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-600">Note</label>
            <input
              name="note"
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="Optional note"
            />
          </div>

          <div className="sm:col-span-2">
            <button type="submit" className="rounded-lg border px-4 py-2" disabled={creating}>
              {creating ? "Creating..." : "Add Classroom"}
            </button>
          </div>
        </div>
      </form>

      {/* List */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-gray-500">No classrooms yet.</p>
        ) : (
          items.map((c) => {
            const created = safeDate(c.createdAt);
            const updated = safeDate(c.updatedAt);
            const isoCreated = created ? created.toISOString() : undefined;
            const isoUpdated = updated ? updated.toISOString() : undefined;

            return (
              <div key={c.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-lg">{c.name || "(unnamed)"}</div>
                    <div className="text-sm text-gray-500">
                      {[c.grade, c.arm, c.capacity ? `${c.capacity} seats` : null]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>

                    <div className="text-xs text-gray-400">
                      Created:{" "}
                      <time dateTime={isoCreated} suppressHydrationWarning>
                        {fmtDate(c.createdAt)}
                      </time>
                    </div>
                    <div className="text-xs text-gray-400">
                      Updated:{" "}
                      <time dateTime={isoUpdated} suppressHydrationWarning>
                        {fmtDate(c.updatedAt)}
                      </time>
                    </div>

                    {c.note ? <div className="mt-1 text-sm text-gray-600">{c.note}</div> : null}
                  </div>

                  <div className="shrink-0 flex gap-2">
                    <button
                      className="rounded-lg border px-3 py-1"
                      onClick={() => {
                        const name = prompt("New name", c.name || "") ?? c.name;
                        if (name === null) return;

                        const grade = prompt("Grade", c.grade || "") ?? c.grade ?? "";
                        const arm = prompt("Arm/Section", c.arm || "") ?? c.arm ?? "";
                        const capacityRaw =
                          prompt("Capacity (number)", c.capacity != null ? String(c.capacity) : "") ??
                          (c.capacity != null ? String(c.capacity) : "");
                        const note = prompt("Note", c.note || "") ?? c.note ?? "";

                        const capacity =
                          capacityRaw && capacityRaw.trim() !== ""
                            ? Number(capacityRaw)
                            : null;

                        handleUpdate(c.id, {
                          name: name || "",
                          grade: grade || null,
                          arm: arm || null,
                          capacity: Number.isFinite(capacity) ? capacity : null,
                          note: note || null,
                        });
                      }}
                      disabled={busyId === c.id}
                    >
                      {busyId === c.id ? "..." : "Edit"}
                    </button>

                    <button
                      className="rounded-lg border px-3 py-1"
                      onClick={() => handleDelete(c.id)}
                      disabled={busyId === c.id}
                    >
                      {busyId === c.id ? "..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
