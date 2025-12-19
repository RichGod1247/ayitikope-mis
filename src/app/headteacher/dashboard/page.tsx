// src/app/headteacher/dashboard/page.tsx
"use client";

import HeadteacherPortalClient from "@/components/HeadteacherPortalClient";

type PageProps = {
  searchParams: {
    tenantId?: string;
    headUserId?: string;
  };
};

/**
 * Classic Headteacher Dashboard
 *
 * For now, this reuses the calm Headteacher Portal client with the
 * weekly attendance pulse + assessment overview, but routes here
 * as the "classic" view so we can later expand it with more
 * data-heavy widgets if needed.
 */
export default function HeadteacherDashboardPage({ searchParams }: PageProps) {
  const tenantId =
    searchParams.tenantId ?? "cmhhnghn00008vcpgp3fl07fl"; // demo tenant fallback
  const headUserId = searchParams.headUserId || "";

  if (!headUserId) {
    // No headteacher identity in the URL → friendly message
    return (
      <main className="min-h-screen bg-zinc-50">
        <div className="max-w-4xl mx-auto px-4 py-10 space-y-4">
          <h1 className="text-2xl font-bold tracking-tight text-blue-900">
            Headteacher Dashboard
          </h1>
          <p className="text-sm text-gray-700">
            This is the classic Headteacher Dashboard view inside{" "}
            <span className="font-semibold">EduLife OS</span>. It shows weekly
            attendance pulse, assessment overview and (later) lesson note
            supervision and fees/SMS modules.
          </p>

          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
            <p className="font-semibold">
              How to open this dashboard in demo mode
            </p>
            <ol className="list-decimal ml-5 space-y-1 text-xs md:text-sm">
              <li>
                Append{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px] font-mono">
                  ?headUserId=&lt;some-id&gt;
                </code>{" "}
                to this URL (for example, the same <code>headUserId</code> you
                use on the Headteacher Portal).
              </li>
              <li>
                Optionally, you can also pass{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px] font-mono">
                  &tenantId=&lt;school-id&gt;
                </code>{" "}
                to point it at a specific school/tenant.
              </li>
            </ol>
          </div>

          <p className="text-xs text-gray-500">
            Example:{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">
              /headteacher/dashboard?tenantId=cmhhnghn00008vcpgp3fl07fl&headUserId=head-demo-user-1
            </code>
          </p>
        </div>
      </main>
    );
  }

  // If we have a headUserId → render the full portal-style dashboard
  return (
    <HeadteacherPortalClient tenantId={tenantId} headUserId={headUserId} />
  );
}
