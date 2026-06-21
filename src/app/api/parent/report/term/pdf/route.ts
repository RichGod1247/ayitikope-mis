// src/app/api/parent/report/term/pdf/route.ts
// Generates a policy-aware PDF report card for a parent's child.
// A13 rule: PDF must display report truth, not rebuild grading formulas.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";
import { launchBrowser } from "@/lib/puppeteerBrowser";
import {
  buildStudentPolicyReportTruth,
  findEvidenceBackedResultsRelease,
} from "@/lib/assessments/reportTruth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type GradeScaleRow = {
  grade: string | number;
  minPercent: number;
  maxPercent: number;
  label?: string | null;
  remark?: string | null;
};

type PdfSubjectRow = {
  subject: string;
  total: number;
  max: number;
  pct: number | null;
  grade: string | null;
  remark: string | null;
};

function normDigits(v: unknown) {
  return digitsOnly(String(v ?? ""));
}

function phoneMatchesBySuffix(a: string, b: string) {
  const A = normDigits(a);
  const B = normDigits(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
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

function pesewasToGhs(p: number): string {
  return `GHS ${(p / 100).toFixed(2)}`;
}

function safeNumber(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function round1(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.round(v * 10) / 10
    : null;
}

function gradeFromPolicyScale(
  gradeScale: GradeScaleRow[] | undefined,
  pct: number | null
) {
  if (pct === null || !Number.isFinite(pct)) return null;

  return (
    gradeScale?.find(
      (row) => pct >= Number(row.minPercent) && pct <= Number(row.maxPercent)
    ) ?? null
  );
}

function buildReportHtml(data: {
  schoolName: string;
  studentName: string;
  sex: string;
  dob: string;
  classLabel: string;
  term: string;
  academicYear: string;
  guardianName: string;
  guardianPhone: string;
  subjectRows: PdfSubjectRow[];
  totalSum: number;
  maxSum: number;
  overallPct: number | null;
  overallGrade: string | null;
  overallRemark: string | null;
  readinessMessage: string | null;
  daysPresent: number;
  daysAbsent: number;
  daysLate: number;
  totalSchoolDays: number;
  billed: number;
  waived: number;
  paid: number;
  outstanding: number;
  signatureSvg: string | null;
}): string {
  const subjectRowsHtml =
    data.subjectRows.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:12px;color:#999">${esc(
          data.readinessMessage ??
            "No reportable assessment subjects available for this learner."
        )}</td></tr>`
      : data.subjectRows
          .map(
            (r, i) => `
        <tr style="background:${i % 2 === 1 ? "#fafafa" : "#fff"}">
          <td style="font-weight:600">${esc(r.subject)}</td>
          <td style="text-align:center">${r.total}</td>
          <td style="text-align:center;color:#666">${r.max}</td>
          <td style="text-align:center">${
            r.pct != null ? r.pct.toFixed(1) + "%" : "—"
          }</td>
          <td style="text-align:center"><span style="background:#e8f5e9;color:#1b5e20;border-radius:3px;padding:1px 5px;font-weight:700">${esc(
            r.grade ?? "—"
          )}</span></td>
          <td>${esc(r.remark ?? "—")}</td>
        </tr>`
          )
          .join("") +
        `
        <tr style="background:#eef2ff;font-weight:700">
          <td>TOTAL</td>
          <td style="text-align:center">${data.totalSum}</td>
          <td style="text-align:center">${data.maxSum}</td>
          <td style="text-align:center">${
            data.overallPct != null ? data.overallPct.toFixed(1) + "%" : "—"
          }</td>
          <td style="text-align:center">${esc(data.overallGrade ?? "—")}</td>
          <td>${esc(data.overallRemark ?? "—")}</td>
        </tr>`;

  const sigHtml = data.signatureSvg
    ? `<span style="display:inline-block;max-height:44px;max-width:150px;vertical-align:middle">${data.signatureSvg}</span>`
    : `Signature &amp; Stamp: ______________________`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Report Card — ${esc(data.studentName)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #111; background: #fff; }
  .page { width: 100%; max-width: 794px; margin: 0 auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 6px; border: 1px solid #bbb; vertical-align: middle; }
  thead th { background: #f0f0f0; font-weight: 700; font-size: 8pt; }
  .section-title { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #555; margin-bottom: 4px; }
  .info-box { border: 1px solid #ddd; border-radius: 3px; padding: 6px 8px; font-size: 9pt; }
  .info-row { display: flex; gap: 4px; margin-bottom: 2px; }
  .info-label { font-weight: 600; min-width: 85px; color: #444; flex-shrink: 0; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .overall-box { border: 2px solid #1a237e; border-radius: 5px; padding: 6px 10px; text-align: center; }
  .overall-pct { font-size: 20pt; font-weight: 800; color: #1a237e; }
  .overall-label { font-size: 8pt; color: #555; }
  .sig-block { border: 1px solid #ddd; border-radius: 3px; padding: 8px; min-height: 68px; font-size: 9pt; }
  .sig-line { border-top: 1px solid #aaa; margin-top: 6px; padding-top: 2px; font-size: 8pt; color: #555; }
  .footer { border-top: 1px solid #ddd; padding-top: 3px; font-size: 7.5pt; color: #999; text-align: right; margin-top: 8px; }
  .outstanding { color: ${data.outstanding > 0 ? "#b71c1c" : "#1b5e20"}; font-weight: 700; }
</style>
</head>
<body>
<div class="page">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #0d1b4e">
    <div>
      <div style="font-size:13pt;font-weight:800;color:#0d1b4e">${esc(data.schoolName)}</div>
      <div style="font-size:9pt;color:#444;margin-top:1px">School Terminal Report Card</div>
      <div style="font-size:8pt;color:#666;margin-top:2px">${esc(data.term)} · ${esc(data.academicYear)}</div>
    </div>
    <div style="text-align:right;font-size:8pt;color:#666">
      <div>Ghana Basic Education</div>
      <div>Policy-aware assessment</div>
    </div>
  </div>

  <div class="grid-3" style="margin-bottom:10px">
    <div class="info-box">
      <div class="info-row"><span class="info-label">Name:</span><span>${esc(data.studentName)}</span></div>
      <div class="info-row"><span class="info-label">Sex:</span><span>${esc(data.sex)}</span></div>
      <div class="info-row"><span class="info-label">DOB:</span><span>${esc(data.dob)}</span></div>
    </div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Class:</span><span>${esc(data.classLabel)}</span></div>
      <div class="info-row"><span class="info-label">Term:</span><span>${esc(data.term)}</span></div>
      <div class="info-row"><span class="info-label">Acad. Year:</span><span>${esc(data.academicYear)}</span></div>
    </div>
    <div class="info-box" style="display:flex;align-items:center;justify-content:center">
      ${
        data.overallPct != null
          ? `<div class="overall-box">
             <div class="overall-pct">${data.overallPct.toFixed(1)}%</div>
             <div class="overall-label">Overall · ${esc(data.overallGrade ?? "—")}</div>
           </div>`
          : `<div style="font-size:9pt;color:#999;text-align:center">No reportable<br>assessment yet</div>`
      }
    </div>
  </div>

  <div style="margin-bottom:10px">
    <div class="section-title">Subject Performance</div>
    <table>
      <thead>
        <tr>
          <th style="text-align:left">Subject</th>
          <th style="text-align:center">Score</th>
          <th style="text-align:center">Max</th>
          <th style="text-align:center">%</th>
          <th style="text-align:center">Grade</th>
          <th style="text-align:left">Remarks</th>
        </tr>
      </thead>
      <tbody>${subjectRowsHtml}</tbody>
    </table>
  </div>

  <div class="grid-2" style="margin-bottom:10px">
    <div>
      <div class="section-title">Attendance</div>
      <table style="font-size:9pt">
        <tbody>
          <tr><td>Days Present</td><td style="text-align:right;font-weight:700">${data.daysPresent}</td></tr>
          <tr style="background:#fafafa"><td>Days Absent</td><td style="text-align:right">${data.daysAbsent}</td></tr>
          <tr><td>Days Late</td><td style="text-align:right">${data.daysLate}</td></tr>
          <tr style="background:#fafafa"><td>Total School Days</td><td style="text-align:right">${data.totalSchoolDays}</td></tr>
        </tbody>
      </table>
    </div>
    <div>
      <div class="section-title">Fees Summary</div>
      <table style="font-size:9pt">
        <tbody>
          <tr><td>Total Billed</td><td style="text-align:right">${pesewasToGhs(data.billed)}</td></tr>
          <tr style="background:#fafafa"><td>Waived</td><td style="text-align:right">${pesewasToGhs(data.waived)}</td></tr>
          <tr><td>Paid</td><td style="text-align:right">${pesewasToGhs(data.paid)}</td></tr>
          <tr class="outstanding" style="background:#fafafa"><td>Outstanding</td><td style="text-align:right">${pesewasToGhs(data.outstanding)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div style="margin-bottom:10px">
    <div class="section-title">Conduct &amp; Remarks</div>
    <div class="grid-2">
      <div class="sig-block">
        <div style="font-weight:600;margin-bottom:4px;font-size:9pt">Class Teacher's Remark</div>
        <div style="min-height:28px;font-size:9pt;color:#aaa">................................................................</div>
        <div class="sig-line">Signature: __________________________</div>
      </div>
      <div class="sig-block">
        <div style="font-weight:600;margin-bottom:4px;font-size:9pt">Headteacher's Remark</div>
        <div style="min-height:28px;font-size:9pt;color:#aaa">................................................................</div>
        <div class="sig-line">${sigHtml}</div>
      </div>
    </div>
  </div>

  <div class="grid-2" style="margin-bottom:6px">
    <div class="info-box" style="font-size:9pt">
      <div class="info-row"><span class="info-label">Guardian:</span><span>${esc(data.guardianName)}</span></div>
      <div class="info-row"><span class="info-label">Phone:</span><span>${esc(data.guardianPhone)}</span></div>
    </div>
    <div class="info-box" style="font-size:9pt">
      <div style="margin-bottom:6px">Next Term Begins: <span style="font-style:italic;color:#888">To be announced</span></div>
      <div>Parent / Guardian Signature: __________________</div>
    </div>
  </div>

  <div class="footer">Generated by EduLife OS · ${new Date().toLocaleDateString("en-GB")}</div>
</div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const gate = requireParentSession(req as any);
  if (!gate.ok) return gate.res as any;

  const sess = gate.session;
  const { searchParams } = new URL(req.url);

  const studentId = String(searchParams.get("studentId") ?? "").trim();
  const term = String(searchParams.get("term") ?? "1st Term").trim();
  const academicYear = String(
    searchParams.get("academicYear") ?? "2025/2026"
  ).trim();

  if (!studentId) {
    return new Response(JSON.stringify({ ok: false, error: "studentId is required" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId: sess.tenantId,
      status: StudentStatus.ACTIVE,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sex: true,
      dob: true,
      classroomId: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      classroom: { select: { name: true, grade: true, arm: true } },
    },
  });

  if (!student) {
    return new Response(JSON.stringify({ ok: false, error: "STUDENT_NOT_FOUND" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const sessE164 = String(sess.guardianPhoneE164 ?? "").trim();
  const sessSuffix9 = normDigits(sess.guardianSuffix9 ?? "");
  const guardianNorm = String(student.guardianPhoneNorm ?? "").trim();
  const guardianRaw = String(student.guardianPhone ?? "").trim();

  const okByE164 =
    !!sessE164 && !!guardianNorm && normDigits(sessE164) === normDigits(guardianNorm);

  const okBySuffix =
    normDigits(sessSuffix9).length >= 7 &&
    (phoneMatchesBySuffix(sessSuffix9, guardianNorm) ||
      phoneMatchesBySuffix(sessSuffix9, guardianRaw));

  if (!okByE164 && !okBySuffix) {
    return new Response(JSON.stringify({ ok: false, error: "GUARDIAN_MISMATCH" }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const classroomId = student.classroomId ?? "";

  const rel = await findEvidenceBackedResultsRelease({
    tenantId: sess.tenantId,
    term,
    academicYear,
    classroomId,
  });

  if (!rel) {
    return new Response(JSON.stringify({ ok: false, error: "RESULTS_NOT_RELEASED" }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const reportTruth = await buildStudentPolicyReportTruth({
    tenantId: sess.tenantId,
    studentId: student.id,
    term,
    academicYear,
  });

  if (!reportTruth.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "REPORT_TRUTH_UNAVAILABLE",
        detail: reportTruth.error,
      }),
      {
        status: 409,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: sess.tenantId },
    select: { name: true },
  });

  const subjectRows: PdfSubjectRow[] = reportTruth.subjects
    .slice()
    .sort((a, b) => String(a.subject).localeCompare(String(b.subject)))
    .map((s) => ({
      subject: String(s.subject ?? "Subject"),
      total: safeNumber(s.totalScore),
      max: safeNumber(s.maxScore),
      pct: round1(s.percentage),
      grade: s.grade == null ? null : String(s.grade),
      remark: s.remark ?? s.gradeLabel ?? null,
    }));

  const validPercentages = subjectRows
    .map((row) => row.pct)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));

  const fallbackOverall =
    validPercentages.length > 0
      ? validPercentages.reduce((sum, p) => sum + p, 0) / validPercentages.length
      : null;

  const overallPct =
    typeof reportTruth.overallPercentage === "number"
      ? round1(reportTruth.overallPercentage)
      : round1(fallbackOverall);

  const gradeScale = reportTruth.policy.gradeScale as GradeScaleRow[];
  const overallBand = gradeFromPolicyScale(gradeScale, overallPct);

  const totalSum = subjectRows.reduce((sum, row) => sum + row.total, 0);
  const maxSum = subjectRows.reduce((sum, row) => sum + row.max, 0);

  const attendanceMarks = classroomId
    ? await prisma.attendanceMark.findMany({
        where: {
          studentId: student.id,
          session: { tenantId: sess.tenantId, classroomId },
        },
        select: { status: true },
      })
    : [];

  const daysPresent = attendanceMarks.filter((mark) => mark.status === "PRESENT").length;
  const daysAbsent = attendanceMarks.filter((mark) => mark.status === "ABSENT").length;
  const daysLate = attendanceMarks.filter((mark) => mark.status === "LATE").length;

  const totalSchoolDays = classroomId
    ? await prisma.attendanceSession.count({
        where: { tenantId: sess.tenantId, classroomId, isClosed: true },
      })
    : 0;

  const invoiceAgg = await prisma.feeInvoice
    .aggregate({
      where: {
        tenantId: sess.tenantId,
        term,
        academicYear,
        studentId: student.id,
      },
      _sum: { totalBilledPesewas: true, totalWaivedPesewas: true },
    })
    .catch(() => ({
      _sum: { totalBilledPesewas: 0, totalWaivedPesewas: 0 },
    }));

  const paymentAgg = await prisma.feePayment
    .aggregate({
      where: {
        tenantId: sess.tenantId,
        status: "SUCCESS",
        invoice: { term, academicYear, studentId: student.id },
      },
      _sum: { amountPesewas: true },
    })
    .catch(() => ({ _sum: { amountPesewas: 0 } }));

  const billed = safeNumber(invoiceAgg._sum.totalBilledPesewas);
  const waived = safeNumber(invoiceAgg._sum.totalWaivedPesewas);
  const paid = safeNumber(paymentAgg._sum.amountPesewas);
  const outstanding = Math.max(0, billed - waived - paid);

  const signature = await prisma.headteacherSignature
    .findFirst({
      where: { tenantId: sess.tenantId },
      select: { signatureSvg: true },
      orderBy: { updatedAt: "desc" },
    })
    .catch(() => null);

  const classLabel = [
    student.classroom?.name ?? student.classroom?.grade ?? "—",
    student.classroom?.arm ? `(${student.classroom.arm})` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const readinessMessage =
    reportTruth.classReadiness?.blockedReasons?.[0] ??
    "No reportable assessment subjects available for this learner.";

  const html = buildReportHtml({
    schoolName: tenant?.name ?? "EduLife OS School",
    studentName:
      `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "Learner",
    sex: student.sex ?? "—",
    dob: fmtDate(student.dob),
    classLabel,
    term,
    academicYear,
    guardianName: student.guardianName ?? "—",
    guardianPhone: student.guardianPhone ?? "—",
    subjectRows,
    totalSum,
    maxSum,
    overallPct,
    overallGrade: overallBand ? String(overallBand.grade) : null,
    overallRemark: overallBand?.remark ?? overallBand?.label ?? null,
    readinessMessage,
    daysPresent,
    daysAbsent,
    daysLate,
    totalSchoolDays,
    billed,
    waived,
    paid,
    outstanding,
    signatureSvg: signature?.signatureSvg ?? null,
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

    return new Response(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "no-store",
        "content-disposition": `inline; filename="report-card-${student.id}.pdf"`,
      },
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}