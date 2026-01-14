// src/app/teacher-portal/page.tsx
import TeacherPortalGatewayClient from "@/components/TeacherPortalGatewayClient";

export const dynamic = "force-dynamic";

export default async function TeacherPortalPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/teacher/dashboard";

  return (
    <main className="min-h-[calc(100vh-65px)]">
      <TeacherPortalGatewayClient nextUrl={next} />
    </main>
  );
}
