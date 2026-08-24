import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function EssentialAlertTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(
    `/api/consent/optin/student/link?token=${encodeURIComponent(String(token ?? ""))}`,
  );
}
