// src/app/admin/scholarships/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ScholarshipActions from "@/components/ScholarshipActions";
import SendQueuedButton from "@/components/SendQueuedButton";


export const metadata = { title: "Admin • Scholarships" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  student_name: string | null;
  level: string | null;
  guardian_phone: string | null;
  need_reason: string | null;
  status: "pending" | "reviewed" | "accepted" | "rejected" | null;
  submitted_at: string | null;
};

export default async function AdminScholarshipsPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="container mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Scholarships (Admin)</h1>
        <h1 className="text-2xl font-bold">Scholarship Applications</h1>
<div className="mt-2">
  <SendQueuedButton />
</div>
        <p className="mt-2 text-gray-700">
          This page is locked in production until auth is enabled.
        </p>
      </main>
    );
  }

  const { data, error } = await supabaseAdmin
    .from("scholarship_applications")
    .select("id, student_name, level, guardian_phone, need_reason, status, submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as Row[];

  return (
    <main className="container mx-auto px-6 py-10">
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">Scholarship Applications</h1>
      {/* WhatsApp: send next queued */}
      <SendQueuedButton />
    </div>

    {error && (
      <p className="mt-3 text-red-600 text-sm">Error: {error.message}</p>
    )}

    <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
      <table className="min-w-[1040px] w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
            <th>Student</th>
            <th>Level</th>
            <th>Guardian Phone</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="[&>td]:px-3 [&>td]:py-2 align-top">
              <td className="font-medium">{r.student_name || "-"}</td>
              <td>{r.level || "-"}</td>
              <td>{r.guardian_phone || "-"}</td>
              <td className="max-w-[420px] text-gray-700">{r.need_reason || "-"}</td>
              <td>
                <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
                  {r.status || "pending"}
                </span>
              </td>
              <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
              <td>
                <ScholarshipActions id={r.id} current={r.status} />
              </td>
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                No scholarship applications yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </main>
  );
}
