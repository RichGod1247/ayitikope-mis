// prisma/import-ayitikope-jhs-students.cjs
// One–off script to import real JHS students from the admission Excel files
// into the Student table for Ayitikope M/A Basic School.

const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ❗ IMPORTANT: this is the Ayitikope tenant we used in the dashboard code.
// If you changed / recreated tenants, verify this value in `Tenant` via
// `npx prisma studio`.
const AYITIKOPE_TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";

/**
 * Small helper to title-case names like "AGBOTSI VICTORIA" -> "Agbotsi Victoria"
 */
function titleCaseName(raw) {
  if (!raw) return "";
  return raw
    .toString()
    .trim()
    .split(/\s+/)
    .map((part) =>
      part.length
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : ""
    )
    .join(" ");
}

/**
 * Load students from one Excel workbook.
 * We search for the row where the first cell is "StuID", then use that row as header.
 * Expected columns include:
 *   - "StuID"
 *   - "Name of Student"
 *   - "Sex"
 *   - "GuardianName"
 *   - "GuardianPhone"
 */
function loadStudentsFromWorkbook(relativePath, levelLabel) {
  const fullPath = path.join(__dirname, "imports", relativePath);
  const wb = XLSX.readFile(fullPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // Convert to array-of-arrays for flexible header detection
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const headerRowIndex = rows.findIndex(
    (r) => r && String(r[0]).trim() === "StuID"
  );
  if (headerRowIndex === -1) {
    throw new Error(`Could not find 'StuID' header row in ${relativePath}`);
  }

  const header = rows[headerRowIndex];

  const idxName = header.indexOf("Name of Student");
  const idxSex = header.indexOf("Sex");
  const idxGuardianName = header.indexOf("GuardianName");
  const idxGuardianPhone = header.indexOf("GuardianPhone");

  if (idxName === -1) {
    throw new Error(
      `Could not find 'Name of Student' column in ${relativePath}`
    );
  }

  const students = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;

    const stuIdCell = row[0];
    if (!stuIdCell || isNaN(Number(stuIdCell))) {
      // Skip non-numeric or empty StuID rows
      continue;
    }

    const rawName = row[idxName] ? row[idxName].toString().trim() : "";
    if (!rawName) continue;

    const rawGuardian = idxGuardianName >= 0 ? row[idxGuardianName] : "";
    const rawGuardianPhone =
      idxGuardianPhone >= 0 ? row[idxGuardianPhone] : "";
    const rawSex = idxSex >= 0 ? row[idxSex] : "";

    const fullName = titleCaseName(rawName);
    const guardianName = titleCaseName(rawGuardian || "");
    const guardianPhone = (rawGuardianPhone || "").toString().trim();
    const sex = (rawSex || "").toString().trim();

    // Split full name into first + last for the Student model
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ");

    students.push({
      level: levelLabel,
      stuId: Number(stuIdCell),
      firstName,
      lastName,
      guardianName,
      guardianPhone,
      sex,
    });
  }

  console.log(
    `Loaded ${students.length} students from ${relativePath} (${levelLabel})`
  );
  return students;
}

async function main() {
  // 1) Load students from the three JHS admission files
  const basic7 = loadStudentsFromWorkbook(
    "Basic 7_Admission_T1_79.xlsx",
    "Basic 7"
  );
  const basic8 = loadStudentsFromWorkbook(
    "Basic 8_Admission_T1_32.xlsx",
    "Basic 8"
  );
  const basic9 = loadStudentsFromWorkbook(
    "Basic 9_Admission_T1_15.xlsx",
    "Basic 9"
  );

  const allStudents = [...basic7, ...basic8, ...basic9];

  console.log(`Total JHS students to import: ${allStudents.length}`);

  // 2) Create Student rows
  // We ONLY set fields we are 100% sure exist & are required:
  //   - tenantId
  //   - firstName
  //   - lastName
  //   - guardianName
  //   - guardianPhone
  //
  // If your Student model has extra required fields *without defaults*,
  // this will throw, and we’ll adjust to include them later.
  let createdCount = 0;

  for (const s of allStudents) {
    try {
      await prisma.student.create({
        data: {
          tenantId: AYITIKOPE_TENANT_ID,
          firstName: s.firstName,
          lastName: s.lastName,
          guardianName: s.guardianName || null,
          guardianPhone: s.guardianPhone || null,
          // If later we add fields like `legacyStuId` or `sex`,
          // we can extend this `data` block safely.
        },
      });
      createdCount++;
    } catch (err) {
      console.error(
        `Failed to create student ${s.firstName} ${s.lastName} (StuID ${s.stuId}):`,
        err
      );
    }
  }

  console.log(`Created ${createdCount} Student records.`);
}

main()
  .catch((err) => {
    console.error("[IMPORT_JHS_STUDENTS_ERROR]", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
