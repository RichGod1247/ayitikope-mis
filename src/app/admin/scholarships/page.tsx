// src/app/admin/scholarships/page.tsx
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import ScholarshipActions from "@/components/ScholarshipActions";
import { ScholarshipApplicationStatus } from "@prisma/client";

export const metadata = { title: "Admin • Scholarships" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ScholarshipApplicationStatus, string> = {
  PENDING: "bg-yellow-50 text-yellow-800 border-yellow-300",
  REVIEWED: "bg-blue-50 text-blue-800 border-blue-300",
  APPROVED: "bg-green-50 text-green-800 border-green-300",
  REJECTED: "bg-red-50 text-red-800 border-red-300",
};

function fmt(d: Date | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminScholarshipsPage() {
  const ctx = await requireServerUserContext({
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  const applications = await prisma.scholarshipApplication.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { submittedAt: "desc" },
    take: 200,
    select: {
      id: true,
      studentName: true,
      level: true,
      scholarshipType: true,
      guardianPhone: true,
      needStatement: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
    },
  });

  return (
    <main className="container mx-auto px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scholarship Applications</h1>
          <p className="mt-1 text-sm text-gray-500">
            {applications.length} application{applications.length !== 1 ? "s" : ""} on record
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:font-semibold [&>th]:text-gray-700">
              <th>Student</th>
              <th>Level</th>
              <th>Type</th>
              <th>Guardian Phone</th>
              <th>Need Statement</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {applications.map((a) => (
              <tr key={a.id} className="[&>td]:px-3 [&>td]:py-2.5 align-top hover:bg-gray-50">
                <td className="font-medium text-gray-900">{a.studentName}</td>
                <td className="text-gray-700">{a.level}</td>
                <td className="text-gray-700">{a.scholarshipType}</td>
                <td className="text-gray-700">{a.guardianPhone}</td>
                <td className="max-w-[320px] text-gray-600 truncate" title={a.needStatement ?? undefined}>
                  {a.needStatement || "-"}
                </td>
                <td>
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                    {a.status}
                  </span>
                </td>
                <td className="text-gray-600 whitespace-nowrap">{fmt(a.submittedAt)}</td>
                <td>
                  <ScholarshipActions id={a.id} current={a.status} />
                </td>
              </tr>
            ))}

            {applications.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-500">
                  No scholarship applications yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
