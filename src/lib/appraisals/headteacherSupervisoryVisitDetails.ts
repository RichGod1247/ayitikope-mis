// src/lib/appraisals/headteacherSupervisoryVisitDetails.ts

export const HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY = {
  schemaVersion: 1,
  visitContextSchemaVersion: 2,
  arrivalTimeFormat: "HH:mm",
  nonNegativeWholeNumbersRequired: true,
  enrolmentBreakdownMustBalance: true,
  teachersPresentCannotExceedStaffStrength: true,
  mutableAfterDraftCreation: false,
  providerCallsAllowed: false,
  databaseWritesAllowed: false,
} as const;

export type HeadteacherSupervisoryVisitDetails = {
  arrivalTime: string;
  staffStrength: number;
  totalEnrolment: number;
  girls: number;
  boys: number;
  teachersPresentAtVisit: number;
};

export type HeadteacherSupervisoryVisitDetailsInput = {
  arrivalTime?: unknown;
  staffStrength?: unknown;
  totalEnrolment?: unknown;
  girls?: unknown;
  boys?: unknown;
  teachersPresentAtVisit?: unknown;
  teachersPresent?: unknown;
};

export type HeadteacherSupervisoryVisitDetailsSnapshot = {
  schemaVersion: 1;
  arrivalTime: string;
  staffStrength: number;
  totalEnrolment: number;
  girls: number;
  boys: number;
  teachersPresentAtVisit: number;
};

type VisitDetailsError = Error & {
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  const error = new Error(code) as VisitDetailsError;
  error.code = code;
  error.status = status;
  error.details = details;
  throw error;
}

function normalizeArrivalTime(value: unknown) {
  const raw = clean(value);
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);

  if (!match) {
    fail("HEADTEACHER_SUPERVISORY_ARRIVAL_TIME_INVALID", 400, {
      fieldName: "arrivalTime",
      reason: "EXPECTED_24_HOUR_HH_MM",
    });
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    fail("HEADTEACHER_SUPERVISORY_ARRIVAL_TIME_INVALID", 400, {
      fieldName: "arrivalTime",
      reason: "EXPECTED_24_HOUR_HH_MM",
    });
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function nonNegativeWholeNumber(value: unknown, fieldName: string) {
  if (
    value == null ||
    (typeof value === "string" && clean(value) === "")
  ) {
    fail("HEADTEACHER_SUPERVISORY_VISIT_FIELD_REQUIRED", 400, {
      fieldName,
    });
  }

  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else {
    const raw = clean(value);
    if (!/^\d+$/.test(raw)) {
      fail("HEADTEACHER_SUPERVISORY_VISIT_FIELD_INVALID", 400, {
        fieldName,
        reason: "NON_NEGATIVE_WHOLE_NUMBER_REQUIRED",
      });
    }
    parsed = Number(raw);
  }

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    fail("HEADTEACHER_SUPERVISORY_VISIT_FIELD_INVALID", 400, {
      fieldName,
      reason: "NON_NEGATIVE_WHOLE_NUMBER_REQUIRED",
    });
  }

  return parsed;
}

export function normalizeHeadteacherSupervisoryVisitDetails(
  input: HeadteacherSupervisoryVisitDetailsInput,
): HeadteacherSupervisoryVisitDetails {
  const arrivalTime = normalizeArrivalTime(input.arrivalTime);
  const staffStrength = nonNegativeWholeNumber(
    input.staffStrength,
    "staffStrength",
  );
  const totalEnrolment = nonNegativeWholeNumber(
    input.totalEnrolment,
    "totalEnrolment",
  );
  const girls = nonNegativeWholeNumber(input.girls, "girls");
  const boys = nonNegativeWholeNumber(input.boys, "boys");
  const teachersPresentAtVisit = nonNegativeWholeNumber(
    input.teachersPresentAtVisit ?? input.teachersPresent,
    "teachersPresentAtVisit",
  );

  if (girls + boys !== totalEnrolment) {
    fail("HEADTEACHER_SUPERVISORY_ENROLMENT_TOTAL_MISMATCH", 400, {
      fieldName: "totalEnrolment",
      reason: "GIRLS_PLUS_BOYS_MUST_EQUAL_TOTAL_ENROLMENT",
    });
  }

  if (teachersPresentAtVisit > staffStrength) {
    fail(
      "HEADTEACHER_SUPERVISORY_TEACHERS_PRESENT_EXCEEDS_STAFF_STRENGTH",
      400,
      {
        fieldName: "teachersPresentAtVisit",
        reason: "TEACHERS_PRESENT_CANNOT_EXCEED_STAFF_STRENGTH",
      },
    );
  }

  return {
    arrivalTime,
    staffStrength,
    totalEnrolment,
    girls,
    boys,
    teachersPresentAtVisit,
  };
}

export function buildHeadteacherSupervisoryVisitDetailsSnapshot(
  input: HeadteacherSupervisoryVisitDetailsInput,
): HeadteacherSupervisoryVisitDetailsSnapshot {
  return {
    schemaVersion:
      HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.schemaVersion,
    ...normalizeHeadteacherSupervisoryVisitDetails(input),
  };
}

export function readHeadteacherSupervisoryVisitDetailsSnapshot(
  value: unknown,
): HeadteacherSupervisoryVisitDetailsSnapshot | null {
  const snapshot = objectValue(value);

  if (!Object.keys(snapshot).length) return null;

  if (
    snapshot.schemaVersion !==
    HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.schemaVersion
  ) {
    fail("HEADTEACHER_SUPERVISORY_VISIT_DETAILS_SCHEMA_UNSUPPORTED", 409, {
      fieldName: "visitDetails.schemaVersion",
    });
  }

  return buildHeadteacherSupervisoryVisitDetailsSnapshot({
    arrivalTime: snapshot.arrivalTime,
    staffStrength: snapshot.staffStrength,
    totalEnrolment: snapshot.totalEnrolment,
    girls: snapshot.girls,
    boys: snapshot.boys,
    teachersPresentAtVisit: snapshot.teachersPresentAtVisit,
  });
}

export function visitDetailsFromEvidenceSnapshot(
  evidenceSnapshotJson: unknown,
): HeadteacherSupervisoryVisitDetailsSnapshot | null {
  const context = objectValue(evidenceSnapshotJson);
  const contextSchemaVersion = Number(context.schemaVersion);

  // Version 1 drafts predate the official visit-detail capture. They remain
  // readable and immutable; missing historical values are never invented.
  if (contextSchemaVersion === 1) return null;

  if (
    contextSchemaVersion !==
    HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY.visitContextSchemaVersion
  ) {
    fail("HEADTEACHER_SUPERVISORY_VISIT_CONTEXT_SCHEMA_UNSUPPORTED", 409, {
      fieldName: "evidenceSnapshotJson.schemaVersion",
    });
  }

  const observation = objectValue(context.observation);
  return readHeadteacherSupervisoryVisitDetailsSnapshot(
    observation.visitDetails,
  );
}
