// src/app/api/headteacher/assessment/mock/export/pdf/route.ts
import { NextRequest } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { normRole } from "@/lib/roleRouting";
import {
  buildHeadteacherMockExportData,
  type MockExportData,
  type MockExportStudentRow,
} from "@/lib/assessments/mockExport";

// PDFKit's normal Node build tries to read built-in AFM font files from disk.
// Next.js server bundling can move those files, causing ENOENT for Helvetica.afm.
// The standalone build embeds the built-in font data and is safer inside Next route handlers.
// @ts-expect-error pdfkit standalone build has no bundled TypeScript declaration.
import PdfDocumentStandaloneImport from "pdfkit/js/pdfkit.standalone.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type PdfDoc = {
  page: {
    width: number;
    height: number;
  };

  on(event: "data", callback: (chunk: Buffer) => void): PdfDoc;
  on(event: "end", callback: () => void): PdfDoc;
  on(event: "error", callback: (err: Error) => void): PdfDoc;

  end(): void;
  save(): PdfDoc;
  restore(): PdfDoc;
  rect(x: number, y: number, width: number, height: number): PdfDoc;
  fillAndStroke(fillColor: string, strokeColor: string): PdfDoc;
  font(name: string): PdfDoc;
  fontSize(size: number): PdfDoc;
  fillColor(color: string): PdfDoc;
  text(
    value: string,
    x?: number,
    y?: number,
    options?: {
      width?: number;
      height?: number;
      align?: "left" | "center" | "right" | "justify";
      ellipsis?: boolean;
      lineBreak?: boolean;
    },
  ): PdfDoc;
  addPage(): PdfDoc;
};

type PdfDocumentConstructor = new (options: {
  size: string;
  layout: "landscape" | "portrait";
  margin: number;
  autoFirstPage: boolean;
  bufferPages?: boolean;
}) => PdfDoc;

const PdfDocumentStandalone =
  PdfDocumentStandaloneImport as unknown as PdfDocumentConstructor;

function isAllowed(roleName: string | null) {
  const role = normRole(roleName ?? "");
  return (
    role === "HEADTEACHER" ||
    role === "ADMIN" ||
    role === "SCHOOL_ADMIN" ||
    role === "SUPERADMIN"
  );
}

function cleanStr(value: unknown) {
  return String(value ?? "").trim();
}

function safeFileName(value: string) {
  return cleanStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ordinal(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "MOCK";

  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod10 === 1 && mod100 !== 11) return `${n}ST`;
  if (mod10 === 2 && mod100 !== 12) return `${n}ND`;
  if (mod10 === 3 && mod100 !== 13) return `${n}RD`;
  return `${n}TH`;
}

function subjectShortName(subject: string) {
  const s = cleanStr(subject).toUpperCase();

  if (s.includes("ENGLISH")) return "ENGLISH";
  if (s.includes("MATH")) return "MATHS";
  if (s.includes("SCIENCE")) return "SCIENCE";
  if (s.includes("SOCIAL")) return "SOCIAL";
  if (s === "RME" || s.includes("RELIGIOUS") || s.includes("MORAL"))
    return "RME";
  if (s.includes("CREATIVE") || s.includes("ART")) return "C_ARTS";
  if (s.includes("COMPUT")) return "COMP";
  if (s.includes("CAREER") || s.includes("TECH")) return "C_TECH";
  if (s.includes("EWE")) return "EWE";
  if (s.includes("GHANAIAN")) return "G_LANG";

  return s.replace(/\s+/g, "_").slice(0, 10);
}

function subjectCellFor(row: MockExportStudentRow, subject: string) {
  return row.subjectCells.find((cell) => cell.subject === subject) ?? null;
}

function gradeColor(grade: number | null | undefined) {
  if (grade == null) return "#E5E7EB";
  if (grade <= 3) return "#C6EFCE";
  if (grade <= 6) return "#FFEB9C";
  return "#FFC7CE";
}

function aggregateColor(value: number | null | undefined) {
  if (value == null) return "#E5E7EB";
  if (value <= 12) return "#C6EFCE";
  if (value <= 18) return "#FFEB9C";
  return "#FFC7CE";
}

function text(value: unknown) {
  if (value == null) return "";
  return String(value);
}

function pdfBuffer(doc: PdfDoc) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.end();
  });
}

function drawCell(
  doc: PdfDoc,
  args: {
    x: number;
    y: number;
    width: number;
    height: number;
    value: string;
    fill?: string;
    fontSize?: number;
    bold?: boolean;
    align?: "left" | "center" | "right";
  },
) {
  const fill = args.fill ?? "#FFFFFF";

  doc.save();
  doc
    .rect(args.x, args.y, args.width, args.height)
    .fillAndStroke(fill, "#000000");
  doc.restore();

  doc
    .font(args.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(args.fontSize ?? 8)
    .fillColor("#000000")
    .text(args.value, args.x + 3, args.y + 5, {
      width: Math.max(1, args.width - 6),
      height: Math.max(1, args.height - 8),
      align: args.align ?? "center",
      ellipsis: true,
      lineBreak: false,
    });
}

function drawTitleBlock(
  doc: PdfDoc,
  data: MockExportData,
  startX: number,
  startY: number,
  totalWidth: number,
) {
  drawCell(doc, {
    x: startX,
    y: startY,
    width: totalWidth,
    height: 38,
    value: data.tenant.name.toUpperCase(),
    fontSize: 23,
    bold: true,
    fill: "#FFFFFF",
  });

  drawCell(doc, {
    x: startX,
    y: startY + 38,
    width: totalWidth,
    height: 34,
    value: `${ordinal(data.session.mockNumber)} MOCK RESULTS - ${data.session.academicYear}`,
    fontSize: 20,
    bold: true,
    fill: "#FFFFFF",
  });

  drawCell(doc, {
    x: startX,
    y: startY + 72,
    width: totalWidth,
    height: 28,
    value: `${data.classroom.label} • ${data.session.term ?? ""}`,
    fontSize: 13,
    bold: true,
    fill: "#F8FAFC",
  });
}

function buildColumns(subjects: string[], scale = 1) {
  const w = (value: number) => Math.max(18, Math.round(value * scale));

  const columns: Array<{
    key: string;
    label: string;
    width: number;
    kind: "fixed" | "score" | "grade" | "agg" | "total";
    subject?: string;
  }> = [
    { key: "no", label: "NO.", width: w(30), kind: "fixed" },
    { key: "name", label: "NAME", width: w(145), kind: "fixed" },
  ];

  for (const subject of subjects) {
    columns.push({
      key: `${subject}_score`,
      label: subjectShortName(subject),
      width: w(48),
      kind: "score",
      subject,
    });

    columns.push({
      key: `${subject}_grade`,
      label: "GR",
      width: w(30),
      kind: "grade",
      subject,
    });
  }

  columns.push({
    key: "schoolAgg",
    label: "SCHOOL\nAGG",
    width: w(54),
    kind: "agg",
  });
  columns.push({
    key: "placementAgg",
    label: "PLACE.\nAGG",
    width: w(54),
    kind: "agg",
  });
  columns.push({ key: "total", label: "TOTAL", width: w(52), kind: "total" });

  return columns;
}

function drawHeader(
  doc: PdfDoc,
  columns: ReturnType<typeof buildColumns>,
  x: number,
  y: number,
  height: number,
) {
  let cursorX = x;

  for (const column of columns) {
    drawCell(doc, {
      x: cursorX,
      y,
      width: column.width,
      height,
      value: column.label,
      fill: "#D9EAF7",
      fontSize: 9,
      bold: true,
    });

    cursorX += column.width;
  }
}

function drawStudentRow(
  doc: PdfDoc,
  args: {
    row: MockExportStudentRow;
    index: number;
    columns: ReturnType<typeof buildColumns>;
    x: number;
    y: number;
    height: number;
  },
) {
  let cursorX = args.x;

  for (const column of args.columns) {
    let value = "";
    let fill = "#FFFFFF";
    let align: "left" | "center" | "right" = "center";
    const bold = true;

    if (column.key === "no") {
      value = String(args.index + 1);
    } else if (column.key === "name") {
      value = args.row.name;
      align = "left";
    } else if (column.kind === "score" && column.subject) {
      const cell = subjectCellFor(args.row, column.subject);
      value = cell?.score == null ? "" : text(cell.score);
      fill = gradeColor(cell?.grade);
    } else if (column.kind === "grade" && column.subject) {
      const cell = subjectCellFor(args.row, column.subject);
      value = cell?.grade == null ? "" : text(cell.grade);
      fill = gradeColor(cell?.grade);
    } else if (column.key === "schoolAgg") {
      value =
        args.row.schoolAggregate.aggregate == null
          ? ""
          : text(args.row.schoolAggregate.aggregate);
      fill = aggregateColor(args.row.schoolAggregate.aggregate);
    } else if (column.key === "placementAgg") {
      value =
        args.row.placementAggregate.aggregate == null
          ? ""
          : text(args.row.placementAggregate.aggregate);
      fill = aggregateColor(args.row.placementAggregate.aggregate);
    } else if (column.key === "total") {
      value =
        args.row.totalRawScore == null ? "" : text(args.row.totalRawScore);
    }

    drawCell(doc, {
      x: cursorX,
      y: args.y,
      width: column.width,
      height: args.height,
      value,
      fill,
      fontSize: column.key === "name" ? 10 : 11,
      bold,
      align,
    });

    cursorX += column.width;
  }
}

function drawLegend(doc: PdfDoc, x: number, y: number, totalWidth: number) {
  const guideWidth = Math.min(620, totalWidth);
  const noteWidth = Math.max(300, totalWidth - guideWidth - 12);

  drawCell(doc, {
    x,
    y,
    width: 120,
    height: 24,
    value: "COLOR GUIDE:",
    bold: true,
    fontSize: 10,
  });

  drawCell(doc, {
    x: x + 120,
    y,
    width: 150,
    height: 24,
    value: "GREEN = Strong",
    fill: "#C6EFCE",
    bold: true,
    fontSize: 10,
  });

  drawCell(doc, {
    x: x + 270,
    y,
    width: 170,
    height: 24,
    value: "YELLOW = Average",
    fill: "#FFEB9C",
    bold: true,
    fontSize: 10,
  });

  drawCell(doc, {
    x: x + 440,
    y,
    width: 180,
    height: 24,
    value: "RED = Weak / Risk",
    fill: "#FFC7CE",
    bold: true,
    fontSize: 10,
  });

  drawCell(doc, {
    x: x + guideWidth + 12,
    y,
    width: noteWidth,
    height: 24,
    value:
      "School Agg = fixed subjects. Placement Agg = core + best 2. Lower aggregate is better.",
    fontSize: 9,
    bold: true,
    align: "left",
    fill: "#FFFFFF",
  });
}

function renderBroadsheetPdf(data: MockExportData) {
  const doc = new PdfDocumentStandalone({
    size: "A3",
    layout: "landscape",
    margin: 18,
    autoFirstPage: true,
    bufferPages: true,
  });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  const horizontalMargin = 16;
  const availableWidth = pageWidth - horizontalMargin * 2;

  const baseColumns = buildColumns(data.subjects, 1);
  const baseTableWidth = baseColumns.reduce(
    (sum, column) => sum + column.width,
    0,
  );
  const widthScale = Math.max(1, availableWidth / Math.max(1, baseTableWidth));

  const columns = buildColumns(data.subjects, widthScale);
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  const startX = Math.max(10, (pageWidth - tableWidth) / 2);
  const titleY = 14;
  const headerY = titleY + 108;
  const headerHeight = 46;
  const bottomLimit = pageHeight - 48;

  const availableBodyHeight = bottomLimit - (headerY + headerHeight);
  const rowHeight = Math.max(
    34,
    Math.min(
      54,
      Math.floor(availableBodyHeight / Math.max(1, data.rows.length)),
    ),
  );

  function drawPageHeader() {
    drawTitleBlock(doc, data, startX, titleY, tableWidth);
    drawHeader(doc, columns, startX, headerY, headerHeight);
  }

  drawPageHeader();

  let y = headerY + headerHeight;

  data.rows.forEach((row, index) => {
    if (y + rowHeight > bottomLimit) {
      drawLegend(doc, startX, pageHeight - 34, tableWidth);
      doc.addPage();
      drawPageHeader();
      y = headerY + headerHeight;
    }

    drawStudentRow(doc, {
      row,
      index,
      columns,
      x: startX,
      y,
      height: rowHeight,
    });

    y += rowHeight;
  });

  const legendY = Math.min(pageHeight - 34, y + 14);
  drawLegend(doc, startX, legendY, tableWidth);

  return doc;
}

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req, { requireTenant: true });
  if (!gate.ok) return gate.res;

  if (!isAllowed(gate.ctx.roleName)) {
    return new Response(JSON.stringify({ ok: false, error: "FORBIDDEN" }), {
      status: 403,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = cleanStr(searchParams.get("sessionId"));

  if (!sessionId) {
    return new Response(
      JSON.stringify({ ok: false, error: "sessionId is required" }),
      {
        status: 400,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  }

  try {
    const data = await buildHeadteacherMockExportData({
      tenantId: gate.ctx.tenantId,
      sessionId,
    });

    if (!data) {
      return new Response(
        JSON.stringify({ ok: false, error: "Mock session not found." }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        },
      );
    }

    const doc = renderBroadsheetPdf(data);
    const buffer = await pdfBuffer(doc);

    const fileName = [
      safeFileName(data.tenant.name || "school"),
      safeFileName(data.classroom.label || "classroom"),
      safeFileName(data.session.mockLabel || "mock"),
      "results.pdf",
    ]
      .filter(Boolean)
      .join("-");

    const body = new Blob([new Uint8Array(buffer)], {
      type: "application/pdf",
    });

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[HEADTEACHER_MOCK_PDF_EXPORT_ERROR]", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Failed to generate Mock PDF export.",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  }
}
