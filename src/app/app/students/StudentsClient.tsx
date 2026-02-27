// src/app/app/students/StudentsClient.tsx
"use client";

import React, { useState } from "react";

type ClassroomLite = { id: string; name: string };

type StudentItem = {
  id: string;
  firstName: string;
  lastName: string;
  sex: string | null;
  dob: string | null; // ISO string from server
  guardianName: string | null;
  guardianPhone: string | null;
  classroomId: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type Props = {
  items: StudentItem[];
  tenantSlug: string;
  classrooms: ClassroomLite[];
};

type CreateForm = {
  firstName: string;
  lastName: string;
  sex: string;
  dob: string; // yyyy-mm-dd
  guardianName: string;
  guardianPhone: string;
  classroomId: string; // "" means none
};

type EditForm = CreateForm;

type StudentUpsertPayload = {
  firstName: string;
  lastName: string;
  sex: "M" | "F" | null;
  dob: string | null; // ISO
  guardianName: string | null;
  guardianPhone: string | null;
  classroomId: string | null;
};

type ApiOk<T> = { ok: true; item: T };
type ApiFail = { ok: false; error?: string };
type ApiResp<T> = ApiOk<T> | ApiFail;

function toISODateOnly(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

function errMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export default function StudentsClient({ items, tenantSlug, classrooms }: Props) {
  const [list, setList] = useState<StudentItem[]>(items ?? []);

  // --- Create form ---
  const [creating, setCreating] = useState(false);
  const [cForm, setCForm] = useState<CreateForm>({
    firstName: "",
    lastName: "",
    sex: "",
    dob: "",
    guardianName: "",
    guardianPhone: "",
    classroomId: "",
  });
  const canCreate = cForm.firstName.trim() && cForm.lastName.trim();

  // --- Editing state ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eForm, setEForm] = useState<EditForm>({
    firstName: "",
    lastName: "",
    sex: "",
    dob: "",
    guardianName: "",
    guardianPhone: "",
    classroomId: "",
  });

  function openEdit(s: StudentItem) {
    setEditingId(s.id);
    setEForm({
      firstName: s.firstName ?? "",
      lastName: s.lastName ?? "",
      sex: s.sex ?? "",
      dob: toISODateOnly(s.dob ?? null),
      guardianName: s.guardianName ?? "",
      guardianPhone: s.guardianPhone ?? "",
      classroomId: s.classroomId ?? "",
    });
  }

  function closeEdit() {
    setEditingId(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;

    setCreating(true);

    const payload: StudentUpsertPayload = {
      firstName: cForm.firstName.trim(),
      lastName: cForm.lastName.trim(),
      sex: cForm.sex === "M" || cForm.sex === "F" ? cForm.sex : null,
      guardianName: cForm.guardianName.trim() ? cForm.guardianName.trim() : null,
      guardianPhone: cForm.guardianPhone.trim() ? cForm.guardianPhone.trim() : null,
      classroomId: cForm.classroomId ? cForm.classroomId : null,
      dob: cForm.dob ? new Date(cForm.dob + "T00:00:00Z").toISOString() : null,
    };

    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as ApiResp<StudentItem>;
      if (!res.ok || !data?.ok) throw new Error((data as ApiFail)?.error || "Create failed");

      setList((prev) => [data.item, ...prev]);

      setCForm({
        firstName: "",
        lastName: "",
        sex: "",
        dob: "",
        guardianName: "",
        guardianPhone: "",
        classroomId: "",
      });
    } catch (err: unknown) {
      alert(errMessage(err, "Failed to create student"));
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(id: string) {
    const payload: StudentUpsertPayload = {
      firstName: eForm.firstName.trim(),
      lastName: eForm.lastName.trim(),
      sex: eForm.sex === "M" || eForm.sex === "F" ? eForm.sex : null,
      guardianName: eForm.guardianName.trim() ? eForm.guardianName.trim() : null,
      guardianPhone: eForm.guardianPhone.trim() ? eForm.guardianPhone.trim() : null,
      classroomId: eForm.classroomId ? eForm.classroomId : null,
      dob: eForm.dob ? new Date(eForm.dob + "T00:00:00Z").toISOString() : null,
    };

    const prev = list;

    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      const draft = [...list];
      draft[idx] = {
        ...draft[idx],
        ...payload,
        updatedAt: new Date().toISOString(),
      };
      setList(draft);
    }

    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as ApiResp<StudentItem>;
      if (!res.ok || !data?.ok) throw new Error((data as ApiFail)?.error || "Update failed");

      setList((cur) => {
        const i = cur.findIndex((x) => x.id === id);
        if (i < 0) return cur;
        const clone = [...cur];
        clone[i] = data.item;
        return clone;
      });

      closeEdit();
    } catch (err: unknown) {
      setList(prev);
      alert(errMessage(err, "Failed to update student"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this student? This cannot be undone.")) return;

    const prev = list;
    setList((cur) => cur.filter((x) => x.id !== id));

    try {
      const res = await fetch(`/api/students/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as ApiResp<unknown>;
      if (!res.ok || !data?.ok) throw new Error((data as ApiFail)?.error || "Delete failed");
    } catch (err: unknown) {
      setList(prev);
      alert(errMessage(err, "Failed to delete student"));
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold mb-3">
          Add Student{" "}
          {tenantSlug ? <span className="text-gray-400">({tenantSlug})</span> : null}
        </h2>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">First name *</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={cForm.firstName}
              onChange={(e) => setCForm((f) => ({ ...f, firstName: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Last name *</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={cForm.lastName}
              onChange={(e) => setCForm((f) => ({ ...f, lastName: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Sex</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={cForm.sex}
              onChange={(e) => setCForm((f) => ({ ...f, sex: e.target.value }))}
            >
              <option value="">--</option>
              <option value="M">Male (M)</option>
              <option value="F">Female (F)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Date of birth</label>
            <input
              type="date"
              className="w-full rounded-md border px-3 py-2"
              value={cForm.dob}
              onChange={(e) => setCForm((f) => ({ ...f, dob: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Guardian name</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={cForm.guardianName}
              onChange={(e) => setCForm((f) => ({ ...f, guardianName: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Guardian phone</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={cForm.guardianPhone}
              onChange={(e) => setCForm((f) => ({ ...f, guardianPhone: e.target.value }))}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Classroom (optional)</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={cForm.classroomId}
              onChange={(e) => setCForm((f) => ({ ...f, classroomId: e.target.value }))}
            >
              <option value="">— No classroom / assign later —</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Leave blank for schools without streams/arms; you can assign later.
            </p>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!canCreate || creating}
              className="rounded-md bg-black text-white px-4 py-2 disabled:opacity-60"
            >
              {creating ? "Saving..." : "Add student"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold mb-3">Students ({list.length})</h2>

        {list.length === 0 ? (
          <div className="text-sm text-gray-500">No students yet.</div>
        ) : (
          <div className="space-y-3">
            {list.map((s) => {
              const created = s.createdAt ? new Date(s.createdAt).toLocaleString() : "";
              const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "";
              const isEditing = editingId === s.id;

              return (
                <div key={s.id} className="rounded-lg border p-4">
                  {!isEditing ? (
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="font-medium">
                          {s.lastName}, {s.firstName}{" "}
                          <span className="text-gray-400 text-sm">
                            {s.sex ? `• ${s.sex}` : ""}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          {s.guardianName || s.guardianPhone ? (
                            <>
                              Guardian: {s.guardianName ?? "—"}{" "}
                              {s.guardianPhone ? `(${s.guardianPhone})` : ""}
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {created ? `Created: ${created}` : ""}
                          {updated ? ` • Updated: ${updated}` : ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(s)} className="px-3 py-1 rounded-md border">
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="px-3 py-1 rounded-md border text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-sm font-medium">First name</label>
                          <input
                            className="w-full rounded-md border px-3 py-2"
                            value={eForm.firstName}
                            onChange={(e) => setEForm((f) => ({ ...f, firstName: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-sm font-medium">Last name</label>
                          <input
                            className="w-full rounded-md border px-3 py-2"
                            value={eForm.lastName}
                            onChange={(e) => setEForm((f) => ({ ...f, lastName: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-sm font-medium">Sex</label>
                          <select
                            className="w-full rounded-md border px-3 py-2"
                            value={eForm.sex}
                            onChange={(e) => setEForm((f) => ({ ...f, sex: e.target.value }))}
                          >
                            <option value="">--</option>
                            <option value="M">Male (M)</option>
                            <option value="F">Female (F)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-sm font-medium">Date of birth</label>
                          <input
                            type="date"
                            className="w-full rounded-md border px-3 py-2"
                            value={eForm.dob}
                            onChange={(e) => setEForm((f) => ({ ...f, dob: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-sm font-medium">Guardian name</label>
                          <input
                            className="w-full rounded-md border px-3 py-2"
                            value={eForm.guardianName}
                            onChange={(e) =>
                              setEForm((f) => ({ ...f, guardianName: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-sm font-medium">Guardian phone</label>
                          <input
                            className="w-full rounded-md border px-3 py-2"
                            value={eForm.guardianPhone}
                            onChange={(e) =>
                              setEForm((f) => ({ ...f, guardianPhone: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <label className="text-sm font-medium">Classroom (optional)</label>
                          <select
                            className="w-full rounded-md border px-3 py-2"
                            value={eForm.classroomId}
                            onChange={(e) =>
                              setEForm((f) => ({ ...f, classroomId: e.target.value }))
                            }
                          >
                            <option value="">— No classroom / unassigned —</option>
                            {classrooms.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdate(s.id)}
                          className="px-4 py-2 rounded-md bg-black text-white"
                        >
                          Save
                        </button>
                        <button onClick={closeEdit} className="px-4 py-2 rounded-md border">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
