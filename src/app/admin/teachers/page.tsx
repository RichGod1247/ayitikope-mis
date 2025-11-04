// src/app/admin/teachers/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import TeacherQuickAddForm from "@/components/TeacherQuickAddForm";
import TeacherDeleteButton from "@/components/TeacherDeleteButton";

export const metadata = { title: "Admin • Teachers" };
export const dynamic = "force-dynamic";

type Teacher = {
  teacher_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  whatsapp_number: string | null;
  staff_id: string | null;
};

export default async function AdminTeachersPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="container mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Teachers (Admin)</h1>
        <p className="mt-2 text-gray-700">Locked in production until auth is enabled.</p>
      </main>
    );
  }

  const { data, error } = await supabaseAdmin
    .from("teachers")
    .select("*")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const rows = (data ?? []) as Teacher[];

  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold">Teachers</h1>
      {error && <p className="mt-2 text-sm text-red-600">Error: {error.message}</p>}

      {/* Quick Add */}
      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-blue-800">Add a Teacher</h2>
        <TeacherQuickAddForm />
      </section>

      {/* List */}
      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Role</th>
              <th>WhatsApp</th>
              <th>Staff ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t) => (
              <tr key={t.teacher_id} className="[&>td]:px-3 [&>td]:py-2">
                <td className="font-medium">
                  {[t.last_name, t.first_name].filter(Boolean).join(", ") || t.teacher_id}
                </td>
                <td>{t.phone || "-"}</td>
                <td>{t.email || "-"}</td>
                <td>{t.role || "-"}</td>
                <td>{t.whatsapp_number || "-"}</td>
                <td>{t.staff_id || "-"}</td>
                <td>
                  <TeacherDeleteButton teacher_id={t.teacher_id} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No teachers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
