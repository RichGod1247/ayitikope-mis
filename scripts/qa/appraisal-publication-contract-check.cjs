#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally uses Node require hooks to load TypeScript source files. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(message, { expected, actual });
}

async function expectError(action, expectedCode, message) {
  try {
    await action();
  } catch (error) {
    const actualCode = error && typeof error === "object" ? error.code : null;
    if (actualCode === expectedCode) return error;
    fail(message, {
      expectedCode,
      actualCode,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  fail(message, { expectedCode, actualCode: null });
}

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: true,
    },
  });

  const diagnostics = transpiled.diagnostics ?? [];

  if (diagnostics.length) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => repoRoot,
      getNewLine: () => "\n",
    });

    fail(`TypeScript transpilation diagnostics in ${filename}`, formatted);
  }

  module._compile(transpiled.outputText, filename);
};

function clone(value) {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, row]) => [key, clone(row)]),
    );
  }
  return value;
}

function selected(value) {
  return clone(value);
}

class FakePublicationDatabase {
  constructor(options = {}) {
    this.instrumentsByCode = new Map();
    this.versionsByInstrumentVersion = new Map();
    this.sections = [];
    this.items = [];
    this.auditLogs = [];
    this.versionStatusTransitions = [];
    this.transactionCalls = 0;
    this.transactionOptions = [];
    this.instrumentSequence = 0;
    this.versionSequence = 0;
    this.sectionSequence = 0;
    this.itemSequence = 0;
    this.raceOnVersionCreate = Boolean(options.raceOnVersionCreate);

    this.appraisalInstrument = {
      findUnique: async (args) => {
        const instrument = this.instrumentsByCode.get(args.where.code) ?? null;
        if (!instrument) return null;

        const versions = [...this.versionsByInstrumentVersion.values()]
          .filter((row) => row.instrumentId === instrument.id)
          .filter((row) => {
            const requested = args.select?.versions?.where?.version;
            return requested === undefined || row.version === requested;
          })
          .slice(0, args.select?.versions?.take ?? Number.MAX_SAFE_INTEGER);

        return selected({ ...instrument, versions });
      },
    };
  }

  key(instrumentId, version) {
    return `${instrumentId}:${version}`;
  }

  transactionClient() {
    return {
      appraisalInstrument: {
        upsert: async (args) => {
          const code = args.where.code;
          let row = this.instrumentsByCode.get(code);

          if (!row) {
            row = {
              id: `instrument-${++this.instrumentSequence}`,
              ...clone(args.create),
            };
            this.instrumentsByCode.set(code, row);
          }

          return selected(row);
        },
      },

      appraisalInstrumentVersion: {
        findUnique: async (args) => {
          const pair = args.where.instrumentId_version;
          return selected(
            this.versionsByInstrumentVersion.get(
              this.key(pair.instrumentId, pair.version),
            ) ?? null,
          );
        },

        findFirst: async (args) => {
          const excludedVersion = args.where.NOT?.version;
          const row = [...this.versionsByInstrumentVersion.values()].find(
            (candidate) =>
              candidate.instrumentId === args.where.instrumentId &&
              candidate.status === args.where.status &&
              candidate.version !== excludedVersion,
          );
          return selected(row ?? null);
        },

        create: async (args) => {
          const data = clone(args.data);

          if (
            data.sections?.create?.length &&
            data.status !== "DRAFT"
          ) {
            const error = new Error(
              "PUBLISHED_APPRAISAL_INSTRUMENT_CONTENT_IS_IMMUTABLE",
            );
            error.code = "P0001";
            throw error;
          }

          const row = {
            id: `version-${++this.versionSequence}`,
            instrumentId: data.instrumentId,
            version: data.version,
            status: data.status,
            title: data.title,
            directorateName: data.directorateName,
            instructions: data.instructions,
            calculationMethod: data.calculationMethod,
            scaleMin: data.scaleMin,
            scaleMax: data.scaleMax,
            allowNotApplicable: data.allowNotApplicable,
            allowComments: data.allowComments,
            contentHash: data.contentHash,
            publishedByUserId: data.publishedByUserId,
            publishedAt: data.publishedAt
              ? new Date(data.publishedAt)
              : null,
            metadata: data.metadata,
          };

          this.versionStatusTransitions.push(row.status);

          this.versionsByInstrumentVersion.set(
            this.key(row.instrumentId, row.version),
            row,
          );

          for (const sectionData of data.sections.create) {
            const section = {
              id: `section-${++this.sectionSequence}`,
              instrumentVersionId: row.id,
              key: sectionData.key,
              title: sectionData.title,
              description: sectionData.description,
              order: sectionData.order,
              maxScore: sectionData.maxScore,
              metadata: sectionData.metadata,
            };
            this.sections.push(section);

            for (const itemData of sectionData.items.create) {
              this.items.push({
                id: `item-${++this.itemSequence}`,
                sectionId: section.id,
                ...itemData,
              });
            }
          }

          if (this.raceOnVersionCreate) {
            this.raceOnVersionCreate = false;

            row.status = "ACTIVE";
            row.publishedByUserId = "concurrent-publisher";
            row.publishedAt = new Date("2026-07-25T12:00:00.000Z");
            this.versionStatusTransitions.push(row.status);

            const error = new Error("Unique constraint race");
            error.code = "P2002";
            throw error;
          }

          return selected(row);
        },

        update: async (args) => {
          const row = [...this.versionsByInstrumentVersion.values()].find(
            (candidate) => candidate.id === args.where.id,
          );

          if (!row) {
            throw new Error("Instrument version not found");
          }

          if (
            row.status !== "DRAFT" ||
            args.data.status !== "ACTIVE"
          ) {
            const error = new Error(
              "PUBLISHED_APPRAISAL_INSTRUMENT_VERSION_IS_IMMUTABLE",
            );
            error.code = "P0001";
            throw error;
          }

          row.status = args.data.status;
          row.publishedByUserId = args.data.publishedByUserId;
          row.publishedAt = args.data.publishedAt
            ? new Date(args.data.publishedAt)
            : null;

          this.versionStatusTransitions.push(row.status);

          return selected(row);
        },
      },

      auditLog: {
        create: async (args) => {
          this.auditLogs.push(clone(args.data));
          return selected(args.data);
        },
      },
    };
  }

  async $transaction(callback, options) {
    this.transactionCalls += 1;
    this.transactionOptions.push(clone(options ?? null));
    return callback(this.transactionClient());
  }
}

async function main() {
  const instruments = require(
    path.join(repoRoot, "src", "lib", "appraisals", "instruments.ts"),
  );
  const publication = require(
    path.join(repoRoot, "src", "lib", "appraisals", "publication.ts"),
  );

  const {
    APPRAISAL_INSTRUMENT_CODES,
    APPRAISAL_INSTRUMENT_DEFINITIONS,
  } = instruments;

  const {
    canonicalAppraisalInstrumentDefinition,
    serializeCanonicalAppraisalInstrumentDefinition,
    hashAppraisalInstrumentDefinition,
    publishAppraisalInstrumentVersion,
    APPRAISAL_PUBLICATION_TRANSACTION_OPTIONS,
  } = publication;

  const teacherCode =
    APPRAISAL_INSTRUMENT_CODES.TEACHER_OBSERVATION_V1;
  const directorCode =
    APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1;
  const staffCode =
    APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1;
  const supervisoryCode =
    APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1;
  const teacher = APPRAISAL_INSTRUMENT_DEFINITIONS[teacherCode];
  const director = APPRAISAL_INSTRUMENT_DEFINITIONS[directorCode];
  const staff = APPRAISAL_INSTRUMENT_DEFINITIONS[staffCode];
  const supervisory =
    APPRAISAL_INSTRUMENT_DEFINITIONS[supervisoryCode];

  const canonical = canonicalAppraisalInstrumentDefinition(director);
  const serialized = serializeCanonicalAppraisalInstrumentDefinition(director);
  const contentHash = hashAppraisalInstrumentDefinition(director);

  assertEqual(canonical.schemaVersion, 1, "Canonical schema version");
  assertEqual(
    canonical.commentsPolicy,
    "PROHIBITED",
    "Director canonical comments policy",
  );
  assertEqual(
    canonical.allowComments,
    false,
    "Director canonical comments must be disabled",
  );
  assertEqual(contentHash.length, 64, "SHA-256 hash length");
  assertEqual(
    /^[a-f0-9]{64}$/.test(contentHash),
    true,
    "SHA-256 hash format",
  );
  assert(
    serialized.includes("DIRECTOR_GOVERNANCE_APPRAISAL_V1"),
    "Canonical serialization must include instrument code",
  );
  assert(
    !serialized.toUpperCase().includes(
      "AKATSI SOUTH MUNICIPAL EDUCATION DIRECTORATE",
    ),
    "Canonical definition must remain jurisdiction neutral",
  );

  const reorderedDirector = {
    ...director,
    headerFields: [...director.headerFields].reverse(),
    sections: [...director.sections]
      .reverse()
      .map((section) => ({
        ...section,
        items: [...section.items].reverse(),
      })),
  };

  assertEqual(
    hashAppraisalInstrumentDefinition(reorderedDirector),
    contentHash,
    "Semantically equivalent ordering must keep the same hash",
  );

  const changedDirector = {
    ...director,
    sections: director.sections.map((section, sectionIndex) =>
      sectionIndex === 0
        ? {
            ...section,
            items: section.items.map((item, itemIndex) =>
              itemIndex === 0
                ? { ...item, label: `${item.label} changed` }
                : item,
            ),
          }
        : section,
    ),
  };

  assert(
    hashAppraisalInstrumentDefinition(changedDirector) !== contentHash,
    "Meaningful definition changes must change the hash",
  );

  const database = new FakePublicationDatabase();
  const now = new Date("2026-07-25T12:00:00.000Z");

  const created = await publishAppraisalInstrumentVersion({
    code: directorCode,
    actorUserId: "director-user-1",
    reqId: "req-publication-1",
    ip: "127.0.0.1",
    userAgent: "D3.2-QA",
    now,
    database,
  });

  assertEqual(created.outcome, "CREATED", "First publication outcome");
  assertEqual(created.code, directorCode, "Published instrument code");
  assertEqual(created.version, 1, "Published version");
  assertEqual(created.contentHash, contentHash, "Stored content hash");
  assertEqual(created.status, "ACTIVE", "Published status");
  assertEqual(
    JSON.stringify(database.versionStatusTransitions),
    JSON.stringify(["DRAFT", "ACTIVE"]),
    "Publication must build content in DRAFT before activation",
  );
  assertEqual(created.sectionCount, 7, "Published section count");
  assertEqual(created.itemCount, 35, "Published item count");
  assertEqual(created.publishedAt, now.toISOString(), "Published timestamp");
  assertEqual(database.instrumentsByCode.size, 1, "Instrument row count");
  assertEqual(
    database.versionsByInstrumentVersion.size,
    1,
    "Instrument-version row count",
  );
  assertEqual(database.sections.length, 7, "Section row count");
  assertEqual(database.items.length, 35, "Item row count");
  assertEqual(database.auditLogs.length, 1, "Publication audit count");
  assertEqual(
    JSON.stringify(database.transactionOptions[0]),
    JSON.stringify(APPRAISAL_PUBLICATION_TRANSACTION_OPTIONS),
    "Bounded publication transaction options",
  );
  assertEqual(
    APPRAISAL_PUBLICATION_TRANSACTION_OPTIONS.maxWait,
    10_000,
    "Publication transaction max-wait",
  );
  assertEqual(
    APPRAISAL_PUBLICATION_TRANSACTION_OPTIONS.timeout,
    30_000,
    "Publication transaction timeout",
  );
  assertEqual(
    database.auditLogs[0].action,
    "APPRAISAL_INSTRUMENT_VERSION_PUBLISHED",
    "Publication audit action",
  );
  assertEqual(
    database.auditLogs[0].resourceId,
    created.instrumentVersionId,
    "Publication audit resource",
  );
  assertEqual(
    database.auditLogs[0].metadata.contentHash,
    contentHash,
    "Publication audit hash",
  );

  const storedInstrument = database.instrumentsByCode.get(directorCode);
  assertEqual(
    storedInstrument.description,
    director.documentTitle,
    "Instrument description",
  );
  assertEqual(
    storedInstrument.metadata.jurisdictionScoped,
    true,
    "Instrument jurisdiction scope metadata",
  );

  const storedVersion = [...database.versionsByInstrumentVersion.values()][0];
  assertEqual(
    storedVersion.directorateName,
    null,
    "Published version must not hardcode a directorate",
  );
  assertEqual(
    storedVersion.metadata.expectedRawMaximum,
    175,
    "Published expected raw maximum",
  );
  assertEqual(
    storedVersion.allowComments,
    false,
    "Published Director comments must be disabled",
  );
  assertEqual(
    storedVersion.metadata.commentsPolicy,
    "PROHIBITED",
    "Published Director comments policy metadata",
  );

  const existing = await publishAppraisalInstrumentVersion({
    code: directorCode,
    actorUserId: "director-user-1",
    reqId: "req-publication-2",
    now: new Date("2026-07-26T12:00:00.000Z"),
    database,
  });

  assertEqual(existing.outcome, "EXISTING_MATCH", "Idempotent outcome");
  assertEqual(
    existing.instrumentVersionId,
    created.instrumentVersionId,
    "Idempotent version identity",
  );
  assertEqual(
    database.versionsByInstrumentVersion.size,
    1,
    "Idempotency must not create a second version",
  );
  assertEqual(
    database.auditLogs.length,
    1,
    "Idempotent reads must not create publication audits",
  );

  const headteacherDatabase = new FakePublicationDatabase();

  const staffCreated = await publishAppraisalInstrumentVersion({
    code: staffCode,
    actorUserId: "director-user-1",
    reqId: "req-headteacher-staff-publication",
    now,
    database: headteacherDatabase,
  });

  const supervisoryCreated = await publishAppraisalInstrumentVersion({
    code: supervisoryCode,
    actorUserId: "director-user-1",
    reqId: "req-headteacher-supervisory-publication",
    now,
    database: headteacherDatabase,
  });

  assertEqual(
    staffCreated.outcome,
    "CREATED",
    "Staff-feedback publication outcome",
  );
  assertEqual(
    supervisoryCreated.outcome,
    "CREATED",
    "Supervisory publication outcome",
  );
  assertEqual(
    staffCreated.sectionCount,
    4,
    "Staff-feedback published section count",
  );
  assertEqual(
    staffCreated.itemCount,
    34,
    "Staff-feedback published item count",
  );
  assertEqual(
    supervisoryCreated.sectionCount,
    4,
    "Supervisory published section count",
  );
  assertEqual(
    supervisoryCreated.itemCount,
    34,
    "Supervisory published item count",
  );
  assertEqual(
    staffCreated.status,
    "ACTIVE",
    "Staff-feedback published status",
  );
  assertEqual(
    supervisoryCreated.status,
    "ACTIVE",
    "Supervisory published status",
  );
  assertEqual(
    headteacherDatabase.instrumentsByCode.size,
    2,
    "Headteacher instrument row count",
  );
  assertEqual(
    headteacherDatabase.versionsByInstrumentVersion.size,
    2,
    "Headteacher instrument-version row count",
  );
  assertEqual(
    headteacherDatabase.sections.length,
    8,
    "Headteacher published section rows",
  );
  assertEqual(
    headteacherDatabase.items.length,
    68,
    "Headteacher published item rows",
  );
  assertEqual(
    headteacherDatabase.auditLogs.length,
    2,
    "Headteacher publication audit count",
  );
  assertEqual(
    headteacherDatabase.transactionCalls,
    2,
    "Headteacher publication transaction count",
  );
  for (const storedHeadteacherVersion of
    headteacherDatabase.versionsByInstrumentVersion.values()) {
    assertEqual(
      storedHeadteacherVersion.allowComments,
      false,
      "Published Headteacher comments must be disabled",
    );
    assertEqual(
      storedHeadteacherVersion.metadata.commentsPolicy,
      "PROHIBITED",
      "Published Headteacher comments policy metadata",
    );
  }
  assertEqual(
    JSON.stringify(headteacherDatabase.versionStatusTransitions),
    JSON.stringify(["DRAFT", "ACTIVE", "DRAFT", "ACTIVE"]),
    "Both Headteacher instruments must build in DRAFT before activation",
  );
  assertEqual(
    headteacherDatabase.auditLogs[0].metadata.contentHash,
    hashAppraisalInstrumentDefinition(staff),
    "Staff-feedback publication audit hash",
  );
  assertEqual(
    headteacherDatabase.auditLogs[1].metadata.contentHash,
    hashAppraisalInstrumentDefinition(supervisory),
    "Supervisory publication audit hash",
  );
  assert(
    staffCreated.contentHash !== supervisoryCreated.contentHash,
    "Distinct Headteacher purposes and headers must retain distinct hashes",
  );

  const staffExisting = await publishAppraisalInstrumentVersion({
    code: staffCode,
    actorUserId: "director-user-1",
    reqId: "req-headteacher-staff-idempotent",
    now,
    database: headteacherDatabase,
  });

  assertEqual(
    staffExisting.outcome,
    "EXISTING_MATCH",
    "Staff-feedback publication must be idempotent",
  );
  assertEqual(
    headteacherDatabase.versionsByInstrumentVersion.size,
    2,
    "Headteacher idempotency must not add a version",
  );
  assertEqual(
    headteacherDatabase.auditLogs.length,
    2,
    "Headteacher idempotency must not duplicate an audit",
  );

  const teacherDatabase = new FakePublicationDatabase();

  const teacherCreated = await publishAppraisalInstrumentVersion({
    code: teacherCode,
    actorUserId: "director-user-1",
    reqId: "req-teacher-observation-publication",
    now,
    database: teacherDatabase,
  });

  assertEqual(
    teacherCreated.outcome,
    "CREATED",
    "Teacher-observation publication outcome",
  );
  assertEqual(
    teacherCreated.sectionCount,
    6,
    "Teacher-observation published section count",
  );
  assertEqual(
    teacherCreated.itemCount,
    34,
    "Teacher-observation published item count",
  );
  assertEqual(
    teacherCreated.status,
    "ACTIVE",
    "Teacher-observation published status",
  );
  assertEqual(
    teacherDatabase.instrumentsByCode.size,
    1,
    "Teacher-observation instrument row count",
  );
  assertEqual(
    teacherDatabase.versionsByInstrumentVersion.size,
    1,
    "Teacher-observation version row count",
  );
  assertEqual(
    teacherDatabase.sections.length,
    6,
    "Teacher-observation published section rows",
  );
  assertEqual(
    teacherDatabase.items.length,
    34,
    "Teacher-observation published item rows",
  );
  assertEqual(
    teacherDatabase.auditLogs.length,
    1,
    "Teacher-observation publication audit count",
  );
  assertEqual(
    JSON.stringify(teacherDatabase.versionStatusTransitions),
    JSON.stringify(["DRAFT", "ACTIVE"]),
    "Teacher observation must build in DRAFT before activation",
  );
  assertEqual(
    teacherDatabase.auditLogs[0].metadata.contentHash,
    hashAppraisalInstrumentDefinition(teacher),
    "Teacher-observation publication audit hash",
  );

  const storedTeacherInstrument =
    teacherDatabase.instrumentsByCode.get(teacherCode);
  const storedTeacherVersion =
    [...teacherDatabase.versionsByInstrumentVersion.values()][0];
  assertEqual(
    storedTeacherVersion.allowComments,
    true,
    "Published Teacher comments remain enabled",
  );
  assertEqual(
    storedTeacherVersion.metadata.commentsPolicy,
    "OFFICIAL_FORM_CONTROLLED",
    "Published Teacher comments policy metadata",
  );
  assertEqual(
    storedTeacherInstrument.purpose,
    "TEACHER_OBSERVATION",
    "Teacher-observation stored purpose",
  );
  assertEqual(
    storedTeacherInstrument.subjectType,
    "TEACHER",
    "Teacher-observation stored subject type",
  );

  const teacherExisting = await publishAppraisalInstrumentVersion({
    code: teacherCode,
    actorUserId: "director-user-1",
    reqId: "req-teacher-observation-idempotent",
    now: new Date("2026-07-26T12:00:00.000Z"),
    database: teacherDatabase,
  });

  assertEqual(
    teacherExisting.outcome,
    "EXISTING_MATCH",
    "Teacher-observation publication must be idempotent",
  );
  assertEqual(
    teacherDatabase.versionsByInstrumentVersion.size,
    1,
    "Teacher-observation idempotency must not add a version",
  );
  assertEqual(
    teacherDatabase.auditLogs.length,
    1,
    "Teacher-observation idempotency must not duplicate an audit",
  );

  const driftDatabase = new FakePublicationDatabase();
  const driftCreated = await publishAppraisalInstrumentVersion({
    code: directorCode,
    actorUserId: "director-user-1",
    reqId: "req-drift-seed",
    now,
    database: driftDatabase,
  });
  const driftVersion = [...driftDatabase.versionsByInstrumentVersion.values()][0];
  driftVersion.contentHash = "0".repeat(64);

  await expectError(
    () =>
      publishAppraisalInstrumentVersion({
        code: directorCode,
        actorUserId: "director-user-1",
        reqId: "req-drift-check",
        database: driftDatabase,
      }),
    "APPRAISAL_INSTRUMENT_VERSION_CONTENT_DRIFT",
    "Same code/version with a changed hash must fail closed",
  );

  assert(driftCreated.instrumentVersionId, "Drift seed must publish");

  const identityDatabase = new FakePublicationDatabase();
  identityDatabase.instrumentsByCode.set(directorCode, {
    id: "instrument-drift",
    code: directorCode,
    purpose: director.purpose,
    subjectType: director.subjectType,
    name: "Incorrect name",
    description: director.documentTitle,
    isActive: true,
    createdByUserId: "someone",
    metadata: {},
  });

  await expectError(
    () =>
      publishAppraisalInstrumentVersion({
        code: directorCode,
        actorUserId: "director-user-1",
        reqId: "req-identity-drift",
        database: identityDatabase,
      }),
    "APPRAISAL_INSTRUMENT_IDENTITY_DRIFT",
    "Instrument identity drift must fail closed",
  );

  const statusDatabase = new FakePublicationDatabase();
  await publishAppraisalInstrumentVersion({
    code: directorCode,
    actorUserId: "director-user-1",
    reqId: "req-status-seed",
    now,
    database: statusDatabase,
  });
  [...statusDatabase.versionsByInstrumentVersion.values()][0].status = "DRAFT";

  await expectError(
    () =>
      publishAppraisalInstrumentVersion({
        code: directorCode,
        actorUserId: "director-user-1",
        reqId: "req-status-check",
        database: statusDatabase,
      }),
    "APPRAISAL_INSTRUMENT_VERSION_NOT_ACTIVE",
    "A matching but non-active version must not masquerade as published",
  );

  const raceDatabase = new FakePublicationDatabase({ raceOnVersionCreate: true });
  const raced = await publishAppraisalInstrumentVersion({
    code: directorCode,
    actorUserId: "director-user-1",
    reqId: "req-race",
    now,
    database: raceDatabase,
  });

  assertEqual(
    raced.outcome,
    "EXISTING_MATCH",
    "Concurrent unique conflict must resolve idempotently",
  );
  assertEqual(
    raceDatabase.versionsByInstrumentVersion.size,
    1,
    "Concurrent publication must preserve one version",
  );
  assertEqual(
    raceDatabase.auditLogs.length,
    0,
    "The losing concurrent transaction must not duplicate the audit",
  );

  console.log("");
  console.log("=== D3.2 APPRAISAL PUBLICATION CONTRACT PROOF ===");
  console.log("");
  console.log("Canonical schema version     : 1");
  console.log("Definition hash              : SHA-256 verified");
  console.log("Director V1 sections/items   : 7 / 35");
  console.log("Director V1 raw maximum      : 175");
  console.log("Jurisdiction hardcoding      : absent");
  console.log("Draft-to-active sequence     : verified");
  console.log("Transaction timeout          : 30 seconds, bounded");
  console.log("Atomic nested publication    : verified");
  console.log("Publication audit            : verified");
  console.log("Same-hash idempotency        : verified");
  console.log("Changed-hash drift rejection : verified");
  console.log("Identity drift rejection     : verified");
  console.log("Concurrent race recovery     : verified");
  console.log("Headteacher instruments      : activation-ready, fake publication verified");
  console.log("Teacher observation          : 6 / 34, activation-ready, fake publication verified");
  console.log("");
  console.log("RESULT: D3.2 APPRAISAL PUBLICATION CONTRACT PROOF GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.2 APPRAISAL PUBLICATION CONTRACT PROOF FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
