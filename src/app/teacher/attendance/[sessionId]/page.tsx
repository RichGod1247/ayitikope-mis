// src/app/teacher/attendance/[sessionId]/page.tsx

import AttendanceSessionClient from "@/components/attendance/AttendanceSessionClient";

type PageProps = {
  params: { sessionId: string };
};

export default function AttendanceSessionPage({ params }: PageProps) {
  const { sessionId } = params;

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-GB"); // e.g. 14/11/2025

  return (
    <AttendanceSessionClient
      sessionId={sessionId}
      initialClassName="JHS 1"
      initialDate={dateLabel}
      initialBrand="AYITIKOPJHS"
    />
  );
}
