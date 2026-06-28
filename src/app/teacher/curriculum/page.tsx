// src/app/teacher/curriculum/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherCurriculumExplorerClient from "@/components/TeacherCurriculumExplorerClient";

export const metadata: Metadata = {
  title: "Curriculum Explorer | EduLife OS",
  description:
    "Teacher Curriculum Explorer for NaCCA KG–JHS curriculum in EduLife OS.",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

async function resolveSearchParams(
  searchParams: PageProps["searchParams"],
): Promise<SearchParams> {
  try {
    const resolved = await Promise.resolve(searchParams ?? {});
    return resolved && typeof resolved === "object" ? resolved : {};
  } catch {
    return {};
  }
}

function buildSelfUrl(searchParams: SearchParams) {
  const p = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    const val = Array.isArray(value) ? value[0] : value;
    if (typeof val === "string" && val.trim()) {
      p.set(key, val.trim());
    }
  }

  const qs = p.toString();
  return `/teacher/curriculum${qs ? `?${qs}` : ""}`;
}

export default async function TeacherCurriculumPage({
  searchParams,
}: PageProps) {
  const sp = await resolveSearchParams(searchParams);
  const redirectTo = buildSelfUrl(sp);

  const safe = await requireServerUserContext({
    redirectTo,
    requireTenant: true,
  });

  const membership = await prisma.membership.findFirst({
    where: {
      userId: safe.userId,
      tenantId: safe.tenantId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!membership) redirect("/teacher/dashboard");

  return <TeacherCurriculumExplorerClient />;
}
