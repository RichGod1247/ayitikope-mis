"use client";

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

export default function CSVButton({
  rows,
  studentsMap,
  date,
  klass,
}: {
  rows: AttendanceRow[];
  studentsMap: Record<string, { name: string }>;
  date: string;
  klass: string;
}) {
  function downloadCSV() {
    const header = [
      "attendance_id",
      "date",
      "class_code",
      "student_id",
      "student_name",
      "check_in_time",
      "check_out_time",
      "temperature_c",
      "method",
      "status",
    ];
    const lines = [header.join(",")];

    for (const r of rows) {
      const nm = r.student_id ? (studentsMap[r.student_id]?.name || "") : "";
      const vals = [
        r.attendance_id,
        r.date ?? date,
        r.class_code ?? klass,
        r.student_id ?? "",
        nm,
        r.check_in_time ?? "",
        r.check_out_time ?? "",
        (r.temperature_c ?? "").toString(),
        r.method ?? "",
        r.status ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(vals.join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${date}${klass ? "_" + klass : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={downloadCSV}
      className="rounded-lg border bg-white px-3 py-1 text-sm font-medium hover:bg-gray-50"
    >
      Download CSV
    </button>
  );
}
