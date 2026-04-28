import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS edulife_os."Receipt" (
      "id" text PRIMARY KEY,
      "tenantId" text NOT NULL,
      "invoiceId" text NOT NULL,
      "feePaymentId" text NOT NULL UNIQUE,
      "paymentIntentId" text,
      "receiptNumber" varchar(40) NOT NULL UNIQUE,
      "issuedAt" timestamptz NOT NULL DEFAULT now(),
      "issuedToName" text,
      "issuedToPhone" varchar(32),
      "issuedByUserId" text,
      "note" text,
      CONSTRAINT receipt_tenant_fk FOREIGN KEY ("tenantId") REFERENCES edulife_os."Tenant"("id") ON DELETE CASCADE,
      CONSTRAINT receipt_invoice_fk FOREIGN KEY ("invoiceId") REFERENCES edulife_os."FeeInvoice"("id") ON DELETE CASCADE,
      CONSTRAINT receipt_payment_fk FOREIGN KEY ("feePaymentId") REFERENCES edulife_os."FeePayment"("id") ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS receipt_tenant_issued_idx ON edulife_os."Receipt" ("tenantId", "issuedAt");
    CREATE INDEX IF NOT EXISTS receipt_tenant_invoice_idx ON edulife_os."Receipt" ("tenantId", "invoiceId");
  `);
  console.log("Receipt table created (or already exists).");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
