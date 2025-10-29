// src/app/admin/admissions/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdmissionsTable from "@/components/AdmissionsTable";

export const metadata = { title: "Admin • Recent Admissions" };
export const dynamic = "force-dynamic";

export default async function AdminAdmissionsPage() {
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
      "student_id, first_name, last_name, applied_level, date_of_birth, guardian_primary_name, guardian_primary_phone, status, enrolment_date"
    )
    .order("enrolment_date", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <main className="container mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Recent Admissions (Dev)</h1>
        <p className="mt-3 text-red-600 text-sm">Error: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold">Recent Admissions (Dev)</h1>
      <div className="mt-6">
        <AdmissionsTable initialRows={data ?? []} />
      </div>
    </main>
  );
}
