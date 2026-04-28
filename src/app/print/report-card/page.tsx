// src/app/print/report-card/page.tsx
// Clean A4 NaCCA terminal report card — no nav/sidebar (SiteChrome hides chrome for /print paths).
// Used by headteachers for browser print and navigated by the PDF route via puppeteer.
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | undefined>;

function naccaGrade(pct: number | null): string | null {
  if (pct == null) return null;
  if (pct >= 90) return "1";
  if (pct >= 80) return "2";
  if (pct >= 70) return "3";
  if (pct >= 60) return "4";
  if (pct >= 50) return "5";
  if (pct >= 40) return "6";
  return "7";
}

function naccaRemark(grade: string | null): string | null {
  const map: Record<string, string> = {
    "1": "Excellent", "2": "Very Good", "3": "Good",
    "4": "Credit", "5": "Pass", "6": "Below Average", "7": "Fail",
  };
  return grade ? (map[grade] ?? null) : null;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function pesewasToGhs(p: number): string {
  return `GHS ${(p / 100).toFixed(2)}`;
}

export default async function ReportCardPrintPage(props: { searchParams: Promise<SP> }) {
  const ctx = await requireServerUserContext({
    redirectTo: "/auth/signin",
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  const sp = await props.searchParams;
  const studentId = String(sp.studentId ?? "").trim();
  const term = String(sp.term ?? "1st Term").trim();
  const academicYear = String(sp.academicYear ?? "2025/2026").trim();

  if (!studentId) {
    return (
      <div style={{ padding: 32, color: "#555", fontFamily: "sans-serif", fontSize: 13 }}>
        No learner ID provided. Add <code>?studentId=X&amp;term=Y&amp;academicYear=Z</code> to the URL.
      </div>
    );
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId },
    select: {
      id: true, firstName: true, lastName: true, sex: true, dob: true,
      classroomId: true, guardianName: true, guardianPhone: true,
      classroom: { select: { id: true, name: true, grade: true, arm: true } },
    },
  });

  if (!student) redirect("/headteacher/reports/student-report");

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });

  const classroomId = student.classroomId ?? "";

  const items = await prisma.assessmentItem.findMany({
    where: { tenantId: ctx.tenantId, classroomId, term, academicYear },
    select: { id: true, subject: true, maxScore: true },
  });

  const scores = items.length
    ? await prisma.assessmentScore.findMany({
        where: { studentId: student.id, itemId: { in: items.map((i) => i.id) } },
        select: { itemId: true, score: true },
      })
    : [];

  const scoreMap = new Map(scores.map((s) => [s.itemId, Number(s.score ?? 0)]));

  const bySubject: Record<string, { total: number; max: number }> = {};
  for (const item of items) {
    const k = item.subject ?? "Subject";
    if (!bySubject[k]) bySubject[k] = { total: 0, max: 0 };
    bySubject[k].total += scoreMap.get(item.id) ?? 0;
    bySubject[k].max += Number(item.maxScore ?? 0);
  }

  const subjectRows = Object.entries(bySubject)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, { total, max }]) => {
      const pct = max > 0 ? (total / max) * 100 : null;
      const grade = naccaGrade(pct);
      return { subject, total, max, pct, grade, remark: naccaRemark(grade) };
    });

  const totalSum = subjectRows.reduce((s, r) => s + r.total, 0);
  const maxSum = subjectRows.reduce((s, r) => s + r.max, 0);
  const overallPct = maxSum > 0 ? (totalSum / maxSum) * 100 : null;

  const attendanceMarks = classroomId
    ? await prisma.attendanceMark.findMany({
        where: { studentId: student.id, session: { tenantId: ctx.tenantId, classroomId } },
        select: { status: true },
      })
    : [];
  const daysPresent = attendanceMarks.filter((m) => m.status === "PRESENT").length;
  const daysAbsent = attendanceMarks.filter((m) => m.status === "ABSENT").length;
  const daysLate = attendanceMarks.filter((m) => m.status === "LATE").length;
  const totalSchoolDays = classroomId
    ? await prisma.attendanceSession.count({
        where: { tenantId: ctx.tenantId, classroomId, isClosed: true },
      })
    : 0;

  const invAgg = await prisma.feeInvoice.aggregate({
    where: { tenantId: ctx.tenantId, term, academicYear, studentId: student.id },
    _sum: { totalBilledPesewas: true, totalWaivedPesewas: true },
  }).catch(() => ({ _sum: { totalBilledPesewas: 0, totalWaivedPesewas: 0 } }));
  const payAgg = await prisma.feePayment.aggregate({
    where: { tenantId: ctx.tenantId, invoice: { term, academicYear, studentId: student.id } },
    _sum: { amountPesewas: true },
  }).catch(() => ({ _sum: { amountPesewas: 0 } }));
  const billed = invAgg._sum.totalBilledPesewas ?? 0;
  const waived = invAgg._sum.totalWaivedPesewas ?? 0;
  const paid = payAgg._sum.amountPesewas ?? 0;

  const sig = await prisma.headteacherSignature.findFirst({
    where: { tenantId: ctx.tenantId },
    select: { signatureSvg: true },
    orderBy: { updatedAt: "desc" },
  }).catch(() => null);

  const schoolName = tenant?.name ?? "EduLife OS School";
  const studentName = `${student.lastName} ${student.firstName}`.trim();
  const classLabel = student.classroom?.name ?? student.classroom?.grade ?? "—";
  const classArm = student.classroom?.arm ? ` (${student.classroom.arm})` : "";
  const outstanding = billed - waived - paid;

  const css = `
    @page { size: A4 portrait; margin: 10mm 12mm; }
    .rc-root { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #111; background: #fff; width: 100%; max-width: 794px; margin: 0 auto; padding: 0; }
    .rc-root *, .rc-root *::before, .rc-root *::after { box-sizing: border-box; }

    /* Header */
    .rc-header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px solid #071A3D; padding-bottom: 8px; margin-bottom: 10px; gap: 8px; }
    .rc-logo-wrap { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .rc-logo-icon { width: 30px; height: 30px; background: #071A3D; border-radius: 5px; display: flex; align-items: center; justify-content: center; color: #D4AF37; font-weight: 900; font-size: 15pt; flex-shrink: 0; line-height: 1; }
    .rc-school-name { font-size: 11pt; font-weight: 800; color: #071A3D; line-height: 1.2; }
    .rc-school-sub { font-size: 7pt; color: #666; margin-top: 1px; }
    .rc-title-center { text-align: center; flex: 1; padding: 0 10px; }
    .rc-card-title { font-size: 9.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #071A3D; }
    .rc-card-subtitle { font-size: 7pt; color: #D4AF37; font-weight: 700; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.08em; }
    .rc-card-term { font-size: 7.5pt; color: #666; margin-top: 3px; }
    .rc-photo-box { border: 2px solid #D4AF37; width: 70px; height: 88px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 3px; background: #faf8f0; }
    .rc-photo-label { font-size: 6pt; color: #bbb; text-align: center; line-height: 1.5; }

    /* Tables */
    .rc-table { width: 100%; border-collapse: collapse; }
    .rc-table th, .rc-table td { padding: 4px 6px; border: 1px solid #ccd; vertical-align: middle; }
    .rc-table thead th { background: #071A3D; color: #F7F4ED; font-weight: 700; font-size: 8pt; }

    /* Section labels */
    .rc-section-title { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #071A3D; margin-bottom: 4px; padding-left: 5px; border-left: 3px solid #D4AF37; }

    /* Info boxes */
    .rc-info-box { border: 1px solid #ddd; border-radius: 3px; padding: 6px 8px; font-size: 9pt; }
    .rc-info-row { display: flex; gap: 4px; margin-bottom: 2px; }
    .rc-info-label { font-weight: 600; min-width: 85px; color: #444; flex-shrink: 0; }

    /* Grids */
    .rc-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .rc-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }

    /* Overall score */
    .rc-overall-box { border: 2px solid #071A3D; border-radius: 5px; padding: 6px 10px; text-align: center; background: #f0f4ff; }
    .rc-overall-pct { font-size: 20pt; font-weight: 800; color: #071A3D; }
    .rc-overall-label { font-size: 8pt; color: #555; }

    /* Grade badges */
    .rc-grade { display: inline-block; background: #e8f5e9; color: #1b5e20; border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 9pt; }
    .rc-grade-fail { background: #ffebee; color: #b71c1c; }
    .rc-grade-below { background: #fff3e0; color: #e65100; }

    /* Signature blocks */
    .rc-sig-block { border: 1px solid #ddd; border-radius: 3px; padding: 8px; font-size: 9pt; min-height: 72px; }
    .rc-sig-container { overflow: hidden; height: 46px; max-width: 180px; display: flex; align-items: center; }
    .rc-sig-container span { display: flex; align-items: center; max-width: 100%; }
    .rc-sig-container svg { max-height: 44px !important; max-width: 180px !important; width: auto !important; height: auto !important; }
    .rc-sig-line { border-top: 1px solid #aaa; margin-top: 5px; padding-top: 3px; font-size: 8pt; color: #555; }

    /* Footer */
    .rc-footer { border-top: 2px solid #071A3D; padding-top: 4px; margin-top: 8px; display: flex; align-items: center; justify-content: space-between; }
    .rc-footer-brand { display: flex; align-items: center; gap: 4px; }
    .rc-footer-icon { width: 14px; height: 14px; background: #071A3D; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: #D4AF37; font-weight: 900; font-size: 8pt; line-height: 1; }
    .rc-footer-name { font-size: 7pt; font-weight: 700; color: #071A3D; }
    .rc-footer-nacca { font-size: 7pt; color: #D4AF37; font-weight: 700; }
    .rc-footer-date { font-size: 7pt; color: #999; }

    /* Misc */
    .rc-highlight { background: #eef2ff; font-weight: 700; }
    .rc-outstanding { color: ${outstanding > 0 ? "#b71c1c" : "#1b5e20"}; font-weight: 700; }
    .rc-odd { background: #fafafa; }
    .rc-divider { border: none; border-top: 1px solid #e0e0e0; margin: 8px 0; }
  `;

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="rc-root">
        {/* Header */}
        <div className="rc-header">
          <div className="rc-logo-wrap">
            <div className="rc-logo-icon">E</div>
            <div>
              <div className="rc-school-name">{schoolName}</div>
              <div className="rc-school-sub">EduLife OS · Ghana Basic Education</div>
            </div>
          </div>
          <div className="rc-title-center">
            <div className="rc-card-title">School Terminal Report Card</div>
            <div className="rc-card-subtitle">NaCCA Curriculum · Ghana</div>
            <div className="rc-card-term">{term} · Academic Year {academicYear}</div>
          </div>
          <div className="rc-photo-box">
            <div className="rc-photo-label">Passport<br />Photo</div>
          </div>
        </div>

        {/* Student info grid */}
        <div className="rc-grid-3" style={{ marginBottom: 10 }}>
          <div className="rc-info-box">
            <div className="rc-info-row"><span className="rc-info-label">Name:</span><span>{studentName}</span></div>
            <div className="rc-info-row"><span className="rc-info-label">Sex:</span><span>{student.sex ?? "—"}</span></div>
            <div className="rc-info-row"><span className="rc-info-label">DOB:</span><span>{fmtDate(student.dob)}</span></div>
          </div>
          <div className="rc-info-box">
            <div className="rc-info-row"><span className="rc-info-label">Class:</span><span>{classLabel}{classArm}</span></div>
            <div className="rc-info-row"><span className="rc-info-label">Term:</span><span>{term}</span></div>
            <div className="rc-info-row"><span className="rc-info-label">Acad. Year:</span><span>{academicYear}</span></div>
          </div>
          <div className="rc-info-box" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            {overallPct != null ? (
              <div className="rc-overall-box">
                <div className="rc-overall-pct">{overallPct.toFixed(1)}%</div>
                <div className="rc-overall-label">Overall · Grade {naccaGrade(overallPct) ?? "—"}</div>
              </div>
            ) : (
              <div style={{ fontSize: "9pt", color: "#999", textAlign: "center" }}>No scores<br />recorded</div>
            )}
          </div>
        </div>

        {/* Subjects table */}
        <div style={{ marginBottom: 10 }}>
          <div className="rc-section-title">Subject Performance</div>
          <table className="rc-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Subject</th>
                <th style={{ textAlign: "center" }}>Score</th>
                <th style={{ textAlign: "center" }}>Max</th>
                <th style={{ textAlign: "center" }}>%</th>
                <th style={{ textAlign: "center" }}>Grade</th>
                <th style={{ textAlign: "left" }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {subjectRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "12px 6px", color: "#999" }}>
                    No assessment scores recorded for this term.
                  </td>
                </tr>
              ) : (
                <>
                  {subjectRows.map((r, i) => (
                    <tr key={r.subject} className={i % 2 === 1 ? "rc-odd" : ""}>
                      <td style={{ fontWeight: 600 }}>{r.subject}</td>
                      <td style={{ textAlign: "center" }}>{r.total}</td>
                      <td style={{ textAlign: "center", color: "#666" }}>{r.max}</td>
                      <td style={{ textAlign: "center" }}>{r.pct != null ? `${r.pct.toFixed(1)}%` : "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`rc-grade${r.grade === "7" ? " rc-grade-fail" : r.grade === "6" ? " rc-grade-below" : ""}`}>
                          {r.grade ?? "—"}
                        </span>
                      </td>
                      <td>{r.remark ?? "—"}</td>
                    </tr>
                  ))}
                  <tr className="rc-highlight">
                    <td>TOTAL</td>
                    <td style={{ textAlign: "center" }}>{totalSum}</td>
                    <td style={{ textAlign: "center" }}>{maxSum}</td>
                    <td style={{ textAlign: "center" }}>{overallPct != null ? `${overallPct.toFixed(1)}%` : "—"}</td>
                    <td style={{ textAlign: "center" }}>{naccaGrade(overallPct) ?? "—"}</td>
                    <td>{naccaRemark(naccaGrade(overallPct)) ?? "—"}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Attendance + Fees */}
        <div className="rc-grid-2" style={{ marginBottom: 10 }}>
          <div>
            <div className="rc-section-title">Attendance</div>
            <table className="rc-table" style={{ fontSize: "9pt" }}>
              <tbody>
                <tr><td>Days Present</td><td style={{ textAlign: "right", fontWeight: 700 }}>{daysPresent}</td></tr>
                <tr className="rc-odd"><td>Days Absent</td><td style={{ textAlign: "right" }}>{daysAbsent}</td></tr>
                <tr><td>Days Late</td><td style={{ textAlign: "right" }}>{daysLate}</td></tr>
                <tr className="rc-odd"><td>Total School Days</td><td style={{ textAlign: "right" }}>{totalSchoolDays}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <div className="rc-section-title">Fees Summary</div>
            <table className="rc-table" style={{ fontSize: "9pt" }}>
              <tbody>
                <tr><td>Total Billed</td><td style={{ textAlign: "right" }}>{pesewasToGhs(billed)}</td></tr>
                <tr className="rc-odd"><td>Waived</td><td style={{ textAlign: "right" }}>{pesewasToGhs(waived)}</td></tr>
                <tr><td>Paid</td><td style={{ textAlign: "right" }}>{pesewasToGhs(paid)}</td></tr>
                <tr className="rc-odd rc-outstanding"><td>Outstanding</td><td style={{ textAlign: "right" }}>{pesewasToGhs(outstanding)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Remarks / Signatures */}
        <div style={{ marginBottom: 10 }}>
          <div className="rc-section-title">Conduct &amp; Remarks</div>
          <div className="rc-grid-2">
            <div className="rc-sig-block">
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: "9pt" }}>Class Teacher's Remark</div>
              <div style={{ minHeight: 28, fontSize: "9pt", color: "#aaa" }}>
                ................................................................
              </div>
              <div className="rc-sig-line">Signature: __________________________</div>
            </div>
            <div className="rc-sig-block">
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: "9pt" }}>Headteacher&apos;s Remark</div>
              <div style={{ minHeight: 24, fontSize: "9pt", color: "#aaa" }}>
                ................................................................
              </div>
              <div className="rc-sig-line">
                {sig?.signatureSvg ? (
                  <div className="rc-sig-container">
                    <span
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: sig.signatureSvg }}
                    />
                  </div>
                ) : (
                  <span>Signature &amp; Stamp: ______________________</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer row */}
        <div className="rc-grid-2" style={{ marginBottom: 6 }}>
          <div className="rc-info-box" style={{ fontSize: "9pt" }}>
            <div className="rc-info-row"><span className="rc-info-label">Guardian:</span><span>{student.guardianName ?? "—"}</span></div>
            <div className="rc-info-row"><span className="rc-info-label">Phone:</span><span>{student.guardianPhone ?? "—"}</span></div>
          </div>
          <div className="rc-info-box" style={{ fontSize: "9pt" }}>
            <div style={{ marginBottom: 6 }}>Next Term Begins: <span style={{ fontStyle: "italic", color: "#888" }}>To be announced</span></div>
            <div>Parent / Guardian Signature: __________________</div>
          </div>
        </div>

        <div className="rc-footer">
          <div className="rc-footer-brand">
            <div className="rc-footer-icon">E</div>
            <div className="rc-footer-name">EduLife OS · {schoolName}</div>
          </div>
          <div className="rc-footer-nacca">NaCCA Compliant</div>
          <div className="rc-footer-date">Generated: {new Date().toLocaleDateString("en-GB")}</div>
        </div>
      </div>
    </>
  );
}
