// src/app/admin/notifications/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const metadata = { title: "Admin • Notifications Queue" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  // lock in production (we'll add real auth later)
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="container mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold">Notifications (Dev)</h1>
        <p className="mt-2 text-gray-700">
          Hidden in production. We’ll secure with proper auth next.
        </p>
      </main>
    );
  }

  const { data, error } = await supabaseAdmin
    .from("notifications_log")
    .select("date_time, channel, template_key, recipient, status, meta")
    .order("date_time", { ascending: false })
    .limit(100);

  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold">Notifications Queue (Dev)</h1>
      {error && (
        <p className="mt-3 text-red-600 text-sm">Error: {error.message}</p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-[920px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
              <th>Time</th>
              <th>Channel</th>
              <th>Template</th>
              <th>Recipient</th>
              <th>Status</th>
              <th>Meta</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.map((r, i) => (
              <tr key={i} className="[&>td]:px-3 [&>td]:py-2 align-top">
                <td>
                  {r.date_time
                    ? new Date(r.date_time as any).toLocaleString()
                    : "-"}
                </td>
                <td>{r.channel || "-"}</td>
                <td>{r.template_key || "-"}</td>
                <td className="font-mono">{r.recipient || "-"}</td>
                <td>
                  <span
                    className={[
                      "rounded-md px-2 py-0.5",
                      r.status === "queued" && "bg-yellow-100 text-yellow-800",
                      r.status === "sent" && "bg-green-100 text-green-800",
                      r.status === "failed" && "bg-red-100 text-red-700",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {r.status || "-"}
                  </span>
                </td>
                <td>
                  <pre className="max-w-[420px] whitespace-pre-wrap break-words text-xs bg-gray-50 rounded p-2">
                    {r.meta ? JSON.stringify(r.meta, null, 2) : "-"}
                  </pre>
                </td>
              </tr>
            ))}

            {!data?.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No notifications yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
