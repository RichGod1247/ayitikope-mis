// src/app/api/admin/fees/reconciliation/exceptions/[exceptionId]/repair-receipt/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { recalculateInvoiceTotals } from "@/lib/finance/core";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Tx = Prisma.TransactionClient;

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function makeJournalRef(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

function makeReceiptNumber(schoolCode: string) {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${schoolCode.toUpperCase()}-${yyyymmdd}-${rand}`;
}

async function createUniqueReceiptNumber(tx: Tx, tenantId: string, schoolCode: string) {
  for (let i = 0; i < 10; i++) {
    const receiptNumber = makeReceiptNumber(schoolCode);
    const existing = await tx.receipt.findFirst({
      where: { tenantId, receiptNumber },
      select: { id: true },
    });

    if (!existing) return receiptNumber;
  }

  throw new Error("FAILED_TO_GENERATE_RECEIPT_NUMBER");
}

async function getParams(ctx: {
  params: Promise<{ exceptionId: string }> | { exceptionId: string };
}) {
  return await ctx.params;
}

async function autoCloseBatchIfReady(
  tx: Tx,
  input: {
    tenantId: string;
    batchId: string | null;
    actorUserId: string;
    trigger: string;
    exceptionId: string;
    receiptId?: string | null;
    receiptNumber?: string | null;
  }
) {
  if (!input.batchId) return false;

  const activeCount = await tx.reconciliationException.count({
    where: {
      tenantId: input.tenantId,
      batchId: input.batchId,
      status: { in: ["OPEN", "INVESTIGATING"] },
    },
  });

  if (activeCount !== 0) return false;

  const closedAt = new Date();

  const updated = await tx.reconciliationBatch.updateMany({
    where: {
      id: input.batchId,
      tenantId: input.tenantId,
      closedAt: null,
      status: { not: "CLOSED" },
    },
    data: {
      status: "CLOSED",
      closedAt,
    },
  });

  if (updated.count === 0) return false;

  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "FINANCE_RECONCILIATION_BATCH_AUTO_CLOSED",
      resource: "ReconciliationBatch",
      resourceId: input.batchId,
      metadata: {
        trigger: input.trigger,
        exceptionId: input.exceptionId,
        receiptId: input.receiptId ?? null,
        receiptNumber: input.receiptNumber ?? null,
        activeExceptionCountAfterAction: activeCount,
        closedAt: closedAt.toISOString(),
      },
    },
  });

  return true;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ exceptionId: string }> | { exceptionId: string } }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { exceptionId } = await getParams(ctx);
  const tenantId = auth.ctx.tenantId;
  const actorUserId = auth.ctx.userId;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const exception = await tx.reconciliationException.findFirst({
          where: { id: exceptionId, tenantId },
          select: {
            id: true,
            kind: true,
            status: true,
            batchId: true,
            invoiceId: true,
            providerReference: true,
            expectedPesewas: true,
            batch: { select: { id: true, status: true, closedAt: true } },
          },
        });

        if (!exception) {
          return { ok: false as const, status: 404, error: "EXCEPTION_NOT_FOUND" };
        }

        if (exception.kind !== "PAYMENT_WITHOUT_RECEIPT") {
          return { ok: false as const, status: 409, error: "UNSUPPORTED_REPAIR_ACTION" };
        }

        if (!exception.invoiceId) {
          return { ok: false as const, status: 409, error: "EXCEPTION_HAS_NO_INVOICE" };
        }

        if (exception.batch?.closedAt || exception.batch?.status === "CLOSED") {
          return { ok: false as const, status: 409, error: "BATCH_ALREADY_CLOSED" };
        }

        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, name: true, schoolCode: true },
        });

        if (!tenant) {
          return { ok: false as const, status: 404, error: "TENANT_NOT_FOUND" };
        }

        const invoice = await tx.feeInvoice.findFirst({
          where: { id: exception.invoiceId, tenantId },
          select: {
            id: true,
            tenantId: true,
            studentId: true,
            term: true,
            academicYear: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
                classroom: { select: { name: true, grade: true, arm: true } },
              },
            },
          },
        });

        if (!invoice) {
          return { ok: false as const, status: 404, error: "INVOICE_NOT_FOUND" };
        }

        const payment = await tx.feePayment.findFirst({
          where: {
            tenantId,
            invoiceId: invoice.id,
            status: "SUCCESS",
            receipt: null,
            ...(exception.providerReference ? { reference: exception.providerReference } : {}),
            ...(exception.expectedPesewas ? { amountPesewas: exception.expectedPesewas } : {}),
          },
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
          },
          orderBy: { paidAt: "desc" },
        });

        if (!payment) {
          const existingReceipt = await tx.receipt.findFirst({
            where: {
              tenantId,
              invoiceId: invoice.id,
              feePayment: {
                status: "SUCCESS",
                ...(exception.providerReference ? { reference: exception.providerReference } : {}),
              },
            },
            select: { id: true, receiptNumber: true },
          });

          if (existingReceipt) {
            const updated = await tx.reconciliationException.update({
              where: { id: exception.id },
              data: {
                status: "RESOLVED",
                resolutionNote:
                  `Receipt already exists: ${existingReceipt.receiptNumber}. ` +
                  "Exception resolved without creating a duplicate receipt.",
                resolvedByUserId: actorUserId,
                resolvedAt: new Date(),
              },
              select: { id: true, status: true },
            });

            await tx.auditLog.create({
              data: {
                tenantId,
                userId: actorUserId,
                action: "FINANCE_RECONCILIATION_EXCEPTION_REPAIR_NOOP",
                resource: "ReconciliationException",
                resourceId: exception.id,
                metadata: {
                  repairType: "PAYMENT_WITHOUT_RECEIPT",
                  batchId: exception.batchId,
                  invoiceId: invoice.id,
                  receiptId: existingReceipt.id,
                  receiptNumber: existingReceipt.receiptNumber,
                  previousExceptionStatus: exception.status,
                  nextExceptionStatus: "RESOLVED",
                  reason: "Receipt already existed, so no duplicate receipt was created.",
                },
              },
            });

            const batchAutoClosed = await autoCloseBatchIfReady(tx, {
              tenantId,
              batchId: exception.batchId,
              actorUserId,
              trigger: "REPAIR_RECEIPT_NOOP_EXISTING_RECEIPT",
              exceptionId: exception.id,
              receiptId: existingReceipt.id,
              receiptNumber: existingReceipt.receiptNumber,
            });

            return {
              ok: true as const,
              repaired: false,
              alreadyHadReceipt: true,
              batchAutoClosed,
              exception: updated,
              receipt: existingReceipt,
              smsPayload: null,
            };
          }

          return {
            ok: false as const,
            status: 404,
            error: "SUCCESSFUL_PAYMENT_WITHOUT_RECEIPT_NOT_FOUND",
          };
        }

        const studentName =
          [invoice.student?.firstName, invoice.student?.lastName].filter(Boolean).join(" ").trim() ||
          "Student";

        const guardianPhone =
          invoice.student?.guardianPhoneNorm || invoice.student?.guardianPhone || null;

        const receiptNumber = await createUniqueReceiptNumber(tx, tenantId, tenant.schoolCode);

        const receipt = await tx.receipt.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            feePaymentId: payment.id,
            receiptNumber,
            issuedToName: studentName,
            issuedToPhone: guardianPhone,
            issuedByUserId: actorUserId,
            note:
              `Repair receipt created from reconciliation exception ${exception.id}. ` +
              (payment.reference ? `Payment reference: ${payment.reference}` : ""),
          },
          select: {
            id: true,
            receiptNumber: true,
            issuedAt: true,
          },
        });

        const existingLedgers = await tx.ledgerEntry.findMany({
          where: {
            tenantId,
            invoiceId: invoice.id,
            feePaymentId: payment.id,
            entryType: "PAYMENT_CREDIT",
            direction: "CREDIT",
          },
          select: {
            id: true,
            receiptId: true,
            amountPesewas: true,
          },
        });

        const ledgerLinkedElsewhere = existingLedgers.find(
          (entry) => entry.receiptId && entry.receiptId !== receipt.id
        );

        if (ledgerLinkedElsewhere) {
          throw new Error("PAYMENT_LEDGER_ALREADY_LINKED_TO_DIFFERENT_RECEIPT");
        }

        if (existingLedgers.length > 0) {
          await tx.ledgerEntry.updateMany({
            where: {
              tenantId,
              invoiceId: invoice.id,
              feePaymentId: payment.id,
              entryType: "PAYMENT_CREDIT",
              direction: "CREDIT",
              receiptId: null,
            },
            data: { receiptId: receipt.id },
          });
        } else {
          await tx.ledgerEntry.create({
            data: {
              tenantId,
              invoiceId: invoice.id,
              studentId: invoice.studentId,
              feePaymentId: payment.id,
              receiptId: receipt.id,
              entryType: "PAYMENT_CREDIT",
              direction: "CREDIT",
              amountPesewas: payment.amountPesewas,
              description: `Repair ledger link for payment${
                payment.reference ? ` (ref: ${payment.reference})` : ""
              }`,
              journalRef: makeJournalRef("PAY"),
              createdByUserId: actorUserId,
            },
          });
        }

        const invoiceAfter = await recalculateInvoiceTotals(tx, tenantId, invoice.id);

        const updatedException = await tx.reconciliationException.update({
          where: { id: exception.id },
          data: {
            status: "RESOLVED",
            resolutionNote: `Missing receipt created safely. Receipt ${receipt.receiptNumber}.`,
            resolvedByUserId: actorUserId,
            resolvedAt: new Date(),
          },
          select: {
            id: true,
            status: true,
            resolutionNote: true,
            resolvedAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actorUserId,
            action: "FINANCE_RECONCILIATION_EXCEPTION_REPAIRED",
            resource: "ReconciliationException",
            resourceId: exception.id,
            metadata: {
              repairType: "PAYMENT_WITHOUT_RECEIPT",
              batchId: exception.batchId,
              invoiceId: invoice.id,
              paymentId: payment.id,
              receiptId: receipt.id,
              receiptNumber: receipt.receiptNumber,
              amountPesewas: payment.amountPesewas,
              providerReference: payment.reference,
              previousExceptionStatus: exception.status,
              nextExceptionStatus: "RESOLVED",
              invoiceStatusAfter: invoiceAfter.status,
              invoiceBalanceAfterPesewas: invoiceAfter.balancePesewas,
              ledgerAction: existingLedgers.length > 0 ? "LINKED_EXISTING_LEDGER" : "CREATED_LEDGER",
            },
          },
        });

        const batchAutoClosed = await autoCloseBatchIfReady(tx, {
          tenantId,
          batchId: exception.batchId,
          actorUserId,
          trigger: "REPAIR_RECEIPT_CREATED_RECEIPT",
          exceptionId: exception.id,
          receiptId: receipt.id,
          receiptNumber: receipt.receiptNumber,
        });

        return {
          ok: true as const,
          repaired: true,
          alreadyHadReceipt: false,
          batchAutoClosed,
          exception: updatedException,
          receipt,
          smsPayload: guardianPhone
            ? {
                to: guardianPhone,
                tenantName: tenant.name,
                studentName,
                classLabel:
                  invoice.student?.classroom?.name ||
                  invoice.student?.classroom?.grade ||
                  "Class",
                term: invoice.term,
                academicYear: invoice.academicYear,
                amountPesewas: payment.amountPesewas,
                outstandingPesewas: invoiceAfter.balancePesewas,
                receiptId: receipt.id,
                receiptNumber: receipt.receiptNumber,
              }
            : null,
        };
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      }
    );

    if (!result.ok) {
      return json(result.status, { ok: false, error: result.error });
    }

    if (result.repaired && result.smsPayload) {
      const amountCedis = (result.smsPayload.amountPesewas / 100).toFixed(2);
      const outstandingCedis = (result.smsPayload.outstandingPesewas / 100).toFixed(2);

      sendSms({
        tenantId,
        actorId: actorUserId,
        to: result.smsPayload.to,
        message:
          `EduLife OS: Receipt ${result.smsPayload.receiptNumber} has been issued for ` +
          `GHS ${amountCedis} paid for ${result.smsPayload.studentName} ` +
          `(${result.smsPayload.classLabel}) - ${result.smsPayload.term} ` +
          `${result.smsPayload.academicYear}. Balance: GHS ${outstandingCedis}. ` +
          `School: ${result.smsPayload.tenantName}. Keep this SMS as proof.`,
        template: "FEES_RECEIPT_REPAIR",
        payload: {
          receiptId: result.smsPayload.receiptId,
          receiptNumber: result.smsPayload.receiptNumber,
          amountPesewas: result.smsPayload.amountPesewas,
          outstandingPesewas: result.smsPayload.outstandingPesewas,
          source: "RECONCILIATION_REPAIR",
        },
      }).catch((err) => {
        console.error("[RECONCILIATION_REPAIR_SMS_ERROR]", err);
      });
    }

    return json(200, {
      ok: true,
      repaired: result.repaired,
      alreadyHadReceipt: result.alreadyHadReceipt,
      batchAutoClosed: result.batchAutoClosed,
      receipt: result.receipt,
      exception: result.exception,
    });
  } catch (err) {
    console.error("[RECONCILIATION_REPAIR_RECEIPT_ERROR]", err);

    const message = err instanceof Error ? err.message : "";
    if (message === "PAYMENT_LEDGER_ALREADY_LINKED_TO_DIFFERENT_RECEIPT") {
      return json(409, {
        ok: false,
        error: "PAYMENT_LEDGER_ALREADY_LINKED_TO_DIFFERENT_RECEIPT",
      });
    }

    if (message === "FAILED_TO_GENERATE_RECEIPT_NUMBER") {
      return json(500, { ok: false, error: "FAILED_TO_GENERATE_RECEIPT_NUMBER" });
    }

    return json(500, { ok: false, error: "FAILED_TO_REPAIR_RECEIPT" });
  }
}