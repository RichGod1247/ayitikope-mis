//src/lib/appraisals/instruments.ts
import type {
  AppraisalCalculationMethod,
  AppraisalInstrumentPurpose,
  AppraisalRespondentIdentityVisibility,
  AppraisalSubjectType,
} from "@prisma/client";

export const APPRAISAL_INSTRUMENT_CODES = {
  HEADTEACHER_STAFF_FEEDBACK_V1: "HEADTEACHER_STAFF_FEEDBACK_V1",
  HEADTEACHER_SUPERVISORY_ASSESSMENT_V1:
    "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
  TEACHER_OBSERVATION_V1: "TEACHER_OBSERVATION_V1",
  DIRECTOR_GOVERNANCE_APPRAISAL_V1: "DIRECTOR_GOVERNANCE_APPRAISAL_V1",
} as const;

export type AppraisalInstrumentCode =
  (typeof APPRAISAL_INSTRUMENT_CODES)[keyof typeof APPRAISAL_INSTRUMENT_CODES];

export type AppraisalWorkflowKind =
  | "CONFIDENTIAL_MULTI_RESPONDENT_FEEDBACK"
  | "SUPERVISORY_ASSESSMENT";

export type InstrumentSourceState =
  | "AWAITING_OFFICIAL_FORM_TRANSCRIPTION"
  | "TRANSCRIBED_AND_VERIFIED";

export type AppraisalInstrumentSpecification = {
  code: AppraisalInstrumentCode;
  version: 1;
  purpose: AppraisalInstrumentPurpose;
  subjectType: AppraisalSubjectType;
  workflowKind: AppraisalWorkflowKind;
  title: string;
  documentTitle: string;
  targetRole: "TEACHER" | "HEADTEACHER" | "DISTRICT_DIRECTOR";
  expectedSectionCount: number;
  expectedRawMaximum: number;
  calculationMethod: AppraisalCalculationMethod;
  scaleMin: 1;
  scaleMax: 5;
  allowNotApplicable: boolean;
  commentsPolicy: "PROHIBITED" | "OFFICIAL_FORM_CONTROLLED";
  identityVisibility: AppraisalRespondentIdentityVisibility;
  responseWindowDays: number | null;
  minimumResponses: number | null;
  sourceState: InstrumentSourceState;
  activationBlockedReason: string | null;
};

export const HEADTEACHER_ITEM_4_5_POLICY = {
  status: "PROVISIONAL_PENDING_DIRECTOR_RATIFICATION",
  ratified: false,
  originalWording: "Presence of broken furniture",
  adoptedWording:
    "Ensures broken furniture is repaired, replaced, or safely removed promptly.",
  scoringDirection: "POSITIVE_HIGHER_IS_BETTER",
} as const;

export const APPRAISAL_INSTRUMENT_SPECIFICATIONS = {
  HEADTEACHER_STAFF_FEEDBACK_V1: {
    code: APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
    version: 1,
    purpose: "HEADTEACHER_STAFF_FEEDBACK",
    subjectType: "HEADTEACHER",
    workflowKind: "CONFIDENTIAL_MULTI_RESPONDENT_FEEDBACK",
    title: "Confidential Teacher Feedback on Headteacher",
    documentTitle: "Monitoring and Inspection Sheet (Headteachers)",
    targetRole: "HEADTEACHER",
    expectedSectionCount: 4,
    expectedRawMaximum: 170,
    calculationMethod: "AVERAGE_VALID_SECTION_PERCENTAGES",
    scaleMin: 1,
    scaleMax: 5,
    allowNotApplicable: true,
    commentsPolicy: "PROHIBITED",
    identityVisibility: "DIRECTOR_ONLY",
    responseWindowDays: 7,
    minimumResponses: 1,
    sourceState: "TRANSCRIBED_AND_VERIFIED",
    activationBlockedReason: null,
  },

  HEADTEACHER_SUPERVISORY_ASSESSMENT_V1: {
    code:
      APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1,
    version: 1,
    purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
    subjectType: "HEADTEACHER",
    workflowKind: "SUPERVISORY_ASSESSMENT",
    title: "Governance Supervisory Appraisal of Headteacher",
    documentTitle: "Monitoring and Inspection Sheet (Headteachers)",
    targetRole: "HEADTEACHER",
    expectedSectionCount: 4,
    expectedRawMaximum: 170,
    calculationMethod: "AVERAGE_VALID_SECTION_PERCENTAGES",
    scaleMin: 1,
    scaleMax: 5,
    allowNotApplicable: true,
    commentsPolicy: "PROHIBITED",
    identityVisibility: "AUTHORIZED_GOVERNANCE_ONLY",
    responseWindowDays: null,
    minimumResponses: null,
    sourceState: "TRANSCRIBED_AND_VERIFIED",
    activationBlockedReason: null,
  },

  TEACHER_OBSERVATION_V1: {
    code: APPRAISAL_INSTRUMENT_CODES.TEACHER_OBSERVATION_V1,
    version: 1,
    purpose: "TEACHER_OBSERVATION",
    subjectType: "TEACHER",
    workflowKind: "SUPERVISORY_ASSESSMENT",
    title: "Governance Supervisory Appraisal of Teacher",
    documentTitle: "Monitoring and Inspection Sheet (Teachers)",
    targetRole: "TEACHER",
    expectedSectionCount: 6,
    expectedRawMaximum: 170,
    calculationMethod: "AVERAGE_VALID_SECTION_PERCENTAGES",
    scaleMin: 1,
    scaleMax: 5,
    allowNotApplicable: true,
    commentsPolicy: "OFFICIAL_FORM_CONTROLLED",
    identityVisibility: "AUTHORIZED_GOVERNANCE_ONLY",
    responseWindowDays: null,
    minimumResponses: null,
    sourceState: "TRANSCRIBED_AND_VERIFIED",
    activationBlockedReason: null,
  },

  DIRECTOR_GOVERNANCE_APPRAISAL_V1: {
    code: APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1,
    version: 1,
    purpose: "GOVERNANCE_OFFICER_FEEDBACK",
    subjectType: "GOVERNANCE_OFFICER",
    workflowKind: "SUPERVISORY_ASSESSMENT",
    title: "Director Work Appraisal",
    documentTitle: "Work Appraisal Form (Director)",
    targetRole: "DISTRICT_DIRECTOR",
    expectedSectionCount: 7,
    expectedRawMaximum: 175,
    calculationMethod: "AVERAGE_VALID_SECTION_PERCENTAGES",
    scaleMin: 1,
    scaleMax: 5,
    allowNotApplicable: true,
    commentsPolicy: "PROHIBITED",
    identityVisibility: "AUTHORIZED_GOVERNANCE_ONLY",
    responseWindowDays: null,
    minimumResponses: null,
    sourceState: "TRANSCRIBED_AND_VERIFIED",
    activationBlockedReason: null,
  },
} as const satisfies Record<
  AppraisalInstrumentCode,
  AppraisalInstrumentSpecification
>;

export type AppraisalItemScoringDirection =
  | "POSITIVE_HIGHER_IS_BETTER"
  | "REQUIRES_POLICY_CONFIRMATION";

export type AppraisalInstrumentItemDefinition = {
  key: string;
  label: string;
  order: number;
  maxScore: number;
  isRequired: boolean;
  scoringDirection: AppraisalItemScoringDirection;
  sourceNotes?: readonly string[];
};

export type AppraisalInstrumentSectionDefinition = {
  key: string;
  title: string;
  description?: string | null;
  order: number;
  maxScore: number;
  items: readonly AppraisalInstrumentItemDefinition[];
};

export type AppraisalHeaderFieldInputMode =
  | "SNAPSHOT"
  | "MANUAL"
  | "AUTO_OR_MANUAL";

export type AppraisalInstrumentHeaderFieldDefinition = {
  key: string;
  label: string;
  order: number;
  inputMode: AppraisalHeaderFieldInputMode;
  required: boolean;
};

export type AppraisalOfficialHeaderDefinition = {
  jurisdictionScoped: true;
  documentTitle: string;
};

export type AppraisalInstrumentDefinition =
  AppraisalInstrumentSpecification & {
    sourceState: "TRANSCRIBED_AND_VERIFIED";
    directorateName: null;
    officialHeader: AppraisalOfficialHeaderDefinition;
    instructions: string;
    allowComments: boolean;
    headerFields: readonly AppraisalInstrumentHeaderFieldDefinition[];
    sourceNotes: readonly string[];
    sections: readonly AppraisalInstrumentSectionDefinition[];
  };

function item(
  key: string,
  order: number,
  label: string,
  options?: {
    scoringDirection?: AppraisalItemScoringDirection;
    sourceNotes?: readonly string[];
  },
): AppraisalInstrumentItemDefinition {
  return {
    key,
    label,
    order,
    maxScore: 5,
    isRequired: true,
    scoringDirection:
      options?.scoringDirection ?? "POSITIVE_HIGHER_IS_BETTER",
    sourceNotes: options?.sourceNotes,
  };
}

const HEADTEACHER_SHARED_SECTIONS = [
  {
    key: "ADMINISTRATIVE_MANAGERIAL_COMPETENCE",
    title: "Measurement of Administrative and Managerial Competence",
    description: "Applicable to the Head teacher",
    order: 1,
    maxScore: 55,
    items: [
      item(
        "1.1",
        1,
        "Number of Enrolment Drive Organized (Evidence from Log book records)",
      ),
      item(
        "1.2",
        2,
        "Number of PLCs Organized (Evidence from attendance sheet/Log Book)",
      ),
      item(
        "1.3",
        3,
        "Vetting of Scheme of Work and Lesson Notes (Evidence from lesson note books)",
      ),
      item(
        "1.4",
        4,
        "Lesson(s) Observed (Evidence from lesson note books and log books)",
      ),
      item(
        "1.5",
        5,
        "Feedback(s) Given (Evidence from lesson note books)",
      ),
      item(
        "1.6",
        6,
        "Information flow from Head teacher to teachers (to be confirmed from teachers)",
      ),
      item("1.7", 7, "Oral and Written Communication Skills"),
      item(
        "1.8",
        8,
        "Coaching and monitoring of teachers by Head teacher (teachers to confirm)",
      ),
      item(
        "1.9",
        9,
        "Regular and timely provision of TLR (teachers to confirm)",
      ),
      item(
        "1.11",
        10,
        "Tone of the school at the time of arrival or at break over",
        {
          sourceNotes: [
            "The printed form skips item number 1.10. The original 1.11 key is preserved.",
          ],
        },
      ),
      item(
        "1.12",
        11,
        "Timely submission of reports (Situational/Termly/SPIP) to District Education Office",
      ),
    ],
  },
  {
    key: "RECORD_KEEPING_COMPETENCE",
    title: "Measurement of Record-Keeping Competence",
    order: 2,
    maxScore: 45,
    items: [
      item("2.1", 1, "Availability and Use of Admission Registers"),
      item("2.2", 2, "Availability and Use of Log Book"),
      item("2.3", 3, "Availability and Use of Teachers’ Attendance Book"),
      item("2.4", 4, "Availability and Use of Students’ Attendance Book"),
      item("2.5", 5, "Availability and Use of Continuous Assessment Records"),
      item(
        "2.6",
        6,
        "Availability and Display of Staff List and Organogram in Head teacher’s office",
      ),
      item(
        "2.7",
        7,
        "Use and Display of Teachers Attendance Chart (Weekly Summary)",
      ),
      item("2.8", 8, "Use and Display of Lesson Note Vetting Chat", {
        sourceNotes: [
          "The printed source says 'Chat'. The wording is preserved rather than silently changed to 'Chart'.",
        ],
      }),
      item("2.9", 9, "Presence and usage of Teachers’ Movement Book"),
    ],
  },
  {
    key: "SCHOOL_GOVERNANCE_ENVIRONMENT",
    title: "Measurement of School Governance and Environment",
    order: 3,
    maxScore: 40,
    items: [
      item("3.1", 1, "Number of Staff Meetings Held within the academic year"),
      item("3.2", 2, "Number of PTA/SMC/CTA Meetings Held"),
      item("3.3", 3, "Number of SPAMs Held"),
      item(
        "3.4",
        4,
        "Existence of School Committees (Exam/Sports/SHEP/Culture/Disciplinary/ETC)",
      ),
      item("3.5", 5, "Delegates duties to Staff"),
      item(
        "3.6",
        6,
        "Has cordial relationship with Staff and maintain cordiality among staff",
      ),
      item("3.7", 7, "Presence of Students’ Leadership"),
      item(
        "3.8",
        8,
        "Cleanliness and Sanitation of the school (to be confirmed by going round)",
      ),
    ],
  },
  {
    key: "RESOURCE_MOBILIZATION_TLR",
    title:
      "Measurement of Mobilization and Use of Teaching & Learning Resources",
    order: 4,
    maxScore: 30,
    items: [
      item(
        "4.1",
        1,
        "Mobilization and effective use of financial resources (consider IGF, PTC, SMC dues)",
      ),
      item("4.2", 2, "Accurate keeping of financial records"),
      item("4.3", 3, "Mobilization, storage and effective use of TLRs"),
      item("4.4", 4, "Availability of adequate furniture"),
      item("4.5", 5, HEADTEACHER_ITEM_4_5_POLICY.adoptedWording, {
        scoringDirection: HEADTEACHER_ITEM_4_5_POLICY.scoringDirection,
        sourceNotes: [
          `Original printed wording: "${HEADTEACHER_ITEM_4_5_POLICY.originalWording}".`,
          `Policy status: ${HEADTEACHER_ITEM_4_5_POLICY.status}.`,
          "Positive scoring direction: higher scores mean stronger evidence that broken furniture is promptly repaired, replaced, or safely removed.",
          "This provisional correction may be replaced after Director ratification without changing the item key, section order, or scoring scale.",
        ],
      }),
      item(
        "4.6",
        6,
        "Proper maintenance of school structure (classrooms, canteens, washrooms, etc)",
      ),
    ],
  },
] as const satisfies readonly AppraisalInstrumentSectionDefinition[];

const HEADTEACHER_STAFF_FEEDBACK_HEADER_FIELDS = [
  {
    key: "schoolName",
    label: "Name of School",
    order: 1,
    inputMode: "SNAPSHOT",
    required: true,
  },
  {
    key: "circuitName",
    label: "Name of Circuit",
    order: 2,
    inputMode: "SNAPSHOT",
    required: true,
  },
  {
    key: "headteacherName",
    label: "Name of Head",
    order: 3,
    inputMode: "SNAPSHOT",
    required: true,
  },
] as const satisfies readonly AppraisalInstrumentHeaderFieldDefinition[];

const HEADTEACHER_SUPERVISORY_HEADER_FIELDS = [
  ...HEADTEACHER_STAFF_FEEDBACK_HEADER_FIELDS,
  {
    key: "dateOfVisit",
    label: "Date of Visit",
    order: 4,
    inputMode: "MANUAL",
    required: true,
  },
  {
    key: "arrivalTime",
    label: "Arrival Time",
    order: 5,
    inputMode: "MANUAL",
    required: true,
  },
  {
    key: "staffStrength",
    label: "Staff Strength",
    order: 6,
    inputMode: "AUTO_OR_MANUAL",
    required: true,
  },
  {
    key: "totalEnrolment",
    label: "Total Enrolment",
    order: 7,
    inputMode: "AUTO_OR_MANUAL",
    required: true,
  },
  {
    key: "girls",
    label: "Girls",
    order: 8,
    inputMode: "AUTO_OR_MANUAL",
    required: true,
  },
  {
    key: "boys",
    label: "Boys",
    order: 9,
    inputMode: "AUTO_OR_MANUAL",
    required: true,
  },
  {
    key: "teachersPresentAtVisit",
    label: "Teachers Present at the Time of Visit",
    order: 10,
    inputMode: "AUTO_OR_MANUAL",
    required: true,
  },
] as const satisfies readonly AppraisalInstrumentHeaderFieldDefinition[];

const TEACHER_OBSERVATION_HEADER_FIELDS = [
  {
    key: "teacherName",
    label: "Name of Teacher",
    order: 1,
    inputMode: "SNAPSHOT",
    required: true,
  },
  {
    key: "yearsInService",
    label: "Number of Years in the Service",
    order: 2,
    inputMode: "AUTO_OR_MANUAL",
    required: false,
  },
  {
    key: "schoolName",
    label: "Name of School",
    order: 3,
    inputMode: "SNAPSHOT",
    required: true,
  },
  {
    key: "yearsInPresentSchool",
    label: "Number of Years in Present School",
    order: 4,
    inputMode: "AUTO_OR_MANUAL",
    required: false,
  },
  {
    key: "circuitName",
    label: "Name of Circuit",
    order: 5,
    inputMode: "SNAPSHOT",
    required: true,
  },
  {
    key: "subjectBeingObserved",
    label: "Subject Being Observed",
    order: 6,
    inputMode: "AUTO_OR_MANUAL",
    required: false,
  },
  {
    key: "dateObserved",
    label: "Date Observed",
    order: 7,
    inputMode: "MANUAL",
    required: true,
  },
  {
    key: "subStrand",
    label: "Sub-strand",
    order: 8,
    inputMode: "AUTO_OR_MANUAL",
    required: false,
  },
  {
    key: "classTaught",
    label: "Class Taught",
    order: 9,
    inputMode: "AUTO_OR_MANUAL",
    required: false,
  },
  {
    key: "durationOfLesson",
    label: "Duration of Lesson",
    order: 10,
    inputMode: "MANUAL",
    required: false,
  },
] as const satisfies readonly AppraisalInstrumentHeaderFieldDefinition[];

const TEACHER_OBSERVATION_SECTIONS = [
  {
    key: "PREPARATION",
    title: "Measurement of Preparation of Lesson Plan",
    order: 1,
    maxScore: 35,
    items: [
      item(
        "1.1",
        1,
        "Preparation of Scheme of work (vetted and covers the term)",
      ),
      item(
        "1.2",
        2,
        "Preparation of Learner notes (vetted, detailed, appropriate and up-to-date)",
      ),
      item(
        "1.3",
        3,
        "Originality of Learner Notes (No signs of downloaded learner notes)",
      ),
      item(
        "1.4",
        4,
        "Statement of adequate and appropriate core competencies",
      ),
      item(
        "1.5",
        5,
        "Statement of appropriate/relevant TLMs in the lesson plan",
      ),
      item(
        "1.6",
        6,
        "Statement of interactive activities in the lesson plan",
      ),
      item(
        "1.7",
        7,
        "Coherence of stages of learner plan (well-arranged and well-paced)",
      ),
    ],
  },
  {
    key: "LESSON_DELIVERY",
    title: "Measurement of Lesson Delivery/Instruction",
    order: 2,
    maxScore: 25,
    items: [
      item(
        "2.1",
        1,
        "Articulation of the Performance Indicators (PI) at the beginning of the lesson",
      ),
      item(
        "2.2",
        2,
        "Clarity of explanation of content (logically sequenced, use of illustrations, use of examples to aid understanding)",
      ),
      item(
        "2.3",
        3,
        "Linkage of pupils daily life or cultural orientation to the content of the lesson",
      ),
      item("2.4", 4, "Deployment of TLMs during lesson delivery"),
      item("2.5", 5, "Teacher's confidence level during lesson delivery"),
    ],
  },
  {
    key: "CLASSROOM_CULTURE",
    title: "Measurement of Classroom Culture",
    order: 3,
    maxScore: 25,
    items: [
      item(
        "3.1",
        1,
        "The teacher treats all pupils with respect (e.g. teacher does not shout on pupils)",
      ),
      item(
        "3.2",
        2,
        "The teacher uses positive language (e.g. good attempt, well done)",
      ),
      item(
        "3.3",
        3,
        "The teacher rephrases language to promote understanding",
      ),
      item(
        "3.4",
        4,
        "The teacher focuses on expected behaviour and redirects misbehavior",
      ),
      item(
        "3.5",
        5,
        "The teacher recognizes learners with special needs and provides them with relevant support",
      ),
    ],
  },
  {
    key: "LEARNER_PARTICIPATION",
    title: "Measurement of Learners' Participation During Lesson Delivery",
    order: 4,
    maxScore: 30,
    items: [
      item(
        "4.1",
        1,
        "Pupils volunteer to participate in the lesson without the teacher's prompt",
      ),
      item("4.2", 2, "Learners ask questions during lesson"),
      item(
        "4.3",
        3,
        "Learners work collaboratively with each other during lesson",
      ),
      item(
        "4.4",
        4,
        "Learners accept feedback from peers and teachers and work with them",
      ),
      item(
        "4.5",
        5,
        "Learners have adequate learning materials (textbooks, notebooks, exercise books, pens, pencils, etc)",
      ),
      item(
        "4.6",
        6,
        "The teacher provides learners with choices when it comes to activities",
      ),
    ],
  },
  {
    key: "UNDERSTANDING_STRATEGIES",
    title: "Measurement of Strategies to Improve Pupils' Understanding",
    order: 5,
    maxScore: 30,
    items: [
      item(
        "5.1",
        1,
        "The teacher uses questions, prompts or other strategies to determine pupils' level of understanding",
      ),
      item(
        "5.2",
        2,
        "The teacher distributes questions/learning task to all pupils in the class",
      ),
      item(
        "5.3",
        3,
        "The teacher monitors pupils/students during independent/group work",
      ),
      item(
        "5.4",
        4,
        "The teacher provides positive reinforcement (nodding, good, okay but...)",
      ),
      item(
        "5.5",
        5,
        "The teacher links current lessons to previous lessons or knowledge in other subjects",
      ),
      item(
        "5.6",
        6,
        "The teacher provides guidance to pupils before handing exercises/assignments",
      ),
    ],
  },
  {
    key: "EVALUATION_STRATEGIES",
    title: "Measurement of Evaluation Strategies",
    order: 6,
    maxScore: 25,
    items: [
      item(
        "6.1",
        1,
        "Set tasks on relevant performance indicators/core competencies",
      ),
      item("6.2", 2, "Marks learner's work promptly and accurately"),
      item(
        "6.3",
        3,
        "Provides feedback on learners performance (good/poor is not a good feedback)",
      ),
      item(
        "6.4",
        4,
        "Records learner's marks in continuous assessment books/record",
      ),
      item("6.5", 5, "Corrections have been done and marked"),
    ],
  },
] as const satisfies readonly AppraisalInstrumentSectionDefinition[];

const DIRECTOR_SECTIONS = [
  {
    key: "ADMINISTRATIVE_MANAGERIAL_COMPETENCE",
    title: "Measurement of Administrative and Managerial Competence",
    order: 1,
    maxScore: 40,
    items: [
      item(
        "1.1",
        1,
        "Has good and up-to-date understanding of educational policies and works towards implementing the policies (e.g. consider modes of appointments/reposting/releases/leaves, other fringe benefit, etc).",
      ),
      item(
        "1.2",
        2,
        "Demonstrates clear vision to improve teaching and learning through the introduction of intervention programs.",
      ),
      item(
        "1.3",
        3,
        "Demonstrates ability to identify issues, analyze challenges and develop solutions to the challenges based on available data.",
      ),
      item(
        "1.4",
        4,
        "Makes informed decisions promptly and gives policy directives (on human, material & financial resources).",
      ),
      item(
        "1.5",
        5,
        "Involves staff/headteachers/teachers in decision making",
      ),
      item("1.6", 6, "Holds staff meetings regularly and effectively"),
      item(
        "1.7",
        7,
        "Delegates duties to staff/headteachers/teachers effectively.",
      ),
      item(
        "1.8",
        8,
        "Fosters positive work culture by encouraging teamwork, recognition of effort and positive reinforcement.",
      ),
    ],
  },
  {
    key: "TIME_MANAGEMENT",
    title: "Measurement of Time Management",
    order: 2,
    maxScore: 25,
    items: [
      item("2.1", 1, "Regular and punctual at work/workshops/program."),
      item(
        "2.2",
        2,
        "Prioritizes tasks and ensure that administrative duties are done in a timely and prompt manner",
      ),
      item(
        "2.3",
        3,
        "Tracks reporting time of staff to school, office, programs and meeting of deadlines.",
      ),
      item(
        "2.4",
        4,
        "Provides feedback to staff on time-related issues and support them to complete task on time.",
      ),
      item(
        "2.5",
        5,
        "Reprimands and sanctions staff as and when appropriate.",
      ),
    ],
  },
  {
    key: "EMPLOYEE_ENGAGEMENT_RELATIONSHIP",
    title: "Measurement of Employee Engagement & Relationship",
    order: 3,
    maxScore: 30,
    items: [
      item(
        "3.1",
        1,
        "Demonstrates good interpersonal relationship with staff and teachers to create commitment to work.",
      ),
      item(
        "3.2",
        2,
        "Demonstrates empathy and ability to resolve disputes and disagreements between individuals to promote healthy working environment.",
      ),
      item(
        "3.3",
        3,
        "Visits classrooms to observe teaching/learning activities",
      ),
      item(
        "3.4",
        4,
        "Operates an open-door policy and listen to teachers, individually and in groups",
      ),
      item(
        "3.5",
        5,
        "Initiates strategies that promote professional development of teachers and staff (refresher training, steady leave, Cluster-based PLCs, orientation for new recruits)",
      ),
      item(
        "3.6",
        6,
        "Initiates strategies that promote mental, physical and emotional development of staff by understanding the challenges of staff and helping resolve their problems.",
      ),
    ],
  },
  {
    key: "STAKEHOLDER_ENGAGEMENT_RELATIONSHIP",
    title: "Measurement of Stakeholder Engagement & Relationship",
    order: 4,
    maxScore: 20,
    items: [
      item(
        "4.1",
        1,
        "Identifies and works with relevant stakeholders to promote educational development",
      ),
      item(
        "4.2",
        2,
        "Discusses learning outcomes (NST/SPAM/Baselines studies/BECE) with parents, traditional rulers and stakeholders in order to find solution.",
      ),
      item(
        "4.3",
        3,
        "Attends PTA, SMC, SPAM, Traditional Festivals and other programs when invited.",
      ),
      item(
        "4.4",
        4,
        "Enforces community involvement in school management and decision making",
      ),
    ],
  },
  {
    key: "RESOURCE_MOBILIZATION_FINANCIAL_MANAGEMENT",
    title: "Resource Mobilization and Financial Management",
    order: 5,
    maxScore: 20,
    items: [
      item(
        "5.1",
        1,
        "Maintains and keeps official property in good shape (vehicles, motor cycles, furniture, buildings, etc)",
      ),
      item(
        "5.2",
        2,
        "Ensures official and school compounds are clean and healthy.",
      ),
      item(
        "5.3",
        3,
        "Ensures mobilization of adequate resources (Books, chalks, pens, equipment) and maintain them for effective use.",
      ),
      item(
        "5.4",
        4,
        "Manages financial matters effectively (Capitation grants/Galop/utilities, etc)",
      ),
    ],
  },
  {
    key: "COMMUNICATION_SKILLS",
    title: "Measurement of Communication Skills",
    order: 6,
    maxScore: 10,
    items: [
      item(
        "6.1",
        1,
        "Speak clearly and correctly with minimal grammatical errors",
      ),
      item(
        "6.2",
        2,
        "Communicates clearly and promptly in writing with minimal grammatical errors.",
      ),
    ],
  },
  {
    key: "PERSONALITY_TRAIT",
    title: "Measurement of Personality Trait",
    order: 7,
    maxScore: 30,
    items: [
      item(
        "7.1",
        1,
        "Ability to generate new ideas that contribute to solving problems",
      ),
      item("7.2", 2, "Ability to take action in times of difficulty"),
      item(
        "7.3",
        3,
        "Ability to plan ahead to introduce a project/program.",
      ),
      item("7.4", 4, "Appearance: neat in dressing and not shabby"),
      item(
        "7.5",
        5,
        "Decency: not rowdy/quarrelsome; does not get drunk.",
      ),
      item(
        "7.6",
        6,
        "Corruption: The Director is not engaged in or tolerate acts of corruption.",
      ),
    ],
  },
] as const satisfies readonly AppraisalInstrumentSectionDefinition[];

export const APPRAISAL_INSTRUMENT_DEFINITIONS = {
  HEADTEACHER_STAFF_FEEDBACK_V1: {
    ...APPRAISAL_INSTRUMENT_SPECIFICATIONS.HEADTEACHER_STAFF_FEEDBACK_V1,
    directorateName: null,
    officialHeader: {
      jurisdictionScoped: true,
      documentTitle: "Monitoring and Inspection Sheet (Headteachers)",
    },
    instructions:
      "Score each item from 1 to 5 or select N/A where you do not have direct knowledge. Do not provide free-text comments. Your identity is hidden from the headteacher and may be viewed only by an authorized Director-level reviewer through an audited action.",
    allowComments: false,
    headerFields: HEADTEACHER_STAFF_FEEDBACK_HEADER_FIELDS,
    sourceNotes: [
      "The same official 34-item headteacher instrument is reused for confidential staff feedback and governance supervisory assessment.",
      "Visit-only paper fields are not collected from teachers; school, circuit and headteacher identity are resolved as immutable snapshots.",
      "The printed item numbering skips 1.10 and the source keys are preserved.",
      "The printed item 2.8 says 'Lesson Note Vetting Chat' and is preserved verbatim.",
      "Item 4.5 uses a provisional positive wording pending Director ratification; the item key and 1–5 scale remain unchanged.",
      "The directorate heading must be resolved from the active governance jurisdiction at runtime and must never be hardcoded.",
    ],
    sections: HEADTEACHER_SHARED_SECTIONS,
  },

  HEADTEACHER_SUPERVISORY_ASSESSMENT_V1: {
    ...APPRAISAL_INSTRUMENT_SPECIFICATIONS
      .HEADTEACHER_SUPERVISORY_ASSESSMENT_V1,
    directorateName: null,
    officialHeader: {
      jurisdictionScoped: true,
      documentTitle: "Monitoring and Inspection Sheet (Headteachers)",
    },
    instructions:
      "The authorized governance assessor records the official visit details, scores each item from 1 to 5 or N/A, and finalizes the assessment for separate review. The reviewer may accept, return or hold the assessment but cannot rewrite the assessor’s scores.",
    allowComments: false,
    headerFields: HEADTEACHER_SUPERVISORY_HEADER_FIELDS,
    sourceNotes: [
      "The same official 34-item headteacher instrument is reused for confidential staff feedback and governance supervisory assessment.",
      "The printed item numbering skips 1.10 and the source keys are preserved.",
      "The printed item 2.8 says 'Lesson Note Vetting Chat' and is preserved verbatim.",
      "Item 4.5 uses a provisional positive wording pending Director ratification; the item key and 1–5 scale remain unchanged.",
      "The directorate heading must be resolved from the assessor’s active governance jurisdiction at runtime and must never be hardcoded.",
    ],
    sections: HEADTEACHER_SHARED_SECTIONS,
  },

  TEACHER_OBSERVATION_V1: {
    ...APPRAISAL_INSTRUMENT_SPECIFICATIONS.TEACHER_OBSERVATION_V1,
    directorateName: null,
    officialHeader: {
      jurisdictionScoped: true,
      documentTitle: "Monitoring and Inspection Sheet (Teachers)",
    },
    instructions:
      "The authorized governance assessor records the observed lesson particulars, scores each item from 1 to 5 or N/A, may add the official general comment, and finalizes the observation for separate staged review. Finalized governance observation scores are immutable and do not overwrite the Headteacher's Teacher appraisal.",
    allowComments: true,
    headerFields: TEACHER_OBSERVATION_HEADER_FIELDS,
    sourceNotes: [
      "The official six-section, 34-item Teacher observation form is reused without changing the legacy Headteacher-to-Teacher appraisal record.",
      "The raw maximum is 170, with section maximums 35, 25, 25, 30, 30 and 25.",
      "N/A rows are excluded from the applicable section denominator; the overall result is the average of valid section percentages.",
      "The official form permits general comments and displays structured evidence links separately from the scoring rows.",
      "The directorate heading must be resolved from the governance assessor's active jurisdiction at runtime and must never be hardcoded.",
    ],
    sections: TEACHER_OBSERVATION_SECTIONS,
  },

  DIRECTOR_GOVERNANCE_APPRAISAL_V1: {
    ...APPRAISAL_INSTRUMENT_SPECIFICATIONS.DIRECTOR_GOVERNANCE_APPRAISAL_V1,
    directorateName: null,
    officialHeader: {
      jurisdictionScoped: true,
      documentTitle: "Work Appraisal Form (Director)",
    },
    instructions:
      "Score each item from 1 to 5 or N/A. Do not provide free-text comments. Section percentages exclude N/A items from their denominators. The overall result is the average of all seven valid section percentages.",
    allowComments: false,
    headerFields: [],
    sourceNotes: [
      "The printed title says 'Work Appraisal Form (Headteachers)' but the supplied official copy is corrected by hand to 'Director'. The digital title therefore uses 'Work Appraisal Form (Director)'.",
      "The printed overall formula averages only sections 1.0 to 4.0. This is treated as a source-form typo because the instrument contains seven sections with a raw maximum of 175.",
      "The digital overall percentage averages all seven valid section percentages.",
      "The directorate heading must be resolved from the target officer’s active governance jurisdiction at runtime and must never be hardcoded.",
    ],
    sections: DIRECTOR_SECTIONS,
  },
} as const satisfies Record<
  AppraisalInstrumentCode,
  AppraisalInstrumentDefinition
>;

export type InstrumentValidationResult =
  | { ok: true }
  | {
      ok: false;
      errors: string[];
    };

export function validateInstrumentDefinition(
  definition: AppraisalInstrumentDefinition,
): InstrumentValidationResult {
  const errors: string[] = [];

  if (!definition.officialHeader.jurisdictionScoped) {
    errors.push("OFFICIAL_HEADER_MUST_BE_JURISDICTION_SCOPED");
  }
  if (definition.directorateName !== null) {
    errors.push("DIRECTORATE_NAME_MUST_NOT_BE_HARDCODED");
  }
  if (!definition.documentTitle.trim()) {
    errors.push("DOCUMENT_TITLE_REQUIRED");
  }
  if (
    definition.documentTitle !== definition.officialHeader.documentTitle
  ) {
    errors.push("DOCUMENT_TITLE_HEADER_MISMATCH");
  }

  if (definition.sections.length !== definition.expectedSectionCount) {
    errors.push(
      `EXPECTED_${definition.expectedSectionCount}_SECTIONS_GOT_${definition.sections.length}`,
    );
  }

  const sectionKeys = new Set<string>();
  const sectionOrders = new Set<number>();
  const globalItemKeys = new Set<string>();
  let rawMaximum = 0;
  let hasUnconfirmedScoringDirection = false;

  for (const section of definition.sections) {
    if (!section.key.trim()) errors.push("SECTION_KEY_REQUIRED");
    if (!section.title.trim()) errors.push(`SECTION_TITLE_REQUIRED:${section.key}`);
    if (sectionKeys.has(section.key)) errors.push(`DUPLICATE_SECTION_KEY:${section.key}`);
    if (sectionOrders.has(section.order)) {
      errors.push(`DUPLICATE_SECTION_ORDER:${section.order}`);
    }

    sectionKeys.add(section.key);
    sectionOrders.add(section.order);

    const itemKeys = new Set<string>();
    const itemOrders = new Set<number>();
    const calculatedSectionMaximum = section.items.reduce(
      (sum, row) => sum + row.maxScore,
      0,
    );

    if (calculatedSectionMaximum !== section.maxScore) {
      errors.push(
        `SECTION_MAXIMUM_MISMATCH:${section.key}:${section.maxScore}:${calculatedSectionMaximum}`,
      );
    }

    rawMaximum += section.maxScore;

    for (const row of section.items) {
      if (!row.key.trim()) errors.push(`ITEM_KEY_REQUIRED:${section.key}`);
      if (!row.label.trim()) errors.push(`ITEM_LABEL_REQUIRED:${row.key}`);
      if (row.maxScore < definition.scaleMin || row.maxScore > definition.scaleMax) {
        errors.push(`ITEM_MAXIMUM_OUT_OF_RANGE:${row.key}:${row.maxScore}`);
      }
      if (itemKeys.has(row.key)) errors.push(`DUPLICATE_ITEM_KEY:${row.key}`);
      if (globalItemKeys.has(row.key)) {
        errors.push(`DUPLICATE_GLOBAL_ITEM_KEY:${row.key}`);
      }
      if (itemOrders.has(row.order)) {
        errors.push(`DUPLICATE_ITEM_ORDER:${section.key}:${row.order}`);
      }
      if (row.scoringDirection === "REQUIRES_POLICY_CONFIRMATION") {
        hasUnconfirmedScoringDirection = true;
      }

      itemKeys.add(row.key);
      globalItemKeys.add(row.key);
      itemOrders.add(row.order);
    }
  }

  if (rawMaximum !== definition.expectedRawMaximum) {
    errors.push(
      `RAW_MAXIMUM_MISMATCH:${definition.expectedRawMaximum}:${rawMaximum}`,
    );
  }

  if (
    hasUnconfirmedScoringDirection &&
    definition.activationBlockedReason == null
  ) {
    errors.push("UNCONFIRMED_SCORING_DIRECTION_REQUIRES_ACTIVATION_BLOCK");
  }

  if (
    definition.commentsPolicy === "PROHIBITED" &&
    definition.allowComments
  ) {
    errors.push("COMMENTS_POLICY_MISMATCH");
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

export function instrumentDefinitionIsActivationReady(
  definition: AppraisalInstrumentDefinition,
) {
  const validation = validateInstrumentDefinition(definition);
  return validation.ok && definition.activationBlockedReason == null;
}

export function assertInstrumentDefinitionReady(
  definition: AppraisalInstrumentDefinition,
) {
  const result = validateInstrumentDefinition(definition);
  const errors = result.ok ? [] : [...result.errors];

  if (definition.activationBlockedReason) {
    errors.push(`ACTIVATION_BLOCKED:${definition.activationBlockedReason}`);
  }

  if (!errors.length) return definition;

  const error = new Error("APPRAISAL_INSTRUMENT_DEFINITION_INVALID") as Error & {
    code?: string;
    errors?: string[];
  };
  error.code = "APPRAISAL_INSTRUMENT_DEFINITION_INVALID";
  error.errors = errors;
  throw error;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function resolveJurisdictionScopedOfficialHeading(args: {
  code: AppraisalInstrumentCode;
  jurisdictionDirectorateName: string;
}) {
  const definition = APPRAISAL_INSTRUMENT_DEFINITIONS[args.code];
  const directorateName = clean(args.jurisdictionDirectorateName);

  if (!directorateName) {
    const error = new Error("APPRAISAL_JURISDICTION_DIRECTORATE_REQUIRED") as Error & {
      code?: string;
      status?: number;
    };
    error.code = "APPRAISAL_JURISDICTION_DIRECTORATE_REQUIRED";
    error.status = 422;
    throw error;
  }

  return {
    directorateName: directorateName.toUpperCase(),
    documentTitle: definition.officialHeader.documentTitle.toUpperCase(),
  };
}

export function instrumentSpecification(code: AppraisalInstrumentCode) {
  return APPRAISAL_INSTRUMENT_SPECIFICATIONS[code];
}

export function instrumentDefinition(code: AppraisalInstrumentCode) {
  return APPRAISAL_INSTRUMENT_DEFINITIONS[code];
}

export function instrumentActivationIsBlocked(code: AppraisalInstrumentCode) {
  return !instrumentDefinitionIsActivationReady(instrumentDefinition(code));
}
