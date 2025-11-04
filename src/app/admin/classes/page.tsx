// src/app/admin/classes/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ClassQuickAdd from "@/components/ClassQuickAdd";
import TeacherSelect from "@/components/TeacherSelect";

export const metadata = { title: "Admin • Classes" };
export const dynamic = "force-dynamic";

type ClassRow = {
  class_code: string;
  class_name: string | null;
  level: string | null;
  teacher_id: string | null;
  academic_year: string | null;
  term: string | null;
};

type TeacherRow = {
  teacher_id: string;
  first_name: string | null;
  last_name: string | null;
};

export default async function AdminClassesPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="container mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Classes (Admin)</h1>
        <p className="mt-2 text-gray-700">
          Locked in production until auth is enabled.
        </p>
      </main>
    );
  }

  // 1) Fetch classes
  const { data: clsData, error: clsErr } = await supabaseAdmin
    .from("classes")
    .select("class_code,class_name,level,teacher_id,academic_year,term")
    .order("level", { ascending: true })
    .order("class_name", { ascending: true });

  const classes = (clsData ?? []) as ClassRow[];

  // 2) Fetch all teachers for dropdown
  const { data: teacherRows } = await supabaseAdmin
    .from("teachers")
    .select("teacher_id, first_name, last_name")
    .order("last_name", { ascending: true });

  const teachers = (teacherRows ?? []) as TeacherRow[];

  // 3) Map teacher_id -> display name (for badge text)
  const teacherName = (tId: string | null) => {
    if (!tId) return "";
    const t = teachers.find(x => x.teacher_id === tId);
    const n = [t?.first_name, t?.last_name].filter(Boolean).join(" ").trim();
    return n || tId;
  };

  return (
    <main className="container mx-auto px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Classes</h1>
        <span className="inline-flex items-center rounded-md border bg-white px-3 py-1 text-sm">
          Total: <strong className="ml-1">{classes.length}</strong>
        </span>
      </header>

      {/* Quick Add form */}
      <div className="mt-4">
        <ClassQuickAdd />
      </div>

      {clsErr && (
        <p className="mt-3 text-sm text-red-600">Error: {clsErr.message}</p>
      )}

      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
              <th>Class Code</th>
              <th>Class Name</th>
              <th>Level</th>
              <th>Teacher</th>
              <th>Academic Year</th>
              <th>Term</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {classes.map((c) => (
              <tr key={c.class_code} className="[&>td]:px-3 [&>td]:py-2 align-middle">
                <td className="font-mono text-xs">{c.class_code}</td>
                <td className="font-medium">{c.class_name || "-"}</td>
                <td>{c.level || "-"}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <TeacherSelect
                      classCode={c.class_code}
                      current={c.teacher_id}
                      teachers={teachers}
                    />
                    <span className="text-xs text-gray-600">
                      {c.teacher_id ? `(${teacherName(c.teacher_id)})` : ""}
                    </span>
                  </div>
                </td>
                <td>{c.academic_year || "-"}</td>
                <td>{c.term || "-"}</td>
              </tr>
            ))}
            {!classes.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No classes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
