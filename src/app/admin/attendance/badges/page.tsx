//src/app/admin/attendance/badges/page.tsx
import AttendanceBadgesClient from "@/components/admin/AttendanceBadgesClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function AdminAttendanceBadgesPage() {
  return <AttendanceBadgesClient />;
}