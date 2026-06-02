// src/app/teacher/notices/page.tsx
import { redirect } from "next/navigation";
import OfficialNoticeInboxClient from "@/components/governance/OfficialNoticeInboxClient";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_TEACHER_ROLES = new Set([
  "TEACHER",
  "HEADTEACHER",
  "SCHOOL_ADMIN",
  "SCHOOLADMIN",
]);

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
  if (!ALLOWED_TEACHER_ROLES.has(role)) redirect("/app");

  return (
    <OfficialNoticeInboxClient
      portalLabel="Teacher"
      title="Official Notice Inbox"
      description="Receive, review, and acknowledge official school and governance notices with delivery evidence and acknowledgement history."
    />
  );
}