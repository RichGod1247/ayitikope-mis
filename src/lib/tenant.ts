// src/lib/tenant.ts
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export async function getActiveTenantByCookie() {
  const cookieStore = await cookies();
  const slug = cookieStore.get("x-tenant")?.value || "ayitikope-basic";
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  return { slug, tenant };
}
