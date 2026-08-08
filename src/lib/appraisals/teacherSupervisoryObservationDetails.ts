export const TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY = {
  schemaVersion: 2,
  legacySchemaVersion: 1,
  officialHeaderFieldCount: 10,
  assessorEnteredOfficialHeaderFieldCount: 7,
  governanceObservationEvidenceFieldCount: 3,
  dateFormat: "YYYY-MM-DD",
  wholeNumberMinimum: 0,
  wholeNumberMaximum: 80,
  optionalTextMaximumCharacters: 240,
  teacherNameServerResolved: true,
  schoolNameServerResolved: true,
  circuitNameServerResolved: true,
  classSubjectAndSubStrandServerResolved: true,
  enrolmentBreakdownMustBalance: true,
  termIsOfficialHeaderField: false,
  academicYearIsOfficialHeaderField: false,
  termAndAcademicYearLifecycleMetadataDeferred: true,
  mutableAfterDraftCreation: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

export type TeacherSupervisoryObservationDetailsV1 = {
  dateObserved: string;
  yearsInService: number | null;
  yearsInPresentSchool: number | null;
  subjectBeingObserved: string | null;
  subStrand: string | null;
  classTaught: string | null;
  durationMinutes: number | null;
};

export type TeacherSupervisoryObservationDetails = {
  dateObserved: string;
  yearsInService: number;
  yearsInPresentSchool: number;
  subjectBeingObserved: string;
  subStrand: string;
  classTaught: string;
  durationMinutes: number;
  totalEnrolment: number;
  girls: number;
  boys: number;
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
  totalEnrolment?: unknown;
  girls?: unknown;
  boys?: unknown;
};

export type TeacherSupervisoryObservationDetailsSnapshotV1 = {
  schemaVersion: 1;
  dateObserved: string;
  yearsInService: number | null;
  yearsInPresentSchool: number | null;
  subjectBeingObserved: string | null;
  subStrand: string | null;
  classTaught: string | null;
  durationMinutes: number | null;
};

export type TeacherSupervisoryObservationDetailsSnapshotV2 = {
  schemaVersion: 2;
  dateObserved: string;
  yearsInService: number;
  yearsInPresentSchool: number;
  subjectBeingObserved: string;
  subStrand: string;
  classTaught: string;
  durationMinutes: number;
  totalEnrolment: number;
  girls: number;
  boys: number;
};

export type TeacherSupervisoryObservationDetailsSnapshot =
  | TeacherSupervisoryObservationDetailsSnapshotV1
  | TeacherSupervisoryObservationDetailsSnapshotV2;

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

function parseWholeNumber(value: unknown, fieldName: string) {
  if (
    value == null ||
    (typeof value === "string" && clean(value) === "")
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_FIELD_REQUIRED", 400, {
      fieldName,
    });
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

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_FIELD_INVALID", 400, {
      fieldName,
      reason: "NON_NEGATIVE_WHOLE_NUMBER_REQUIRED",
    });
  }

  return parsed;
}

function requiredBoundedWholeNumber(value: unknown, fieldName: string) {
  const parsed = parseWholeNumber(value, fieldName);
  if (
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

function optionalBoundedWholeNumber(value: unknown, fieldName: string) {
  if (
    value == null ||
    (typeof value === "string" && clean(value) === "")
  ) {
    return null;
  }
  return requiredBoundedWholeNumber(value, fieldName);
}

function requiredText(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    fail("TEACHER_SUPERVISORY_OBSERVATION_FIELD_REQUIRED", 400, {
      fieldName,
    });
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_FIELD_REQUIRED", 400, {
      fieldName,
    });
  }

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
  const totalEnrolment = parseWholeNumber(
    input.totalEnrolment,
    "totalEnrolment",
  );
  const girls = parseWholeNumber(input.girls, "girls");
  const boys = parseWholeNumber(input.boys, "boys");

  if (girls + boys !== totalEnrolment) {
    fail("TEACHER_SUPERVISORY_ENROLMENT_TOTAL_MISMATCH", 400, {
      fieldName: "totalEnrolment",
      reason: "GIRLS_PLUS_BOYS_MUST_EQUAL_TOTAL_ENROLMENT",
    });
  }

  return {
    dateObserved: normalizeDateOnly(input.dateObserved),
    yearsInService: requiredBoundedWholeNumber(
      input.yearsInService,
      "yearsInService",
    ),
    yearsInPresentSchool: requiredBoundedWholeNumber(
      input.yearsInPresentSchool,
      "yearsInPresentSchool",
    ),
    subjectBeingObserved: requiredText(
      input.subjectBeingObserved ?? input.subject,
      "subjectBeingObserved",
    ),
    subStrand: requiredText(input.subStrand, "subStrand"),
    classTaught: requiredText(input.classTaught, "classTaught"),
    durationMinutes: requiredBoundedWholeNumber(
      input.durationMinutes ?? input.durationOfLesson,
      "durationMinutes",
    ),
    totalEnrolment,
    girls,
    boys,
  };
}

export function buildTeacherSupervisoryObservationDetailsSnapshot(
  input: TeacherSupervisoryObservationDetailsInput,
): TeacherSupervisoryObservationDetailsSnapshotV2 {
  return {
    schemaVersion:
      TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.schemaVersion,
    ...normalizeTeacherSupervisoryObservationDetails(input),
  };
}

function readLegacySnapshot(
  snapshot: Record<string, unknown>,
): TeacherSupervisoryObservationDetailsSnapshotV1 {
  return {
    schemaVersion: 1,
    dateObserved: normalizeDateOnly(snapshot.dateObserved),
    yearsInService: optionalBoundedWholeNumber(
      snapshot.yearsInService,
      "yearsInService",
    ),
    yearsInPresentSchool: optionalBoundedWholeNumber(
      snapshot.yearsInPresentSchool,
      "yearsInPresentSchool",
    ),
    subjectBeingObserved: optionalText(
      snapshot.subjectBeingObserved,
      "subjectBeingObserved",
    ),
    subStrand: optionalText(snapshot.subStrand, "subStrand"),
    classTaught: optionalText(snapshot.classTaught, "classTaught"),
    durationMinutes: optionalBoundedWholeNumber(
      snapshot.durationMinutes,
      "durationMinutes",
    ),
  };
}

export function readTeacherSupervisoryObservationDetailsSnapshot(
  value: unknown,
): TeacherSupervisoryObservationDetailsSnapshot | null {
  const snapshot = objectValue(value);
  if (!Object.keys(snapshot).length) return null;

  const schemaVersion = Number(snapshot.schemaVersion);
  if (
    schemaVersion !==
      TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.legacySchemaVersion &&
    schemaVersion !== TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.schemaVersion
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_DETAILS_SCHEMA_UNSUPPORTED", 409, {
      fieldName: "observationDetails.schemaVersion",
    });
  }

  if (schemaVersion === 1) {
    return readLegacySnapshot(snapshot);
  }

  return buildTeacherSupervisoryObservationDetailsSnapshot({
    dateObserved: snapshot.dateObserved,
    yearsInService: snapshot.yearsInService,
    yearsInPresentSchool: snapshot.yearsInPresentSchool,
    subjectBeingObserved: snapshot.subjectBeingObserved,
    subStrand: snapshot.subStrand,
    classTaught: snapshot.classTaught,
    durationMinutes: snapshot.durationMinutes,
    totalEnrolment: snapshot.totalEnrolment,
    girls: snapshot.girls,
    boys: snapshot.boys,
  });
}
