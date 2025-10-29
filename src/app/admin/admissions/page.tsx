// src/app/admin/admissions/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const metadata = { title: "Admin • Recent Admissions" };
export const dynamic = "force-dynamic";

export default async function AdminAdmissionsPage() {
  // Safety: don’t expose this page in production yet
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="container mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Admin Admissions</h1>
        <p className="mt-2 text-gray-700">
          This page is locked in production. (We’ll add proper auth next.)
        </p>
      </main>
    );
  }

  const { data, error } = await supabaseAdmin
    .from("students")
    .select(
      "first_name,last_name,applied_level,date_of_birth,guardian_primary_name,guardian_primary_phone,status,enrolment_date"
    )
    .order("enrolment_date", { ascending: false })
    .limit(50);

  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold">Recent Admissions (Dev)</h1>
      {error && (
        <p className="mt-3 text-red-600 text-sm">
          Error: {error.message}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-[860px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
              <th>Student</th>
              <th>Level</th>
              <th>DOB</th>
              <th>Parent/Guardian</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.map((r, idx) => (
              <tr key={idx} className="[&>td]:px-3 [&>td]:py-2">
                <td>{[r.first_name, r.last_name].filter(Boolean).join(" ")}</td>
                <td>{r.applied_level || "-"}</td>
                <td>{r.date_of_birth || "-"}</td>
                <td>{r.guardian_primary_name || "-"}</td>
                <td>{r.guardian_primary_phone || "-"}</td>
                <td>{r.status || "-"}</td>
                <td>
                  {r.enrolment_date
                    ? new Date(r.enrolment_date).toLocaleString()
                    : "-"}
                </td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
