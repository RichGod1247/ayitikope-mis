// src/app/admin/assessments/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AssessmentQuickAdd from "@/components/AssessmentQuickAdd";

export const metadata = { title: "Admin • Assessments" };
export const dynamic = "force-dynamic";

type AssessmentRow = {
  record_id: string;
  student_id: string | null;
  class_code: string | null;
  subject: string | null;
  assessment_type: string | null;
  max_score: number | null;
  score: number | null;
  date: string | null;
  term: string | null;
  academic_year: string | null;
  grade: string | null;
  comment: string | null;
};

type StudentRow = {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
};

export default async function AdminAssessmentsPage() {
  // Guard prod for now (until auth is wired)
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="container mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Assessments (Admin)</h1>
        <p className="mt-2 text-gray-700">
          This page is locked in production until authentication is enabled.
        </p>
      </main>
    );
  }

  // 1) Pull last 100 assessments by date (desc)
  const { data, error } = await supabaseAdmin
    .from("assessments")
    .select(
      "record_id, student_id, class_code, subject, assessment_type, max_score, score, date, term, academic_year, grade, comment"
    )
    .order("date", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as AssessmentRow[];

  // 2) Build a student map for names
  const studentIds = Array.from(
    new Set(rows.map(r => r.student_id).filter(Boolean))
  ) as string[];

  const studentMap = new Map<string, string>();
  if (studentIds.length) {
    const { data: studs } = await supabaseAdmin
      .from("students")
      .select("student_id, first_name, last_name")
      .in("student_id", studentIds);

    (studs as StudentRow[] | null)?.forEach(s => {
      const nm = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
      studentMap.set(s.student_id, nm || s.student_id);
    });
  }

  return (
    <main className="container mx-auto px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assessments</h1>
        <span className="inline-flex items-center rounded-md border bg-white px-3 py-1 text-sm">
          Total: <strong className="ml-1">{rows.length}</strong>
        </span>
      </header>

      {/* Quick Add form */}
      <div className="mt-4">
        <AssessmentQuickAdd />
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">Error: {error.message}</p>
      )}

      {/* Table */}
      <section className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
              <th>Date</th>
              <th>Student</th>
              <th>Class</th>
              <th>Subject</th>
              <th>Type</th>
              <th>Score</th>
              <th>Max</th>
              <th>Grade</th>
              <th>Term</th>
              <th>Year</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(r => (
              <tr key={r.record_id} className="[&>td]:px-3 [&>td]:py-2">
                <td>{r.date || "-"}</td>
                <td className="font-medium">
                  {r.student_id ? (studentMap.get(r.student_id) || r.student_id) : "-"}
                </td>
                <td>{r.class_code || "-"}</td>
                <td>{r.subject || "-"}</td>
                <td>{r.assessment_type || "-"}</td>
                <td>{r.score ?? "-"}</td>
                <td>{r.max_score ?? "-"}</td>
                <td>{r.grade || "-"}</td>
                <td>{r.term || "-"}</td>
                <td>{r.academic_year || "-"}</td>
                <td className="max-w-[300px] text-gray-700">{r.comment || "-"}</td>
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-gray-500">
                  No assessments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
