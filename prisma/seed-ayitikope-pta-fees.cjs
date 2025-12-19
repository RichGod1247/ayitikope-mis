/* prisma/seed-ayitikope-pta-fees.cjs */
/* eslint-disable */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// -----------------------------
// CONFIG: Ayitikope JHS PTA/printing fees
// -----------------------------
const TENANT_ID = "cmhhnghn00008vcpgp3fl07fl"; // Ayitikope
const TERM = "1st Term";
const ACADEMIC_YEAR = "2025/2026";

// GH₵ amounts
const PTA_PRINTING_AMOUNT_GHC = 80;  // total billed per learner
const EXAMPLE_PAYMENT_GHC = 40;      // partial payment for demo (first few learners)

// Helper: convert GH₵ → pesewas (int)
function cedis(ghc) {
  return Math.round(Number(ghc) * 100);
}

async function main() {
  console.log("Starting PTA/printing fee seeding for Ayitikope…");
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Term: ${TERM}, Academic year: ${ACADEMIC_YEAR}`);

  // 1) Load all students for this tenant
  const students = await prisma.student.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true },
  });

  console.log(`Found ${students.length} students.`);

  // 2) Clean existing invoices & payments for this term/year
  console.log("Cleaning existing invoices & payments for this term/year…");

  const oldInvoices = await prisma.feeInvoice.findMany({
    where: {
      tenantId: TENANT_ID,
      term: TERM,
      academicYear: ACADEMIC_YEAR,
    },
    select: { id: true },
  });

  if (oldInvoices.length > 0) {
    const invoiceIds = oldInvoices.map((i) => i.id);

    await prisma.feePayment.deleteMany({
      where: {
        tenantId: TENANT_ID,
        invoiceId: { in: invoiceIds },
      },
    });

    await prisma.feeInvoice.deleteMany({
      where: {
        tenantId: TENANT_ID,
        term: TERM,
        academicYear: ACADEMIC_YEAR,
      },
    });

    console.log(
      `Deleted ${oldInvoices.length} existing invoices and all linked payments for this term/year.`
    );
  } else {
    console.log("No existing invoices found for this term/year – fresh start.");
  }

  // 3) Seed PTA/printing invoice for every learner
  console.log(
    `Billing each learner GH₵${PTA_PRINTING_AMOUNT_GHC.toFixed(
      2
    )} (PTA + printing) for ${TERM} ${ACADEMIC_YEAR}.`
  );

  const billedAmountPesewas = cedis(PTA_PRINTING_AMOUNT_GHC);
  const examplePaymentPesewas = cedis(EXAMPLE_PAYMENT_GHC);

  let createdInvoices = 0;
  let createdPayments = 0;

  for (const student of students) {
    // Create invoice
    const invoice = await prisma.feeInvoice.create({
      data: {
        tenantId: TENANT_ID,
        studentId: student.id,
        term: TERM,
        academicYear: ACADEMIC_YEAR,
        totalBilledPesewas: billedAmountPesewas,
        totalWaivedPesewas: 0,
      },
    });
    createdInvoices++;

    // OPTIONAL: create a partial payment demo for first 10 learners
    // (so parents/teachers can see "amount paid" in the UI)
    if (createdInvoices <= 10) {
      await prisma.feePayment.create({
        data: {
          tenantId: TENANT_ID,
          invoiceId: invoice.id,
          amountPesewas: examplePaymentPesewas,
          paidAt: new Date("2025-02-15T08:00:00.000Z"),
          // IMPORTANT: method is REQUIRED by your Prisma schema
          // You can later extend this to "MOMO", "BANK", etc.
          method: "CASH",
        },
      });
      createdPayments++;
    }
  }

  console.log(`Created ${createdInvoices} PTA/printing invoices.`);
  console.log(
    `Created ${createdPayments} example payments (GH₵${EXAMPLE_PAYMENT_GHC.toFixed(
      2
    )} each) for the first ${createdPayments} learners.`
  );
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("Fatal error in PTA seeding script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
