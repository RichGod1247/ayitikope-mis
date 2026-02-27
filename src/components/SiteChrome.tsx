// src/components/SiteChrome.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const HIDE_PREFIXES = [
  "/app",
  "/admin",
  "/admin-portal",
  "/teacher",
  "/teacher-portal",
  "/teacher-gateway",
  "/headteacher",
  "/head-portal",
  "/parent",
  "/parent-portal",
  "/parents", // include parents area too
  "/student",
  "/student-portal",
  "/smc-pta-portal",
  "/debug",
];

function shouldHideChrome(pathname: string) {
  // Hide on print pages always (PDF/print layouts must be clean)
  if (pathname.includes("/print")) return true;

  // Hide on app/portal routes
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (shouldHideChrome(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}