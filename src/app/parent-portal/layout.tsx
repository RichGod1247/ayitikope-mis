import { ReactNode } from "react";
import ParentSidebarNav from "@/components/ParentSidebarNav";

export default function ParentPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#05070B]">
      <ParentSidebarNav />
      <div className="flex-1 min-w-0 pt-12 md:pt-0">
        {children}
      </div>
    </div>
  );
}
