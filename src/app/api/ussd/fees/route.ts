// src/app/api/ussd/fees/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  digitsOnly,
  normalizeGhPhoneE164,
  suffix9Digits,
} from "@/lib/parentSession";
import {
  attachGatewayToPaymentIntent,
  createParentPaymentIntent,
  FinanceError,
} from "@/lib/finance/core";
import { sendSms } from "@/lib/sms";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawPayload = Record<string, unknown>;

type UssdStudent = {
  id: string;
  tenantId: string;
  firstName: string | null;
  lastName: string | null;
  guardianPhone: string | null;
  guardianPhoneNorm: string | null;
  classroom: { name: string | null; grade: string | null } | null;
};

type FeeSnapshot = {
  invoiceCount: number;
  balancePesewas: number;
  totalBilledPesewas: number;
  totalPaidPesewas: number;
  payableInvoiceId: string | null;
  payableInvoiceBalancePesewas: number;
};

type UssdRequestContext = {
  /** Optional pilot fallback. National-scale routing is phone-first. */
  tenantId: string | null;
  phoneRaw: string;
  phoneE164: string | null;
  phoneSuffix9: string;
  sessionId: string;
  serviceCode: string;
  text: string;
  term: string;
  academicYear: string;
};

type PaystackInitData = {
  authorization_url?: string;
  access_code?: string;
  reference?: string;
};

type PaystackInitResponse = {
  status: boolean;
  message?: string;
  data?: PaystackInitData;
};

const DEFAULT_TERM = "1st Term";
const DEFAULT_ACADEMIC_YEAR = "2025/2026";
const MAX_USSD_STUDENTS = 9;
const MAX_SCHOOL_SEARCH_RESULTS = 5;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const s = clean(value);
    if (s) return s;
  }
  return "";
}

function toQueryObject(req: NextRequest): RawPayload {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

async function readBody(req: NextRequest): Promise<RawPayload> {
  if (req.method === "GET" || req.method === "HEAD") return {};

  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as unknown;
      return body && typeof body === "object" && !Array.isArray(body)
        ? (body as RawPayload)
        : {};
    }

    const raw = await req.text();
    if (!raw.trim()) return {};

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      raw.includes("=")
    ) {
      return Object.fromEntries(new URLSearchParams(raw).entries());
    }

    return { text: raw };
  } catch {
    return {};
  }
}

function responseMode(): "plain" | "con_end" {
  return process.env.USSD_RESPONSE_MODE === "plain" ? "plain" : "con_end";
}

function ussdResponse(
  kind: "CON" | "END",
  message: string,
  status = 200,
): NextResponse {
  const body = responseMode() === "plain" ? message : `${kind} ${message}`;

  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function safeServiceUnavailable() {
  return ussdResponse(
    "END",
    "EduLife OS fees service is temporarily unavailable. Please try again later.",
  );
}

function allowQuerySecretForLocalDebug() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.USSD_ALLOW_QUERY_SECRET_IN_DEV === "true"
  );
}

function providedSecret(req: NextRequest, query: RawPayload, body: RawPayload) {
  const headerSecret = firstNonEmpty(
    req.headers.get("x-edulife-ussd-secret"),
    req.headers.get("x-ussd-secret"),
  );

  if (headerSecret) return headerSecret;

  // Query/body secrets are deliberately disabled by default because URLs can
  // leak into browser history, reverse-proxy logs, terminal request logs, and
  // analytics. Use only for temporary local browser debugging.
  if (!allowQuerySecretForLocalDebug()) return "";

  return firstNonEmpty(query.secret, query.signature, body.secret, body.signature);
}

function timingSafeSecretEqual(a: string, b: string) {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function expectedSecret() {
  return firstNonEmpty(
    process.env.USSD_SHARED_SECRET,
    process.env.PAYSTACK_USSD_SHARED_SECRET,
  );
}

function tenantIdFromRequest(query: RawPayload, body: RawPayload): string | null {
  const configuredTenant = clean(process.env.USSD_DEFAULT_TENANT_ID);
  if (configuredTenant) return configuredTenant;

  if (process.env.NODE_ENV !== "production") {
    return firstNonEmpty(body.tenantId, query.tenantId) || null;
  }

  return null;
}

function shouldForceDefaultTenant() {
  return process.env.USSD_FORCE_DEFAULT_TENANT === "true";
}

function termFromRequest(query: RawPayload, body: RawPayload) {
  return firstNonEmpty(
    body.term,
    query.term,
    process.env.USSD_DEFAULT_TERM,
    DEFAULT_TERM,
  );
}

function academicYearFromRequest(query: RawPayload, body: RawPayload) {
  return firstNonEmpty(
    body.academicYear,
    body.academic_year,
    query.academicYear,
    query.academic_year,
    process.env.USSD_DEFAULT_ACADEMIC_YEAR,
    DEFAULT_ACADEMIC_YEAR,
  );
}

function extractPhone(query: RawPayload, body: RawPayload) {
  return firstNonEmpty(
    body.phone,
    body.phoneNumber,
    body.msisdn,
    body.MSISDN,
    body.Mobile,
    body.MobileNumber,
    body.From,
    query.phone,
    query.phoneNumber,
    query.msisdn,
    query.MSISDN,
    query.Mobile,
    query.MobileNumber,
    query.From,
  );
}

function extractSessionId(query: RawPayload, body: RawPayload) {
  return firstNonEmpty(
    body.sessionId,
    body.session_id,
    body.SessionId,
    body.SessionID,
    body.session,
    query.sessionId,
    query.session_id,
    query.SessionId,
    query.SessionID,
    query.session,
    cryptoRandomShortId(),
  );
}

function extractServiceCode(query: RawPayload, body: RawPayload) {
  return firstNonEmpty(
    body.serviceCode,
    body.service_code,
    body.ServiceCode,
    body.shortCode,
    body.shortcode,
    query.serviceCode,
    query.service_code,
    query.ServiceCode,
    query.shortCode,
    query.shortcode,
  );
}

function extractText(query: RawPayload, body: RawPayload) {
  return firstNonEmpty(
    body.text,
    body.message,
    body.ussdString,
    body.ussd_string,
    body.UserData,
    body.userData,
    query.text,
    query.message,
    query.ussdString,
    query.ussd_string,
    query.UserData,
    query.userData,
  );
}

function cryptoRandomShortId() {
  return `local-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function splitUssdText(text: string): string[] {
  return clean(text)
    .split("*")
    .map((part) => part.trim())
    .filter(Boolean);
}

function studentName(student: Pick<UssdStudent, "firstName" | "lastName">) {
  return (
    [student.firstName, student.lastName].filter(Boolean).join(" ").trim() ||
    "Learner"
  );
}

function classLabel(student: Pick<UssdStudent, "classroom">) {
  return student.classroom?.name || student.classroom?.grade || "Class";
}

function formatGhs(pesewas: number) {
  const amount = (Math.max(0, Math.floor(pesewas)) / 100).toFixed(2);
  return amount.endsWith(".00") ? amount.slice(0, -3) : amount;
}

function parseGhsToPesewas(value: string): number | null {
  const s = clean(value).replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  const pesewas = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return Number.isSafeInteger(pesewas) && pesewas >= 100 ? pesewas : null;
}

function ownsStudentByPhone(input: {
  phoneRaw: string;
  phoneE164: string | null;
  phoneSuffix9: string;
  student: Pick<UssdStudent, "guardianPhone" | "guardianPhoneNorm">;
}) {
  const parentDigits = digitsOnly(input.phoneE164 ?? input.phoneRaw);
  const parentLast9 = parentDigits.slice(-9);
  const suffix9 = digitsOnly(input.phoneSuffix9);
  const studentNorm = digitsOnly(input.student.guardianPhoneNorm ?? "");
  const studentRaw = digitsOnly(input.student.guardianPhone ?? "");

  return (
    (parentLast9.length >= 7 &&
      (studentNorm.endsWith(parentLast9) ||
        studentRaw.endsWith(parentLast9))) ||
    (suffix9.length >= 7 &&
      (studentNorm.endsWith(suffix9) || studentRaw.endsWith(suffix9)))
  );
}

async function buildContext(
  req: NextRequest,
): Promise<UssdRequestContext | null> {
  const query = toQueryObject(req);
  const body = await readBody(req);

  const expected = expectedSecret();
  if (expected) {
    const provided = providedSecret(req, query, body);
    if (!provided || !timingSafeSecretEqual(provided, expected)) return null;
  } else if (process.env.NODE_ENV === "production") {
    console.error("[USSD_FEES] Missing USSD_SHARED_SECRET in production");
    return null;
  }

  const phoneRaw = extractPhone(query, body);
  const phoneE164 = normalizeGhPhoneE164(phoneRaw);
  const phoneSuffix9 = suffix9Digits(phoneRaw);

  if (!phoneRaw || digitsOnly(phoneSuffix9).length < 7) {
    return null;
  }

  return {
    tenantId: tenantIdFromRequest(query, body),
    phoneRaw,
    phoneE164,
    phoneSuffix9,
    sessionId: extractSessionId(query, body),
    serviceCode: extractServiceCode(query, body),
    text: extractText(query, body),
    term: termFromRequest(query, body),
    academicYear: academicYearFromRequest(query, body),
  };
}

async function loadStudentsForGuardian(
  ctx: UssdRequestContext,
): Promise<UssdStudent[]> {
  const suffix9 = digitsOnly(ctx.phoneSuffix9);
  const suffix7 = suffix9.slice(-7);

  const candidates = await prisma.student.findMany({
    where: {
      ...(ctx.tenantId && shouldForceDefaultTenant()
        ? { tenantId: ctx.tenantId }
        : {}),
      status: "ACTIVE",
      OR: [
        { guardianPhoneNorm: { contains: suffix9 } },
        { guardianPhone: { contains: suffix9 } },
        ...(suffix7.length >= 7
          ? [
              { guardianPhoneNorm: { contains: suffix7 } },
              { guardianPhone: { contains: suffix7 } },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      classroom: { select: { name: true, grade: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: 50,
  });

  return candidates
    .filter((student) =>
      ownsStudentByPhone({
        phoneRaw: ctx.phoneRaw,
        phoneE164: ctx.phoneE164,
        phoneSuffix9: ctx.phoneSuffix9,
        student,
      }),
    )
    .slice(0, MAX_USSD_STUDENTS);
}

async function getFeeSnapshot(input: {
  tenantId: string;
  studentId: string;
  term: string;
  academicYear: string;
}): Promise<FeeSnapshot> {
  const invoices = await prisma.feeInvoice.findMany({
    where: {
      tenantId: input.tenantId,
      studentId: input.studentId,
      term: input.term,
      academicYear: input.academicYear,
      status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
    },
    select: {
      id: true,
      totalBilledPesewas: true,
      totalPaidPesewas: true,
      balancePesewas: true,
      issuedAt: true,
      createdAt: true,
    },
    orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
    take: 50,
  });

  if (invoices.length === 0) {
    return {
      invoiceCount: 0,
      balancePesewas: 0,
      totalBilledPesewas: 0,
      totalPaidPesewas: 0,
      payableInvoiceId: null,
      payableInvoiceBalancePesewas: 0,
    };
  }

  const totals = invoices.reduce(
    (acc, invoice) => {
      acc.balancePesewas += Math.max(0, invoice.balancePesewas ?? 0);
      acc.totalBilledPesewas += Math.max(0, invoice.totalBilledPesewas ?? 0);
      acc.totalPaidPesewas += Math.max(0, invoice.totalPaidPesewas ?? 0);
      return acc;
    },
    {
      balancePesewas: 0,
      totalBilledPesewas: 0,
      totalPaidPesewas: 0,
    },
  );

  const payableInvoice = invoices.find(
    (invoice) => Math.max(0, invoice.balancePesewas ?? 0) > 0,
  );

  return {
    invoiceCount: invoices.length,
    balancePesewas: Math.max(0, totals.balancePesewas),
    totalBilledPesewas: Math.max(0, totals.totalBilledPesewas),
    totalPaidPesewas: Math.max(0, totals.totalPaidPesewas),
    payableInvoiceId: payableInvoice?.id ?? null,
    payableInvoiceBalancePesewas: Math.max(
      0,
      payableInvoice?.balancePesewas ?? 0,
    ),
  };
}

function mainMenu() {
  return ["EduLife OS Fees", "1. Check balance", "2. Pay fees"].join("\n");
}

function unmatchedPhoneMenu() {
  return [
    "EduLife OS",
    "No learner is linked to this phone.",
    "1. Search school/town",
    "2. Contact school office",
  ].join("\n");
}

function studentMenu(students: UssdStudent[], actionLabel: string) {
  return [
    `Select learner to ${actionLabel}:`,
    ...students.map(
      (student, index) =>
        `${index + 1}. ${studentName(student)} (${classLabel(student)})`,
    ),
  ].join("\n");
}

function studentAt(students: UssdStudent[], indexToken: string) {
  const index = Number(indexToken);
  if (!Number.isSafeInteger(index) || index < 1 || index > students.length) {
    return null;
  }
  return students[index - 1] ?? null;
}

async function searchSchools(searchTerm: string) {
  const q = clean(searchTerm).slice(0, 80);
  if (q.length < 2) return [];

  return prisma.tenant.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { schoolCode: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      schoolCode: true,
    },
    orderBy: { name: "asc" },
    take: MAX_SCHOOL_SEARCH_RESULTS,
  });
}

async function handleUnmatchedPhone(ctx: UssdRequestContext, tokens: string[]) {
  if (tokens.length === 0) return ussdResponse("CON", unmatchedPhoneMenu());

  if (tokens[0] === "1") {
    const searchTerm = tokens.slice(1).join(" ").trim();

    if (!searchTerm) {
      return ussdResponse("CON", "Enter school or town name:");
    }

    const schools = await searchSchools(searchTerm);
    if (schools.length === 0) {
      return ussdResponse(
        "END",
        "No matching school found. Contact your school office to link this phone number.",
      );
    }

    return ussdResponse(
      "END",
      [
        "Matching schools:",
        ...schools.map((school, index) => {
          const code = school.schoolCode ? ` - ${school.schoolCode}` : "";
          return `${index + 1}. ${school.name}${code}`;
        }),
        "Ask the school office to link this phone number to your learner.",
      ].join("\n"),
    );
  }

  if (tokens[0] === "2") {
    return ussdResponse(
      "END",
      "Please contact your school office to link this phone number to your learner before using EduLife OS USSD fees.",
    );
  }

  return ussdResponse("END", "Invalid option. Dial again and choose 1 or 2.");
}

async function showBalance(ctx: UssdRequestContext, student: UssdStudent) {
  const snapshot = await getFeeSnapshot({
    tenantId: student.tenantId,
    studentId: student.id,
    term: ctx.term,
    academicYear: ctx.academicYear,
  });

  if (snapshot.invoiceCount === 0) {
    return ussdResponse(
      "END",
      `${studentName(student)} has no posted fees for ${ctx.term} ${ctx.academicYear}.`,
    );
  }

  return ussdResponse(
    "END",
    `${studentName(student)}\n${ctx.term} ${ctx.academicYear}\nBalance: GHS ${formatGhs(
      snapshot.balancePesewas,
    )}\nPaid: GHS ${formatGhs(snapshot.totalPaidPesewas)}`,
  );
}

function paystackChannels() {
  const raw = clean(process.env.PAYSTACK_USSD_CHANNELS || "");
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAppUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    ""
  ).replace(/\/$/, "");
}

function validBearer(value: unknown): "account" | "subaccount" | undefined {
  const s = clean(value).toLowerCase();
  return s === "account" || s === "subaccount" ? s : undefined;
}

async function maybeSendPaymentLinkSms(input: {
  tenantId: string;
  to: string;
  studentName: string;
  amountPesewas: number;
  reference: string;
  authorizationUrl: string;
}) {
  if (process.env.USSD_SEND_PAYMENT_LINK_SMS !== "true") return;

  await sendSms({
    tenantId: input.tenantId,
    to: input.to,
    template: "USSD_PAYSTACK_PAYMENT_LINK",
    payload: {
      reference: input.reference,
      amountPesewas: input.amountPesewas,
      source: "paystack_ussd",
      channel: "ussd",
    },
    message: `EduLife OS: Pay GHS ${formatGhs(
      input.amountPesewas,
    )} for ${input.studentName}. Ref: ${input.reference}. Link: ${
      input.authorizationUrl
    }. Receipt follows after Paystack confirmation.`,
  });
}

function buildPaystackPayload(input: {
  amountPesewas: number;
  email: string;
  reference: string;
  currency: string;
  callbackUrl: string;
  subaccountCode: string;
  channels: string[];
  metadata: Record<string, unknown>;
}) {
  const bearer = validBearer(process.env.PAYSTACK_BEARER);

  const payload: Record<string, unknown> = {
    amount: input.amountPesewas,
    email: input.email,
    reference: input.reference,
    currency: input.currency,
    callback_url: input.callbackUrl,
    subaccount: input.subaccountCode,
    metadata: input.metadata,
  };

  if (input.channels.length > 0) payload.channels = input.channels;
  if (bearer) payload.bearer = bearer;

  return payload;
}

async function postPaystackInitialize(
  paystackSecret: string,
  payload: Record<string, unknown>,
) {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text().catch(() => "");
  let parsed: PaystackInitResponse | null = null;

  try {
    parsed = raw ? (JSON.parse(raw) as PaystackInitResponse) : null;
  } catch {
    parsed = null;
  }

  return { res, raw, parsed };
}

function shouldRetryWithoutChannels(input: {
  status: number;
  raw: string;
  channels: string[];
}) {
  if (input.channels.length === 0) return false;
  if (input.status !== 400 && input.status !== 422) return false;

  const raw = input.raw.toLowerCase();
  return (
    raw.includes("no active channel") ||
    raw.includes("invalid_params") ||
    raw.includes("channels") ||
    raw.includes("valid")
  );
}

async function markUssdGatewayFailed(input: {
  tenantId: string;
  providerReference: string;
  paymentIntentId: string;
  reason: string;
  attemptedChannels: string[];
  lastProviderRaw: string;
}) {
  await prisma.paymentIntent.updateMany({
    where: {
      id: input.paymentIntentId,
      tenantId: input.tenantId,
      provider: "PAYSTACK",
      providerReference: input.providerReference,
      status: "PENDING",
    },
    data: {
      status: "FAILED",
      metadata: {
        source: "paystack_ussd",
        channel: "ussd",
        gatewayFailureReason: input.reason,
        attemptedChannels: input.attemptedChannels,
        providerError: input.lastProviderRaw.slice(0, 1000),
      },
    },
  });
}

async function createUssdPaystackIntent(input: {
  ctx: UssdRequestContext;
  student: UssdStudent;
  amountPesewas: number;
}) {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (
    !paystackSecret?.startsWith("sk_test_") &&
    !paystackSecret?.startsWith("sk_live_")
  ) {
    throw new FinanceError("PAYMENT_SERVICE_NOT_CONFIGURED", 500);
  }

  const appUrl = getAppUrl();
  if (!appUrl) throw new FinanceError("PAYMENT_SERVICE_NOT_CONFIGURED", 500);

  const intentResult = await createParentPaymentIntent({
    tenantId: input.student.tenantId,
    studentId: input.student.id,
    term: input.ctx.term,
    academicYear: input.ctx.academicYear,
    amountPesewas: input.amountPesewas,
    guardianPhoneE164: input.ctx.phoneE164 ?? input.ctx.phoneRaw,
    guardianSuffix9: input.ctx.phoneSuffix9,
    channel: "ussd",
    source: "paystack_ussd",
  });

  const subaccountCode = intentResult.settlementAccount.providerSubaccountCode;
  if (!subaccountCode) {
    throw new FinanceError("SETTLEMENT_ACCOUNT_REQUIRED", 409);
  }

  const reference = intentResult.intent.providerReference;
  const callbackUrl = `${appUrl}/parent/fees/payment-callback?ref=${encodeURIComponent(
    reference,
  )}&channel=ussd`;

  const requestedChannels = paystackChannels();
  const metadata = {
    paymentIntentId: intentResult.intent.id,
    invoiceId: intentResult.intent.invoiceId,
    tenantId: intentResult.intent.tenantId,
    studentId: intentResult.intent.studentId,
    studentName: intentResult.studentName,
    term: input.ctx.term,
    academicYear: input.ctx.academicYear,
    source: "paystack_ussd",
    channel: "ussd",
    ussd: {
      sessionId: input.ctx.sessionId,
      serviceCode: input.ctx.serviceCode || null,
      phoneSuffix9: input.ctx.phoneSuffix9,
    },
    settlement: {
      provider: "PAYSTACK",
      settlementAccountId: intentResult.intent.settlementAccountId,
      providerSubaccountCode: subaccountCode,
      accountName: intentResult.settlementAccount.accountName,
      accountNumberLast4: intentResult.settlementAccount.accountNumberLast4,
      bankCode: intentResult.settlementAccount.bankCode,
      bankName: intentResult.settlementAccount.bankName,
    },
  };

  const firstPayload = buildPaystackPayload({
    amountPesewas: intentResult.intent.amountPesewas,
    email: intentResult.email,
    reference,
    currency: intentResult.intent.currency || "GHS",
    callbackUrl,
    subaccountCode,
    channels: requestedChannels,
    metadata,
  });

  let attempt = await postPaystackInitialize(paystackSecret, firstPayload);
  let usedChannels = requestedChannels;

  if (
    !attempt.res.ok &&
    shouldRetryWithoutChannels({
      status: attempt.res.status,
      raw: attempt.raw,
      channels: requestedChannels,
    })
  ) {
    console.warn("[USSD_PAYSTACK_RETRY_WITHOUT_FORCED_CHANNELS]", {
      status: attempt.res.status,
      reference,
      tenantId: input.student.tenantId,
      requestedChannels,
      raw: attempt.raw,
    });

    const fallbackPayload = buildPaystackPayload({
      amountPesewas: intentResult.intent.amountPesewas,
      email: intentResult.email,
      reference,
      currency: intentResult.intent.currency || "GHS",
      callbackUrl,
      subaccountCode,
      channels: [],
      metadata,
    });

    attempt = await postPaystackInitialize(paystackSecret, fallbackPayload);
    usedChannels = [];
  }

  if (!attempt.res.ok) {
    await markUssdGatewayFailed({
      tenantId: input.student.tenantId,
      providerReference: reference,
      paymentIntentId: intentResult.intent.id,
      reason: `PAYSTACK_HTTP_${attempt.res.status}`,
      attemptedChannels: requestedChannels,
      lastProviderRaw: attempt.raw,
    });

    console.error("[USSD_PAYSTACK_INIT_HTTP_ERROR]", {
      status: attempt.res.status,
      reference,
      tenantId: input.student.tenantId,
      attemptedChannels: requestedChannels,
      raw: attempt.raw,
    });

    throw new FinanceError("PAYMENT_GATEWAY_FAILED", 502);
  }

  const psData = attempt.parsed;
  if (!psData?.status || !psData.data?.authorization_url) {
    await markUssdGatewayFailed({
      tenantId: input.student.tenantId,
      providerReference: reference,
      paymentIntentId: intentResult.intent.id,
      reason: "PAYSTACK_BAD_RESPONSE",
      attemptedChannels: requestedChannels,
      lastProviderRaw: attempt.raw,
    });

    console.error("[USSD_PAYSTACK_INIT_BAD_RESPONSE]", {
      reference,
      tenantId: input.student.tenantId,
      psData,
      raw: attempt.raw,
    });

    throw new FinanceError("PAYMENT_GATEWAY_FAILED", 502);
  }

  const returnedReference = clean(psData.data.reference);
  if (returnedReference && returnedReference !== reference) {
    await markUssdGatewayFailed({
      tenantId: input.student.tenantId,
      providerReference: reference,
      paymentIntentId: intentResult.intent.id,
      reason: "PAYSTACK_REFERENCE_MISMATCH",
      attemptedChannels: requestedChannels,
      lastProviderRaw: JSON.stringify(psData).slice(0, 1000),
    });

    console.error("[USSD_PAYSTACK_INIT_REFERENCE_MISMATCH]", {
      local: reference,
      paystack: returnedReference,
      tenantId: input.student.tenantId,
    });

    throw new FinanceError("PAYMENT_GATEWAY_FAILED", 502);
  }

  await attachGatewayToPaymentIntent({
    tenantId: input.student.tenantId,
    providerReference: reference,
    checkoutUrl: psData.data.authorization_url,
    accessCode: psData.data.access_code ?? null,
  });

  await maybeSendPaymentLinkSms({
    tenantId: input.student.tenantId,
    to: input.ctx.phoneE164 ?? input.ctx.phoneRaw,
    studentName: studentName(input.student),
    amountPesewas: intentResult.intent.amountPesewas,
    reference,
    authorizationUrl: psData.data.authorization_url,
  });

  return {
    reference,
    amountPesewas: intentResult.intent.amountPesewas,
    authorizationUrl: psData.data.authorization_url,
    usedChannels,
  };
}

async function handleCheckBalance(
  ctx: UssdRequestContext,
  tokens: string[],
  students: UssdStudent[],
) {
  if (students.length === 1) return showBalance(ctx, students[0]);

  if (tokens.length === 1) {
    return ussdResponse("CON", studentMenu(students, "check fees"));
  }

  const student = studentAt(students, tokens[1]);
  if (!student) return ussdResponse("END", "Invalid learner selection.");

  return showBalance(ctx, student);
}

async function handlePayFees(
  ctx: UssdRequestContext,
  tokens: string[],
  students: UssdStudent[],
) {
  let student: UssdStudent | null = null;
  let amountToken = "";

  if (students.length === 1) {
    student = students[0];
    amountToken = tokens[1] ?? "";
  } else {
    if (tokens.length === 1) {
      return ussdResponse("CON", studentMenu(students, "pay fees"));
    }

    student = studentAt(students, tokens[1]);
    if (!student) return ussdResponse("END", "Invalid learner selection.");
    amountToken = tokens[2] ?? "";
  }

  const snapshot = await getFeeSnapshot({
    tenantId: student.tenantId,
    studentId: student.id,
    term: ctx.term,
    academicYear: ctx.academicYear,
  });

  if (snapshot.balancePesewas <= 0) {
    return ussdResponse(
      "END",
      `${studentName(student)} has no outstanding balance for ${ctx.term} ${ctx.academicYear}.`,
    );
  }

  if (!amountToken) {
    return ussdResponse(
      "CON",
      `${studentName(student)} balance: GHS ${formatGhs(
        snapshot.balancePesewas,
      )}\nEnter amount in GHS:`,
    );
  }

  const amountPesewas = parseGhsToPesewas(amountToken);
  if (!amountPesewas) return ussdResponse("END", "Invalid amount. Try again.");

  if (amountPesewas > snapshot.balancePesewas) {
    return ussdResponse(
      "END",
      `Amount exceeds balance. Balance is GHS ${formatGhs(snapshot.balancePesewas)}.`,
    );
  }

  const payment = await createUssdPaystackIntent({
    ctx,
    student,
    amountPesewas,
  });

  const channelNote =
    payment.usedChannels.length === 0
      ? "Complete payment with the Paystack link sent by SMS or school support."
      : "Complete payment through the Paystack prompt.";

  return ussdResponse(
    "END",
    `Payment request created.\nLearner: ${studentName(student)}\nAmount: GHS ${formatGhs(
      payment.amountPesewas,
    )}\nRef: ${payment.reference}\n${channelNote}\nReceipt follows after confirmation.`,
  );
}

async function handle(req: NextRequest) {
  const ctx = await buildContext(req);
  if (!ctx) return safeServiceUnavailable();

  const ip = getClientIp(req);

  const ipLimit = await checkRateLimit({
    scope: "ussd_fees_ip",
    keyParts: [ip],
    limit: 60,
    windowSeconds: 60,
    blockSeconds: 300,
    metadata: { route: "/api/ussd/fees" },
  });

  if (!ipLimit.ok) {
    return ussdResponse(
      "END",
      "Service is busy. Please try again shortly.",
      429,
    );
  }

  const phoneLimit = await checkRateLimit({
    scope: "ussd_fees_phone",
    keyParts: [ctx.phoneSuffix9],
    limit: 20,
    windowSeconds: 60,
    blockSeconds: 600,
    metadata: { route: "/api/ussd/fees", serviceCode: ctx.serviceCode || null },
  });

  if (!phoneLimit.ok) {
    return ussdResponse(
      "END",
      "Too many requests. Please try again later.",
      429,
    );
  }

  const tokens = splitUssdText(ctx.text);

  try {
    const students = await loadStudentsForGuardian(ctx);

    if (students.length === 0) {
      return await handleUnmatchedPhone(ctx, tokens);
    }

    if (tokens.length === 0) return ussdResponse("CON", mainMenu());
    if (tokens[0] === "1") return await handleCheckBalance(ctx, tokens, students);
    if (tokens[0] === "2") return await handlePayFees(ctx, tokens, students);

    return ussdResponse("END", "Invalid option. Dial again and choose 1 or 2.");
  } catch (err) {
    if (err instanceof FinanceError) {
      console.error("[USSD_FEES_FINANCE_ERROR]", {
        code: err.code,
        status: err.status,
        sessionId: ctx.sessionId,
        tenantId: ctx.tenantId,
      });

      if (err.code === "PAYMENT_EXCEEDS_BALANCE") {
        return ussdResponse(
          "END",
          "Amount exceeds current balance. Please try again.",
        );
      }

      if (err.code === "INVOICE_ALREADY_CLEARED") {
        return ussdResponse(
          "END",
          "This learner has no outstanding fee balance.",
        );
      }

      if (err.code === "PAYMENT_GATEWAY_FAILED") {
        return ussdResponse(
          "END",
          "Payment request could not start. Please try again later or contact the school office.",
        );
      }

      return safeServiceUnavailable();
    }

    console.error("[USSD_FEES_ERROR]", err);
    return safeServiceUnavailable();
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
