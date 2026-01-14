// src/app/auth/login/page.tsx
import { redirect } from "next/navigation";

export default function LoginAliasPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();

  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string" && v.trim()) qs.set(k, v);
      else if (Array.isArray(v) && v.length > 0) qs.set(k, v[0] ?? "");
    }
  }

  const suffix = qs.toString();
  redirect(suffix ? `/auth/signin?${suffix}` : "/auth/signin");
}
