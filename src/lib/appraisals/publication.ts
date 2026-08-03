//src/lib/appraisals/publication.ts
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import {
  APPRAISAL_INSTRUMENT_DEFINITIONS,
  assertInstrumentDefinitionReady,
  type AppraisalInstrumentCode,
  type AppraisalInstrumentDefinition,
} from "@/lib/appraisals/instruments";

const CANONICAL_DEFINITION_SCHEMA_VERSION = 1;
const DEFINITION_HASH_ALGORITHM = "sha256";
const PUBLICATION_RESOURCE = "AppraisalInstrumentVersion";

export const APPRAISAL_PUBLICATION_TRANSACTION_OPTIONS = Object.freeze({
  maxWait: 10_000,
  timeout: 30_000,
});

type JsonObject = Record<string, Prisma.InputJsonValue>;

type StoredInstrumentIdentity = {
  id: string;
  code: string;
  purpose: string;
  subjectType: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type StoredInstrumentVersion = {
  id: string;
  version: number;
  status: string;
  contentHash: string | null;
  publishedByUserId: string | null;
  publishedAt: Date | null;
};

type StoredInstrumentWithVersion = StoredInstrumentIdentity & {
  versions: StoredInstrumentVersion[];
};

export type AppraisalPublicationTransaction = {
  appraisalInstrument: {
    upsert(args: unknown): Promise<StoredInstrumentIdentity>;
  };
  appraisalInstrumentVersion: {
    findUnique(args: unknown): Promise<StoredInstrumentVersion | null>;
    findFirst(args: unknown): Promise<StoredInstrumentVersion | null>;
    create(args: unknown): Promise<StoredInstrumentVersion>;
    update(args: unknown): Promise<StoredInstrumentVersion>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type AppraisalPublicationDatabase = {
  appraisalInstrument: {
    findUnique(args: unknown): Promise<StoredInstrumentWithVersion | null>;
  };
  $transaction<T>(
    callback: (tx: AppraisalPublicationTransaction) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export type PublishAppraisalInstrumentInput = {
  code: AppraisalInstrumentCode;
  actorUserId: string;
  reqId: string;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: AppraisalPublicationDatabase;
};

export type AppraisalPublicationOutcome = "CREATED" | "EXISTING_MATCH";

export type AppraisalPublicationResult = {
  outcome: AppraisalPublicationOutcome;
  code: AppraisalInstrumentCode;
  version: number;
  instrumentId: string;
  instrumentVersionId: string;
  contentHash: string;
  status: "ACTIVE";
  sectionCount: number;
  itemCount: number;
  publishedAt: string;
};

export type CanonicalAppraisalInstrumentDefinition = ReturnType<
  typeof canonicalAppraisalInstrumentDefinition
>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function publicationError(
  code: string,
  details?: Record<string, unknown>,
  status = 409,
) {
  const error = new Error(code) as Error & {
    code?: string;
    status?: number;
    details?: Record<string, unknown>;
  };

  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function asJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function sortByOrderThenKey<T extends { order: number; key: string }>(
  rows: readonly T[],
) {
  return [...rows].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.key.localeCompare(b.key);
  });
}

export function canonicalAppraisalInstrumentDefinition(
  definition: AppraisalInstrumentDefinition,
) {
  return {
    schemaVersion: CANONICAL_DEFINITION_SCHEMA_VERSION,
    code: definition.code,
    version: definition.version,
    purpose: definition.purpose,
    subjectType: definition.subjectType,
    workflowKind: definition.workflowKind,
    title: definition.title,
    documentTitle: definition.documentTitle,
    targetRole: definition.targetRole,
    expectedSectionCount: definition.expectedSectionCount,
    expectedRawMaximum: definition.expectedRawMaximum,
    calculationMethod: definition.calculationMethod,
    scaleMin: definition.scaleMin,
    scaleMax: definition.scaleMax,
    allowNotApplicable: definition.allowNotApplicable,
    commentsPolicy: definition.commentsPolicy,
    identityVisibility: definition.identityVisibility,
    responseWindowDays: definition.responseWindowDays,
    minimumResponses: definition.minimumResponses,
    sourceState: definition.sourceState,
    activationBlockedReason: definition.activationBlockedReason,
    directorateName: definition.directorateName,
    officialHeader: {
      jurisdictionScoped: definition.officialHeader.jurisdictionScoped,
      documentTitle: definition.officialHeader.documentTitle,
    },
    instructions: definition.instructions,
    allowComments: definition.allowComments,
    headerFields: sortByOrderThenKey(definition.headerFields).map((field) => ({
      key: field.key,
      label: field.label,
      order: field.order,
      inputMode: field.inputMode,
      required: field.required,
    })),
    sourceNotes: [...definition.sourceNotes],
    sections: sortByOrderThenKey(definition.sections).map((section) => ({
      key: section.key,
      title: section.title,
      description: section.description ?? null,
      order: section.order,
      maxScore: section.maxScore,
      items: sortByOrderThenKey(section.items).map((item) => ({
        key: item.key,
        label: item.label,
        order: item.order,
        maxScore: item.maxScore,
        isRequired: item.isRequired,
        scoringDirection: item.scoringDirection,
        sourceNotes: [...(item.sourceNotes ?? [])],
      })),
    })),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(input).sort()) {
      if (input[key] !== undefined) {
        output[key] = canonicalize(input[key]);
      }
    }

    return output;
  }

  return value;
}

export function serializeCanonicalAppraisalInstrumentDefinition(
  definition: AppraisalInstrumentDefinition,
) {
  return JSON.stringify(
    canonicalize(canonicalAppraisalInstrumentDefinition(definition)),
  );
}

export function hashAppraisalInstrumentDefinition(
  definition: AppraisalInstrumentDefinition,
) {
  return createHash(DEFINITION_HASH_ALGORITHM)
    .update(serializeCanonicalAppraisalInstrumentDefinition(definition), "utf8")
    .digest("hex");
}

function itemCount(definition: AppraisalInstrumentDefinition) {
  return definition.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
}

function instrumentCreateData(
  definition: AppraisalInstrumentDefinition,
  actorUserId: string,
) {
  return {
    code: definition.code,
    purpose: definition.purpose,
    subjectType: definition.subjectType,
    name: definition.title,
    description: definition.documentTitle,
    isActive: true,
    createdByUserId: actorUserId,
    metadata: asJsonObject({
      source: "SOURCE_CONTROLLED_APPRAISAL_CONTRACT",
      workflowKind: definition.workflowKind,
      targetRole: definition.targetRole,
      jurisdictionScoped: definition.officialHeader.jurisdictionScoped,
    }),
  };
}

function versionMetadata(
  definition: AppraisalInstrumentDefinition,
  contentHash: string,
) {
  return asJsonObject({
    canonicalDefinitionSchemaVersion: CANONICAL_DEFINITION_SCHEMA_VERSION,
    definitionHashAlgorithm: "SHA-256",
    contentHash,
    code: definition.code,
    purpose: definition.purpose,
    subjectType: definition.subjectType,
    workflowKind: definition.workflowKind,
    targetRole: definition.targetRole,
    expectedSectionCount: definition.expectedSectionCount,
    expectedRawMaximum: definition.expectedRawMaximum,
    commentsPolicy: definition.commentsPolicy,
    identityVisibility: definition.identityVisibility,
    responseWindowDays: definition.responseWindowDays,
    minimumResponses: definition.minimumResponses,
    sourceState: definition.sourceState,
    officialHeader: definition.officialHeader,
    headerFields: definition.headerFields,
    sourceNotes: definition.sourceNotes,
  });
}

function sectionCreateData(definition: AppraisalInstrumentDefinition) {
  return sortByOrderThenKey(definition.sections).map((section) => ({
    key: section.key,
    title: section.title,
    description: section.description ?? null,
    order: section.order,
    maxScore: section.maxScore,
    metadata: asJsonObject({
      source: "SOURCE_CONTROLLED_APPRAISAL_CONTRACT",
    }),
    items: {
      create: sortByOrderThenKey(section.items).map((item) => ({
        key: item.key,
        label: item.label,
        order: item.order,
        maxScore: item.maxScore,
        isRequired: item.isRequired,
        metadata: asJsonObject({
          scoringDirection: item.scoringDirection,
          sourceNotes: item.sourceNotes ?? [],
        }),
      })),
    },
  }));
}

function assertInstrumentIdentityMatches(
  stored: StoredInstrumentIdentity,
  definition: AppraisalInstrumentDefinition,
) {
  const mismatches: Record<string, { expected: unknown; actual: unknown }> = {};

  const checks: Array<[keyof StoredInstrumentIdentity, unknown]> = [
    ["code", definition.code],
    ["purpose", definition.purpose],
    ["subjectType", definition.subjectType],
    ["name", definition.title],
    ["description", definition.documentTitle],
    ["isActive", true],
  ];

  for (const [field, expected] of checks) {
    const actual = stored[field];
    if (actual !== expected) mismatches[field] = { expected, actual };
  }

  if (Object.keys(mismatches).length) {
    throw publicationError("APPRAISAL_INSTRUMENT_IDENTITY_DRIFT", {
      code: definition.code,
      mismatches,
    });
  }
}

function existingPublicationResult(args: {
  instrument: StoredInstrumentIdentity;
  version: StoredInstrumentVersion;
  definition: AppraisalInstrumentDefinition;
  contentHash: string;
}): AppraisalPublicationResult {
  assertInstrumentIdentityMatches(args.instrument, args.definition);

  if (args.version.contentHash !== args.contentHash) {
    throw publicationError("APPRAISAL_INSTRUMENT_VERSION_CONTENT_DRIFT", {
      code: args.definition.code,
      version: args.definition.version,
      expectedContentHash: args.contentHash,
      storedContentHash: args.version.contentHash,
    });
  }

  if (args.version.status !== "ACTIVE") {
    throw publicationError("APPRAISAL_INSTRUMENT_VERSION_NOT_ACTIVE", {
      code: args.definition.code,
      version: args.definition.version,
      storedStatus: args.version.status,
    });
  }

  if (!args.version.publishedAt || !args.version.publishedByUserId) {
    throw publicationError("APPRAISAL_INSTRUMENT_VERSION_PUBLICATION_INCOMPLETE", {
      code: args.definition.code,
      version: args.definition.version,
    });
  }

  return {
    outcome: "EXISTING_MATCH",
    code: args.definition.code,
    version: args.definition.version,
    instrumentId: args.instrument.id,
    instrumentVersionId: args.version.id,
    contentHash: args.contentHash,
    status: "ACTIVE",
    sectionCount: args.definition.sections.length,
    itemCount: itemCount(args.definition),
    publishedAt: args.version.publishedAt.toISOString(),
  };
}

async function findExistingPublication(
  database: AppraisalPublicationDatabase,
  definition: AppraisalInstrumentDefinition,
  contentHash: string,
) {
  const instrument = await database.appraisalInstrument.findUnique({
    where: { code: definition.code },
    select: {
      id: true,
      code: true,
      purpose: true,
      subjectType: true,
      name: true,
      description: true,
      isActive: true,
      versions: {
        where: { version: definition.version },
        take: 1,
        select: {
          id: true,
          version: true,
          status: true,
          contentHash: true,
          publishedByUserId: true,
          publishedAt: true,
        },
      },
    },
  });

  if (!instrument || !instrument.versions[0]) return null;

  return existingPublicationResult({
    instrument,
    version: instrument.versions[0],
    definition,
    contentHash,
  });
}

function isUniqueConflict(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return true;
  }

  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function definitionForCode(code: AppraisalInstrumentCode) {
  const definition = APPRAISAL_INSTRUMENT_DEFINITIONS[code];

  if (!definition) {
    throw publicationError(
      "APPRAISAL_INSTRUMENT_CODE_UNKNOWN",
      { code },
      404,
    );
  }

  return definition;
}

export async function publishAppraisalInstrumentVersion(
  input: PublishAppraisalInstrumentInput,
): Promise<AppraisalPublicationResult> {
  const actorUserId = clean(input.actorUserId);
  const reqId = clean(input.reqId);

  if (!actorUserId) {
    throw publicationError("APPRAISAL_PUBLICATION_ACTOR_REQUIRED", undefined, 422);
  }
  if (!reqId) {
    throw publicationError("APPRAISAL_PUBLICATION_REQUEST_ID_REQUIRED", undefined, 422);
  }

  const definition = assertInstrumentDefinitionReady(
    definitionForCode(input.code),
  );
  const contentHash = hashAppraisalInstrumentDefinition(definition);
  const publishedAt = input.now ? new Date(input.now) : new Date();

  if (Number.isNaN(publishedAt.getTime())) {
    throw publicationError("APPRAISAL_PUBLICATION_TIME_INVALID", undefined, 422);
  }

  const database =
    input.database ??
    (prisma as unknown as AppraisalPublicationDatabase);

  try {
    return await database.$transaction(async (tx) => {
      const instrument = await tx.appraisalInstrument.upsert({
        where: { code: definition.code },
        create: instrumentCreateData(definition, actorUserId),
        update: {},
        select: {
          id: true,
          code: true,
          purpose: true,
          subjectType: true,
          name: true,
          description: true,
          isActive: true,
        },
      });

      assertInstrumentIdentityMatches(instrument, definition);

      const existingVersion =
        await tx.appraisalInstrumentVersion.findUnique({
          where: {
            instrumentId_version: {
              instrumentId: instrument.id,
              version: definition.version,
            },
          },
          select: {
            id: true,
            version: true,
            status: true,
            contentHash: true,
            publishedByUserId: true,
            publishedAt: true,
          },
        });

      if (existingVersion) {
        return existingPublicationResult({
          instrument,
          version: existingVersion,
          definition,
          contentHash,
        });
      }

      const otherActiveVersion =
        await tx.appraisalInstrumentVersion.findFirst({
          where: {
            instrumentId: instrument.id,
            status: "ACTIVE",
            NOT: { version: definition.version },
          },
          select: {
            id: true,
            version: true,
            status: true,
            contentHash: true,
            publishedByUserId: true,
            publishedAt: true,
          },
        });

      if (otherActiveVersion) {
        throw publicationError("APPRAISAL_INSTRUMENT_ACTIVE_VERSION_EXISTS", {
          code: definition.code,
          requestedVersion: definition.version,
          activeVersion: otherActiveVersion.version,
        });
      }

      const draftVersion =
        await tx.appraisalInstrumentVersion.create({
          data: {
            instrumentId: instrument.id,
            version: definition.version,
            status: "DRAFT",
            title: definition.documentTitle,
            directorateName: null,
            instructions: definition.instructions,
            calculationMethod: definition.calculationMethod,
            scaleMin: definition.scaleMin,
            scaleMax: definition.scaleMax,
            allowNotApplicable: definition.allowNotApplicable,
            allowComments: definition.allowComments,
            contentHash,
            publishedByUserId: null,
            publishedAt: null,
            metadata: versionMetadata(definition, contentHash),
            sections: {
              create: sectionCreateData(definition),
            },
          },
          select: {
            id: true,
            version: true,
            status: true,
            contentHash: true,
            publishedByUserId: true,
            publishedAt: true,
          },
        });

      const createdVersion =
        await tx.appraisalInstrumentVersion.update({
          where: { id: draftVersion.id },
          data: {
            status: "ACTIVE",
            publishedByUserId: actorUserId,
            publishedAt,
          },
          select: {
            id: true,
            version: true,
            status: true,
            contentHash: true,
            publishedByUserId: true,
            publishedAt: true,
          },
        });

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: APPRAISAL_AUDIT_ACTIONS.INSTRUMENT_VERSION_PUBLISHED,
          resource: PUBLICATION_RESOURCE,
          resourceId: createdVersion.id,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          metadata: asJsonObject({
            reqId,
            action:
              APPRAISAL_AUDIT_ACTIONS.INSTRUMENT_VERSION_PUBLISHED,
            instrumentCode: definition.code,
            instrumentVersion: definition.version,
            contentHash,
            sectionCount: definition.sections.length,
            itemCount: itemCount(definition),
            targetRole: definition.targetRole,
            outcome: "CREATED",
          }),
        },
      });

      if (
        createdVersion.status !== "ACTIVE" ||
        createdVersion.contentHash !== contentHash ||
        !createdVersion.publishedAt
      ) {
        throw publicationError("APPRAISAL_INSTRUMENT_PUBLICATION_POSTCONDITION_FAILED", {
          code: definition.code,
          version: definition.version,
        });
      }

      return {
        outcome: "CREATED",
        code: definition.code,
        version: definition.version,
        instrumentId: instrument.id,
        instrumentVersionId: createdVersion.id,
        contentHash,
        status: "ACTIVE",
        sectionCount: definition.sections.length,
        itemCount: itemCount(definition),
        publishedAt: createdVersion.publishedAt.toISOString(),
      };
    }, APPRAISAL_PUBLICATION_TRANSACTION_OPTIONS);
  } catch (error) {
    if (isUniqueConflict(error)) {
      const existing = await findExistingPublication(
        database,
        definition,
        contentHash,
      );

      if (existing) return existing;
    }

    throw error;
  }
}
