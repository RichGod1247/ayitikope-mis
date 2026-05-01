// src/app/api/admin/paystack/create-subaccount/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  tenantId?: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  businessName?: string;
  percentageCharge?: number;
  primaryContactEmail?: string;
  primaryContactName?: string;
  primaryContactPhone?: string;
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function digitsOnly(v: unknown) {
  return clean(v).replace(/\D/g, "");
}

function last4(v: string) {
  return v.length >= 4 ? v.slice(-4) : v;
}

function safePercentage(v: unknown) {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  if (v < 0 || v > 100) return 0;
  return v;
}

function redactAccountNumber(v: string) {
  if (!v) return null;
  return `****${last4(v)}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!paystackSecret) {
    return json(
      { ok: false, error: "PAYSTACK_SECRET_KEY_NOT_CONFIGURED" },
      500
    );
  }

  if (!paystackSecret.startsWith("sk_test_") && !paystackSecret.startsWith("sk_live_")) {
    return json({ ok: false, error: "INVALID_PAYSTACK_SECRET_KEY" }, 500);
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const tenantId = clean(body.tenantId);
  const bankCode = clean(body.bankCode);
  const bankName = clean(body.bankName);
  const accountNumber = digitsOnly(body.accountNumber);
  const accountName = clean(body.accountName);
  const businessName = clean(body.businessName) || accountName;
  const percentageCharge = safePercentage(body.percentageCharge);

  if (!tenantId) return json({ ok: false, error: "TENANT_ID_REQUIRED" }, 400);
  if (!bankCode) return json({ ok: false, error: "BANK_CODE_REQUIRED" }, 400);
  if (!accountNumber) {
    return json({ ok: false, error: "ACCOUNT_NUMBER_REQUIRED" }, 400);
  }
  if (accountNumber.length < 6 || accountNumber.length > 20) {
    return json({ ok: false, error: "INVALID_ACCOUNT_NUMBER_LENGTH" }, 400);
  }
  if (!businessName) {
    return json({ ok: false, error: "BUSINESS_OR_ACCOUNT_NAME_REQUIRED" }, 400);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      status: true,
      contactEmail: true,
      contactPhoneNorm: true,
    },
  });

  if (!tenant) return json({ ok: false, error: "TENANT_NOT_FOUND" }, 404);
  if (tenant.status !== "ACTIVE") {
    return json({ ok: false, error: "TENANT_NOT_ACTIVE" }, 409);
  }

  const existingActive = await prisma.tenantSettlementAccount.findFirst({
    where: {
      tenantId,
      provider: "PAYSTACK",
      status: "ACTIVE",
      isPrimary: true,
    },
    select: {
      id: true,
      providerSubaccountCode: true,
      accountName: true,
      accountNumberLast4: true,
      bankCode: true,
      bankName: true,
      status: true,
      isPrimary: true,
    },
  });

  if (existingActive?.providerSubaccountCode) {
    return json(
      {
        ok: false,
        error: "PRIMARY_PAYSTACK_SETTLEMENT_ACCOUNT_ALREADY_EXISTS",
        settlementAccount: existingActive,
      },
      409
    );
  }

  const paystackPayload = {
    business_name: businessName,
    bank_code: bankCode,
    account_number: accountNumber,
    percentage_charge: percentageCharge,
    description: `EduLife OS school fee settlement account for ${tenant.name} (${tenant.schoolCode})`,
    primary_contact_email: clean(body.primaryContactEmail) || tenant.contactEmail || undefined,
    primary_contact_name: clean(body.primaryContactName) || tenant.name,
    primary_contact_phone:
      clean(body.primaryContactPhone) || tenant.contactPhoneNorm || undefined,
    metadata: JSON.stringify({
      tenantId: tenant.id,
      schoolCode: tenant.schoolCode,
      source: "edulife_os_superadmin",
      purpose: "school_fee_settlement",
      requestedByUserId: auth.ctx.userId,
    }),
  };

  const psRes = await fetch("https://api.paystack.co/subaccount", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paystackPayload),
  });

  const psData = (await psRes.json().catch(() => null)) as any;

  if (!psRes.ok || !psData?.status || !psData?.data?.subaccount_code) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: auth.ctx.userId,
        action: "PAYSTACK_SUBACCOUNT_CREATE_FAILED",
        resource: "TenantSettlementAccount",
        resourceId: tenantId,
        ip: getIpFromHeaders(req.headers),
        userAgent: getUserAgentFromHeaders(req.headers),
        metadata: {
          provider: "PAYSTACK",
          httpStatus: psRes.status,
          paystackMessage: psData?.message ?? null,
          bankCode,
          bankName: bankName || null,
          accountName: accountName || businessName,
          accountNumberLast4: last4(accountNumber),
        } as any,
      },
    });

    return json(
      {
        ok: false,
        error: "PAYSTACK_SUBACCOUNT_CREATE_FAILED",
        message: psData?.message ?? null,
      },
      502
    );
  }

  const subaccountCode = clean(psData.data.subaccount_code);

  const settlementAccount = await prisma.$transaction(async (tx) => {
    await tx.tenantSettlementAccount.updateMany({
      where: {
        tenantId,
        provider: "PAYSTACK",
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });

    const created = await tx.tenantSettlementAccount.create({
      data: {
        tenantId,
        provider: "PAYSTACK",
        providerSubaccountCode: subaccountCode,
        bankCode,
        bankName:
          bankName ||
          clean(psData.data.settlement_bank) ||
          clean(psData.data.bank?.name) ||
          null,
        accountName:
          accountName ||
          clean(psData.data.account_name) ||
          clean(psData.data.business_name) ||
          businessName,
        accountNumberLast4: last4(accountNumber),
        accountNumberEncrypted: null,
        currency: clean(psData.data.currency) || "GHS",
        status: "ACTIVE",
        isPrimary: true,
        requestedByUserId: auth.ctx.userId,
        approvedByUserId: auth.ctx.userId,
        approvedAt: new Date(),
        metadata: {
          provider: "PAYSTACK",
          paystack: psData,
          redactedInput: {
            businessName,
            bankCode,
            bankName: bankName || null,
            accountName: accountName || null,
            accountNumber: redactAccountNumber(accountNumber),
            percentageCharge,
          },
        } as any,
      },
      select: {
        id: true,
        tenantId: true,
        provider: true,
        providerSubaccountCode: true,
        bankCode: true,
        bankName: true,
        accountName: true,
        accountNumberLast4: true,
        currency: true,
        status: true,
        isPrimary: true,
        approvedAt: true,
        createdAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        userId: auth.ctx.userId,
        action: "PAYSTACK_SUBACCOUNT_CREATED",
        resource: "TenantSettlementAccount",
        resourceId: created.id,
        ip: getIpFromHeaders(req.headers),
        userAgent: getUserAgentFromHeaders(req.headers),
        metadata: {
          provider: "PAYSTACK",
          tenantId,
          schoolCode: tenant.schoolCode,
          settlementAccountId: created.id,
          providerSubaccountCode: subaccountCode,
          bankCode,
          bankName: created.bankName,
          accountName: created.accountName,
          accountNumberLast4: created.accountNumberLast4,
          percentageCharge,
        } as any,
      },
    });

    return created;
  });

  return json({
    ok: true,
    settlementAccount,
  });
}