// src/app/pending/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { sendEmail } from "@/lib/email/sendEmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUTO_ACTIVATE_HOURS = Number(process.env.TENANT_AUTO_ACTIVATE_AFTER_HOURS || 12) || 12;
const ACTIVATION_SMS_BRAND = "EDULIFEOS" as const;

function asObj(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as any) : {};
}

function parseDateMaybe(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function getBootstrapSubmittedAt(settings: any, fallback: Date) {
  const d = parseDateMaybe(settings?.bootstrapSubmittedAt);
  return d ?? fallback;
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

function buildActivationEmailText(args: { tenantName: string; schoolCode: string }) {
  return (
    `Hello,\n\n` +
    `Good news — your school is now ACTIVE on EduLife OS.\n\n` +
    `School: ${args.tenantName}\n` +
    `School Code: ${args.schoolCode}\n\n` +
    `You can sign in and continue setup.\n`
  );
}

function buildActivationSmsText(args: { schoolCode: string }) {
  return `EduLifeOS\nSchool ACTIVE\nCode: ${args.schoolCode}\nSign in to continue.`;
}

export default async function PendingPage() {
  const ctx = await getServerUserContextOrNull({ requireTenant: false });

  if (!ctx?.userId) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">School Verification</h1>
          <p className="text-sm text-slate-700">
            If your school was just enrolled, it may be pending verification before it can be used.
          </p>
          <Link
            href="/auth/signin"
            className="inline-flex rounded-xl bg-black text-white px-4 py-2 text-sm font-semibold"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const mem = await prisma.membership.findFirst({
    where: { userId: ctx.userId, status: "ACTIVE", role: { name: "SCHOOL_ADMIN" } },
    orderBy: { createdAt: "desc" },
    select: {
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
          status: true,
          createdAt: true,
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
        <div className="max-w-2xl mx-auto p-6 space-y-3">
          <h1 className="text-xl font-semibold text-slate-900">No school found</h1>
          <p className="text-sm text-slate-700">Your account is not linked to a school admin membership.</p>
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
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Enrollment Rejected</h1>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 space-y-3">
            <div className="text-sm text-rose-900">
              School: <span className="font-semibold">{tenant.name}</span>{" "}
              <span className="text-rose-700">({tenant.schoolCode})</span>
            </div>

            <div className="text-sm text-rose-900">
              Reason: <span className="font-medium">{reject.reason ?? "Not provided."}</span>
            </div>

            <div className="text-xs text-rose-800">
              {reject.rejectedAt ? `Rejected at: ${reject.rejectedAt.toLocaleString()}` : null}
            </div>

            <div className="pt-2 text-sm text-rose-900">
              Contact EduLife OS support / your platform admin to resolve this and re-approve the school.
            </div>

            <div className="text-xs text-rose-800">
              Contact: {tenant.contactEmail || "—"} • {tenant.contactPhoneNorm || "—"}
            </div>

            <div className="pt-3 flex items-center gap-3">
              <Link href="/auth/signin" className="text-sm underline text-rose-900">
                Sign in again
              </Link>
              <Link href="/admin/dashboard" className="text-sm underline text-rose-900">
                Try dashboard
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const submittedAt = getBootstrapSubmittedAt(settings, tenant.createdAt);
  const autoActivateAt = new Date(submittedAt.getTime() + AUTO_ACTIVATE_HOURS * 60 * 60 * 1000);

  if (Date.now() >= autoActivateAt.getTime()) {
    const nowIso = new Date().toISOString();

    const activated = await prisma.$transaction(async (tx) => {
      const current = await tx.tenant.findUnique({
        where: { id: tenant.id },
        select: {
          id: true,
          name: true,
          schoolCode: true,
          status: true,
          createdAt: true,
          settingsJson: true,
          contactEmail: true,
          contactPhoneNorm: true,
        },
      });

      if (!current) return { ok: false as const, reason: "NOT_FOUND" };
      if (current.status === "ACTIVE") return { ok: false as const, reason: "ALREADY_ACTIVE" };

      const s = asObj(current.settingsJson);
      const rj = getRejectInfo(s);
      if (rj.isRejected) return { ok: false as const, reason: "REJECTED" };

      const subAt = getBootstrapSubmittedAt(s, current.createdAt);
      const dueAt = new Date(subAt.getTime() + AUTO_ACTIVATE_HOURS * 60 * 60 * 1000);
      if (Date.now() < dueAt.getTime()) return { ok: false as const, reason: "NOT_DUE" };

      if (typeof s.bootstrapAutoActivatedAt === "string" && s.bootstrapAutoActivatedAt.trim()) {
        return { ok: false as const, reason: "ALREADY_MARKED" };
      }

      const nextSettings = { ...s };

      delete nextSettings.bootstrapRejectedAt;
      delete nextSettings.bootstrapRejectedByUserId;
      delete nextSettings.bootstrapRejectReason;

      nextSettings.bootstrapAutoActivatedAt = nowIso;
      nextSettings.bootstrapAutoActivatedBy = "SYSTEM";
      nextSettings.bootstrapAutoActivatedReason = `AUTO_AFTER_${AUTO_ACTIVATE_HOURS}_H`;
      nextSettings.bootstrapAutoActivatedNotifiedAt = nowIso;

      const upd = await tx.tenant.updateMany({
        where: { id: current.id, status: "PENDING" },
        data: { status: "ACTIVE", settingsJson: nextSettings as any },
      });

      if (upd.count !== 1) return { ok: false as const, reason: "RACE_LOST" };

      try {
        await tx.auditLog.create({
          data: {
            tenantId: current.id,
            userId: ctx.userId,
            action: "TENANT_AUTO_ACTIVATED",
            resource: "Tenant",
            resourceId: current.id,
            ip: null,
            userAgent: null,
            metadata: {
              autoActivateHours: AUTO_ACTIVATE_HOURS,
              bootstrapSubmittedAt: subAt.toISOString(),
              autoActivateAt: dueAt.toISOString(),
              activatedAt: nowIso,
              notify: true,
            } as any,
          },
        });
      } catch {}

      return {
        ok: true as const,
        tenantId: current.id,
        tenantName: current.name,
        schoolCode: current.schoolCode,
        contactEmail: current.contactEmail,
        contactPhoneNorm: current.contactPhoneNorm,
      };
    });

    if (activated.ok) {
      const delivery: any = { email: null, sms: null };

      if (activated.contactEmail) {
        delivery.email = await sendEmail({
          to: activated.contactEmail,
          subject: `EduLife OS: School is ACTIVE (${activated.schoolCode})`,
          text: buildActivationEmailText({
            tenantName: activated.tenantName,
            schoolCode: activated.schoolCode,
          }),
        });
      }

      if (activated.contactPhoneNorm) {
        try {
          await sendViaHubtel({
            to: activated.contactPhoneNorm,
            body: buildActivationSmsText({ schoolCode: activated.schoolCode }),
            brand: ACTIVATION_SMS_BRAND,
            tenantId: undefined,
            actorId: ctx.userId,
            meta: {
              category: "TENANT_AUTO_ACTIVATED",
              tenantId: activated.tenantId,
              schoolCode: activated.schoolCode,
            },
          });
          delivery.sms = { ok: true, to: activated.contactPhoneNorm };
        } catch (e: any) {
          delivery.sms = { ok: false, to: activated.contactPhoneNorm, error: String(e?.message || "SMS_FAILED") };
        }
      }

      try {
        await prisma.auditLog.create({
          data: {
            tenantId: activated.tenantId,
            userId: ctx.userId,
            action: "TENANT_AUTO_ACTIVATION_NOTIFIED",
            resource: "Tenant",
            resourceId: activated.tenantId,
            ip: null,
            userAgent: null,
            metadata: delivery as any,
          },
        });
      } catch {}
    }

    redirect("/admin/dashboard");
  }

  const remainingMs = autoActivateAt.getTime() - Date.now();
  const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Pending Verification</h1>

        <div className="rounded-2xl border bg-white p-5 space-y-2">
          <div className="text-sm text-slate-700">
            School: <span className="font-semibold">{tenant.name}</span>{" "}
            <span className="text-slate-500">({tenant.schoolCode})</span>
          </div>
          <div className="text-sm text-slate-700">
            Status: <span className="font-semibold">PENDING</span>
          </div>
          <div className="text-sm text-slate-700">
            Auto-activates in ~<b>{remainingMin}</b> minutes (at{" "}
            <span className="font-mono">{autoActivateAt.toLocaleString()}</span>)
          </div>

          <div className="pt-3 text-sm text-slate-700">
            If you need faster access, contact EduLife OS support / your platform admin to approve the school.
          </div>

          <div className="text-xs text-slate-500">
            Contact: {tenant.contactEmail || "—"} • {tenant.contactPhoneNorm || "—"}
          </div>

          <div className="pt-3">
            <Link href="/admin/dashboard" className="text-sm underline text-slate-700">
              Try dashboard again
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}