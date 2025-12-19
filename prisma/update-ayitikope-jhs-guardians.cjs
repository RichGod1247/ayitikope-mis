// prisma/update-ayitikope-jhs-guardians.cjs
//
// Updates Ayitikope JHS student guardian info (name, phone, sex, guardianSmsOptIn)
// from the three Excel files you provided.
//
// Files expected (already in prisma/imports):
//   prisma/imports/Basic 7_Admission_T1_79.xlsx
//   prisma/imports/Basic 8_Admission_T1_32.xlsx
//   prisma/imports/Basic 9_Admission_T1_15.xlsx
//
// It does NOT touch the DB structure.
// It only fills in empty guardianName / guardianPhone / sex / guardianSmsOptIn
// for matching students.
//
// Matching is done by:
//   fullName = (firstName + " " + lastName), normalised to lowercase.
//

require("dotenv/config");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Change if you ever use a different tenant id
const AYITIKOPE_TENANT_ID =
  process.env.AYITIKOPE_TENANT_ID || "cmhhnghn00008vcpgp3fl07fl";

const IMPORT_DIR = path.join(__dirname, "imports");

function normaliseName(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pickByHeader(row, needles) {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const k = String(key).toLowerCase();
    if (!value) continue;
    for (const n of needles) {
      if (k.includes(n)) return String(value).trim();
    }
  }
  return "";
}

function guessPhone(row) {
  const entries = Object.entries(row);
  for (const [, value] of entries) {
    if (!value) continue;
    const v = String(value).replace(/\s+/g, "");
    // crude Ghana-ish phone check
    if (/^(0|\+?233)\d{8,9}$/.test(v)) return v;
  }
  return "";
}

function guessNames(row) {
  // Try by headers first
  const lastName =
    pickByHeader(row, ["surname", "last name", "lastname", "last"]) || "";
  const firstName =
    pickByHeader(row, ["first name", "firstname", "other names", "othernames", "first"]) ||
    "";

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  // Fallback: first two non-empty string cells
  const vals = Object.values(row)
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  if (vals.length >= 2) {
    return { lastName: vals[0], firstName: vals[1] };
  }

  return { firstName: "", lastName: "" };
}

function loadGuardianRows(excelFile, label) {
  const fullPath = path.join(IMPORT_DIR, excelFile);
  console.log(`Loading guardian rows from ${excelFile} (${label})`);

  if (!fs.existsSync(fullPath)) {
    console.warn(`  ⚠️ File not found: ${fullPath} – skipping.`);
    return [];
  }

  const wb = XLSX.readFile(fullPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const usable = [];

  for (const raw of rawRows) {
    const { firstName, lastName } = guessNames(raw);
    const guardianName =
      pickByHeader(raw, ["guardian", "parent", "father", "mother"]) || "";
    const guardianPhone =
      pickByHeader(raw, ["phone", "contact", "tel", "mobile"]) ||
      guessPhone(raw);
    const sex =
      pickByHeader(raw, ["sex", "gender"])
        .toUpperCase()
        .replace(/\s+/g, "") || "";

    const fullName = `${firstName} ${lastName}`.trim();

    if (!fullName) continue;

    usable.push({
      label,
      firstName,
      lastName,
      fullName,
      guardianName: guardianName || "",
      guardianPhone: guardianPhone || "",
      sex: sex || "",
    });
  }

  console.log(
    `Loaded ${usable.length} usable rows from ${excelFile} (${label})`
  );

  return usable;
}

async function main() {
  console.log("Starting Ayitikope JHS guardian info update...");

  // 1) Load all students for this tenant and index by full name
  const students = await prisma.student.findMany({
    where: {
      tenantId: AYITIKOPE_TENANT_ID,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  const studentByName = new Map();
  for (const s of students) {
    const full = normaliseName(`${s.firstName} ${s.lastName}`);
    if (full) {
      studentByName.set(full, { id: s.id, firstName: s.firstName, lastName: s.lastName });
    }
  }

  console.log(
    `Indexed ${studentByName.size} students by full name (first + last).`
  );

  // 2) Load guardian rows from the three Excel files
  const guardianRows = [
    ...loadGuardianRows("Basic 7_Admission_T1_79.xlsx", "Basic 7"),
    ...loadGuardianRows("Basic 8_Admission_T1_32.xlsx", "Basic 8"),
    ...loadGuardianRows("Basic 9_Admission_T1_15.xlsx", "Basic 9"),
  ];

  console.log(
    `Total Excel rows considered for guardian update: ${guardianRows.length}`
  );

  let matched = 0;
  let updated = 0;
  let noMatch = 0;

  for (const row of guardianRows) {
    const key = normaliseName(row.fullName);
    const student = studentByName.get(key);

    if (!student) {
      noMatch++;
      continue;
    }

    matched++;

    /** @type {import("@prisma/client").Prisma.StudentUpdateInput} */
    const updateData = {};

    if (row.guardianName) {
      updateData.guardianName = row.guardianName;
    }
    if (row.guardianPhone) {
      updateData.guardianPhone = row.guardianPhone;
      updateData.guardianSmsOptIn = true;
    }
    if (row.sex) {
      // Normalise to "Male" / "Female" if possible
      const sx = row.sex.toUpperCase();
      if (sx.startsWith("M")) updateData.sex = "Male";
      else if (sx.startsWith("F")) updateData.sex = "Female";
      else updateData.sex = row.sex;
    }

    // If nothing to update, skip
    if (Object.keys(updateData).length === 0) continue;

    await prisma.student.update({
      where: { id: student.id },
      data: updateData,
    });

    updated++;
  }

  console.log("---------- Summary ----------");
  console.log(`Students matched by name : ${matched}`);
  console.log(`Student records updated  : ${updated}`);
  console.log(`Rows with no student match: ${noMatch}`);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Fatal error in guardian update script:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
