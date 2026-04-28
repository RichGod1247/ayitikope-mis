// src/app/parent/layout.tsx
import { ReactNode } from "react";
import ParentSidebarNav from "@/components/ParentSidebarNav";

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <ParentSidebarNav />
      {/* Content area — top padding on mobile to clear the fixed header */}
      <div className="flex-1 min-w-0 pt-12 md:pt-0">
        {children}
      </div>
    </div>
  );
}
