create schema if not exists edulife_os;

do $$ begin
  create type edulife_os."FeeStructureScope" as enum ('SCHOOL','CLASSROOM','STUDENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."FeeInvoiceStatus" as enum ('OPEN','PARTIALLY_PAID','PAID','CANCELLED','WRITTEN_OFF');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."PaymentProvider" as enum ('PAYSTACK','MANUAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."PaymentIntentStatus" as enum ('PENDING','AUTHORIZED','PAID','FAILED','CANCELLED','EXPIRED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."PaymentStatus" as enum ('PENDING','SUCCESS','FAILED','REVERSED','REFUNDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."ProviderEventStatus" as enum ('RECEIVED','PROCESSED','FAILED','IGNORED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."LedgerDirection" as enum ('DEBIT','CREDIT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."ReconciliationStatus" as enum ('OPEN','CLEAN','HAS_EXCEPTIONS','CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."ReconciliationExceptionKind" as enum (
    'MISSING_LEDGER_ENTRY',
    'PAYMENT_WITHOUT_RECEIPT',
    'RECEIPT_WITHOUT_PAYMENT',
    'DUPLICATE_PROVIDER_REFERENCE',
    'AMOUNT_MISMATCH',
    'UNMATCHED_PROVIDER_EVENT',
    'OVERPAYMENT',
    'UNKNOWN'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."ReconciliationSeverity" as enum ('LOW','MEDIUM','HIGH','CRITICAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."ReconciliationExceptionStatus" as enum ('OPEN','INVESTIGATING','RESOLVED','DISMISSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."ScholarshipApplicationStatus" as enum ('PENDING','REVIEWED','APPROVED','REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."ScholarshipAwardStatus" as enum ('ACTIVE','REVOKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edulife_os."LedgerEntryType" as enum ('INVOICE_DEBIT','PAYMENT_CREDIT','ADJUSTMENT_CREDIT','CORRECTION');
exception when duplicate_object then null; end $$;

alter type edulife_os."LedgerEntryType" add value if not exists 'REVERSAL_DEBIT';
alter type edulife_os."LedgerEntryType" add value if not exists 'REVERSAL_CREDIT';

alter table edulife_os."FeeStructure"
  add column if not exists "category" text not null default 'GENERAL',
  add column if not exists "scope" edulife_os."FeeStructureScope" not null default 'SCHOOL',
  add column if not exists "classroomId" text,
  add column if not exists "studentId" text,
  add column if not exists "isRequired" boolean not null default true,
  add column if not exists "isRecurring" boolean not null default false,
  add column if not exists "approvedByUserId" text,
  add column if not exists "approvedAt" timestamptz;

alter table edulife_os."FeeInvoice"
  add column if not exists "status" edulife_os."FeeInvoiceStatus" not null default 'OPEN',
  add column if not exists "totalPaidPesewas" integer not null default 0,
  add column if not exists "balancePesewas" integer not null default 0,
  add column if not exists "dueDate" date,
  add column if not exists "issuedAt" timestamptz not null default now(),
  add column if not exists "closedAt" timestamptz;

alter table edulife_os."FeePayment"
  add column if not exists "status" edulife_os."PaymentStatus" not null default 'SUCCESS',
  add column if not exists "updatedAt" timestamptz not null default now();

create table if not exists edulife_os."FeeInvoiceLine" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "invoiceId" text not null references edulife_os."FeeInvoice"("id") on delete cascade,
  "feeStructureId" text references edulife_os."FeeStructure"("id") on delete set null,
  "category" text not null default 'GENERAL',
  "description" text not null,
  "amountPesewas" integer not null,
  "waivedPesewas" integer not null default 0,
  "sortOrder" integer not null default 0,
  "createdAt" timestamptz not null default now()
);

create table if not exists edulife_os."PaymentIntent" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "studentId" text not null references edulife_os."Student"("id") on delete restrict,
  "invoiceId" text not null references edulife_os."FeeInvoice"("id") on delete restrict,
  "provider" edulife_os."PaymentProvider" not null default 'PAYSTACK',
  "providerReference" varchar(120) not null,
  "amountPesewas" integer not null,
  "currency" varchar(8) not null default 'GHS',
  "status" edulife_os."PaymentIntentStatus" not null default 'PENDING',
  "checkoutUrl" text,
  "accessCode" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "expiresAt" timestamptz,
  "createdByUserId" text references edulife_os."User"("id") on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "PaymentIntent_tenant_provider_ref_unique" unique ("tenantId","provider","providerReference")
);

create table if not exists edulife_os."PaymentProviderEvent" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text references edulife_os."Tenant"("id") on delete set null,
  "provider" edulife_os."PaymentProvider" not null default 'PAYSTACK',
  "eventType" text not null,
  "providerReference" varchar(120),
  "signature" text,
  "rawPayload" jsonb not null,
  "receivedAt" timestamptz not null default now(),
  "processedAt" timestamptz,
  "processingStatus" edulife_os."ProviderEventStatus" not null default 'RECEIVED',
  "processingError" text
);

create table if not exists edulife_os."PaymentTransaction" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "paymentIntentId" text references edulife_os."PaymentIntent"("id") on delete set null,
  "feePaymentId" text unique references edulife_os."FeePayment"("id") on delete set null,
  "provider" edulife_os."PaymentProvider" not null default 'PAYSTACK',
  "providerReference" varchar(120) not null,
  "providerTransactionId" text,
  "amountPesewas" integer not null,
  "currency" varchar(8) not null default 'GHS',
  "status" edulife_os."PaymentStatus" not null default 'SUCCESS',
  "channel" text,
  "providerPaidAt" timestamptz,
  "providerRaw" jsonb,
  "createdByUserId" text references edulife_os."User"("id") on delete set null,
  "createdAt" timestamptz not null default now(),
  constraint "PaymentTransaction_tenant_provider_ref_unique" unique ("tenantId","provider","providerReference")
);

create table if not exists edulife_os."PaymentAllocation" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "studentId" text not null references edulife_os."Student"("id") on delete restrict,
  "invoiceId" text not null references edulife_os."FeeInvoice"("id") on delete restrict,
  "feePaymentId" text not null references edulife_os."FeePayment"("id") on delete restrict,
  "amountPesewas" integer not null,
  "allocationType" text not null default 'INVOICE_PAYMENT',
  "createdAt" timestamptz not null default now()
);

create table if not exists edulife_os."Receipt" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "invoiceId" text not null references edulife_os."FeeInvoice"("id") on delete restrict,
  "feePaymentId" text not null unique references edulife_os."FeePayment"("id") on delete restrict,
  "receiptNumber" varchar(64) not null,
  "issuedAt" timestamptz not null default now(),
  "issuedToName" text,
  "issuedToPhone" varchar(32),
  "issuedByUserId" text references edulife_os."User"("id") on delete set null,
  "note" text,
  "createdAt" timestamptz not null default now()
);

alter table edulife_os."Receipt"
  add column if not exists "createdAt" timestamptz not null default now();

create table if not exists edulife_os."SponsorProfile" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "name" text not null,
  "contactEmail" varchar(320),
  "contactPhone" varchar(32),
  "notes" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists edulife_os."ScholarshipApplication" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "studentName" text not null,
  "dateOfBirth" date,
  "level" text not null,
  "scholarshipType" text not null,
  "guardianName" text not null,
  "guardianPhone" text not null,
  "whatsappNumber" text,
  "achievements" text,
  "needStatement" text,
  "status" edulife_os."ScholarshipApplicationStatus" not null default 'PENDING',
  "reviewNote" text,
  "reviewedAt" timestamptz,
  "reviewedByUserId" text references edulife_os."User"("id") on delete set null,
  "submittedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now()
);

create table if not exists edulife_os."ScholarshipAward" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "applicationId" text references edulife_os."ScholarshipApplication"("id") on delete set null,
  "studentId" text not null references edulife_os."Student"("id") on delete restrict,
  "supportKind" text not null,
  "amountPesewas" integer not null,
  "reason" text not null,
  "fundingLabel" text,
  "sponsorProfileId" text references edulife_os."SponsorProfile"("id") on delete set null,
  "applicableTerm" text not null,
  "applicableAcademicYear" text not null,
  "status" edulife_os."ScholarshipAwardStatus" not null default 'ACTIVE',
  "approvedAt" timestamptz not null default now(),
  "approvedByUserId" text not null references edulife_os."User"("id"),
  "createdAt" timestamptz not null default now(),
  "revokedAt" timestamptz
);

create table if not exists edulife_os."FeeAdjustment" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "invoiceId" text not null references edulife_os."FeeInvoice"("id") on delete restrict,
  "studentId" text not null references edulife_os."Student"("id") on delete restrict,
  "scholarshipAwardId" text references edulife_os."ScholarshipAward"("id") on delete set null,
  "kind" text not null,
  "amountPesewas" integer not null,
  "reason" text,
  "createdByUserId" text references edulife_os."User"("id") on delete set null,
  "createdAt" timestamptz not null default now(),
  "reversedAt" timestamptz,
  "reversalReason" text
);

create table if not exists edulife_os."LedgerEntry" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "invoiceId" text references edulife_os."FeeInvoice"("id") on delete set null,
  "invoiceLineId" text references edulife_os."FeeInvoiceLine"("id") on delete set null,
  "studentId" text references edulife_os."Student"("id") on delete set null,
  "feePaymentId" text references edulife_os."FeePayment"("id") on delete set null,
  "feeAdjustmentId" text references edulife_os."FeeAdjustment"("id") on delete set null,
  "receiptId" text references edulife_os."Receipt"("id") on delete set null,
  "entryType" edulife_os."LedgerEntryType" not null,
  "amountPesewas" integer not null,
  "direction" edulife_os."LedgerDirection" not null default 'CREDIT',
  "description" text,
  "journalRef" varchar(80),
  "createdByUserId" text references edulife_os."User"("id") on delete set null,
  "createdAt" timestamptz not null default now()
);

alter table edulife_os."LedgerEntry"
  add column if not exists "invoiceLineId" text,
  add column if not exists "direction" edulife_os."LedgerDirection" not null default 'CREDIT',
  add column if not exists "journalRef" varchar(80);

create table if not exists edulife_os."ReconciliationBatch" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "provider" edulife_os."PaymentProvider",
  "batchDate" date not null,
  "status" edulife_os."ReconciliationStatus" not null default 'OPEN',
  "expectedPesewas" integer not null default 0,
  "actualPesewas" integer not null default 0,
  "deltaPesewas" integer not null default 0,
  "notes" text,
  "createdByUserId" text references edulife_os."User"("id") on delete set null,
  "createdAt" timestamptz not null default now(),
  "closedAt" timestamptz
);

create table if not exists edulife_os."ReconciliationException" (
  "id" text primary key default gen_random_uuid()::text,
  "tenantId" text not null references edulife_os."Tenant"("id") on delete cascade,
  "batchId" text references edulife_os."ReconciliationBatch"("id") on delete set null,
  "invoiceId" text references edulife_os."FeeInvoice"("id") on delete set null,
  "providerReference" text,
  "kind" edulife_os."ReconciliationExceptionKind" not null,
  "severity" edulife_os."ReconciliationSeverity" not null default 'MEDIUM',
  "status" edulife_os."ReconciliationExceptionStatus" not null default 'OPEN',
  "expectedPesewas" integer,
  "actualPesewas" integer,
  "deltaPesewas" integer,
  "description" text not null,
  "resolutionNote" text,
  "resolvedByUserId" text references edulife_os."User"("id") on delete set null,
  "resolvedAt" timestamptz,
  "createdAt" timestamptz not null default now()
);

create unique index if not exists "Receipt_tenant_receiptNumber_unique"
on edulife_os."Receipt" ("tenantId","receiptNumber");

create index if not exists "FeeInvoiceLine_tenant_invoice_idx"
on edulife_os."FeeInvoiceLine" ("tenantId","invoiceId");

create index if not exists "PaymentIntent_tenant_invoice_idx"
on edulife_os."PaymentIntent" ("tenantId","invoiceId");

create index if not exists "PaymentProviderEvent_provider_ref_idx"
on edulife_os."PaymentProviderEvent" ("provider","providerReference");

create index if not exists "PaymentTransaction_tenant_status_idx"
on edulife_os."PaymentTransaction" ("tenantId","status");

create index if not exists "PaymentAllocation_tenant_invoice_idx"
on edulife_os."PaymentAllocation" ("tenantId","invoiceId");

create index if not exists "LedgerEntry_tenant_invoice_idx"
on edulife_os."LedgerEntry" ("tenantId","invoiceId");

create index if not exists "LedgerEntry_tenant_type_idx"
on edulife_os."LedgerEntry" ("tenantId","entryType");

create index if not exists "ReconciliationException_tenant_status_idx"
on edulife_os."ReconciliationException" ("tenantId","status");

update edulife_os."LedgerEntry"
set "direction" = case
  when "entryType" = 'INVOICE_DEBIT' then 'DEBIT'::edulife_os."LedgerDirection"
  else 'CREDIT'::edulife_os."LedgerDirection"
end;

update edulife_os."FeeInvoice" inv
set
  "totalPaidPesewas" = coalesce(p.paid, 0),
  "balancePesewas" = greatest(0, coalesce(inv."totalBilledPesewas", 0) - coalesce(inv."totalWaivedPesewas", 0) - coalesce(p.paid, 0)),
  "status" = case
    when greatest(0, coalesce(inv."totalBilledPesewas", 0) - coalesce(inv."totalWaivedPesewas", 0) - coalesce(p.paid, 0)) = 0 then 'PAID'::edulife_os."FeeInvoiceStatus"
    when coalesce(p.paid, 0) > 0 then 'PARTIALLY_PAID'::edulife_os."FeeInvoiceStatus"
    else 'OPEN'::edulife_os."FeeInvoiceStatus"
  end
from (
  select "invoiceId", sum("amountPesewas") as paid
  from edulife_os."FeePayment"
  group by "invoiceId"
) p
where inv."id" = p."invoiceId";

update edulife_os."FeeInvoice" inv
set
  "totalPaidPesewas" = 0,
  "balancePesewas" = greatest(0, coalesce(inv."totalBilledPesewas", 0) - coalesce(inv."totalWaivedPesewas", 0)),
  "status" = 'OPEN'::edulife_os."FeeInvoiceStatus"
where not exists (
  select 1 from edulife_os."FeePayment" p where p."invoiceId" = inv."id"
);

insert into edulife_os."FeeInvoiceLine" (
  "tenantId",
  "invoiceId",
  "category",
  "description",
  "amountPesewas",
  "waivedPesewas",
  "sortOrder"
)
select
  inv."tenantId",
  inv."id",
  'LEGACY',
  'Legacy invoice total',
  inv."totalBilledPesewas",
  inv."totalWaivedPesewas",
  0
from edulife_os."FeeInvoice" inv
where not exists (
  select 1 from edulife_os."FeeInvoiceLine" line
  where line."invoiceId" = inv."id"
);