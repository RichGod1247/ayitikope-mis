//src/app/api/headteacher/assessment/mock/export/xlsx/route.ts
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { normRole } from "@/lib/roleRouting";
import {
  buildHeadteacherMockExportData,
  type MockExportData,
  type MockExportStudentRow,
  type MockExportSubjectCell,
} from "@/lib/assessments/mockExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
  };
}

function solidFill(argb: string): ExcelJS.Fill {
  return {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb },
  };
}

function gradeFill(grade: number | null | undefined) {
  if (grade == null) return solidFill("FFE5E7EB");
  if (grade <= 3) return solidFill("FFC6EFCE"); // strong
  if (grade <= 6) return solidFill("FFFFEB9C"); // average
  return solidFill("FFFFC7CE"); // weak
}

function aggregateFill(value: number | null | undefined) {
  if (value == null) return solidFill("FFE5E7EB");
  if (value <= 12) return solidFill("FFC6EFCE");
  if (value <= 18) return solidFill("FFFFEB9C");
  return solidFill("FFFFC7CE");
}

function colLetter(n: number) {
  let s = "";
  let x = n;

  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - m) / 26);
  }

  return s;
}

function styleTitleRow(row: ExcelJS.Row, fontSize: number) {
  row.height = fontSize + 18;
  row.font = {
    name: "Calibri",
    bold: true,
    size: fontSize,
    color: { argb: "FF000000" },
  };
  row.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  row.eachCell((cell) => {
    cell.border = thinBorder();
  });
}

function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.font = {
    name: "Calibri",
    bold: true,
    size: 24,
    color: { argb: "FF000000" },
  };
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  cell.border = thinBorder();
}

function styleBodyCell(cell: ExcelJS.Cell) {
  cell.font = {
    name: "Calibri",
    bold: true,
    size: 22,
    color: { argb: "FF000000" },
  };
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  cell.border = thinBorder();
}

function styleNameCell(cell: ExcelJS.Cell) {
  cell.font = {
    name: "Calibri",
    bold: true,
    size: 22,
    color: { argb: "FF000000" },
  };
  cell.alignment = {
    horizontal: "left",
    vertical: "middle",
    wrapText: true,
  };
  cell.border = thinBorder();
}

function buildHeaders(subjects: string[]) {
  const headers = ["NO.", "NAME"];

  for (const subject of subjects) {
    headers.push(subjectShortName(subject));
    headers.push("GR");
  }

  headers.push("SCHOOL\nAGG");
  headers.push("PLACEMENT\nAGG");
  headers.push("TOTAL");

  return headers;
}

function totalColumns(subjects: string[]) {
  return 2 + subjects.length * 2 + 3;
}

function addTemplateBroadsheet(
  workbook: ExcelJS.Workbook,
  data: MockExportData,
) {
  const worksheet = workbook.addWorksheet("Sheet1", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.15,
        footer: 0.15,
      },
    },
  });

  const subjects = data.subjects;
  const columnCount = totalColumns(subjects);
  const lastColumn = colLetter(columnCount);

  worksheet.mergeCells(`A1:${lastColumn}1`);
  worksheet.getCell("A1").value = data.tenant.name.toUpperCase();
  styleTitleRow(worksheet.getRow(1), 30);

  worksheet.mergeCells(`A2:${lastColumn}2`);
  worksheet.getCell("A2").value =
    `${ordinal(data.session.mockNumber)} MOCK RESULTS - ${data.session.academicYear}`;
  styleTitleRow(worksheet.getRow(2), 28);

  worksheet.columns = buildHeaders(subjects).map((header, index) => {
    if (index === 0) return { width: 8 };
    if (index === 1) return { width: 34 };
    if (header === "GR") return { width: 9 };
    if (header.includes("AGG")) return { width: 15 };
    if (header === "TOTAL") return { width: 14 };
    return { width: 16 };
  });

  const headerRow = worksheet.getRow(3);
  headerRow.values = buildHeaders(subjects);
  headerRow.height = 44;
  headerRow.eachCell(styleHeaderCell);

  data.rows.forEach((student, index) => {
    const rowNumber = index + 4;
    const row = worksheet.getRow(rowNumber);

    const values: Array<string | number> = [index + 1, student.name];

    for (const subject of subjects) {
      const cell = subjectCellFor(student, subject);
      values.push(cell?.score == null ? "" : Number(cell.score));
      values.push(cell?.grade == null ? "" : Number(cell.grade));
    }

    values.push(
      student.schoolAggregate.aggregate ?? "",
      student.placementAggregate.aggregate ?? "",
      student.totalRawScore ?? "",
    );

    row.values = values;
    row.height = 58;

    row.eachCell((cell, colNumber) => {
      if (colNumber === 2) {
        styleNameCell(cell);
      } else {
        styleBodyCell(cell);
      }
    });

    let col = 3;

    for (const subject of subjects) {
      const subjectCell =
        subjectCellFor(student, subject) ??
        ({
          itemId: "",
          subject,
          canonicalSubject: subject,
          score: null,
          comment: null,
          grade: null,
          gradeLabel: null,
          remark: null,
          nextGrade: null,
          pointsToNextGrade: null,
        } satisfies MockExportSubjectCell);

      const scoreCell = row.getCell(col);
      const gradeCell = row.getCell(col + 1);

      scoreCell.fill = gradeFill(subjectCell.grade);
      gradeCell.fill = gradeFill(subjectCell.grade);
      gradeCell.font = {
        name: "Calibri",
        bold: true,
        size: 24,
        color: { argb: "FF000000" },
      };

      col += 2;
    }

    const schoolAggCol = 3 + subjects.length * 2;
    const placementAggCol = schoolAggCol + 1;
    const totalCol = placementAggCol + 1;

    row.getCell(schoolAggCol).fill = aggregateFill(
      student.schoolAggregate.aggregate,
    );
    row.getCell(placementAggCol).fill = aggregateFill(
      student.placementAggregate.aggregate,
    );

    row.getCell(schoolAggCol).font = {
      name: "Calibri",
      bold: true,
      size: 24,
      color: { argb: "FF000000" },
    };

    row.getCell(placementAggCol).font = {
      name: "Calibri",
      bold: true,
      size: 24,
      color: { argb: "FF000000" },
    };

    row.getCell(totalCol).font = {
      name: "Calibri",
      bold: true,
      size: 24,
      color: { argb: "FF000000" },
    };
  });

  const lastRow = Math.max(4, data.rows.length + 3);

  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: columnCount },
  };

  worksheet.pageSetup.printTitlesRow = "1:3";
  worksheet.pageSetup.printArea = `A1:${lastColumn}${lastRow}`;

  worksheet.getRow(lastRow + 1).height = 18;

  const legendRow = worksheet.getRow(lastRow + 2);
  legendRow.getCell(1).value = "COLOR GUIDE:";
  legendRow.getCell(2).value = "GREEN = Strong";
  legendRow.getCell(3).value = "YELLOW = Average";
  legendRow.getCell(4).value = "RED = Weak / Risk";
  legendRow.height = 30;

  legendRow.eachCell((cell) => {
    cell.font = {
      name: "Calibri",
      bold: true,
      size: 16,
      color: { argb: "FF000000" },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = thinBorder();
  });

  legendRow.getCell(2).fill = solidFill("FFC6EFCE");
  legendRow.getCell(3).fill = solidFill("FFFFEB9C");
  legendRow.getCell(4).fill = solidFill("FFFFC7CE");
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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EduLife OS";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "BECE Mock Results";
    workbook.title = `${data.tenant.name} ${data.session.mockLabel} Results`;

    addTemplateBroadsheet(workbook, data);

    const output = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(output) ? output : Buffer.from(output);

    const fileName = [
      safeFileName(data.tenant.name || "school"),
      safeFileName(data.classroom.label || "classroom"),
      safeFileName(data.session.mockLabel || "mock"),
      "results.xlsx",
    ]
      .filter(Boolean)
      .join("-");

    return new Response(buffer, {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[HEADTEACHER_MOCK_XLSX_EXPORT_ERROR]", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Failed to generate Mock Excel export.",
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
