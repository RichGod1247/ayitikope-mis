//src/app/headteacher/schemes/page.tsx
import { redirect } from "next/navigation";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";
import HeadteacherSchemesClient from "./ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toSignIn(callbackUrl: string, error?: string) {
  const p = new URLSearchParams();
  p.set("callbackUrl", callbackUrl);
  if (error) p.set("error", error);
  return `/auth/signin?${p.toString()}`;
}

export default async function HeadteacherSchemesPage() {
  try {
    await requireHeadteacherContext({ redirectTo: "/headteacher/schemes" });
  } catch {
    redirect(toSignIn("/headteacher/schemes", "FORBIDDEN"));
  }

  return <HeadteacherSchemesClient />;
}
