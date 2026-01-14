// src/app/teacher/curriculum/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherCurriculumExplorerClient from "@/components/TeacherCurriculumExplorerClient";

export const metadata: Metadata = {
  title: "Curriculum Explorer | EduLife OS",
  description: "Teacher Curriculum Explorer for NaCCA KG–JHS curriculum in EduLife OS.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function buildSelfUrl(searchParams?: PageProps["searchParams"]) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    const val = Array.isArray(v) ? v[0] : v;
    if (typeof val === "string" && val.trim()) p.set(k, val.trim());
  }
  const qs = p.toString();
  return `/teacher/curriculum${qs ? `?${qs}` : ""}`;
}

export default async function TeacherCurriculumPage({ searchParams }: PageProps) {
  const redirectTo = buildSelfUrl(searchParams);

  const safe = await requireServerUserContext({
    redirectTo,
    requireTenant: true,
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: safe.userId, tenantId: safe.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!membership) redirect("/teacher/dashboard");

  return <TeacherCurriculumExplorerClient />;
}
