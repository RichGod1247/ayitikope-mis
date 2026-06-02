// src/app/teacher/notices/page.tsx
import { redirect } from "next/navigation";
import OfficialNoticeInboxClient from "@/components/governance/OfficialNoticeInboxClient";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "_");
}

export default async function TeacherNoticesPage() {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });

  if (!ctx) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/teacher/notices")}`);
  }

  const role = normalizeRole(ctx.roleName);

  // Bank-grade rule:
  // Teacher notices are for users whose effective role is TEACHER only.
  // Headteachers and school admins must use their own notice surfaces.
  if (role !== "TEACHER") {
    redirect("/app");
  }

  return (
    <OfficialNoticeInboxClient
      portalLabel="Teacher"
      title="Official Notice Inbox"
      description="Receive, review, and acknowledge official notices sent specifically to you as a teacher, with clear delivery and acknowledgement evidence."
    />
  );
}