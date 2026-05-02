// src/app/admin/fees/audit/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Financial Audit Trail | Admin | EduLife OS",
};

type SearchParams = Promise<{
  action?: string;
  resource?: string;
  q?: string;
}>;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function clean(value?: string | null) {
  return String(value ?? "").trim();
}

function prettyAction(action: string) {
  return action.replaceAll("_", " ");
}

function metadataPreview(metadata: unknown) {
  if (!metadata) return "—";

  try {
    const text = JSON.stringify(metadata, null, 2);
    return text.length > 700 ? `${text.slice(0, 700)}…` : text;
  } catch {
    return "Unreadable metadata";
  }
}

function badgeClass(action: string) {
  if (action.includes("REPAIRED")) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (action.includes("FAILED") || action.includes("ERROR")) {
    return "border-red-300 bg-red-50 text-red-800";
  }

  if (action.includes("EXCEPTION") || action.includes("RECONCILIATION")) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  if (action.includes("PAYMENT") || action.includes("RECEIPT") || action.includes("LEDGER")) {
    return "border-blue-300 bg-blue-50 text-blue-800";
  }

  return "border-zinc-300 bg-zinc-50 text-zinc-700";
}

export default async function AdminFeesAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requireServerUserContext({
  requireTenant: true,
  requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
});

if (!auth.tenantId) {
  redirect("/login");
}

const params = await searchParams;
const tenantId = auth.tenantId;

  const action = clean(params.action);
  const resource = clean(params.resource);
  const q = clean(params.q);

  const where = {
    tenantId,
    ...(action ? { action } : {}),
    ...(resource ? { resource } : {}),
    ...(q
      ? {
          OR: [
            { action: { contains: q, mode: "insensitive" as const } },
            { resource: { contains: q, mode: "insensitive" as const } },
            { resourceId: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [logs, actions, resources, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        metadata: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.auditLog.findMany({
      where: { tenantId },
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
      take: 100,
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        resource: { not: null },
      },
      select: { resource: true },
      distinct: ["resource"],
      orderBy: { resource: "asc" },
      take: 100,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            EduLife OS · Finance Governance
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
            Financial Audit Trail
          </h1>
          <p className="max-w-3xl text-sm text-zinc-600">
            Read-only evidence trail for finance actions, reconciliation decisions, receipt
            repairs, disputes, and governance events.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Search</label>
              <input
                name="q"
                defaultValue={q}
                placeholder="Action, resource, or ID"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Action</label>
              <select
                name="action"
                defaultValue={action}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="">All actions</option>
                {actions.map((item) => (
                  <option key={item.action} value={item.action}>
                    {prettyAction(item.action)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Resource</label>
              <select
                name="resource"
                defaultValue={resource}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="">All resources</option>
                {resources
                  .filter((item) => item.resource)
                  .map((item) => (
                    <option key={item.resource ?? ""} value={item.resource ?? ""}>
                      {item.resource}
                    </option>
                  ))}
              </select>
            </div>

            <button
              type="submit"
              className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black"
            >
              Filter
            </button>
          </form>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Matching events</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">{totalCount}</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Displayed</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">{logs.length}</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Mode</p>
            <p className="mt-1 text-xl font-bold text-emerald-700">Read-only</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-950">Latest audit events</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Showing latest 100 matching records. AuditLog is tenant-scoped by `tenantId`.
            </p>
          </div>

          {logs.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">No audit records found.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {logs.map((log) => {
                const actor =
                  [log.user?.firstName, log.user?.lastName].filter(Boolean).join(" ").trim() ||
                  log.user?.name ||
                  log.user?.email ||
                  "System";

                return (
                  <article key={log.id} className="grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
                    <div className="space-y-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${badgeClass(
                          log.action
                        )}`}
                      >
                        {prettyAction(log.action)}
                      </span>

                      <div className="text-xs text-zinc-500">
                        <p>{formatDate(log.createdAt)}</p>
                        <p className="mt-1">
                          Actor: <span className="font-semibold text-zinc-800">{actor}</span>
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid gap-2 text-xs md:grid-cols-2">
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="text-zinc-500">Resource</p>
                          <p className="mt-1 font-semibold text-zinc-900">
                            {log.resource ?? "—"}
                          </p>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <p className="text-zinc-500">Resource ID</p>
                          <p className="mt-1 break-all font-mono text-[11px] text-zinc-900">
                            {log.resourceId ?? "—"}
                          </p>
                        </div>
                      </div>

                      <details className="rounded-xl border border-zinc-200 bg-zinc-950 p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-zinc-100">
                          Metadata
                        </summary>
                        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-zinc-200">
                          {metadataPreview(log.metadata)}
                        </pre>
                      </details>

                      {(log.ip || log.userAgent) && (
                        <details className="rounded-xl border border-zinc-200 bg-white p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                            Request context
                          </summary>
                          <div className="mt-2 space-y-1 text-xs text-zinc-500">
                            <p>IP: {log.ip ?? "—"}</p>
                            <p className="break-all">User agent: {log.userAgent ?? "—"}</p>
                          </div>
                        </details>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}