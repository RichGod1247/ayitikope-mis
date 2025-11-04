"use client";

import { useState } from "react";

export default function TeacherDeleteButton({ teacher_id }: { teacher_id: string }) {
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm("Delete this teacher? (Will fail if assigned to a class)")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/teachers/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ teacher_id }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        alert(`Error: ${j.error || r.statusText}`);
      } else {
        window.location.reload();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
    >
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}
