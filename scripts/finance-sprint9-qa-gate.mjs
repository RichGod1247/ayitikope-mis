// scripts/finance-sprint9-qa-gate.mjs
import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

const commands = [
  {
    label: "Prisma schema validation",
    command: "npx prisma validate",
  },
  {
    label: "Prisma client generation",
    command: "npx prisma generate",
  },
  {
    label: "TypeScript typecheck",
    command: "npm run typecheck",
  },
  {
    label: "Next.js production build",
    command: "npm run build",
  },
];

function run(step) {
  console.log(`\n▶ ${step.label}`);
  console.log(`$ ${step.command}\n`);

  const result = spawnSync(step.command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
    windowsHide: false,
  });

  if (result.error) {
    console.error(`\n✖ EXECUTION ERROR: ${step.label}`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\n✖ FAILED: ${step.label}`);
    console.error(`Exit code: ${result.status}`);
    process.exit(result.status ?? 1);
  }

  console.log(`\n✓ PASSED: ${step.label}`);
}

console.log("\nEduLife OS — Sprint 9 Finance QA Gate");
console.log("=====================================");
console.log("This gate verifies the technical build chain before manual finance proof.\n");

if (isWindows) {
  console.log("Running on Windows shell mode for reliable npm/npx execution.\n");
}

for (const step of commands) {
  run(step);
}

console.log("\nBank-grade manual finance proof checklist");
console.log("=========================================");
console.log(`
Run these checks before deployment or before starting USSD:

A. Invoice truth
[ ] Generate invoice for a test learner.
[ ] Confirm invoice lines and totals are correct.
[ ] Confirm archived fee structures cannot generate invoices.

B. Manual payment truth
[ ] Record manual payment with idempotency key.
[ ] Double-click/replay the payment action and confirm no duplicate money posting.
[ ] Confirm receipt is issued once.
[ ] Confirm ledger PAYMENT_CREDIT appears once.
[ ] Confirm SMS receipt outbox event completes once.
[ ] Confirm parent receives receipt SMS.
[ ] Confirm audit log shows receipt/payment evidence.

C. Parent receipt truth
[ ] Open /parent/fees.
[ ] Open /parent/receipts.
[ ] Open /parent/receipts/[receiptId].
[ ] Download receipt PDF.
[ ] Confirm list, detail, PDF, and admin receipt register agree.

D. Refund truth
[ ] Request partial refund.
[ ] Confirm requester cannot approve own refund where applicable.
[ ] Approve refund.
[ ] Execute refund.
[ ] Sync refund if Paystack status is pending/processing.
[ ] Confirm REVERSAL_DEBIT ledger entry appears once.
[ ] Confirm receipt status becomes PARTIALLY_REFUNDED.
[ ] Confirm parent views and PDF show gross paid, refunded, and net paid.
[ ] Repeat with full refund and confirm REFUNDED status.

E. Admin finance truth
[ ] /admin/fees/overview agrees.
[ ] /admin/fees/summary agrees.
[ ] /admin/fees/receipts agrees.
[ ] /admin/fees/ledger agrees.
[ ] /admin/fees/settlements agrees.
[ ] /admin/fees/audit shows evidence chain.
[ ] /admin/fees/disputes explains remaining risks.
[ ] /admin/fees/reconciliation can save, investigate, repair, resolve, or dismiss cases correctly.
[ ] /admin/fees/reconciliation/history shows batch evidence timeline.

F. Outbox and cron truth
[ ] /admin/fees/outbox shows receipt/refund SMS events.
[ ] Run worker returns expected claimed/completed/failed values.
[ ] Authorized cron call works with FINANCE_OUTBOX_CRON_SECRET.
[ ] Unauthorized cron call returns 401.
[ ] Completed outbox events are not reopened by duplicate enqueue.
[ ] Failed/dead events can be retried safely.

G. Provider event truth
[ ] /admin/fees/provider-events loads.
[ ] Received/failed provider events are recoverable.
[ ] Processed/ignored events cannot be reprocessed.
[ ] Provider event reprocess creates audit evidence.
[ ] Duplicate provider-reference race is auditable.
[ ] Refund webhook failure path records recoverable evidence.

H. Final decision
[ ] If all checks pass, Sprint 9 Phase F finance trust spine is ready for final USSD planning.
[ ] If any check fails, do not start USSD.
`);

console.log("\n✓ Technical finance QA gate passed.");
console.log("Now complete the manual checklist above.\n");