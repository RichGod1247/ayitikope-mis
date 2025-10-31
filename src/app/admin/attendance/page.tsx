// src/app/admin/attendance/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import CSVButton from "@/components/CSVButton";

export const metadata = { title: "Admin • Attendance" };
export const dynamic = "force-dynamic";

// Helper to format YYYY-MM-DD for "today"
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

type AttendanceRow = {
  attendance_id: string;
  student_id: string | null;
  class_code: string | null;
  date: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  method: string | null;
  temperature_c: number | null;
  status: string | null;
};

type StudentRow = {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
};

export default async function AdminAttendancePage({
  searchParams,
}: {
  // Next 15: searchParams is a Promise in Server Components
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const date =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayISO();
  const klass = sp.class || ""; // e.g., "JHS1A"

  // 1) Fetch attendance for the day (optionally by class)
  let query = supabaseAdmin
    .from("attendance")
    .select("*")
    .eq("date", date)
    .order("check_in_time", { ascending: true })
    .limit(500);

  if (klass) query = query.eq("class_code", klass);

  const { data: attRows, error: attErr } = await query;
  const rows = (attRows ?? []) as AttendanceRow[];

  // 2) Pull student names for nicer display
  const ids = Array.from(
    new Set(rows.map((r) => r.student_id).filter(Boolean))
  ) as string[];

  const studentsMap = new Map<string, { name: string }>();
  if (ids.length) {
    const { data: studs } = await supabaseAdmin
      .from("students")
      .select("student_id, first_name, last_name")
      .in("student_id", ids);

    (studs as StudentRow[] | null)?.forEach((s) => {
      const name =
        [s.first_name, s.last_name].filter(Boolean).join(" ").trim() ||
        s.student_id;
      studentsMap.set(s.student_id, { name });
    });
  }

  const presentCount = rows.length;
  const classInfo = klass ? ` • ${klass}` : "";

  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold">Attendance — {date}{classInfo}</h1>

      {/* Filters */}
      <form className="mt-4 grid gap-3 sm:flex sm:items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            defaultValue={date}
            type="date"
            name="date"
            className="mt-1 rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Class (optional)</label>
          <input
            defaultValue={klass}
            name="class"
            placeholder="e.g., JHS1A"
            className="mt-1 rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
        <button
          className="h-[38px] rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
          type="submit"
        >
          Apply
        </button>
      </form>

      {/* Summary + CSV */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center rounded-md border bg-white px-3 py-1 text-sm">
          Present: <strong className="ml-1">{presentCount}</strong>
        </span>

        {/* Client CSV button */}
        <CSVButton
          rows={rows}
          studentsMap={Object.fromEntries(studentsMap)}
          date={date}
          klass={klass}
        />
      </div>

      {/* Table */}
      <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
              <th>Student</th>
              <th>Class</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Temp (°C)</th>
              <th>Method</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const nm = r.student_id ? studentsMap.get(r.student_id)?.name : "-";
              return (
                <tr key={r.attendance_id} className="[&>td]:px-3 [&>td]:py-2">
                  <td className="font-medium">{nm || r.student_id || "-"}</td>
                  <td>{r.class_code || "-"}</td>
                  <td>{r.check_in_time || "-"}</td>
                  <td>{r.check_out_time || "-"}</td>
                  <td>{r.temperature_c ?? "-"}</td>
                  <td>{r.method || "-"}</td>
                  <td>{r.status || "-"}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No records for this date{klass ? ` and class (${klass})` : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {attErr && (
        <p className="mt-3 text-red-600 text-sm">Error: {attErr.message}</p>
      )}
    </main>
  );
}
