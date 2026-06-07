// src/app/pending/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asObj(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as any) : {};
}

function parseDateMaybe(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function getRejectInfo(settings: any) {
  const rejectedAt = parseDateMaybe(settings?.bootstrapRejectedAt);
  const reasonRaw = settings?.bootstrapRejectReason;
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";

  return {
    isRejected: Boolean(rejectedAt),
    rejectedAt,
    reason: reason || null,
  };
}

function schoolSectorLabel(sector: string | null | undefined) {
  return sector === "PRIVATE" ? "Private School" : "Public School";
}

function officialIdentifierLabel(sector: string | null | undefined) {
  return sector === "PRIVATE"
    ? "EMIS / NaSIA / registration code"
    : "EMIS code";
}

export default async function PendingPage() {
  const ctx = await getServerUserContextOrNull({ requireTenant: false });

  if (!ctx?.userId) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl space-y-4 p-6">
          <h1 className="text-xl font-semibold text-slate-900">
            School Verification
          </h1>
          <p className="text-sm text-slate-700">
            If your school was just enrolled, it may be pending verification
            before it can be used.
          </p>
          <Link
            href="/auth/signin"
            className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const mem = await prisma.membership.findFirst({
    where: {
      userId: ctx.userId,
      status: "ACTIVE",
      role: { name: "SCHOOL_ADMIN" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
          status: true,
          createdAt: true,
          schoolSector: true,
          emisCode: true,
          settingsJson: true,
          contactEmail: true,
          contactPhoneNorm: true,
        },
      },
    },
  });

  if (!mem?.tenant) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl space-y-3 p-6">
          <h1 className="text-xl font-semibold text-slate-900">
            No school found
          </h1>
          <p className="text-sm text-slate-700">
            Your account is not linked to a school admin membership.
          </p>
        </div>
      </main>
    );
  }

  const tenant = mem.tenant;

  if (tenant.status === "ACTIVE") {
    redirect("/admin/dashboard");
  }

  const settings = asObj(tenant.settingsJson);
  const reject = getRejectInfo(settings);

  if (reject.isRejected) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl space-y-4 p-6">
          <h1 className="text-xl font-semibold text-slate-900">
            Enrollment Rejected
          </h1>

          <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <div className="text-sm text-rose-900">
              School: <span className="font-semibold">{tenant.name}</span>{" "}
              <span className="text-rose-700">({tenant.schoolCode})</span>
            </div>

            <div className="text-sm text-rose-900">
              Sector:{" "}
              <span className="font-semibold">
                {schoolSectorLabel(tenant.schoolSector)}
              </span>
            </div>

            <div className="text-sm text-rose-900">
              {officialIdentifierLabel(tenant.schoolSector)}:{" "}
              <span className="font-mono font-semibold">
                {tenant.emisCode || "—"}
              </span>
            </div>

            <div className="text-sm text-rose-900">
              Reason:{" "}
              <span className="font-medium">
                {reject.reason ?? "Not provided."}
              </span>
            </div>

            <div className="text-xs text-rose-800">
              {reject.rejectedAt
                ? `Rejected at: ${reject.rejectedAt.toLocaleString()}`
                : null}
            </div>

            <div className="pt-2 text-sm text-rose-900">
              Contact EduLife OS support or your platform administrator to
              resolve this and re-apply.
            </div>

            <div className="text-xs text-rose-800">
              Contact: {tenant.contactEmail || "—"} •{" "}
              {tenant.contactPhoneNorm || "—"}
            </div>

            <div className="flex items-center gap-3 pt-3">
              <Link href="/auth/signin" className="text-sm text-rose-900 underline">
                Sign in again
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Pending Verification
        </h1>

        <div className="space-y-3 rounded-2xl border bg-white p-5">
          <div className="text-sm text-slate-700">
            School: <span className="font-semibold">{tenant.name}</span>{" "}
            <span className="text-slate-500">({tenant.schoolCode})</span>
          </div>

          <div className="text-sm text-slate-700">
            Status: <span className="font-semibold">PENDING</span>
          </div>

          <div className="text-sm text-slate-700">
            Sector:{" "}
            <span className="font-semibold">
              {schoolSectorLabel(tenant.schoolSector)}
            </span>
          </div>

          <div className="text-sm text-slate-700">
            {officialIdentifierLabel(tenant.schoolSector)}:{" "}
            <span className="font-mono font-semibold">
              {tenant.emisCode || "—"}
            </span>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Your school is awaiting superadmin approval. It will not activate
            automatically. You will receive SMS/email notification after approval.
          </div>

          <div className="pt-2 text-sm text-slate-700">
            If you need faster access, contact EduLife OS support or your
            platform administrator.
          </div>

          <div className="text-xs text-slate-500">
            Contact: {tenant.contactEmail || "—"} •{" "}
            {tenant.contactPhoneNorm || "—"}
          </div>

          <div className="pt-3">
            <Link href="/auth/signin" className="text-sm text-slate-700 underline">
              Sign in again
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}