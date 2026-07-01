// src/app/api/parent/assessment/mock/readiness/pdf/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { launchBrowser } from "@/lib/puppeteerBrowser";
import { buildHeadteacherMockExportData } from "@/lib/assessments/mockExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type MockSubjectCell = {
  subject: string;
  score: number | null;
  grade: number | null;
  gradeLabel: string | null;
  remark: string | null;
  nextGrade?: number | null;
  pointsToNextGrade?: number | null;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normDigits(v: unknown) {
  return digitsOnly(String(v ?? ""));
}

function phoneMatchesBySuffix(a: string, b: string) {
  const A = normDigits(a);
  const B = normDigits(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
}

function isValidSuffixForLookup(suffix: string) {
  return normDigits(suffix).length >= 7;
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNumber(v: number | null | undefined, suffix = "") {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  return `${n.toFixed(Number.isInteger(n) ? 0 : 1)}${suffix}`;
}

function parentOwnsStudent(args: {
  sessGuardianPhoneE164?: string | null;
  sessGuardianSuffix9?: string | null;
  studentGuardianPhoneNorm?: string | null;
  studentGuardianPhone?: string | null;
}) {
  const sessE164 = cleanStr(args.sessGuardianPhoneE164);
  const sessSuffix9 = normDigits(args.sessGuardianSuffix9);
  const guardianNorm = cleanStr(args.studentGuardianPhoneNorm);
  const guardianRaw = cleanStr(args.studentGuardianPhone);

  const okByE164 =
    !!sessE164 &&
    !!guardianNorm &&
    normDigits(sessE164) === normDigits(guardianNorm);

  const okBySuffix =
    isValidSuffixForLookup(sessSuffix9) &&
    (phoneMatchesBySuffix(sessSuffix9, guardianNorm) ||
      phoneMatchesBySuffix(sessSuffix9, guardianRaw));

  return okByE164 || okBySuffix;
}

function studentDisplayName(student: {
  firstName: string | null;
  lastName: string | null;
}) {
  return (
    [student.firstName, student.lastName].filter(Boolean).join(" ").trim() ||
    "Learner"
  );
}

function classLabel(student: {
  classroom?: {
    name: string | null;
    grade: string | null;
    arm: string | null;
  } | null;
}) {
  return [
    student.classroom?.name ?? student.classroom?.grade ?? "—",
    student.classroom?.arm ? `(${student.classroom.arm})` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function parentSafeHomeSupport(args: {
  placementAggregate: { ok: boolean; aggregate: number | null };
  missingSubjectCount: number;
  weakestSubject: string | null;
}) {
  const aggregate = args.placementAggregate.aggregate;

  if (!args.placementAggregate.ok || args.missingSubjectCount > 0) {
    return "Some subject evidence is incomplete. Keep revision steady while the school completes all evidence.";
  }

  if (typeof aggregate === "number" && aggregate <= 12) {
    return "Protect this strong position with regular revision, past questions, and calm consistency.";
  }

  if (typeof aggregate === "number" && aggregate <= 18) {
    return `Focus extra home support on ${
      args.weakestSubject ?? "the weaker subjects"
    } before the next Mock.`;
  }

  return `Create a simple weekly study routine and give extra attention to ${
    args.weakestSubject ?? "the weaker subjects"
  }. Contact the school for guidance if needed.`;
}

function buildBrandMark() {
  return `
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:34px;height:34px;border-radius:8px;background:#071A3D;border:2px solid #D4AF37;color:#D4AF37;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:17pt;line-height:1">E</div>
      <div>
        <div style="font-size:8pt;font-weight:800;color:#D4AF37;text-transform:uppercase;letter-spacing:.12em">EduLife OS</div>
        <div style="font-size:7pt;color:#5f6368">Ghana Basic Education</div>
      </div>
    </div>
  `;
}

function buildMockPdfHtml(data: {
  schoolName: string;
  studentName: string;
  classLabel: string;
  guardianName: string;
  guardianPhone: string;
  mockTitle: string;
  mockLabel: string;
  term: string | null;
  academicYear: string;
  releasedAt: string;
  releasedByName: string | null;
  smsNotifiedAt: string | null;
  releaseSnapshotHash: string;
  readinessStatus: string;
  readinessScore: number;
  schoolAggregate: number | null;
  placementAggregate: number | null;
  averageScore: number | null;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  classAveragePlacementAggregate: number | null;
  classPlacementReadyCount: number;
  classTotalStudents: number;
  homeSupport: string;
  recommendedAction: string | null;
  subjects: MockSubjectCell[];
  strongestSubjects: MockSubjectCell[];
  weakestSubjects: MockSubjectCell[];
}) {
  const subjectRows =
    data.subjects.length === 0
      ? `<tr><td colspan="5" style="padding:12px;text-align:center;color:#777">No released Mock score rows are available.</td></tr>`
      : data.subjects
          .map(
            (subject, index) => `
          <tr style="background:${index % 2 ? "#fafafa" : "#fff"}">
            <td style="font-weight:700">${esc(subject.subject)}</td>
            <td style="text-align:center">${fmtNumber(subject.score)}</td>
            <td style="text-align:center">${esc(subject.gradeLabel ?? fmtNumber(subject.grade))}</td>
            <td>${esc(subject.remark ?? "—")}</td>
            <td>${esc(
              subject.pointsToNextGrade != null && subject.nextGrade != null
                ? `${subject.pointsToNextGrade} mark(s) to Grade ${subject.nextGrade}`
                : "—",
            )}</td>
          </tr>`,
          )
          .join("");

  const strongest = data.strongestSubjects.length
    ? data.strongestSubjects
        .map(
          (s) =>
            `<li><strong>${esc(s.subject)}</strong> — ${fmtNumber(
              s.score,
            )} · ${esc(s.gradeLabel ?? fmtNumber(s.grade))}</li>`,
        )
        .join("")
    : "<li>No strong-subject signal available yet.</li>";

  const weakest = data.weakestSubjects.length
    ? data.weakestSubjects
        .map(
          (s) =>
            `<li><strong>${esc(s.subject)}</strong> — ${fmtNumber(
              s.score,
            )} · ${esc(s.gradeLabel ?? fmtNumber(s.grade))}</li>`,
        )
        .join("")
    : "<li>No support-area signal available yet.</li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Mock Readiness — ${esc(data.studentName)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family:'Helvetica Neue', Arial, sans-serif; font-size:10pt; color:#111; background:#fff; }
  .page { width:100%; max-width:794px; margin:0 auto; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #cfd4dc; padding:5px 7px; vertical-align:middle; }
  thead th { background:#eef2ff; color:#071A3D; font-size:8pt; text-transform:uppercase; letter-spacing:.06em; }
  .muted { color:#5f6368; }
  .small { font-size:8pt; }
  .tiny { font-size:7.2pt; }
  .section-title { font-size:7.5pt; font-weight:800; color:#5f6368; text-transform:uppercase; letter-spacing:.12em; margin-bottom:5px; }
  .box { border:1px solid #d7dce5; border-radius:6px; padding:8px 10px; }
  .metric { border:1px solid #d7dce5; border-radius:7px; padding:8px 10px; background:#fbfcff; }
  .metric-label { font-size:7.2pt; color:#5f6368; text-transform:uppercase; letter-spacing:.1em; }
  .metric-value { margin-top:3px; font-size:16pt; font-weight:900; color:#071A3D; }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  .grid-4 { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
  .notice { border-radius:7px; padding:8px 10px; line-height:1.5; }
  .gold { color:#D4AF37; }
  .blue { color:#071A3D; }
  .footer { margin-top:8px; border-top:1px solid #d7dce5; padding-top:4px; text-align:right; color:#777; font-size:7.2pt; }
</style>
</head>
<body>
<div class="page">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border-bottom:3px solid #071A3D;padding-bottom:10px;margin-bottom:10px">
    <div style="min-width:0;flex:1">
      ${buildBrandMark()}
      <div style="margin-top:8px;font-size:13pt;font-weight:900;color:#071A3D;text-transform:uppercase;letter-spacing:.04em">${esc(data.schoolName)}</div>
      <div class="small muted" style="margin-top:2px">BECE Mock Readiness Report · ${esc(data.mockLabel)}</div>
    </div>

    <div style="text-align:center;border:2px solid #071A3D;border-radius:8px;background:#f0f4ff;padding:8px 12px;min-width:108px">
      <div style="font-size:19pt;font-weight:900;color:#071A3D;line-height:1">${esc(data.placementAggregate ?? "—")}</div>
      <div class="tiny muted" style="margin-top:2px">Placement Aggregate</div>
    </div>
  </div>

  <div class="notice" style="border:1px solid #D4AF37;background:#fffaf0;margin-bottom:10px">
    <strong>Important:</strong> This is a released Mock readiness report. It is not the normal 30/70 terminal report.
    It is meant to guide BECE preparation, home support, and school follow-up.
  </div>

  <div class="grid-3" style="margin-bottom:10px">
    <div class="box">
      <div class="section-title">Learner</div>
      <div><strong>${esc(data.studentName)}</strong></div>
      <div class="small muted">Class: ${esc(data.classLabel)}</div>
      <div class="small muted">Guardian: ${esc(data.guardianName)}</div>
      <div class="small muted">Phone: ${esc(data.guardianPhone)}</div>
    </div>

    <div class="box">
      <div class="section-title">Mock Session</div>
      <div><strong>${esc(data.mockTitle)}</strong></div>
      <div class="small muted">Term: ${esc(data.term ?? "—")}</div>
      <div class="small muted">Academic Year: ${esc(data.academicYear)}</div>
      <div class="small muted">Released: ${esc(data.releasedAt)}</div>
    </div>

    <div class="box">
      <div class="section-title">Release Proof</div>
      <div class="small">Released by: <strong>${esc(data.releasedByName ?? "Headteacher/Admin")}</strong></div>
      <div class="small">SMS notified: ${esc(data.smsNotifiedAt ?? "—")}</div>
      <div class="tiny muted" style="margin-top:4px;word-break:break-all">Hash: ${esc(data.releaseSnapshotHash)}</div>
    </div>
  </div>

  <div class="grid-4" style="margin-bottom:10px">
    <div class="metric">
      <div class="metric-label">Placement agg.</div>
      <div class="metric-value">${esc(data.placementAggregate ?? "—")}</div>
    </div>
    <div class="metric">
      <div class="metric-label">School agg.</div>
      <div class="metric-value">${esc(data.schoolAggregate ?? "—")}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Average</div>
      <div class="metric-value">${fmtNumber(data.averageScore)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Subjects</div>
      <div class="metric-value">${data.scoredSubjectCount}</div>
      <div class="tiny muted">Missing ${data.missingSubjectCount}</div>
    </div>
  </div>

  <div class="grid-2" style="margin-bottom:10px">
    <div class="notice" style="border:1px solid #bbf7d0;background:#f0fdf4">
      <div class="section-title">Home Support</div>
      ${esc(data.homeSupport)}
    </div>
    <div class="notice" style="border:1px solid #bfdbfe;background:#eff6ff">
      <div class="section-title">School Recommendation</div>
      ${esc(data.recommendedAction ?? "Keep a steady revision rhythm and contact the school for support guidance.")}
    </div>
  </div>

  <div class="grid-2" style="margin-bottom:10px">
    <div class="box">
      <div class="section-title">Strengths to Protect</div>
      <ul style="margin:0 0 0 16px;padding:0;line-height:1.55">${strongest}</ul>
    </div>

    <div class="box">
      <div class="section-title">Support Areas</div>
      <ul style="margin:0 0 0 16px;padding:0;line-height:1.55">${weakest}</ul>
    </div>
  </div>

  <div style="margin-bottom:8px">
    <div class="section-title">Released Mock Subject Scores</div>
    <table>
      <thead>
        <tr>
          <th style="text-align:left">Subject</th>
          <th style="text-align:center">Score</th>
          <th style="text-align:center">Grade</th>
          <th style="text-align:left">Remark</th>
          <th style="text-align:left">Next Improvement</th>
        </tr>
      </thead>
      <tbody>${subjectRows}</tbody>
    </table>
  </div>

  <div class="box" style="font-size:8pt;line-height:1.45">
    <strong>Class context:</strong> Class average placement aggregate is ${fmtNumber(
      data.classAveragePlacementAggregate,
    )}. ${data.classPlacementReadyCount}/${data.classTotalStudents} learners are placement-ready in this released Mock evidence.
  </div>

  <div class="footer">Generated by EduLife OS · ${fmtDate(new Date())}</div>
</div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const gate = requireParentSession(req as any);
  if (!gate.ok) return gate.res as any;

  const sess = gate.session;
  const { searchParams } = new URL(req.url);

  const studentId = cleanStr(searchParams.get("studentId"));
  const requestedSessionId = cleanStr(searchParams.get("sessionId"));

  if (!studentId) {
    return new Response(JSON.stringify({ ok: false, error: "MISSING_STUDENT_ID" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: sess.tenantId },
    select: { id: true, name: true, status: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") {
    return new Response(JSON.stringify({ ok: false, error: "TENANT_NOT_ACTIVE" }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId: sess.tenantId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      classroomId: true,
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
        },
      },
    },
  });

  if (!student) {
    return new Response(JSON.stringify({ ok: false, error: "STUDENT_NOT_FOUND" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (
    !parentOwnsStudent({
      sessGuardianPhoneE164: sess.guardianPhoneE164,
      sessGuardianSuffix9: sess.guardianSuffix9,
      studentGuardianPhoneNorm: student.guardianPhoneNorm,
      studentGuardianPhone: student.guardianPhone,
    })
  ) {
    return new Response(JSON.stringify({ ok: false, error: "GUARDIAN_MISMATCH" }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (!student.classroomId) {
    return new Response(JSON.stringify({ ok: false, error: "STUDENT_CLASSROOM_NOT_ASSIGNED" }), {
      status: 409,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const release = await prisma.mockResultsRelease.findFirst({
    where: {
      tenantId: sess.tenantId,
      classroomId: student.classroomId,
      ...(requestedSessionId ? { mockExamSessionId: requestedSessionId } : {}),
      parentVisible: true,
      readinessStatus: { in: ["READY", "OVERRIDE"] },
      releaseSnapshotHash: { not: "" },
      mockExamSession: {
        tenantId: sess.tenantId,
        classroomId: student.classroomId,
        status: "LOCKED",
      },
    },
    orderBy: [{ releasedAt: "desc" }],
    select: {
      id: true,
      mockExamSessionId: true,
      classroomId: true,
      academicYear: true,
      term: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      readinessStatus: true,
      readinessScore: true,
      releaseSnapshotHash: true,
      releaseMode: true,
      smsNotifiedAt: true,
      releasedAt: true,
      releasedByUser: {
        select: {
          name: true,
          email: true,
        },
      },
      mockExamSession: {
        select: {
          id: true,
          status: true,
          title: true,
          mockLabel: true,
          mockNumber: true,
          academicYear: true,
          term: true,
        },
      },
    },
  });

  if (!release) {
    return new Response(JSON.stringify({ ok: false, error: "MOCK_RESULTS_NOT_RELEASED" }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const exportData = await buildHeadteacherMockExportData({
    tenantId: sess.tenantId,
    sessionId: release.mockExamSessionId,
  });

  if (!exportData) {
    return new Response(JSON.stringify({ ok: false, error: "MOCK_READINESS_TRUTH_UNAVAILABLE" }), {
      status: 409,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const row = exportData.rows.find((r) => r.studentId === student.id);

  if (!row) {
    return new Response(JSON.stringify({ ok: false, error: "STUDENT_NOT_IN_RELEASED_MOCK" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const scoredSubjects = row.subjectCells.filter((cell) => cell.score != null);

  const strongestSubjects = [...scoredSubjects]
    .sort((a, b) => {
      const ga = Number(a.grade ?? 99);
      const gb = Number(b.grade ?? 99);
      if (ga !== gb) return ga - gb;
      return Number(b.score ?? 0) - Number(a.score ?? 0);
    })
    .slice(0, 3);

  const weakestSubjects = [...scoredSubjects]
    .sort((a, b) => {
      const ga = Number(a.grade ?? -1);
      const gb = Number(b.grade ?? -1);
      if (ga !== gb) return gb - ga;
      return Number(a.score ?? 0) - Number(b.score ?? 0);
    })
    .slice(0, 3);

  const weakestSubject = weakestSubjects[0]?.subject ?? null;

  const homeSupport = parentSafeHomeSupport({
    placementAggregate: row.placementAggregate,
    missingSubjectCount: row.missingSubjectCount,
    weakestSubject,
  });

  const releasedByName =
    cleanStr(release.releasedByUser?.name) ||
    cleanStr(release.releasedByUser?.email) ||
    null;

  const html = buildMockPdfHtml({
    schoolName: tenant.name,
    studentName: studentDisplayName(student),
    classLabel: classLabel(student),
    guardianName: student.guardianName ?? "—",
    guardianPhone: student.guardianPhone ?? "—",
    mockTitle: release.title,
    mockLabel: release.mockLabel,
    term: release.term,
    academicYear: release.academicYear,
    releasedAt: fmtDateTime(release.releasedAt),
    releasedByName,
    smsNotifiedAt: release.smsNotifiedAt ? fmtDateTime(release.smsNotifiedAt) : null,
    releaseSnapshotHash: release.releaseSnapshotHash,
    readinessStatus: String(release.readinessStatus),
    readinessScore: Number(release.readinessScore ?? 0),
    schoolAggregate: row.schoolAggregate.aggregate,
    placementAggregate: row.placementAggregate.aggregate,
    averageScore: row.averageScore,
    scoredSubjectCount: row.scoredSubjectCount,
    missingSubjectCount: row.missingSubjectCount,
    classAveragePlacementAggregate: exportData.summary.classAveragePlacementAggregate,
    classPlacementReadyCount: exportData.summary.placementReadyCount,
    classTotalStudents: exportData.summary.totalStudents,
    homeSupport,
    recommendedAction: row.recommendedAction,
    subjects: row.subjectCells,
    strongestSubjects,
    weakestSubjects,
  });

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });

    const pdfBody = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength,
    ) as ArrayBuffer;

    return new Response(pdfBody, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "no-store",
        "content-disposition": `inline; filename="mock-readiness-${student.id}.pdf"`,
      },
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}