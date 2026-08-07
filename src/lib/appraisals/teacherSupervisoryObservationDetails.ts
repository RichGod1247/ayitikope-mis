// src/lib/appraisals/teacherSupervisoryObservationDetails.ts
export const TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY = {
  schemaVersion: 1,
  officialHeaderFieldCount: 10,
  dateFormat: "YYYY-MM-DD",
  wholeNumberMinimum: 0,
  wholeNumberMaximum: 80,
  optionalTextMaximumCharacters: 240,
  teacherNameServerResolved: true,
  schoolNameServerResolved: true,
  circuitNameServerResolved: true,
  termIsOfficialHeaderField: false,
  academicYearIsOfficialHeaderField: false,
  termAndAcademicYearLifecycleMetadataDeferred: true,
  mutableAfterDraftCreation: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

export type TeacherSupervisoryObservationDetails = {
  dateObserved: string;
  yearsInService: number | null;
  yearsInPresentSchool: number | null;
  subjectBeingObserved: string | null;
  subStrand: string | null;
  classTaught: string | null;
  durationMinutes: number | null;
};

export type TeacherSupervisoryObservationDetailsInput = {
  dateObserved?: unknown;
  yearsInService?: unknown;
  yearsInPresentSchool?: unknown;
  subjectBeingObserved?: unknown;
  subject?: unknown;
  subStrand?: unknown;
  classTaught?: unknown;
  durationMinutes?: unknown;
  durationOfLesson?: unknown;
};

export type TeacherSupervisoryObservationDetailsSnapshot = {
  schemaVersion: 1;
  dateObserved: string;
  yearsInService: number | null;
  yearsInPresentSchool: number | null;
  subjectBeingObserved: string | null;
  subStrand: string | null;
  classTaught: string | null;
  durationMinutes: number | null;
};

type ObservationDetailsError = Error & {
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
  const error = new Error(code) as ObservationDetailsError;
  error.code = code;
  error.status = status;
  error.details = details;
  throw error;
}

function normalizeDateOnly(value: unknown) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID", 400, {
      fieldName: "dateObserved",
      reason: "EXPECTED_YYYY_MM_DD",
    });
  }

  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID", 400, {
      fieldName: "dateObserved",
      reason: "EXPECTED_REAL_CALENDAR_DATE",
    });
  }

  return raw;
}

function optionalWholeNumber(value: unknown, fieldName: string) {
  if (
    value == null ||
    (typeof value === "string" && clean(value) === "")
  ) {
    return null;
  }

  let parsed: number;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string" && /^\d+$/.test(clean(value))) {
    parsed = Number(clean(value));
  } else {
    fail("TEACHER_SUPERVISORY_OBSERVATION_FIELD_INVALID", 400, {
      fieldName,
      reason: "WHOLE_NUMBER_REQUIRED",
    });
  }

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.wholeNumberMinimum ||
    parsed > TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.wholeNumberMaximum
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_FIELD_INVALID", 400, {
      fieldName,
      reason: "WHOLE_NUMBER_OUTSIDE_ALLOWED_RANGE",
      minimum:
        TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.wholeNumberMinimum,
      maximum:
        TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.wholeNumberMaximum,
    });
  }

  return parsed;
}

function optionalText(value: unknown, fieldName: string) {
  if (value == null) return null;
  if (typeof value !== "string") {
    fail("TEACHER_SUPERVISORY_OBSERVATION_FIELD_INVALID", 400, {
      fieldName,
      reason: "TEXT_REQUIRED",
    });
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (
    normalized.length >
    TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.optionalTextMaximumCharacters
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_FIELD_INVALID", 400, {
      fieldName,
      reason: "TEXT_TOO_LONG",
      maximumCharacters:
        TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.optionalTextMaximumCharacters,
    });
  }
  return normalized;
}

export function normalizeTeacherSupervisoryObservationDetails(
  input: TeacherSupervisoryObservationDetailsInput,
): TeacherSupervisoryObservationDetails {
  return {
    dateObserved: normalizeDateOnly(input.dateObserved),
    yearsInService: optionalWholeNumber(
      input.yearsInService,
      "yearsInService",
    ),
    yearsInPresentSchool: optionalWholeNumber(
      input.yearsInPresentSchool,
      "yearsInPresentSchool",
    ),
    subjectBeingObserved: optionalText(
      input.subjectBeingObserved ?? input.subject,
      "subjectBeingObserved",
    ),
    subStrand: optionalText(input.subStrand, "subStrand"),
    classTaught: optionalText(input.classTaught, "classTaught"),
    durationMinutes: optionalWholeNumber(
      input.durationMinutes ?? input.durationOfLesson,
      "durationMinutes",
    ),
  };
}

export function buildTeacherSupervisoryObservationDetailsSnapshot(
  input: TeacherSupervisoryObservationDetailsInput,
): TeacherSupervisoryObservationDetailsSnapshot {
  return {
    schemaVersion:
      TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.schemaVersion,
    ...normalizeTeacherSupervisoryObservationDetails(input),
  };
}

export function readTeacherSupervisoryObservationDetailsSnapshot(
  value: unknown,
): TeacherSupervisoryObservationDetailsSnapshot | null {
  const snapshot = objectValue(value);
  if (!Object.keys(snapshot).length) return null;

  if (
    snapshot.schemaVersion !==
    TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.schemaVersion
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_DETAILS_SCHEMA_UNSUPPORTED", 409, {
      fieldName: "observationDetails.schemaVersion",
    });
  }

  return buildTeacherSupervisoryObservationDetailsSnapshot({
    dateObserved: snapshot.dateObserved,
    yearsInService: snapshot.yearsInService,
    yearsInPresentSchool: snapshot.yearsInPresentSchool,
    subjectBeingObserved: snapshot.subjectBeingObserved,
    subStrand: snapshot.subStrand,
    classTaught: snapshot.classTaught,
    durationMinutes: snapshot.durationMinutes,
  });
}
