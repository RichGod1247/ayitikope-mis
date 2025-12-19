// src/app/admin/tools/sms-attendance-demo/page.tsx

"use client";

import { useState, useMemo } from "react";

type Mode = "demo";

type ApiResult = {
  ok: boolean;
  mode?: Mode;
  brand?: string;
  className?: string;
  date?: string;
  count?: number;
  successCount?: number;
  results?: {
    student: string;
    to: string;
    ok: boolean;
    error?: string;
  }[];
  error?: string;
};

type ParsedStudent = {
  name: string;
  guardianPhone: string;
};

function parseStudents(input: string): ParsedStudent[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // Format: Name - Phone
      const [namePart, phonePart] = line.split("-").map((p) => p.trim());
      return {
        name: namePart ?? "",
        guardianPhone: phonePart ?? "",
      };
    })
    .filter((s) => s.name.length > 0 && s.guardianPhone.length > 0);
}

export default function SmsAttendanceDemoPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [className, setClassName] = useState("JHS 1");
  const [brand, setBrand] = useState<string>("AYITIADMIN");
  const [rawStudents, setRawStudents] = useState(
    [
      "Demo Student 1 - 0242914353",
      "Demo Student 2 - 0242914353",
      "Demo Student 3 - 0242914353",
    ].join("\n")
  );

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  const parsedStudents = useMemo(
    () => parseStudents(rawStudents),
    [rawStudents]
  );

  const previewMessage =
    parsedStudents.length > 0
      ? `[EduLife OS] Attendance alert: ${
          parsedStudents[0].name
        } was ABSENT today in ${className} on ${date}. If this is unexpected, kindly contact Ayitikope M/A Basic School.`
      : "[Preview] Attendance alert: <student name> was ABSENT today...";

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/sms/attendance-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          className,
          brand,
          students: parsedStudents,
          mode: "demo",
        }),
      });

      const data = (await res.json()) as ApiResult;
      setResult(data);
    } catch (err: any) {
      setResult({
        ok: false,
        error: err?.message ?? "Unexpected error sending attendance alerts.",
      });
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || parsedStudents.length === 0;

  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-3xl bg-white shadow-md rounded-xl p-6 border border-slate-200">
        <h1 className="text-2xl font-bold mb-2">
          EduLife OS – Attendance SMS Demo
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Prototype tool for sending <strong>attendance alerts</strong> to
          parents/guardians. In this demo version, you manually specify
          student names and phone numbers. Later, this will plug directly
          into the attendance records.
        </p>

        <form onSubmit={handleSend} className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Date
              </label>
              <input
                type="date"
                className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Class / Form
              </label>
              <input
                type="text"
                className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="e.g. JHS 1"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Brand / Sender
              </label>
              <select
                className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="AYITIADMIN">AyitiAdmin (Admin)</option>
                <option value="AYITIKOPJHS">AyitikopJHS (JHS)</option>
                <option value="AYITIKPRIM">AyitikPRIM (Primary)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Students (one per line, format: Name - Phone)
            </label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[110px]"
              value={rawStudents}
              onChange={(e) => setRawStudents(e.target.value)}
              placeholder={"John Doe - 024XXXXXXX\nJane Doe - 024YYYYYYY"}
            />
            <p className="mt-1 text-xs text-slate-500">
              Example:{" "}
              <code className="bg-slate-100 px-1 py-0.5 rounded">
                John Doe - 0241234567
              </code>
              . Each line will send an alert to that guardian phone.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Message Preview
            </label>
            <div className="border border-slate-200 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-800">
              {previewMessage}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              This is the template that will be sent for each student, with
              their name inserted.
            </p>
          </div>

          <button
            type="submit"
            disabled={disabled}
            className={`inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm ${
              disabled
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {loading ? "Sending..." : "Send Attendance Alerts (Demo)"}
          </button>
        </form>

        {result && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">
              Result
            </h2>

            {!result.ok ? (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
                Error: {result.error ?? "Unknown error"}
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                Attendance alerts sent with{" "}
                <strong>
                  brand = {result.brand} • class = {result.className} • date ={" "}
                  {result.date}
                </strong>
                . Success:{" "}
                <strong>
                  {result.successCount}/{result.count}
                </strong>
              </div>
            )}

            {result.results && result.results.length > 0 && (
              <div className="mt-4 max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">
                        Student
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">
                        To
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr
                        key={i}
                        className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
                      >
                        <td className="px-3 py-2 text-slate-700">
                          {r.student}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          <code>{r.to || "—"}</code>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {r.ok ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                              OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              Failed
                            </span>
                          )}
                          {r.error && (
                            <div className="mt-0.5 text-[10px] text-slate-500">
                              {r.error}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 text-xs text-slate-500">
          <p>
            All these messages are also logged into <code>SmsLog</code> and
            visible at <code>/admin/tools/sms-logs</code>. When we connect
            this to the real attendance system, this page can evolve into a
            “review & send” console instead of manual entry.
          </p>
        </div>
      </div>
    </main>
  );
}
