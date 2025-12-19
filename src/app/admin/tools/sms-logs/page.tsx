// src/app/admin/tools/sms-logs/page.tsx

import { prisma } from "@/lib/prisma";

type SmsLogRow = {
  id: number;
  createdAt: string;
  to: string;
  from: string;
  brand: string;
  body: string;
  status: number | null;
  statusDescription: string | null;
  messageId: string | null;
  rate: number | null;
  purpose: string | null;
  testMode: boolean;
};

export default async function SmsLogsPage() {
  // Use `any` to avoid TS complaining about `smsLog` on PrismaClient
  const rawLogs = (await (prisma as any).smsLog.findMany({
    orderBy: { id: "desc" },
    take: 100,
  })) as any[];

  const logs: SmsLogRow[] = rawLogs.map((log: any) => {
    const meta = log.meta ?? log.providerMeta ?? log.providerRaw?.meta ?? null;

    const purpose: string | null =
      meta?.purpose ??
      meta?.Purpose ??
      meta?.smsPurpose ??
      meta?.reason ??
      null;

    const testMode: boolean = !!(
      meta?.testMode ??
      meta?.smsTestMode ??
      meta?.mode === "test"
    );

    return {
      id: log.id,
      createdAt: log.createdAt
        ? new Date(log.createdAt).toLocaleString()
        : "",
      to: log.to ?? "",
      from: log.from ?? "",
      brand: log.brand ?? "",
      body: log.body ?? "",
      status: typeof log.status === "number" ? log.status : null,
      statusDescription: log.statusDescription ?? null,
      messageId: log.messageId ?? null,
      rate:
        typeof log.rate === "number"
          ? log.rate
          : typeof log.rate === "string"
          ? Number(log.rate)
          : null,
      purpose,
      testMode,
    };
  });

  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-5xl bg-white shadow-md rounded-xl p-6 border border-slate-200">
        <h1 className="text-2xl font-bold mb-2">
          EduLife OS – SMS Logs & Audit
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Last 100 SMS messages sent by EduLife OS. Use this view to verify
          broadcasts, attendance alerts, fees reminders, and test messages. You
          can also <strong>resend</strong> failed messages directly from here.
        </p>

        <div className="mb-4 text-xs text-slate-600">
          <p>
            <span className="font-semibold">Tip:</span>{" "}
            <span>
              Look at <code>Purpose</code> to distinguish between{" "}
              <code>admin-broadcast</code>,{" "}
              <code>attendance-alert-demo</code>,{" "}
              <code>fees-reminder-demo</code>,{" "}
              <code>resend-from-log</code>, and test flows.
            </span>
          </p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  #
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Time
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Brand
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  To
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Purpose
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Rate
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Test?
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Snippet
                </th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    No SMS logs found yet.
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-600">
                      {log.id ?? idx + 1}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {log.createdAt || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {log.brand || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <code>{log.to || "—"}</code>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {log.purpose ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          {log.purpose}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {log.status === null ? (
                        <span className="text-[10px] text-slate-400">—</span>
                      ) : log.status === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                          {log.status}{" "}
                          {log.statusDescription
                            ? `(${log.statusDescription})`
                            : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {log.rate !== null ? `GHS ${log.rate.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {log.testMode ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          TEST
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Live</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-xs">
                      <span className="line-clamp-2">
                        {log.body || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {log.status === 0 ? (
                        <span className="text-[10px] text-slate-400">—</span>
                      ) : log.to && log.body ? (
                        <a
                          href={`/api/admin/sms/resend/${log.id}`}
                          className="inline-flex items-center rounded-full bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-semibold px-2 py-0.5"
                          title="Resend this SMS using the same content and destination"
                        >
                          Resend
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          N/A
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          <p>
            This view is intentionally read-only except for the{" "}
            <strong>Resend</strong> action on failed messages. If something
            looks wrong, you can drill down from the message purpose to the
            page or tool that triggered it (broadcast console, attendance demo,
            fees demo, etc.).
          </p>
        </div>
      </div>
    </main>
  );
}
