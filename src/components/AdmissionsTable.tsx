// src/components/AdmissionsTable.tsx
"use client";

import { useMemo, useState } from "react";

type Row = {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  applied_level: string | null;
  date_of_birth: string | null;
  guardian_primary_name: string | null;
  guardian_primary_phone: string | null;
  enrolment_date: string | null;
  status: "pending" | "reviewed" | "accepted" | "declined" | string | null;
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  reviewed: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
};

function StatusBadge({ value }: { value: string }) {
  const cls = STATUS_CLASS[value] || "bg-gray-100 text-gray-800";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{value}</span>;
}

export default function AdmissionsTable({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"pending" | "reviewed" | "accepted" | "declined" | "all">(
    "pending"
  );
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      const ok = filter === "all" ? true : (r.status ?? "pending") === filter;
      if (!ok) return false;
      if (!text) return true;
      const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.toLowerCase();
      return (
        name.includes(text) ||
        (r.guardian_primary_name ?? "").toLowerCase().includes(text) ||
        (r.guardian_primary_phone ?? "").toLowerCase().includes(text)
      );
    });
  }, [rows, q, filter]);

  async function updateStatus(student_id: string, status: "reviewed" | "accepted" | "declined") {
    setBusy(student_id + ":" + status);
    try {
      const res = await fetch("/api/admin/students/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          // In production you'll also send: 'x-admin-key': process.env.NEXT_PUBLIC_ADMIN_KEY
        },
        body: JSON.stringify({ student_id, status }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Update failed");

      // Optimistic update
      setRows((prev) => prev.map((r) => (r.student_id === student_id ? { ...r, status } : r)));
    } catch (e) {
      alert("Update failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-soft">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {(["pending", "reviewed", "accepted", "declined", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={[
                "rounded-md px-3 py-1.5 text-sm border",
                filter === s ? "bg-blue-700 text-white border-blue-700" : "bg-white hover:bg-gray-50",
              ].join(" ")}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search student/parent/phone…"
          className="rounded-md border px-3 py-2 outline-none focus:border-blue-600 w-full sm:w-80"
        />
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="py-2 pr-3">Student</th>
              <th className="py-2 pr-3">Level</th>
              <th className="py-2 pr-3">DOB</th>
              <th className="py-2 pr-3">Parent/Guardian</th>
              <th className="py-2 pr-3">Phone</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Submitted</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.student_id} className="border-t">
                <td className="py-2 pr-3 font-medium">
                  {(r.first_name ?? "") + " " + (r.last_name ?? "")}
                </td>
                <td className="py-2 pr-3">{r.applied_level ?? "-"}</td>
                <td className="py-2 pr-3">{r.date_of_birth ?? "-"}</td>
                <td className="py-2 pr-3">{r.guardian_primary_name ?? "-"}</td>
                <td className="py-2 pr-3">{r.guardian_primary_phone ?? "-"}</td>
                <td className="py-2 pr-3">
                  <StatusBadge value={(r.status ?? "pending").toString()} />
                </td>
                <td className="py-2 pr-3">
                  {(r.enrolment_date ?? "").slice(0, 19).replace("T", " ")}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updateStatus(r.student_id, "reviewed")}
                      disabled={busy === r.student_id + ":reviewed"}
                      className="rounded-md border px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Review
                    </button>
                    <button
                      onClick={() => updateStatus(r.student_id, "accepted")}
                      disabled={busy === r.student_id + ":accepted"}
                      className="rounded-md bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => updateStatus(r.student_id, "declined")}
                      disabled={busy === r.student_id + ":declined"}
                      className="rounded-md bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-500">
                  No records match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
