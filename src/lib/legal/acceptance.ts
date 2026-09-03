import { Prisma } from "@prisma/client";
import {
  PRIVACY_NOTICE_UAT,
  TERMS_OF_SERVICE_UAT,
} from "@/lib/legal/publishedDocuments";

export const LEGAL_ACCEPTANCE_STATEMENT =
  "I agree to the EduLife OS Terms of Service and acknowledge the Privacy Notice.";

export const LEGAL_ACCEPTANCE_STATEMENT_VERSION =
  "EDULIFE_LEGAL_ACCEPTANCE_CHECKBOX_V1";

export type LegalAcceptanceAuthorityType =
  | "SCHOOL_MEMBERSHIP"
  | "GOVERNANCE_ASSIGNMENT";

export type LegalAcceptanceSource =
  | "STAFF_SIGNUP"
  | "GOVERNANCE_INVITE_ACCEPTANCE";

type CurrentLegalDocumentRow = {
  id: string;
  documentType: string;
  version: string;
  contentHash: string;
};

type LegalAcceptanceRow = {
  id: string;
};

export type RecordCurrentLegalAcceptanceInput = {
  tx: Prisma.TransactionClient;
  userId: string;
  authorityType: LegalAcceptanceAuthorityType;
  authorityId: string;
  acceptanceSource: LegalAcceptanceSource;
  evidence?: Record<string, string | number | boolean | null>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function canonicalHash(value: unknown) {
  return clean(value).toLowerCase();
}

function expectedDocument(input: {
  actual: CurrentLegalDocumentRow | undefined;
  expectedType: "TERMS_OF_SERVICE" | "PRIVACY_NOTICE";
  expectedVersion: string;
  expectedHash: string;
}) {
  const actual = input.actual;

  if (!actual) {
    throw new Error("LEGAL_ACCEPTANCE_CURRENT_DOCUMENTS_UNAVAILABLE");
  }

  if (
    actual.documentType !== input.expectedType ||
    actual.version !== input.expectedVersion ||
    canonicalHash(actual.contentHash) !== canonicalHash(input.expectedHash)
  ) {
    throw new Error("LEGAL_ACCEPTANCE_CANONICAL_DOCUMENT_DRIFT");
  }

  return actual;
}

async function recordCurrentLegalAcceptanceUnchecked(
  input: RecordCurrentLegalAcceptanceInput,
) {
  const userId = clean(input.userId);
  const authorityId = clean(input.authorityId);
  const acceptanceSource = clean(input.acceptanceSource);

  if (!userId || !authorityId || !acceptanceSource) {
    throw new Error("LEGAL_ACCEPTANCE_INPUT_INVALID");
  }

  const currentDocuments = await input.tx.$queryRaw<CurrentLegalDocumentRow[]>(
    Prisma.sql`
      SELECT
        d."id",
        d."documentType",
        d."version",
        d."contentHash"
      FROM edulife_os."LegalDocumentVersion" d
      WHERE d."documentType" IN ('TERMS_OF_SERVICE', 'PRIVACY_NOTICE')
        AND d."isCurrent" = true
        AND d."effectiveAt" <= now()
        AND d."supersededAt" IS NULL
      ORDER BY d."documentType" ASC
      FOR SHARE
    `,
  );

  if (currentDocuments.length !== 2) {
    throw new Error("LEGAL_ACCEPTANCE_CURRENT_DOCUMENTS_UNAVAILABLE");
  }

  const terms = expectedDocument({
    actual: currentDocuments.find(
      (document) => document.documentType === "TERMS_OF_SERVICE",
    ),
    expectedType: "TERMS_OF_SERVICE",
    expectedVersion: TERMS_OF_SERVICE_UAT.version,
    expectedHash: TERMS_OF_SERVICE_UAT.contentHash,
  });

  const privacy = expectedDocument({
    actual: currentDocuments.find(
      (document) => document.documentType === "PRIVACY_NOTICE",
    ),
    expectedType: "PRIVACY_NOTICE",
    expectedVersion: PRIVACY_NOTICE_UAT.version,
    expectedHash: PRIVACY_NOTICE_UAT.contentHash,
  });

  const evidence = {
    ...(input.evidence ?? {}),
    explicitAgreement: true,
    statementVersion: LEGAL_ACCEPTANCE_STATEMENT_VERSION,
    statement: LEGAL_ACCEPTANCE_STATEMENT,
    termsPath: "/legal/terms",
    privacyPath: "/legal/privacy",
  };

  await input.tx.$executeRaw(
    Prisma.sql`
      INSERT INTO edulife_os."LegalAcceptance" (
        "userId",
        "termsDocumentId",
        "privacyDocumentId",
        "authorityType",
        "authorityId",
        "acceptanceSource",
        "evidenceJson"
      )
      VALUES (
        ${userId},
        ${terms.id}::uuid,
        ${privacy.id}::uuid,
        ${input.authorityType},
        ${authorityId},
        ${acceptanceSource},
        CAST(${JSON.stringify(evidence)} AS jsonb)
      )
      ON CONFLICT ON CONSTRAINT "LegalAcceptance_idempotency_unique"
      DO NOTHING
    `,
  );

  const acceptance = await input.tx.$queryRaw<LegalAcceptanceRow[]>(
    Prisma.sql`
      SELECT a."id"
      FROM edulife_os."LegalAcceptance" a
      WHERE a."userId" = ${userId}
        AND a."termsDocumentId" = ${terms.id}::uuid
        AND a."privacyDocumentId" = ${privacy.id}::uuid
        AND a."authorityType" = ${input.authorityType}
        AND a."authorityId" = ${authorityId}
      LIMIT 1
    `,
  );

  if (acceptance.length !== 1 || !clean(acceptance[0]?.id)) {
    throw new Error("LEGAL_ACCEPTANCE_INSERT_FAILED");
  }

  return {
    id: acceptance[0].id,
    termsVersion: terms.version,
    privacyVersion: privacy.version,
  };
}

export async function recordCurrentLegalAcceptance(
  input: RecordCurrentLegalAcceptanceInput,
) {
  try {
    return await recordCurrentLegalAcceptanceUnchecked(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.startsWith("LEGAL_ACCEPTANCE_")) {
      throw error;
    }

    throw new Error("LEGAL_ACCEPTANCE_PERSISTENCE_FAILED");
  }
}
