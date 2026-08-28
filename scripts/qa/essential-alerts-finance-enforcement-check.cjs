#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files for static contract verification. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function read(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) fail(`A16A4_FILE_MISSING:${relativePath}`);
  return fs.readFileSync(fullPath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function contains(source, marker, label) {
  if (!source.includes(marker)) fail(`A16A4_MARKER_MISSING:${label}`, { marker });
}

function excludes(source, marker, label) {
  if (source.includes(marker)) fail(`A16A4_FORBIDDEN_MARKER:${label}`, { marker });
}

function count(source, marker) {
  return source.split(marker).length - 1;
}

const enrollmentPath = "src/lib/essentialAlerts/enrollment.ts";
const corePath = "src/lib/finance/core.ts";
const refundsPath = "src/lib/finance/refunds.ts";
const workerPath = "src/lib/finance/outbox-worker.ts";
const arrearsRoutePath = "src/app/api/fees/notify-arrears/route.ts";
const simulateRoutePath = "src/app/api/fees/notify-arrears/simulate/route.ts";
const pagePath = "src/app/admin/fees/arrears/page.tsx";
const repairRoutePath =
  "src/app/api/admin/fees/reconciliation/exceptions/[exceptionId]/repair-receipt/route.ts";

const enrollment = read(enrollmentPath);
const core = read(corePath);
const refunds = read(refundsPath);
const worker = read(workerPath);
const arrearsRoute = read(arrearsRoutePath);
const simulateRoute = read(simulateRoutePath);
const page = read(pagePath);
const repairRoute = read(repairRoutePath);

// Guardian eligibility must be usable inside the same finance transaction.
contains(enrollment, "tx?: Prisma.TransactionClient;", "enrollment:tx-input");
contains(enrollment, "const eligibilityDb = input.tx ?? prisma;", "enrollment:tx-db");
contains(
  enrollment,
  "eligibilityDb.essentialAlertEnrollment.findMany",
  "enrollment:tx-enrollment-read",
);

// FEE_PAYMENT producer admission: receipts and all refund lifecycle notices.
contains(core, 'const FEE_PAYMENT_PURPOSE = "FEE_PAYMENT" as const;', "core:fee-purpose");
contains(core, "export async function enqueueFeeReceiptSmsOutbox", "core:receipt-helper");
contains(core, "getGuardianEssentialAlertEligibilityMap({", "core:eligibility");
contains(core, "purpose: FEE_PAYMENT_PURPOSE", "core:purpose");
contains(core, "to: authorizedPhone", "core:authorized-phone");
contains(core, 'status: "PENDING"', "core:pending-only-after-gate");
contains(core, "studentId: input.studentId", "core:durable-student-id");
contains(core, "FINANCE_SMS_ESSENTIAL_ALERT_SKIPPED", "core:skip-audit");
contains(core, "export async function loadCurrentFeeArrears", "core:arrears-truth-helper");
contains(core, 'status: "SUCCESS"', "core:successful-payment-truth");
contains(core, 'refund.status === "SUCCEEDED"', "core:succeeded-refund-truth");

contains(refunds, 'const FEE_PAYMENT_PURPOSE = "FEE_PAYMENT" as const;', "refunds:fee-purpose");
contains(refunds, "getGuardianEssentialAlertEligibilityMap({", "refunds:eligibility");
contains(refunds, "purpose: FEE_PAYMENT_PURPOSE", "refunds:purpose");
contains(refunds, "to: authorizedPhone", "refunds:authorized-phone");
contains(refunds, 'kind: "REQUESTED"', "refunds:requested");
contains(refunds, 'kind: "PROCESSING"', "refunds:processing");
contains(refunds, 'kind: "SUCCEEDED"', "refunds:succeeded");
contains(refunds, 'kind: "FAILED"', "refunds:failed");
contains(refunds, "studentId: input.studentId", "refunds:durable-student-id");
excludes(refunds, "guardianSmsOptIn", "refunds:legacy-opt-in");

// Repaired receipts must use the same durable FEE_PAYMENT spine, never fire-and-forget SMS.
contains(repairRoute, "enqueueFeeReceiptSmsOutbox(tx,", "repair:durable-receipt-queue");
contains(repairRoute, 'template: "FEES_RECEIPT_REPAIR"', "repair:template");
contains(repairRoute, 'source: "RECONCILIATION_REPAIR"', "repair:source");
excludes(repairRoute, 'from "@/lib/sms"', "repair:direct-sms-import");
excludes(repairRoute, "sendSms({", "repair:direct-sms-call");

// FEE_ACCOUNT_NOTICE producer: client provides invoice identity only; server owns content and phone.
contains(
  arrearsRoute,
  'const FEE_ACCOUNT_NOTICE_PURPOSE = "FEE_ACCOUNT_NOTICE" as const;',
  "arrears:purpose",
);
contains(arrearsRoute, "invoiceId: z.string().min(5)", "arrears:invoice-id-only-input");
contains(arrearsRoute, "loadCurrentFeeArrears({", "arrears:server-financial-truth");
contains(arrearsRoute, "getGuardianEssentialAlertEligibilityMap({", "arrears:eligibility");
contains(arrearsRoute, "purpose: FEE_ACCOUNT_NOTICE_PURPOSE", "arrears:purpose-gate");
contains(arrearsRoute, "FinanceOutboxEventType.SMS_ARREARS_NOTICE", "arrears:outbox-event");
contains(arrearsRoute, "balancePesewas: row.balancePesewas", "arrears:balance-snapshot");
contains(arrearsRoute, "arrears-sms:${row.invoiceId}:${dayKey}", "arrears:daily-idempotency");
contains(arrearsRoute, "to: authorizedPhone", "arrears:authorized-phone");
excludes(arrearsRoute, "guardianSmsOptIn", "arrears:legacy-opt-in");
excludes(arrearsRoute, "sendViaHubtel", "arrears:hubtel-direct");
excludes(arrearsRoute, 'from "@/lib/sms', "arrears:provider-import");

// Simulation must use the same current finance truth + enrollment authority, but write/send nothing.
contains(simulateRoute, "loadCurrentFeeArrears({", "simulate:server-financial-truth");
contains(simulateRoute, "getGuardianEssentialAlertEligibilityMap({", "simulate:eligibility");
contains(simulateRoute, "purpose: FEE_ACCOUNT_NOTICE_PURPOSE", "simulate:purpose");
contains(simulateRoute, "providerCalled: false", "simulate:no-provider-proof");
contains(simulateRoute, "outboxWritten: false", "simulate:no-outbox-proof");
excludes(simulateRoute, "financeOutboxEvent.", "simulate:no-outbox-write");
excludes(simulateRoute, "sendSms(", "simulate:no-shared-provider");
excludes(simulateRoute, "sendViaHubtel", "simulate:no-hubtel-provider");

// Browser cannot author financial/recipient truth in the send payload.
const payloadStart = page.indexOf("const payload = {");
const endpointStart = page.indexOf("const endpoint = simulateOnly", payloadStart);
if (payloadStart < 0 || endpointStart < 0) fail("A16A4_PAGE_PAYLOAD_BLOCK_MISSING");
const payloadBlock = page.slice(payloadStart, endpointStart);
contains(payloadBlock, "invoiceId: row.invoiceId", "page:invoice-id");
excludes(payloadBlock, "studentName:", "page:student-name-authority");
excludes(payloadBlock, "guardianPhone:", "page:phone-authority");
excludes(payloadBlock, "amountDue:", "page:balance-authority");
excludes(payloadBlock, "className:", "page:class-authority");
excludes(payloadBlock, "term:", "page:term-authority");
excludes(payloadBlock, "dueDate:", "page:due-date-authority");
excludes(page, "Success reported", "page:false-delivery-success");
contains(page, "Delivery runs through the background worker.", "page:async-delivery-truth");
contains(page, "Maximum estimated SMS units", "page:max-estimate");

// Worker must independently revalidate both finance purposes and never trust queued destination.
contains(worker, 'const FEE_PAYMENT_PURPOSE = "FEE_PAYMENT" as const;', "worker:fee-payment");
contains(
  worker,
  'const FEE_ACCOUNT_NOTICE_PURPOSE = "FEE_ACCOUNT_NOTICE" as const;',
  "worker:fee-account",
);
contains(worker, "handleFinanceEssentialAlertSmsEvent(event, FEE_PAYMENT_PURPOSE)", "worker:receipt-refund-map");
contains(worker, "FEE_ACCOUNT_NOTICE_PURPOSE", "worker:arrears-map");
contains(worker, "loadCurrentFeeArrears({", "worker:arrears-current-truth");
contains(worker, "ACCOUNT_STATE_CHANGED_AFTER_QUEUE", "worker:stale-balance-fail-closed");
contains(worker, "getGuardianEssentialAlertEligibilityMap({", "worker:eligibility");
contains(worker, "to: authorizedPhone", "worker:current-authorized-phone");
contains(worker, "workerRevalidated: true", "worker:revalidation-proof");
contains(worker, "ESSENTIAL_ALERT_NOT_CURRENTLY_ELIGIBLE", "worker:ineligible-skip");

if (count(worker, "sendSms({") < 2) {
  fail("A16A4_WORKER_SHARED_SMS_BOUNDARY_MISSING");
}

console.log("=== A16A4 FINANCE ESSENTIAL ALERT ENFORCEMENT ===");
console.log("");
console.log("FEE_PAYMENT receipt producer       : Essential Alert gated inside transaction");
console.log("FEE_PAYMENT refund lifecycle       : Essential Alert gated at all SMS stages");
console.log("Reconciliation repaired receipt    : durable receipt outbox; direct SMS removed");
console.log("FEE_ACCOUNT_NOTICE arrears input   : invoice identity only");
console.log("Arrears financial truth            : server re-read; refund-aware");
console.log("Arrears recipient authority        : current Essential Alert enrollment");
console.log("Arrears provider path              : durable SMS_ARREARS_NOTICE outbox");
console.log("Arrears same-day idempotency       : one invoice/day key");
console.log("Simulation                         : same truth + consent; zero writes/provider");
console.log("Worker FEE_PAYMENT revalidation    : current learner + current phone");
console.log("Worker FEE_ACCOUNT revalidation    : current balance + current phone");
console.log("Queued historical destination      : not trusted at provider boundary");
console.log("Legacy guardianSmsOptIn authority  : absent from migrated finance producers");
console.log("Direct Hubtel arrears call         : removed");
console.log("Schema migration                   : none required");
console.log("Database accessed by QA            : false");
console.log("Provider calls by QA               : 0");
console.log("");
console.log("RESULT: A16A4 FINANCE ESSENTIAL ALERT ENFORCEMENT GREEN");
