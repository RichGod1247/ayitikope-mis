// src/app/api/headteacher/reports/student-term-report/pdf/route.ts
// Generates a PDF of the NaCCA report card for a given student.
// Navigates puppeteer to the /print/report-card page with the headteacher's session forwarded.
import { NextRequest } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { normRole } from "@/lib/roleRouting";
import { launchBrowser, parseCookiesForPuppeteer } from "@/lib/puppeteerBrowser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel max function duration — PDF generation can take a few seconds
export const maxDuration = 60;

function isAllowed(roleName: string | null) {
  const r = normRole(roleName ?? "");
  return r === "HEADTEACHER" || r === "ADMIN" || r === "SCHOOL_ADMIN" || r === "SUPERADMIN";
}

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req, { requireTenant: true });
  if (!gate.ok) return gate.res;

  if (!isAllowed(gate.ctx.roleName)) {
    return new Response(JSON.stringify({ ok: false, error: "FORBIDDEN" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const { searchParams } = new URL(req.url);
  const studentId = String(searchParams.get("studentId") ?? "").trim();
  const term = String(searchParams.get("term") ?? "1st Term").trim();
  const academicYear = String(searchParams.get("academicYear") ?? "2025/2026").trim();

  if (!studentId) {
    return new Response(JSON.stringify({ ok: false, error: "studentId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const origin =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    `http://localhost:${process.env.PORT || 3000}`;

  const printUrl = `${origin}/print/report-card?studentId=${encodeURIComponent(studentId)}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`;

  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Forward the headteacher's session cookies so the print page can auth
    const cookieHeader = req.headers.get("cookie") ?? "";
    if (cookieHeader) {
      const hostname = new URL(origin).hostname;
      const cookies = parseCookiesForPuppeteer(cookieHeader, hostname);
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
      }
    }

    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 60_000 });

    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });

    const lastName = gate.ctx.email?.split("@")[0] ?? "report";
    const safeName = `${studentId.slice(0, 8)}-${term.replace(/\s+/g, "-")}-${academicYear.replace("/", "-")}`;

    const headers = new Headers();
    headers.set("content-type", "application/pdf");
    headers.set("content-disposition", `attachment; filename="report-card-${safeName}.pdf"`);
    headers.set("cache-control", "no-store");

    return new Response(Buffer.from(pdfBytes), { status: 200, headers });
  } catch (err: any) {
    console.error("[HT_REPORT_PDF_ERROR]", err);
    return new Response(JSON.stringify({ ok: false, error: "PDF generation failed. Please try again." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
