// src/app/headteacher/notices/page.tsx
import { redirect } from "next/navigation";
import OfficialNoticeInboxClient from "@/components/governance/OfficialNoticeInboxClient";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toSignIn(callbackUrl: string, error?: string) {
  const p = new URLSearchParams();
  p.set("callbackUrl", callbackUrl);
  if (error) p.set("error", error);
  return `/auth/signin?${p.toString()}`;
}

export default async function HeadteacherNoticesPage() {
  try {
    await requireHeadteacherContext({ redirectTo: "/headteacher/notices" });
  } catch {
    redirect(toSignIn("/headteacher/notices", "FORBIDDEN"));
  }

  return (
    <OfficialNoticeInboxClient
      portalLabel="Headteacher"
      title="Official Notice Inbox"
      description="Receive, review, and acknowledge official governance notices from circuit and district education leadership with full delivery evidence."
    />
  );
}