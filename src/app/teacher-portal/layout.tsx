// src/app/teacher-portal/layout.tsx
import type { ReactNode } from "react";

export default function TeacherPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      {children}
    </div>
  );
}
