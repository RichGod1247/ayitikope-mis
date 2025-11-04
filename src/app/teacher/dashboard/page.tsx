// src/app/teacher/dashboard/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import TeacherDashboardClient from "@/components/TeacherDashboardClient";

export const metadata = { title: "Teacher Dashboard" };
export const dynamic = "force-dynamic";

type SP = { teacher_id?: string };

type TeacherRow = {
  teacher_id: string;
  first_name: string | null;
  last_name: string | null;
};

type HomeroomRow = {
  class_code: string;
  class_name: string | null;
  level: "KG" | "Primary" | "JHS" | null;
};

type AssignRow = {
  assignment_id: string;
  class_code: string | null;
  subject: string | null;
  academic_year: string | null;
  term: string | null;
};

type AssessRowToday = {
  record_id?: string;
  class_code: string | null;
  subject: string | null;
  created_at?: string | null;
  student_id?: string | null;
  score?: number | null;
  assessment_type?: string | null;
};

type ClassCountRow = {
  class_code: string | null;
  student_count: number | null;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function weekStartISO() {
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // make Monday=0
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default async function TeacherDashboard({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const teacher_id = (sp.teacher_id || "").trim();

  if (!teacher_id) {
    return (
      <main className="container mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
        <p className="mt-2 text-gray-700">
          For now (demo), append{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">
            ?teacher_id=&lt;uuid&gt;
          </code>{" "}
          to this URL to view a specific teacher’s dashboard.
        </p>
      </main>
    );
  }

  // --- Teacher basic info ---
  let teacher: TeacherRow | null = null;
  {
    const { data } = await supabaseAdmin
      .from("teachers")
      .select("teacher_id, first_name, last_name")
      .eq("teacher_id", teacher_id)
      .maybeSingle();
    teacher = (data as TeacherRow | null) ?? null;
  }

  // --- Homeroom class (if any) ---
  let homeroom: HomeroomRow | null = null;
  {
    const { data } = await supabaseAdmin
      .from("classes")
      .select("class_code, class_name, level")
      .eq("teacher_id", teacher_id)
      .maybeSingle();
    homeroom = (data as HomeroomRow | null) ?? null;
  }

  // --- Subject-teaching assignments ---
  const { data: assigns } = await supabaseAdmin
    .from("teaching_assignments")
    .select("assignment_id, class_code, subject, academic_year, term")
    .eq("teacher_id", teacher_id)
    .order("subject", { ascending: true })
    .order("class_code", { ascending: true });

  const assignList: AssignRow[] = (assigns ?? []) as AssignRow[];

  // --- Class student counts (from v_class_student_counts view)
  const { data: countsRows } = await supabaseAdmin
    .from("v_class_student_counts")
    .select("class_code, student_count");
  const classCountsMap = new Map<string, number>();
  ((countsRows ?? []) as ClassCountRow[]).forEach((r) => {
    if (r.class_code) classCountsMap.set(r.class_code, r.student_count ?? 0);
  });

  // --- TODAY counters & latest timestamps ---
  const today = todayISO();

  // Today rows (to make "recent today" and homeroom counts)
  const { data: todayAssess } = await supabaseAdmin
    .from("assessments")
    .select("record_id, class_code, subject, created_at, student_id, score, assessment_type")
    .eq("date", today);

  const todayRows: AssessRowToday[] = (todayAssess ?? []) as AssessRowToday[];

  // Build map: { "CLASS__SUBJECT" -> count today }
  const byKeyToday = new Map<string, number>();
  for (const r of todayRows) {
    const key = `${r.class_code ?? ""}__${r.subject ?? ""}`;
    byKeyToday.set(key, (byKeyToday.get(key) || 0) + 1);
  }

  // Latest submission per assignment (uses created_at)
  const { data: latestRows } = await supabaseAdmin
    .from("assessments")
    .select("class_code, subject, created_at")
    .order("created_at", { ascending: false })
    .limit(2000); // generous cap for dev
  const latestMap = new Map<string, string>(); // ISO string
  ((latestRows ?? []) as AssessRowToday[]).forEach((r) => {
    const key = `${r.class_code ?? ""}__${r.subject ?? ""}`;
    if (!latestMap.has(key) && r.created_at) {
      latestMap.set(key, r.created_at);
    }
  });

  const assignmentsWithCounts = assignList.map((a) => {
    const key = `${a.class_code ?? ""}__${a.subject ?? ""}`;
    return {
      assignment_id: a.assignment_id,
      class_code: a.class_code ?? "",
      subject: a.subject ?? "",
      academic_year: a.academic_year,
      term: a.term,
      todayCount: byKeyToday.get(key) || 0,
      latestISO: latestMap.get(key) || null,
      classSize: a.class_code ? classCountsMap.get(a.class_code) ?? null : null,
    };
  });

  // Homeroom today count = all assessments for that class (any subject) today
  let homeroomTodayCount = 0;
  const homeroomCode = homeroom?.class_code ?? null;
  if (homeroomCode) {
    for (const r of todayRows) {
      if ((r.class_code ?? "") === homeroomCode) homeroomTodayCount += 1;
    }
  }

  // My recent entries today (restrict to classes this teacher handles)
  const myClassCodes = new Set<string>();
  if (homeroomCode) myClassCodes.add(homeroomCode);
  for (const a of assignmentsWithCounts) {
    if (a.class_code) myClassCodes.add(a.class_code);
  }
  const recentToday = todayRows
    .filter((r) => (r.class_code ? myClassCodes.has(r.class_code) : false))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 12);

  // Alerts: no entries this week for an assignment
  const weekStart = weekStartISO();
  const { data: weekRows } = await supabaseAdmin
    .from("assessments")
    .select("class_code, subject, date")
    .gte("date", weekStart)
    .lte("date", today);
  const weekSet = new Set<string>();
  ((weekRows ?? []) as { class_code: string | null; subject: string | null }[]).forEach((r) => {
    const key = `${r.class_code ?? ""}__${r.subject ?? ""}`;
    weekSet.add(key);
  });
  const alerts: string[] = [];
  assignmentsWithCounts.forEach((a) => {
    const key = `${a.class_code}__${a.subject}`;
    if (!weekSet.has(key)) {
      alerts.push(`No entries this week • ${a.class_code} • ${a.subject}`);
    }
  });

  const todayTotal =
    homeroomTodayCount +
    assignmentsWithCounts.reduce((sum, a) => sum + (a.todayCount || 0), 0);

  return (
    <main className="container mx-auto px-6 py-10">
      <TeacherDashboardClient
        teacher={teacher}
        homeroom={homeroom}
        assignments={assignmentsWithCounts}
        todayMeta={{
          date: today,
          total: todayTotal,
          homeroomCount: homeroomTodayCount,
        }}
        classCounts={Object.fromEntries(classCountsMap)}
        latestMap={Object.fromEntries(latestMap)}
        recentToday={recentToday.map((r) => ({
          record_id: r.record_id || "",
          class_code: r.class_code || "",
          subject: r.subject || "",
          created_at: r.created_at || null,
          student_id: r.student_id || null,
          score: r.score ?? null,
          assessment_type: r.assessment_type || null,
        }))}
        alerts={alerts}
      />
    </main>
  );
}
