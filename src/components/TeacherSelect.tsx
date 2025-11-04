// src/components/TeacherSelect.tsx
"use client";

import { useState } from "react";

type Teacher = {
  teacher_id: string;
  first_name: string | null;
  last_name: string | null;
};

export default function TeacherSelect({
  classCode,
  current,
  teachers,
}: {
  classCode: string;
  current: string | null;
  teachers: Teacher[];
}) {
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const raw = e.target.value;
    // Convert "" → null for “Unassigned”
    const teacher_id = raw === "" ? null : raw;

    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/admin/classes/assign-teacher", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_code: classCode, teacher_id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setMsg(data.error || "Update failed.");
      } else {
        setValue(teacher_id ?? "");
        setMsg("Saved");
        setTimeout(() => setMsg(""), 1500);
      }
    } catch (err: any) {
      setMsg(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={onChange}
        disabled={busy}
        className="rounded-md border px-2 py-1 text-sm"
        aria-label="Assign class teacher"
      >
        <option value="">— Unassigned —</option>
        {teachers.map((t) => {
          const name =
            [t.first_name, t.last_name].filter(Boolean).join(" ").trim() ||
            t.teacher_id;
        return (
            <option key={t.teacher_id} value={t.teacher_id}>
              {name}
            </option>
          );
        })}
      </select>
      {busy && <span className="text-xs text-gray-500">Saving…</span>}
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}
