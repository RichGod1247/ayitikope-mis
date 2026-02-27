// src/app/consent/student/[token]/page.tsx
import { prisma } from "@/lib/prisma";
import { verifyStudentConsentToken } from "@/lib/consentTokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuardianConsentLetterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const payload = verifyStudentConsentToken(token);
  if (!payload) {
    return (
      <div style={{ fontFamily: "system-ui", maxWidth: 720, margin: "40px auto", lineHeight: 1.6 }}>
        <h1>Link expired</h1>
        <p>This consent link is invalid or has expired. Please contact your school for a new link.</p>
      </div>
    );
  }

  const student = await prisma.student.findUnique({
    where: { id: payload.sid },
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
    },
  });

  if (!student) {
    return (
      <div style={{ fontFamily: "system-ui", maxWidth: 720, margin: "40px auto", lineHeight: 1.6 }}>
        <h1>Student not found</h1>
        <p>Please contact your school for help.</p>
      </div>
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: student.tenantId },
    select: { name: true },
  });

  const schoolName = tenant?.name || "Your School";
  const child = `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "your child";

  const confirmUrl = `/api/consent/optin/student/link?token=${encodeURIComponent(token)}`;

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 720, margin: "40px auto", lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 6 }}>Health & SMS Consent</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        <strong>{schoolName}</strong>
      </p>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, marginTop: 18 }}>
        <p><strong>Student:</strong> {child}</p>
        <p><strong>Guardian:</strong> {student.guardianName || "Parent/Guardian"}</p>
        <p><strong>Phone:</strong> {student.guardianPhone || "—"}</p>
        <hr style={{ border: 0, borderTop: "1px solid #eee", margin: "14px 0" }} />
        <p>
          By confirming, you agree that the school may:
          <br />• record basic health/temperature checks when needed
          <br />• send SMS updates related to attendance/health/safety
        </p>

        <p style={{ color: "#555" }}>
          Current status:{" "}
          <strong>
            {student.guardianSmsOptIn ? "SMS Opt-in: ON" : "SMS Opt-in: OFF"}
          </strong>
          {" · "}
          <strong>
            {student.healthConsentAt ? "Health consent: Recorded" : "Health consent: Not recorded yet"}
          </strong>
        </p>

        <a
          href={confirmUrl}
          style={{
            display: "inline-block",
            marginTop: 10,
            background: "#2563eb",
            color: "white",
            textDecoration: "none",
            padding: "10px 14px",
            borderRadius: 12,
            fontWeight: 600,
          }}
        >
          Confirm Consent & Enable SMS
        </a>

        <p style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
          If you did not request this or need corrections, contact the school administration.
        </p>
      </div>
    </div>
  );
}
