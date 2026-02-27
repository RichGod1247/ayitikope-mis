// src/app/signup/page.tsx
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default function SignupRedirectPage({ searchParams }: { searchParams?: SP }) {
  const qs = new URLSearchParams();

  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => x != null && qs.append(k, String(x)));
    else if (v != null) qs.set(k, String(v));
  }

  const suffix = qs.toString();
  redirect(`/auth/signup${suffix ? `?${suffix}` : ""}`);
}