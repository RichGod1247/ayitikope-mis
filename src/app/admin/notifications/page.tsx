// src/app/admin/notifications/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const metadata = { title: "Admin • Notifications Queue" };
export const dynamic = "force-dynamic";

type Status = "queued" | "sent" | "failed" | "all";
type SP = Record<string, string | string[] | undefined>;

function toStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  // In Next 15+, searchParams is a Promise in server components
  searchParams: Promise<SP>;
}) {
  // Hide in production until we wire auth
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

  const sp = await searchParams; // ✅ await the params
  const q = toStr(sp.q).trim();
  const status = (toStr(sp.status) as Status) || "all";

  // Build query
  let query = supabaseAdmin
    .from("notifications_log")
    .select("date_time, channel, template_key, recipient, status, meta")
    .order("date_time", { ascending: false })
    .limit(100);

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (q) {
    // Match on recipient or template_key (broad + fast)
    query = query.or(`recipient.ilike.%${q}%,template_key.ilike.%${q}%`);
  }

  const { data, error } = await query;

  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold">Notifications Queue (Dev)</h1>
      {error && <p className="mt-3 text-red-600 text-sm">Error: {error.message}</p>}

      {/* Filters */}
      <form method="get" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="q" className="text-sm text-gray-700">Search</label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="recipient (024...), template key…"
            className="rounded-md border px-3 py-1.5 outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="status" className="text-sm text-gray-700">Status</label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="rounded-md border px-3 py-1.5 outline-none bg-white focus:border-blue-600"
          >
            <option value="all">All</option>
            <option value="queued">Queued</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <button type="submit" className="rounded-md bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-800">
          Apply
        </button>

        <a href="/admin/notifications" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
          Reset
        </a>
      </form>

      {/* Table */}
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
                <td>{r.date_time ? new Date(r.date_time as any).toLocaleString() : "-"}</td>
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
                    ].filter(Boolean).join(" ")}
                  >
                    {r.status || "-"}
                  </span>
                </td>
                <td>
                  <pre className="max-w-[420px] whitespace-pre-wrap wrap-break-word text-xs bg-gray-50 rounded p-2">
                    {r.meta ? JSON.stringify(r.meta, null, 2) : "-"}
                  </pre>
                </td>
              </tr>
            ))}

            {!data?.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No notifications found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
