import { createHash } from "crypto";
import { deflateSync } from "node:zlib";

import {
  HEHXAGON_DOCUMENT_SECURITY_ENGINE,
  HEHXAGON_DOCUMENT_SECURITY_ENGINE_VERSION,
  inspectNativeDocumentIdentity,
} from "../src/lib/security/documentScanner/nativeDocumentScanner";
import {
  inspectOoxmlArchive,
  ooxmlTagAttributes,
} from "../src/lib/security/documentScanner/ooxmlArchiveInspector";
import { inspectPdfStructuralSecurity } from "../src/lib/security/documentScanner/pdfStructuralInspector";
import {
  HEHXAGON_DOCUMENT_SECURITY_RULE_IDS,
  HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION,
} from "../src/lib/security/documentScanner/securityRulePack";
import type {
  NativeDocumentArchiveLimits,
  NativeDocumentContainer,
  NativeDocumentIdentityEvidence,
  NativeDocumentOleLimits,
  NativeDocumentPdfLimits,
  NativeDocumentScannerReasonCode,
  NativeDocumentScannerResult,
  NativeDocumentScannerVerdict,
  NativeDocumentSecurityRuleId,
} from "../src/lib/security/documentScanner/types";

export const HDS_M6_ADVERSARIAL_CORPUS_SCHEMA_VERSION =
  "HDS-M6-ADVERSARIAL-CORPUS-V1" as const;

export const HDS_M6A_HARNESS_VERSION =
  "HDS-M6A-HARNESS-V1" as const;

export const HDS_M6B_HARNESS_VERSION =
  "HDS-M6B-HARNESS-V1" as const;

export const HDS_M6C_HARNESS_VERSION =
  "HDS-M6C-HARNESS-V1" as const;

export const HDS_M6D1_HARNESS_VERSION =
  "HDS-M6D1-HARNESS-V1" as const;

export const HDS_M6D2_HARNESS_VERSION =
  "HDS-M6D2-HARNESS-V1" as const;

export const HDS_M6D3_HARNESS_VERSION =
  "HDS-M6D3-HARNESS-V1" as const;

export const HDS_M6D4_HARNESS_VERSION =
  "HDS-M6D4-HARNESS-V1" as const;

export const HDS_M6D5_HARNESS_VERSION =
  "HDS-M6D5-HARNESS-V1" as const;

export const HDS_M6D5B_HARNESS_VERSION =
  "HDS-M6D5B-HARNESS-V1" as const;

export const HDS_M6D6_HARNESS_VERSION =
  "HDS-M6D6-HARNESS-V1" as const;

export const HDS_M6E1_HARNESS_VERSION =
  "HDS-M6E1-HARNESS-V1" as const;

export const HDS_M6E2A_HARNESS_VERSION =
  "HDS-M6E2A-HARNESS-V1" as const;

export const HDS_M6E2B_HARNESS_VERSION =
  "HDS-M6E2B-HARNESS-V1" as const;

export const HDS_M6E3_HARNESS_VERSION =
  "HDS-M6E3-HARNESS-V1" as const;

export const HDS_M6F1_HARNESS_VERSION =
  "HDS-M6F1-HARNESS-V1" as const;

export const HDS_M6F2_HARNESS_VERSION =
  "HDS-M6F2-HARNESS-V1" as const;

const ONE_MEBIBYTE = 1024 * 1024;

const ARCHIVE_LIMITS: NativeDocumentArchiveLimits = Object.freeze({
  maxEntries: 128,
  maxEntryUncompressedBytes: 2 * 1024 * 1024,
  maxTotalUncompressedBytes: 8 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxControlPartBytes: 256 * 1024,
});

const OLE_LIMITS: NativeDocumentOleLimits = Object.freeze({
  maxDirectoryEntries: 128,
  maxDirectoryDepth: 16,
  maxFatSectors: 32,
  maxDifatSectors: 8,
  maxMiniFatSectors: 8,
  maxSectorChainLength: 256,
  maxStreams: 64,
  maxStreamBytes: 4 * 1024 * 1024,
  maxTotalStreamBytes: 8 * 1024 * 1024,
});

const PDF_LIMITS: NativeDocumentPdfLimits = Object.freeze({
  maxObjects: 128,
  maxIncrementalUpdates: 4,
  maxNestingDepth: 24,
  maxTokenBytes: 4096,
  maxStringBytes: 64 * 1024,
  maxDecodedXrefStreamBytes: 256 * 1024,
  maxDecodedObjectStreamBytes: 2 * 1024 * 1024,
  maxObjectsPerObjectStream: 64,
});

const THREAT_FAMILIES = Object.freeze([
  "IDENTITY_AMBIGUITY",
  "POLYGLOT",
  "OOXML_CONTAINER_EVASION",
  "OOXML_RELATIONSHIP_EVASION",
  "OOXML_MACRO_EVASION",
  "PDF_INCREMENTAL_UPDATE_EVASION",
  "PDF_XREF_EVASION",
  "PDF_OBJECT_STREAM_EVASION",
  "PDF_ACTION_EVASION",
  "PDF_URI_EVASION",
  "PDF_EMBEDDED_CONTENT_EVASION",
  "OLE_FAT_DIFAT_EVASION",
  "OLE_MINIFAT_EVASION",
  "OLE_DIRECTORY_EVASION",
  "OLE_VBA_EVASION",
  "OLE_EMBEDDED_OBJECT_EVASION",
  "RESOURCE_EXHAUSTION",
  "TRUNCATION",
  "HASH_SIZE_IDENTITY_RACE",
  "RULE_ORDER_DETERMINISM",
  "FALSE_POSITIVE_CONTROL",
] as const);

type ThreatFamily = (typeof THREAT_FAMILIES)[number];

type CertificationPhase =
  | "M6B"
  | "M6C"
  | "M6D"
  | "M6E"
  | "M6F"
  | "M6G";

type ThreatFamilyManifestEntry = Readonly<{
  threatFamily: ThreatFamily;
  plannedPhase: CertificationPhase;
  certificationStatus:
    | "NOT_CERTIFIED"
    | "CERTIFIED_M6B"
    | "CERTIFIED_M6C"
    | "CERTIFIED_M6D2"
    | "CERTIFIED_M6D3"
    | "CERTIFIED_M6D4"
    | "CERTIFIED_M6D5"
    | "CERTIFIED_M6D5B"
    | "CERTIFIED_M6E1"
    | "CERTIFIED_M6E2B"
    | "CERTIFIED_M6E3"
    | "CERTIFIED_M6F1"
    | "CERTIFIED_M6F2";
  objective: string;
}>;

type CorpusCaseContract = Readonly<{
  caseId: string;
  threatFamily: ThreatFamily;
  format: "GENERIC" | "PDF" | "OOXML" | "OLE";
  attackTechnique: string;
  expectedVerdict: NativeDocumentScannerVerdict;
  expectedReasonCode: NativeDocumentScannerReasonCode;
  expectedRuleId: NativeDocumentSecurityRuleId | null;
  expectedDetectedContainer?: NativeDocumentContainer;
  expectedSignatureKind?: NativeDocumentIdentityEvidence["signatureKind"];
  benignControl: boolean;
  provenance: "DETERMINISTIC_GENERATED";
  certificationPhase: "M6A" | CertificationPhase;
  certificationCredit: boolean;
  authorityImplication: "NO_CLEAN_AUTHORITY";
}>;

type M6E2APowerPointAuthorityCase = Readonly<{
  caseId: string;
  attackTechnique: string;
  expectedVerdict: NativeDocumentScannerVerdict;
  expectedReasonCode: NativeDocumentScannerReasonCode;
  benignControl: boolean;
  authorityCredit: boolean;
}>;

const THREAT_FAMILY_MANIFEST: readonly ThreatFamilyManifestEntry[] =
  Object.freeze([
    Object.freeze({
      threatFamily: "IDENTITY_AMBIGUITY",
      plannedPhase: "M6B",
      certificationStatus: "CERTIFIED_M6B",
      objective:
        "Challenge declared extension, MIME, filename, signature and container identity assumptions.",
    }),
    Object.freeze({
      threatFamily: "POLYGLOT",
      plannedPhase: "M6B",
      certificationStatus: "CERTIFIED_M6B",
      objective:
        "Construct multi-format byte sequences that intentionally satisfy competing container signatures.",
    }),
    Object.freeze({
      threatFamily: "OOXML_CONTAINER_EVASION",
      plannedPhase: "M6C",
      certificationStatus: "CERTIFIED_M6C",
      objective:
        "Attack ZIP local/central metadata, path normalization, overlap, bounds and archive identity assumptions.",
    }),
    Object.freeze({
      threatFamily: "OOXML_RELATIONSHIP_EVASION",
      plannedPhase: "M6C",
      certificationStatus: "CERTIFIED_M6C",
      objective:
        "Attack relationship type, target, target mode, XML representation and external-reference interpretation.",
    }),
    Object.freeze({
      threatFamily: "OOXML_MACRO_EVASION",
      plannedPhase: "M6C",
      certificationStatus: "CERTIFIED_M6C",
      objective:
        "Hide macro or active-content capability through alternate package paths, types and relationships.",
    }),
    Object.freeze({
      threatFamily: "PDF_INCREMENTAL_UPDATE_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "CERTIFIED_M6D2",
      objective:
        "Challenge revision precedence, Prev chains, hybrid references and active-object selection.",
    }),
    Object.freeze({
      threatFamily: "PDF_XREF_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "CERTIFIED_M6D2",
      objective:
        "Attack classic and stream cross-reference consistency, offsets, generations and supplemental xrefs.",
    }),
    Object.freeze({
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "CERTIFIED_M6D3",
      objective:
        "Hide active structures in compressed objects and challenge object-stream indexing and precedence.",
    }),
    Object.freeze({
      threatFamily: "PDF_ACTION_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "CERTIFIED_M6D4",
      objective:
        "Represent prohibited PDF actions through indirect, nested, encoded and revision-dependent structures.",
    }),
    Object.freeze({
      threatFamily: "PDF_URI_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "CERTIFIED_M6D5",
      objective:
        "Challenge URI normalization and allowed-scheme boundaries with encoded and ambiguous targets.",
    }),
    Object.freeze({
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "CERTIFIED_M6D5B",
      objective:
        "Hide files, rich media or executable-like payload capability behind indirect structural references.",
    }),
    Object.freeze({
      threatFamily: "OLE_FAT_DIFAT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "CERTIFIED_M6E1",
      objective:
        "Attack FAT/DIFAT ownership, marker consistency, chain termination and sector aliasing.",
    }),
    Object.freeze({
      threatFamily: "OLE_MINIFAT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "CERTIFIED_M6E1",
      objective:
        "Attack MiniFAT chains, root mini-stream bounds, mini-sector aliasing and declared-size semantics.",
    }),
    Object.freeze({
      threatFamily: "OLE_DIRECTORY_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "CERTIFIED_M6E3",
      objective:
        "Challenge directory reachability, sibling trees, duplicate names, parentage and application identity.",
    }),
    Object.freeze({
      threatFamily: "OLE_VBA_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "CERTIFIED_M6E2B",
      objective:
        "Hide VBA capability through alternate storage names, paths and stream arrangements.",
    }),
    Object.freeze({
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "CERTIFIED_M6E2B",
      objective:
        "Hide package and OLE-native embedded-object capability through alternate directory layouts.",
    }),
    Object.freeze({
      threatFamily: "RESOURCE_EXHAUSTION",
      plannedPhase: "M6F",
      certificationStatus: "CERTIFIED_M6F2",
      objective:
        "Exercise bounded parser ceilings without unbounded memory, decompression, nesting or chain traversal.",
    }),
    Object.freeze({
      threatFamily: "TRUNCATION",
      plannedPhase: "M6F",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Truncate documents at structural boundaries and prove fail-closed deterministic outcomes.",
    }),
    Object.freeze({
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      plannedPhase: "M6F",
      certificationStatus: "CERTIFIED_M6F1",
      objective:
        "Challenge expected size and SHA-256 integrity contracts across fragmented, mutable and inconsistent sources.",
    }),
    Object.freeze({
      threatFamily: "RULE_ORDER_DETERMINISM",
      plannedPhase: "M6F",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Prove identical structural evidence yields immutable, stable rule ordering and policy outcomes.",
    }),
    Object.freeze({
      threatFamily: "FALSE_POSITIVE_CONTROL",
      plannedPhase: "M6G",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Protect legitimate documents and ordinary allowed hyperlinks from adversarial over-blocking.",
    }),
  ]);

const HARNESS_SENTINEL_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-001-SAFE-PDF",
      threatFamily: "FALSE_POSITIVE_CONTROL",
      format: "PDF",
      attackTechnique: "Known-safe classic PDF control traverses the real scanner path.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-002-PE-AS-PDF",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "GENERIC",
      attackTechnique: "PE executable signature declared as an application/pdf document.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "EXECUTABLE_SIGNATURE_DETECTED",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-003-SHA-MISMATCH",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique: "Correct document bytes supplied with an intentionally incorrect expected SHA-256.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SHA256_MISMATCH",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-004-TRUNCATED-SIZE",
      threatFamily: "TRUNCATION",
      format: "PDF",
      attackTechnique: "Complete deterministic source is declared one byte larger than the bytes actually supplied.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SIZE_MISMATCH",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-005-SIZE-EXCEEDS-EXPECTED",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique: "The byte source contains more data than the caller-declared expected size.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SIZE_EXCEEDS_EXPECTED",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6B_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6B-001-ZIP-INNER-PDF-DOCX",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "OOXML",
      attackTechnique:
        "A leading ZIP container carries an inner PDF header marker and must retain ZIP identity.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "ZIP_END_OF_CENTRAL_DIRECTORY_MISSING",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-002-OLE-INNER-PDF-DOC",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "OLE",
      attackTechnique:
        "A leading OLE compound-file signature carries an inner PDF header marker and must retain OLE identity.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_VERSION_UNSUPPORTED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-003-PE-INNER-PDF",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "GENERIC",
      attackTechnique:
        "A PE executable with an embedded PDF header marker must preserve executable precedence.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "EXECUTABLE_SIGNATURE_DETECTED",
      expectedRuleId: null,
      expectedDetectedContainer: "EXECUTABLE",
      expectedSignatureKind: "PE_EXECUTABLE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-004-ELF-INNER-PDF",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "GENERIC",
      attackTechnique:
        "An ELF executable with an embedded PDF header marker must preserve executable precedence.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "EXECUTABLE_SIGNATURE_DETECTED",
      expectedRuleId: null,
      expectedDetectedContainer: "EXECUTABLE",
      expectedSignatureKind: "ELF_EXECUTABLE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-005-ZIP-INNER-PDF-AS-PDF",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "GENERIC",
      attackTechnique:
        "A ZIP-fronted object with an inner PDF marker masquerades as PDF and must fail the extension/container contract.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "EXTENSION_CONTAINER_MISMATCH",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-006-OLE-INNER-PDF-AS-PDF",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "GENERIC",
      attackTechnique:
        "An OLE-fronted object with an inner PDF marker masquerades as PDF and must fail the extension/container contract.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "EXTENSION_CONTAINER_MISMATCH",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-007-BOUNDED-PDF-PREAMBLE",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "PDF",
      attackTechnique:
        "A structurally valid PDF with a bounded non-container preamble must preserve the supported PDF-header window.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-008-PDF-INTERNAL-ZIP-MAGIC",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "PDF",
      attackTechnique:
        "A valid PDF carrying non-leading ZIP magic inside a comment must not be over-classified as a ZIP container.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-009-TRUE-OOXML-PDF-POLYGLOT-DOCX",
      threatFamily: "POLYGLOT",
      format: "OOXML",
      attackTechnique:
        "The same bytes are structurally valid OOXML and structurally valid PDF while byte-zero ZIP identity controls DOCX ingress.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-010-TRUE-OOXML-PDF-POLYGLOT-AS-PDF",
      threatFamily: "POLYGLOT",
      format: "GENERIC",
      attackTechnique:
        "A structurally dual-valid OOXML/PDF polyglot declared as PDF must not use its inner PDF interpretation to override byte-zero ZIP identity.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "EXTENSION_CONTAINER_MISMATCH",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6B-011-PDF-INTERNAL-OLE-MAGIC",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "PDF",
      attackTechnique:
        "A valid PDF carrying non-leading OLE magic inside a comment must retain PDF identity without broad magic-byte overblocking.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6B",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6C_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6C-001-DOCX-CASE-COLLISION",
      threatFamily: "OOXML_CONTAINER_EVASION",
      format: "OOXML",
      attackTechnique:
        "A DOCX package carries two ZIP entries whose names differ only by case and must collapse to one normalized package identity.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "ZIP_DUPLICATE_ENTRY",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6C-002-XLSX-PATH-TRAVERSAL",
      threatFamily: "OOXML_CONTAINER_EVASION",
      format: "OOXML",
      attackTechnique:
        "An XLSX package includes a ZIP entry containing parent-directory traversal and must fail before semantic Office inspection begins.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "ZIP_ENTRY_PATH_TRAVERSAL",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6C-003-PPTX-UNICODE-COLLISION",
      threatFamily: "OOXML_CONTAINER_EVASION",
      format: "OOXML",
      attackTechnique:
        "A PPTX package presents canonically equivalent Unicode ZIP entry names and must reject the normalized-name collision deterministically.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "ZIP_DUPLICATE_ENTRY",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6C-004-DOCX-REMOTE-TEMPLATE-ENTITY",
      threatFamily: "OOXML_RELATIONSHIP_EVASION",
      format: "OOXML",
      attackTechnique:
        "A DOCX attached-template relationship hides one character of its relationship type behind a numeric XML character reference.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OOXML_REMOTE_TEMPLATE_BLOCKED",
      expectedRuleId: "HDS-OOXML-006-REMOTE-TEMPLATE",
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6C-005-XLSX-HYPERLINK-ENTITY-CONTROL",
      threatFamily: "OOXML_RELATIONSHIP_EVASION",
      format: "OOXML",
      attackTechnique:
        "An ordinary XLSX HTTPS hyperlink encodes one URI character as a numeric XML reference and must remain an allowed benign control.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6C-006-PPTX-OLE-RELATIONSHIP-ENTITY",
      threatFamily: "OOXML_RELATIONSHIP_EVASION",
      format: "OOXML",
      attackTechnique:
        "A PPTX internal OLE-object relationship encodes part of its relationship type numerically and must still produce embedded-object evidence.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OOXML_EMBEDDED_OBJECT_BLOCKED",
      expectedRuleId: "HDS-OOXML-004-EMBEDDED-OBJECT",
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6C-007-DOCX-VBA-RELATIONSHIP-ENTITY",
      threatFamily: "OOXML_MACRO_EVASION",
      format: "OOXML",
      attackTechnique:
        "A DOCX VBA relationship targets an innocuously named part while hiding one relationship-type character behind a hexadecimal XML reference.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OOXML_VBA_PROJECT_BLOCKED",
      expectedRuleId: "HDS-OOXML-001-VBA",
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6C-008-XLSX-VBA-CONTENT-TYPE-ENTITY",
      threatFamily: "OOXML_MACRO_EVASION",
      format: "OOXML",
      attackTechnique:
        "An XLSX auxiliary part hides the VBA content-type token behind a decimal XML character reference and must still trigger VBA policy.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OOXML_VBA_PROJECT_BLOCKED",
      expectedRuleId: "HDS-OOXML-001-VBA",
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6C-009-PPTX-MACRO-CONTENT-TYPE-ENTITY",
      threatFamily: "OOXML_MACRO_EVASION",
      format: "OOXML",
      attackTechnique:
        "A PPTX auxiliary content type encodes one character of macroEnabled numerically and must still be rejected by macro-content policy.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OOXML_MACRO_ENABLED_CONTENT_TYPE_BLOCKED",
      expectedRuleId: "HDS-OOXML-002-MACRO-CONTENT-TYPE",
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6C",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6D2_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6D2-001-NEWEST-REVISION-REPLACES-OLDER-OBJECT",
      threatFamily: "PDF_INCREMENTAL_UPDATE_EVASION",
      format: "PDF",
      attackTechnique:
        "An older active JavaScript object is replaced by a benign object in the newest incremental revision, proving newest-revision object authority without scanning stale bytes as active content.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-002-NEWEST-FREE-ENTRY-SUPPRESSES-OLDER-OBJECT",
      threatFamily: "PDF_INCREMENTAL_UPDATE_EVASION",
      format: "PDF",
      attackTechnique:
        "A newest-revision free xref entry suppresses an older live JavaScript object so that a stale object cannot re-enter the active object graph from an earlier revision.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-003-PREV-CYCLE",
      threatFamily: "PDF_INCREMENTAL_UPDATE_EVASION",
      format: "PDF",
      attackTechnique:
        "The newest classic trailer points Prev back to its own startxref offset, creating a revision-chain cycle that must terminate deterministically rather than loop or reinterpret history.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_XREF_TABLE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-004-PREV-PRESENT-WRONG-TYPE",
      threatFamily: "PDF_INCREMENTAL_UPDATE_EVASION",
      format: "PDF",
      attackTechnique:
        "A classic trailer contains a present but non-integer Prev value, which must not be treated as though revision history were simply absent and complete.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_XREF_TABLE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-005-XREFSTM-PRESENT-WRONG-TYPE",
      threatFamily: "PDF_XREF_EVASION",
      format: "PDF",
      attackTechnique:
        "A classic trailer contains a present but non-integer XRefStm value, which must fail closed instead of silently discarding a claimed supplemental cross-reference authority source.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_XREF_STREAM_DICTIONARY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-006-CLASSIC-XREF-DUPLICATE-OBJECT-NUMBER",
      threatFamily: "PDF_XREF_EVASION",
      format: "PDF",
      attackTechnique:
        "Overlapping classic xref subsections define the same object number twice inside one revision, creating an order-dependent authority ambiguity that must be rejected.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_XREF_TABLE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-007-HYBRID-CONFLICTING-SAME-OBJECT-AUTHORITY",
      threatFamily: "PDF_XREF_EVASION",
      format: "PDF",
      attackTechnique:
        "A hybrid revision gives the same object number different locations in the companion classic table and supplemental XRefStm, forcing HDS to reject consumer-dependent precedence ambiguity.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_XREF_STREAM_ENTRY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-008-ROOT-GENERATION-MISMATCH",
      threatFamily: "PDF_XREF_EVASION",
      format: "PDF",
      attackTechnique:
        "The trailer Root reference requests a generation different from the active xref generation for the same object number, which must not collapse to object-number-only lookup.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_OFFSET_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-009-PAGES-GENERATION-MISMATCH",
      threatFamily: "PDF_XREF_EVASION",
      format: "PDF",
      attackTechnique:
        "The Catalog Pages reference requests a non-active generation for the Pages object and must fail instead of resolving solely by object number.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_OFFSET_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-010-STREAM-LENGTH-GENERATION-MISMATCH",
      threatFamily: "PDF_XREF_EVASION",
      format: "PDF",
      attackTechnique:
        "A stream Length indirect reference requests a different generation from the active integer object, which must fail before stream boundaries are trusted.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_OFFSET_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-011-CLASSIC-SIZE-AUTHORITY-CONTRADICTION",
      threatFamily: "PDF_XREF_EVASION",
      format: "PDF",
      attackTechnique:
        "A classic trailer Size excludes an object number that its own xref section declares, creating contradictory object-number authority that must fail closed.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_XREF_TABLE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D2-012-ORDINARY-INCREMENTAL-CONTROL",
      threatFamily: "PDF_INCREMENTAL_UPDATE_EVASION",
      format: "PDF",
      attackTechnique:
        "A normal one-revision incremental update adds a benign object with a valid Prev chain and must remain accepted at the current non-CLEAN structural-pass authority level.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6D3_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6D3-001-VALID-OBJECT-STREAM-CONTROL",
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      format: "PDF",
      attackTechnique:
        "A valid PDF 1.7 object stream stores the Catalog and Pages objects with matching type-2 xref indexes and must remain accepted at the current non-CLEAN structural-pass level.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D3-002-OBJECT-STREAM-NONZERO-GENERATION",
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      format: "PDF",
      attackTechnique:
        "A type-2 compressed-object entry points at an ObjStm whose active indirect-object generation is one even though object streams are required to use generation zero, creating consumer-dependent object-stream authority.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_STREAM_DICTIONARY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D3-003-COMPRESSED-OBJECT-SOLE-REFERENCE",
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      format: "PDF",
      attackTechnique:
        "An active compressed object consists solely of an indirect reference, a representation forbidden inside ObjStm content and therefore rejected instead of leaving its interpretation to consumer-specific repair behavior.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_STREAM_INDEX_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D3-004-COMPRESSED-OBJECT-STREAM-LENGTH",
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      format: "PDF",
      attackTechnique:
        "An ObjStm resolves its Length through an indirect integer that is itself stored as a compressed object in a second ObjStm, violating the object-stream Length storage restriction and requiring fail-closed rejection.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_STREAM_DICTIONARY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D3-005-COMPRESSED-OBJECT-ZERO",
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      format: "PDF",
      attackTechnique:
        "A cross-reference stream marks reserved object number zero as a type-2 compressed object, which must fail before the scanner can silently skip the free-list head as though it were harmless compressed content.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_XREF_STREAM_ENTRY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D3-006-DUPLICATE-CONTAINED-OBJECT-NUMBER",
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      format: "PDF",
      attackTechnique:
        "An object-stream header declares the same contained object number twice, creating ambiguous index-to-object membership that must remain rejected before any compressed-object policy evaluation.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_STREAM_HEADER_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D3-007-XREF-OBJECT-STREAM-INDEX-MISMATCH",
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      format: "PDF",
      attackTechnique:
        "The type-2 xref entry for the Catalog names index one while index one belongs to the Pages object, proving the existing compressed-object index agreement check remains fail closed.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_COMPRESSED_OBJECT_REFERENCE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D3-008-DESCENDING-OBJECT-OFFSETS",
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      format: "PDF",
      attackTechnique:
        "An ObjStm header declares contained-object relative offsets in descending order, violating monotonic indexed boundaries and proving the existing object-stream index guard remains fail closed.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_STREAM_INDEX_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6D4_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6D4-001-BENIGN-DIRECT-GOTO-CONTROL",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "A standard internal GoTo action remains an allowed benign control so action hardening does not over-block ordinary in-document navigation semantics.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-002-ENCODED-JAVASCRIPT-ACTION-NAME",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "A JavaScript action encodes one character of its S name with PDF name hexadecimal escaping and must normalize to the same prohibited action semantics.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_JAVASCRIPT_BLOCKED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-003-DIRECT-NEXT-JAVASCRIPT",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "An otherwise internal GoTo action carries a direct nested Next action dictionary whose JavaScript subtype must remain visible to recursive structural inspection.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_JAVASCRIPT_BLOCKED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-004-INDIRECT-NEXT-LAUNCH",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "An internal GoTo action points Next at a separate active Launch action object and must remain blocked even when the dangerous chained action is indirect.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_LAUNCH_ACTION_BLOCKED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-005-INDIRECT-S-LAUNCH",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "A Type Action dictionary resolves S through an indirect name object containing Launch, proving action subtype authority cannot depend on direct-name syntax alone.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_LAUNCH_ACTION_BLOCKED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-006-INDIRECT-S-GOTOR",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "A Type Action dictionary resolves S through an indirect GoToR name so remote-navigation capability must be classified identically to a directly encoded prohibited action subtype.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_EXTERNAL_ACTION_BLOCKED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-007-INDIRECT-S-SUBMITFORM",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "A Type Action dictionary resolves S through an indirect SubmitForm name and must retain the existing blocked external-action policy after indirect resolution.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_EXTERNAL_ACTION_BLOCKED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-008-INDIRECT-S-GENERATION-MISMATCH",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "An action S reference requests generation one while the active name object exists only at generation zero, requiring generation-aware fail-closed resolution before action policy evaluation.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_OFFSET_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-009-SOUND-ACTION",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "A standard Sound action uses action subtype semantics rather than annotation Subtype Sound and must still produce the existing rich-media blocking evidence.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_RICH_MEDIA_BLOCKED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-010-UNKNOWN-EXPLICIT-ACTION-SUBTYPE",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "An explicit Type Action dictionary declares an unknown vendor-specific S subtype, which must fail closed because HDS cannot safely certify semantics it does not understand.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_SYNTAX_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D4-011-BENIGN-INDIRECT-S-GOTO-CONTROL",
      threatFamily: "PDF_ACTION_EVASION",
      format: "PDF",
      attackTechnique:
        "A valid internal GoTo action resolves S through an indirect name object and must remain accepted, proving indirect action resolution does not become a blanket false-positive block.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);


const M6D5_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6D5-001-BENIGN-DIRECT-HTTPS-CONTROL",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A direct ordinary HTTPS URI action remains an allowed benign control so URI evasion hardening preserves the existing bounded HTTP(S) ingress policy.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-002-BENIGN-MIXED-CASE-HTTP-CONTROL",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "An ordinary HTTP URI action uses mixed-case scheme characters and must normalize case-insensitively without being mistaken for an unsafe external scheme.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-003-BENIGN-MAILTO-CONTROL",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A direct ordinary mailto URI action remains an allowed benign control under the existing M4 rule-pack policy while dangerous schemes stay blocked.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-004-BENIGN-OCTAL-HTTPS-CONTROL",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "An HTTPS target encodes the leading h with a PDF literal-string octal escape and must decode to the same ordinary allowed HTTPS URI semantics.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-005-JAVASCRIPT-SCHEME",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A URI action directly supplies a javascript scheme and must be rejected by the existing unsafe-URI rule rather than treated as an ordinary hyperlink.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
      expectedRuleId: "HDS-PDF-010-UNSAFE-URI",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-006-DATA-SCHEME",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A URI action uses a data scheme carrying inline content and must remain outside the bounded HTTP(S)/mailto URI allowlist and be blocked deterministically.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
      expectedRuleId: "HDS-PDF-010-UNSAFE-URI",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-007-FILE-SCHEME",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A URI action attempts a local file scheme and must be classified as unsafe instead of inheriting ordinary external-link permission from the PDF URI action type.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
      expectedRuleId: "HDS-PDF-010-UNSAFE-URI",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-008-OCTAL-ESCAPED-JAVASCRIPT-SCHEME",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A javascript URI hides its leading j behind a PDF literal-string octal escape and must be evaluated after string decoding rather than by raw source spelling.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
      expectedRuleId: "HDS-PDF-010-UNSAFE-URI",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-009-HEX-STRING-JAVASCRIPT-SCHEME",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A javascript URI is represented as a PDF hexadecimal string and must decode to the prohibited scheme before the M4 URI policy is evaluated.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
      expectedRuleId: "HDS-PDF-010-UNSAFE-URI",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-010-ENCODED-URI-DICTIONARY-KEY",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A dangerous javascript target hides one character of the URI dictionary key with PDF name hexadecimal escaping and must still reach unsafe-URI policy evaluation.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
      expectedRuleId: "HDS-PDF-010-UNSAFE-URI",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-011-INDIRECT-URI-JAVASCRIPT-FAIL-CLOSED",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A URI action stores its dangerous javascript target in an indirect string object; the current bounded parser must fail closed as unsafe rather than silently allow an unresolved URI value.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
      expectedRuleId: "HDS-PDF-010-UNSAFE-URI",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5-012-NUL-PREFIXED-JAVASCRIPT-SCHEME",
      threatFamily: "PDF_URI_EVASION",
      format: "PDF",
      attackTechnique:
        "A dangerous javascript URI is prefixed with a decoded NUL byte and must not become an allowed target through trimming, case folding, or prefix-based scheme classification.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
      expectedRuleId: "HDS-PDF-010-UNSAFE-URI",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6D5B_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6D5B-001-BENIGN-INDIRECT-TEXT-ANNOTATION-CONTROL",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A benign Text annotation resolves its required Subtype through an indirect name object and must remain accepted, proving semantic subtype resolution does not become a blanket annotation block.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-002-DIRECT-FILESPEC-EF",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A file specification exposes an EF dictionary that points to an embedded-file stream and must deterministically reach the existing embedded-file ingress rule.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_EMBEDDED_FILE_BLOCKED",
      expectedRuleId: "HDS-PDF-006-EMBEDDED-FILE",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-003-ENCODED-EF-DICTIONARY-KEY",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A file specification hides one character of the EF dictionary key using PDF name hexadecimal escaping and must still expose embedded-file capability after name decoding.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_EMBEDDED_FILE_BLOCKED",
      expectedRuleId: "HDS-PDF-006-EMBEDDED-FILE",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-004-EMBEDDEDFILES-NAME-TREE",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "The document catalog advertises an EmbeddedFiles name tree whose file specification points to an embedded stream, and document-level attachment capability must be blocked.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_EMBEDDED_FILE_BLOCKED",
      expectedRuleId: "HDS-PDF-006-EMBEDDED-FILE",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-005-FILEATTACHMENT-ANNOTATION-WITH-EF",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A FileAttachment annotation references a file specification containing EF and must be blocked even when attachment capability is reached through an indirect annotation file-specification reference.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_EMBEDDED_FILE_BLOCKED",
      expectedRuleId: "HDS-PDF-006-EMBEDDED-FILE",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-006-ASSOCIATED-FILE-WITH-EF",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "The catalog associates a file specification through AF while that specification carries EF-backed embedded content, proving associated-file indirection cannot evade the embedded-file rule.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_EMBEDDED_FILE_BLOCKED",
      expectedRuleId: "HDS-PDF-006-EMBEDDED-FILE",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-007-DIRECT-RICHMEDIA-SUBTYPE",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A direct RichMedia annotation subtype must continue to reach the existing rich-media rule, preserving the current block while indirect-subtype semantics are hardened.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_RICH_MEDIA_BLOCKED",
      expectedRuleId: "HDS-PDF-007-RICH-MEDIA",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-008-INDIRECT-RICHMEDIA-SUBTYPE",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A RichMedia annotation stores its required Subtype name in a separate indirect object and must be classified identically to the direct form rather than bypass rich-media evidence.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_RICH_MEDIA_BLOCKED",
      expectedRuleId: "HDS-PDF-007-RICH-MEDIA",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-009-INDIRECT-SOUND-SUBTYPE",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A Sound annotation resolves Subtype through an indirect name while retaining a sound stream reference, and indirect annotation typing must not bypass interactive-media blocking.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_RICH_MEDIA_BLOCKED",
      expectedRuleId: "HDS-PDF-007-RICH-MEDIA",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-010-INDIRECT-MOVIE-SUBTYPE",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A Movie annotation resolves Subtype through an indirect name object and must retain the same rich-media block as a directly declared Movie annotation.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_RICH_MEDIA_BLOCKED",
      expectedRuleId: "HDS-PDF-007-RICH-MEDIA",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-011-INDIRECT-3D-SUBTYPE",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A 3D annotation resolves its required Subtype through an indirect name and must still produce rich-media evidence rather than depend on surface-level direct-name syntax.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "PDF_RICH_MEDIA_BLOCKED",
      expectedRuleId: "HDS-PDF-007-RICH-MEDIA",
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6D5B-012-INDIRECT-SUBTYPE-GENERATION-MISMATCH",
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      format: "PDF",
      attackTechnique:
        "A rich-media annotation requests a non-active generation for its indirect Subtype name, which must fail closed before rule-pack trust instead of falling back to an untyped benign interpretation.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_OFFSET_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6D",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);


const M6E1_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6E1-001-BENIGN-FAT-DIFAT-CONTROL",
      threatFamily: "OLE_FAT_DIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "A deterministic legacy Word compound file with ordinary FAT and header-DIFAT allocation remains structurally accepted without earning CLEAN authority.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-002-DUPLICATE-HEADER-DIFAT",
      threatFamily: "OLE_FAT_DIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "The CFB header repeats the same FAT sector in two DIFAT slots so allocation authority is ambiguous and must fail before policy trust.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIFAT_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-003-FAT-SECTOR-MARKER-CONTRADICTION",
      threatFamily: "OLE_FAT_DIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "A sector named by the DIFAT as FAT-owned is deliberately marked ENDOFCHAIN inside the FAT and must be rejected as contradictory allocation metadata.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_FAT_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-004-DIRECTORY-FAT-CHAIN-CYCLE",
      threatFamily: "OLE_FAT_DIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "The directory sector FAT chain points back to itself, challenging cycle detection and bounded chain traversal before any directory evidence can be trusted.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_SECTOR_CHAIN_LOOP",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-005-REGULAR-STREAM-ALIASES-DIRECTORY-SECTOR",
      threatFamily: "OLE_FAT_DIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "The primary Word stream is redirected onto a sector already owned by the directory chain and must fail the single-owner sector invariant.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_SECTOR_OWNERSHIP_CONFLICT",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-006-BENIGN-MINIFAT-CONTROL",
      threatFamily: "OLE_MINIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "A deterministic small metadata stream traverses the MiniFAT and root mini stream normally, proving benign mini-stream allocation remains accepted.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-007-MINIFAT-CHAIN-CYCLE",
      threatFamily: "OLE_MINIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "A small-stream MiniFAT entry points back to itself so the mini-sector chain becomes cyclic and must fail bounded traversal.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_SECTOR_CHAIN_LOOP",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-008-MINIFAT-EARLY-END",
      threatFamily: "OLE_MINIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "The first mini sector terminates before enough sectors exist for the declared stream size, forcing an invalid subsequent mini-sector reference.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_MINISTREAM_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-009-MINIFAT-CHAIN-EXCEEDS-DECLARED-SIZE",
      threatFamily: "OLE_MINIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "A MiniFAT chain continues beyond the exact number of mini sectors implied by the stream size and must be rejected rather than silently ignored.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-010-MINI-SECTOR-ALIASED-BETWEEN-STREAMS",
      threatFamily: "OLE_MINIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "Two independent small streams claim the same starting mini sector and must fail the mini-sector single-owner invariant.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_SECTOR_OWNERSHIP_CONFLICT",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-011-MINIFAT-HEADER-COUNT-CONTRADICTION",
      threatFamily: "OLE_MINIFAT_EVASION",
      format: "OLE",
      attackTechnique:
        "The header declares zero MiniFAT sectors while retaining a concrete first MiniFAT sector, which must fail as contradictory MiniFAT authority.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_MINIFAT_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6E1_DIRECTORY_REPAIR_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6E1-DIR-001-INVALID-COLOR-FLAG",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A reachable directory entry carries a Color Flag outside the CFB red-or-black domain and must fail directory conformance without certifying the wider directory family.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E1-DIR-002-PROHIBITED-DIRECTORY-NAME-CHARACTER",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A reachable stream name contains a CFB-prohibited slash character and must fail directory conformance without prematurely certifying sibling-tree ordering authority.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6E2A_POWERPOINT_AUTHORITY_CASES: readonly M6E2APowerPointAuthorityCase[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-001-BENIGN-SINGLE-EDIT",
      attackTechnique:
        "A deterministic binary PowerPoint file exposes one CurrentUserAtom, one UserEditAtom, one PersistDirectoryAtom and an authoritative DocumentContainer mapping that must remain accepted without granting active-content certification.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      benignControl: true,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-002-NEWEST-PERSIST-MAPPING-WINS",
      attackTechnique:
        "An older edit maps document persist id 1 to a deliberately invalid stale record while the newest edit remaps id 1 to a valid DocumentContainer, proving live authority follows newest persist-directory precedence rather than physical byte presence.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      benignControl: true,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-003-NEWEST-INVALID-OVERRIDES-OLD",
      attackTechnique:
        "A valid historical DocumentContainer remains in the stream but the newest persist directory remaps document persist id 1 to an invalid record, which must fail instead of falling back to the stale valid object.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-004-CURRENT-USER-WRONG-RECORD-TYPE",
      attackTechnique:
        "The Current User stream begins with a record type other than RT_CurrentUserAtom and must fail before its offset can become revision authority for the PowerPoint Document stream.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-005-CURRENT-EDIT-OFFSET-OUTSIDE-STREAM",
      attackTechnique:
        "CurrentUserAtom points offsetToCurrentEdit at the end of the bounded PowerPoint Document stream, so no complete UserEditAtom can exist there and authority establishment must fail closed.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-006-USER-EDIT-CHAIN-NONDECREASING",
      attackTechnique:
        "The newest UserEditAtom points offsetLastEdit back to itself instead of an earlier edit, violating monotonic revision ancestry and forcing fail-closed cycle or ordering rejection.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-007-PERSIST-DIRECTORY-WRONG-RECORD-TYPE",
      attackTechnique:
        "UserEditAtom points to a record whose type is not RT_PersistDirectoryAtom, so the claimed persist-object authority cannot be trusted and the file must fail closed.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-008-PERSIST-OFFSET-OUTSIDE-EDIT-INTERVAL",
      attackTechnique:
        "A PersistDirectoryEntry points a persist object at or beyond its own persist-directory record instead of inside the corresponding edit interval, which must be rejected as impossible authority metadata.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-009-DOCUMENT-PERSIST-ID-NOT-ONE",
      attackTechnique:
        "The current UserEditAtom declares docPersistIdRef other than the mandated persist id 1 and must fail rather than selecting an attacker-controlled alternative document root.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-010-PERSIST-ID-SEED-BELOW-AUTHORITY",
      attackTechnique:
        "The latest edit advertises a persistIdSeed smaller than an identifier present in the assembled authoritative persist directory, contradicting persist-id allocation authority and requiring rejection.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-011-ENCRYPTED-TOKEN-WITHOUT-SESSION-REFERENCE",
      attackTechnique:
        "CurrentUserAtom marks the presentation encrypted but the latest UserEditAtom omits the required encryption-session persist reference, so HDS must fail closed rather than inspect encrypted presentation content as plaintext.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-012-MISSING-CURRENT-USER-REJECTED",
      attackTechnique:
        "A binary PowerPoint compound file contains the application stream but omits the required Current User stream, so HDS must reject the file instead of accepting content whose live persist authority cannot be established.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_APPLICATION_STREAM_MISSING",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-013-DUPLICATE-PERSIST-ID-IN-ATOM",
      attackTechnique:
        "One PersistDirectoryAtom repeats persist identifier 1 in separate entries with different offsets, violating the per-directory uniqueness rule and forcing rejection before either mapping can become live authority.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-014-VALID-ENCRYPTED-SINGLE-EDIT-BLOCKED",
      attackTechnique:
        "A structurally valid encrypted binary PowerPoint file exposes exactly one UserEditAtom and a live CryptSession10Container persist object; authority establishment must succeed only far enough for the existing encrypted-document policy to block it.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OLE_ENCRYPTED_PACKAGE_BLOCKED",
      benignControl: false,
      authorityCredit: true,
    }),
    Object.freeze({
      caseId: "HDS-M6E2A-AUTH-015-ENCRYPTED-MULTIPLE-USER-EDITS",
      attackTechnique:
        "An encrypted binary PowerPoint stream contains more than the single UserEditAtom permitted for encrypted presentations, so HDS must fail closed before encrypted persist objects can be trusted.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      benignControl: false,
      authorityCredit: true,
    }),
  ]);

const M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6E2B-001-BENIGN-LIVE-DOCUMENT-CONTROL",
      threatFamily: "OLE_VBA_EVASION",
      format: "OLE",
      attackTechnique:
        "An authoritative binary PowerPoint DocumentContainer contains no live VBA information or external-object references and must remain accepted without gaining CLEAN authority.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-002-STALE-UNREFERENCED-STORAGE-CONTROL",
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      format: "OLE",
      attackTechnique:
        "A physically present ExternalOleObjectStg record is absent from the authoritative persist directory and from every live DocumentContainer reference, proving stale historical storage bytes are ignored rather than falsely blocked.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-003-LIVE-VBA-PROJECT-STORAGE",
      threatFamily: "OLE_VBA_EVASION",
      format: "OLE",
      attackTechnique:
        "A live DocInfoListContainer carries VBAInfoAtom persist authority to an ExternalOleObjectStg record, so the existing HDS OLE VBA policy must block the presentation.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OLE_VBA_PROJECT_BLOCKED",
      expectedRuleId: "HDS-OLE-001-VBA",
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-004-VBA-PERSIST-REFERENCE-MISSING",
      threatFamily: "OLE_VBA_EVASION",
      format: "OLE",
      attackTechnique:
        "A live VBAInfoAtom declares a nonzero VBA project persist identifier that is absent from the assembled authoritative persist directory and must fail closed before rule evaluation.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-005-VBA-INFO-STATE-INVALID",
      threatFamily: "OLE_VBA_EVASION",
      format: "OLE",
      attackTechnique:
        "A live VBAInfoAtom uses an invalid fHasMacros value even though its persisted storage is otherwise reachable, so malformed macro-state metadata must fail closed.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-006-LIVE-EMBEDDED-OLE-STORAGE",
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      format: "OLE",
      attackTechnique:
        "A live ExOleEmbedContainer resolves its ExOleObjAtom persist identifier to ExternalOleObjectStg storage and must reach the existing embedded-object blocking rule.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OLE_EMBEDDED_OBJECT_BLOCKED",
      expectedRuleId: "HDS-OLE-002-EMBEDDED-OBJECT",
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-007-LIVE-ACTIVEX-STORAGE",
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      format: "OLE",
      attackTechnique:
        "A live ExControlContainer resolves its ExOleObjAtom persist identifier to ExternalOleObjectStg storage, representing ActiveX control storage that must be blocked as embedded active content.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OLE_EMBEDDED_OBJECT_BLOCKED",
      expectedRuleId: "HDS-OLE-002-EMBEDDED-OBJECT",
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-008-LIVE-LINKED-OLE-STORAGE",
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      format: "OLE",
      attackTechnique:
        "A live ExOleLinkContainer resolves to persisted ExternalOleObjectStg bytes, preserving a serialized OLE capability that the bounded ingress policy treats as blocked external-object content.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "OLE_EMBEDDED_OBJECT_BLOCKED",
      expectedRuleId: "HDS-OLE-002-EMBEDDED-OBJECT",
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-009-EXTERNAL-PERSIST-REFERENCE-MISSING",
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      format: "OLE",
      attackTechnique:
        "A live external-object container identifies persisted storage that does not exist in the authoritative persist directory and must fail before stale or attacker-selected bytes can become content authority.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-010-EXTERNAL-TARGET-WRONG-RECORD-TYPE",
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      format: "OLE",
      attackTechnique:
        "A live external-object persist identifier resolves to a record whose type is not ExternalOleObjectStg, so the contradictory target must fail rather than be trusted as serialized OLE storage.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-011-COMPRESSED-STORAGE-ZERO-SIZE",
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      format: "OLE",
      attackTechnique:
        "A live external-object reference reaches the compressed ExternalOleObjectStg form but its declared decompressed size is zero, so malformed compressed storage must fail closed without decompression.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E2B-012-VBA-TARGET-WRONG-RECORD-TYPE",
      threatFamily: "OLE_VBA_EVASION",
      format: "OLE",
      attackTechnique:
        "A live VBAInfoAtom resolves through the authoritative persist map to a record that is not ExternalOleObjectStg, requiring deterministic failure instead of silently accepting an invalid VBA storage target.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_CHAIN_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

const M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6F1-001-BENIGN-FRAGMENTED-SOURCE",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique:
        "A valid PDF arrives through deterministic fragmented chunks while size and SHA-256 remain bound to the exact reconstructed byte sequence.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F1-002-SHA256-MISMATCH",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique:
        "The source bytes are structurally valid but the caller-supplied SHA-256 belongs to different bytes and must fail before structural authority is granted.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SHA256_MISMATCH",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F1-003-SOURCE-SHORTER-THAN-EXPECTED",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique:
        "The byte source terminates one byte before its immutable expected-size contract and must fail closed before parsing.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SIZE_MISMATCH",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F1-004-SOURCE-LARGER-THAN-EXPECTED",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique:
        "The byte source exceeds its immutable expected-size contract and must stop immediately without accepting the oversized identity.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SIZE_EXCEEDS_EXPECTED",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F1-005-MUTABLE-SHARED-BACKING-SNAPSHOT",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique:
        "A SharedArrayBuffer-backed source is mutated immediately after the hash update hook; the scanner must parse the same owned snapshot that it hashed rather than later mutable backing bytes.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);


const M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6F2-001-BENIGN-PDF-RESOURCE-CONTROL",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "PDF",
      attackTechnique:
        "A normal bounded PDF remains accepted under the configured source and PDF resource ceilings.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-002-SOURCE-MAX-BYTES-PREFLIGHT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "PDF",
      attackTechnique:
        "The immutable expected source size exceeds maxBytes and must fail before source consumption or parser allocation.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "RESOURCE_LIMIT_EXCEEDED",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-003-EMPTY-SOURCE-CHUNK-FLOOD",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "PDF",
      attackTechnique:
        "A byte source emits more than the engine's bounded allowance of zero-length chunks before any useful bytes, preventing an unbounded empty-chunk iteration loop.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "RESOURCE_LIMIT_EXCEEDED",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-004-BENIGN-OOXML-RESOURCE-CONTROL",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OOXML",
      attackTechnique:
        "A normal bounded DOCX package remains accepted under the configured archive resource ceilings.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-005-OOXML-ENTRY-COUNT-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OOXML",
      attackTechnique:
        "An otherwise valid OOXML package declares more central-directory entries than the configured archive ceiling.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "ZIP_ENTRY_COUNT_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-006-OOXML-ENTRY-SIZE-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OOXML",
      attackTechnique:
        "A declared OOXML entry exceeds the configured single-entry expanded-size ceiling before decompression is attempted.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "ZIP_ENTRY_SIZE_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-007-OOXML-TOTAL-EXPANDED-SIZE-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OOXML",
      attackTechnique:
        "Multiple individually bounded OOXML parts collectively exceed the configured total expanded-byte budget.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "ZIP_TOTAL_EXPANDED_SIZE_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-008-OOXML-COMPRESSION-RATIO-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OOXML",
      attackTechnique:
        "Central-directory metadata advertises an expansion ratio beyond policy and must be rejected before control-part inflation.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "ZIP_COMPRESSION_RATIO_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "ZIP",
      expectedSignatureKind: "ZIP_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-009-PDF-OBJECT-COUNT-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "PDF",
      attackTechnique:
        "The PDF cross-reference section declares more objects than the configured active-object ceiling.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_COUNT_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-010-PDF-NESTING-DEPTH-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "PDF",
      attackTechnique:
        "A live catalog contains nested arrays deeper than the configured PDF object-nesting ceiling.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_OBJECT_NESTING_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-011-PDF-STRING-BYTE-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "PDF",
      attackTechnique:
        "A live catalog string exceeds the configured PDF string-byte ceiling and must terminate parsing deterministically.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_STRING_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-012-PDF-XREF-DECODE-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "PDF",
      attackTechnique:
        "A modern PDF cross-reference stream expands beyond the configured decoded-xref byte ceiling.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "PDF_STREAM_DECODE_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "PDF",
      expectedSignatureKind: "PDF_HEADER",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-013-BENIGN-OLE-RESOURCE-CONTROL",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OLE",
      attackTechnique:
        "A normal bounded legacy DOC remains accepted under the configured CFB allocation and stream ceilings.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-014-OLE-DIRECTORY-ENTRY-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OLE",
      attackTechnique:
        "The allocated CFB directory contains more slots than the configured directory-entry ceiling.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_ENTRY_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-015-OLE-STREAM-COUNT-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OLE",
      attackTechnique:
        "The compound file contains more user streams than the configured stream-count ceiling.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_COUNT_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-016-OLE-SECTOR-CHAIN-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OLE",
      attackTechnique:
        "A valid regular WordDocument stream requires more FAT sectors than the configured sector-chain traversal ceiling.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_SECTOR_CHAIN_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-017-OLE-STREAM-SIZE-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OLE",
      attackTechnique:
        "A valid legacy Word stream declares more bytes than the configured per-stream ceiling.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_STREAM_SIZE_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6F2-018-OLE-TOTAL-STREAM-BYTE-LIMIT",
      threatFamily: "RESOURCE_EXHAUSTION",
      format: "OLE",
      attackTechnique:
        "Individually permitted legacy streams collectively exceed the configured total user-stream byte budget.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_TOTAL_STREAM_SIZE_LIMIT_EXCEEDED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6F",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`M6C_ASSERTION_FAILED: ${message}`);
  }
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceFromDeterministicFragments(bytes: Buffer) {
  return (async function* () {
    const cut1 = Math.min(1, bytes.length);
    const cut2 = Math.min(4, bytes.length);
    const cut3 = Math.min(11, bytes.length);

    for (const chunk of [
      bytes.subarray(0, cut1),
      bytes.subarray(cut1, cut2),
      bytes.subarray(cut2, cut3),
      bytes.subarray(cut3),
    ]) {
      if (chunk.length > 0) {
        yield chunk;
      }
    }
  })();
}


function sourceWithEmptyChunkFlood(bytes: Buffer) {
  return (async function* () {
    for (let index = 0; index < 65; index += 1) {
      yield Buffer.alloc(0);
    }
    yield bytes;
  })();
}

function patchFirstZipCentralCompressedSize(bytes: Buffer, compressedSize: number) {
  const copy = Buffer.from(bytes);
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const offset = copy.indexOf(signature);

  assert(offset >= 0, "M6F2 ZIP fixture must contain a central-directory entry.");
  copy.writeUInt32LE(compressedSize >>> 0, offset + 20);
  return copy;
}

async function inspectDocumentWithResourceLimits(args: {
  bytes: Buffer;
  filename: string;
  extension: string;
  mimeType: string;
  source?: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  maxBytes?: number;
  archive?: NativeDocumentArchiveLimits;
  pdf?: NativeDocumentPdfLimits;
  ole?: NativeDocumentOleLimits;
}) {
  return inspectNativeDocumentIdentity({
    source: args.source ?? sourceFromDeterministicFragments(args.bytes),
    expectedSizeBytes: args.bytes.length,
    expectedSha256: sha256(args.bytes),
    declaredFilename: args.filename,
    declaredExtension: args.extension,
    declaredMimeType: args.mimeType,
    limits: {
      maxBytes: args.maxBytes ?? ONE_MEBIBYTE,
      archive: args.archive ?? ARCHIVE_LIMITS,
      pdf: args.pdf ?? PDF_LIMITS,
      ole: args.ole ?? OLE_LIMITS,
    },
  });
}


const M6E3_DIRECTORY_CERTIFICATION_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6E3-001-BENIGN-SORTED-DIRECTORY-TREE",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A deterministic legacy Word compound file uses a bounded, sorted all-black sibling tree with canonical unused directory entries and must remain accepted as a non-CLEAN benign directory control.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-002-INVALID-COLOR-FLAG",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A reachable stream carries a directory Color Flag outside the CFB red-or-black domain and must fail before application stream authority or security rules can be trusted.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-003-PROHIBITED-NAME-CHARACTER",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A reachable directory name contains a CFB-prohibited slash character and must fail before malformed naming can alter sibling lookup, application identity, or active-content reachability.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-004-LEFT-SUBTREE-ORDER-VIOLATION",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A directory node physically linked in the left subtree is renamed so it sorts after its ancestor under CFB length-first case-insensitive ordering and must fail structural authority.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_TREE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-005-RIGHT-SUBTREE-ORDER-VIOLATION",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A directory node physically linked in the right subtree is renamed so it sorts before its ancestor and must fail bounded sibling-tree ordering rather than being accepted by traversal order alone.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_TREE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-006-CASE-INSENSITIVE-DUPLICATE-NAME",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "Two immediate children become equal under the CFB case-insensitive comparator while retaining distinct byte spelling, and the duplicate namespace must fail instead of creating ambiguous lookup authority.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_TREE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-007-CONSECUTIVE-RED-SIBLING-NODES",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A parent and its directly linked sibling-tree child are both marked red, violating the CFB red-node adjacency invariant and requiring deterministic directory-tree rejection.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_TREE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-008-STREAM-CHILD-POINTER",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A stream directory entry is given a child pointer to another reachable entry, contradicting the CFB stream-object containment contract and attempting to smuggle a second hierarchy beneath a stream.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_TREE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-009-OUT-OF-RANGE-SIBLING-POINTER",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A reachable stream points to a sibling stream identifier beyond the bounded directory array and must fail before the invalid pointer can influence traversal or object lookup.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_TREE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-010-SIBLING-TREE-CYCLE",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A reachable sibling pointer is redirected to its own directory entry, creating a deterministic cycle that must fail without recursion escape, duplicate-parent acceptance, or ambiguous path construction.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_TREE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-011-UNREACHABLE-ALLOCATED-ENTRY",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A previously unused directory slot is converted into a syntactically allocated stream without linking it into any storage tree, and must fail as unreachable hidden directory content.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_TREE_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-012-DIRTY-UNALLOCATED-ENTRY",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "An unallocated directory slot retains Object Type zero but contains noncanonical hidden metadata, and must fail instead of allowing bytes outside the reachable directory namespace to carry ambiguous structure.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-013-STREAM-CLSID-NONZERO",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A stream directory entry carries a nonzero CLSID even though CFB requires stream CLSID bytes to be zero, and must fail before application activation metadata can be smuggled into a stream entry.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-014-STREAM-TIMESTAMP-NONZERO",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "A stream directory entry carries nonzero creation or modification time bytes where CFB requires zeros, and must fail strict directory conformance before stream authority is accepted.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6E3-015-ROOT-CREATION-TIME-NONZERO",
      threatFamily: "OLE_DIRECTORY_EVASION",
      format: "OLE",
      attackTechnique:
        "The Root Entry carries a nonzero creation timestamp even though CFB requires root creation time to be zero, and strict directory authority must reject the malformed root metadata.",
      expectedVerdict: "FAILED",
      expectedReasonCode: "OLE_DIRECTORY_INVALID",
      expectedRuleId: null,
      expectedDetectedContainer: "OLE",
      expectedSignatureKind: "OLE_COMPOUND_FILE_SIGNATURE",
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6E",
      certificationCredit: true,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

type CfbFixtureStream = {
  path: string;
  data: Buffer;
};

type CfbFixtureNode = {
  id: number;
  name: string;
  type: 1 | 2 | 5;
  parentPath: string | null;
  data: Buffer | null;
  startSector: number;
  streamSize: number;
  left: number;
  right: number;
  child: number;
};


function compareCfbFixtureNames(left: string, right: string) {
  const leftLength = Buffer.byteLength(`${left}\u0000`, "utf16le");
  const rightLength = Buffer.byteLength(`${right}\u0000`, "utf16le");
  if (leftLength !== rightLength) {
    return leftLength < rightLength ? -1 : 1;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftCodeUnit = left.charCodeAt(index);
    const rightCodeUnit = right.charCodeAt(index);
    const leftUpper =
      leftCodeUnit >= 0xd800 && leftCodeUnit <= 0xdfff
        ? leftCodeUnit
        : String.fromCharCode(leftCodeUnit).toUpperCase().charCodeAt(0);
    const rightUpper =
      rightCodeUnit >= 0xd800 && rightCodeUnit <= 0xdfff
        ? rightCodeUnit
        : String.fromCharCode(rightCodeUnit).toUpperCase().charCodeAt(0);

    if (leftUpper !== rightUpper) {
      return leftUpper < rightUpper ? -1 : 1;
    }
  }

  return 0;
}

function buildCfb(streams: CfbFixtureStream[], majorVersion: 3 | 4 = 3) {
  const sectorSize = majorVersion === 3 ? 512 : 4096;
  const miniSectorSize = 64;
  const nodes: CfbFixtureNode[] = [
    {
      id: 0,
      name: "Root Entry",
      type: 5,
      parentPath: null,
      data: null,
      startSector: 0xfffffffe,
      streamSize: 0,
      left: 0xffffffff,
      right: 0xffffffff,
      child: 0xffffffff,
    },
  ];
  const storageIds = new Map<string, number>();

  for (const stream of streams) {
    const parts = stream.path.split("/").filter(Boolean);
    assert(parts.length > 0, "CFB fixture stream path is required.");
    let parentPath = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index] as string;
      const path = parentPath ? `${parentPath}/${name}` : name;
      if (!storageIds.has(path)) {
        const id = nodes.length;
        storageIds.set(path, id);
        nodes.push({
          id,
          name,
          type: 1,
          parentPath: parentPath || "",
          data: null,
          startSector: 0,
          streamSize: 0,
          left: 0xffffffff,
          right: 0xffffffff,
          child: 0xffffffff,
        });
      }
      parentPath = path;
    }
    const name = parts[parts.length - 1] as string;
    nodes.push({
      id: nodes.length,
      name,
      type: 2,
      parentPath: parentPath || "",
      data: Buffer.from(stream.data),
      startSector: 0xfffffffe,
      streamSize: stream.data.length,
      left: 0xffffffff,
      right: 0xffffffff,
      child: 0xffffffff,
    });
  }

  const pathById = new Map<number, string>([[0, ""]]);
  for (const [path, id] of storageIds) pathById.set(id, path);

  const childrenByParent = new Map<string, number[]>();
  for (const node of nodes.slice(1)) {
    const parent = node.parentPath ?? "";
    const list = childrenByParent.get(parent) ?? [];
    list.push(node.id);
    childrenByParent.set(parent, list);
  }

  for (const [parentPath, childIds] of childrenByParent) {
    const parentId = parentPath === "" ? 0 : storageIds.get(parentPath);
    assert(parentId !== undefined, "CFB fixture parent storage must exist.");

    const sortedChildIds = [...childIds].sort((leftId, rightId) =>
      compareCfbFixtureNames(
        nodes[leftId]!.name,
        nodes[rightId]!.name,
      ),
    );

    for (let index = 1; index < sortedChildIds.length; index += 1) {
      assert(
        compareCfbFixtureNames(
          nodes[sortedChildIds[index - 1]!]!.name,
          nodes[sortedChildIds[index]!]!.name,
        ) !== 0,
        "CFB fixture siblings must have unique names under CFB ordering.",
      );
    }

    const buildSiblingTree = (
      startIndex: number,
      endIndex: number,
    ): number => {
      if (startIndex >= endIndex) return 0xffffffff;

      const middle = Math.floor((startIndex + endIndex) / 2);
      const nodeId = sortedChildIds[middle] as number;
      nodes[nodeId]!.left = buildSiblingTree(startIndex, middle);
      nodes[nodeId]!.right = buildSiblingTree(middle + 1, endIndex);
      return nodeId;
    };

    nodes[parentId]!.child = buildSiblingTree(
      0,
      sortedChildIds.length,
    );
  }

  const smallStreams = nodes.filter(
    (node) => node.type === 2 && node.streamSize > 0 && node.streamSize < 4096,
  );
  const regularStreams = nodes.filter(
    (node) => node.type === 2 && node.streamSize >= 4096,
  );

  const miniFatEntries: number[] = [];
  const miniChunks: Buffer[] = [];
  for (const node of smallStreams) {
    const miniCount = Math.ceil(node.streamSize / miniSectorSize);
    const firstMini = miniFatEntries.length;
    node.startSector = firstMini;
    for (let index = 0; index < miniCount; index += 1) {
      const chunk = Buffer.alloc(miniSectorSize);
      node.data!.subarray(index * miniSectorSize, (index + 1) * miniSectorSize).copy(chunk);
      miniChunks.push(chunk);
      miniFatEntries.push(index === miniCount - 1 ? 0xfffffffe : firstMini + index + 1);
    }
  }
  const miniStream = Buffer.concat(miniChunks);
  nodes[0]!.streamSize = miniStream.length;

  const directoryBytesLength = Math.max(sectorSize, Math.ceil(nodes.length * 128 / sectorSize) * sectorSize);
  const directorySectorCount = directoryBytesLength / sectorSize;
  const miniFatSectorCount = miniFatEntries.length === 0 ? 0 : Math.ceil(miniFatEntries.length * 4 / sectorSize);
  const rootMiniSectorCount = miniStream.length === 0 ? 0 : Math.ceil(miniStream.length / sectorSize);
  const regularSectorCounts = regularStreams.map((node) => Math.ceil(node.streamSize / sectorSize));

  const nonFatSectors = directorySectorCount + miniFatSectorCount + rootMiniSectorCount + regularSectorCounts.reduce((sum, count) => sum + count, 0);
  let fatSectorCount = 1;
  while (Math.ceil((nonFatSectors + fatSectorCount) / (sectorSize / 4)) > fatSectorCount) {
    fatSectorCount += 1;
  }
  assert(fatSectorCount <= 109, "CFB fixture must fit the header DIFAT.");

  let nextSector = 0;
  const directoryStart = nextSector;
  nextSector += directorySectorCount;
  const miniFatStart = miniFatSectorCount ? nextSector : 0xfffffffe;
  nextSector += miniFatSectorCount;
  const rootMiniStart = rootMiniSectorCount ? nextSector : 0xfffffffe;
  nextSector += rootMiniSectorCount;
  nodes[0]!.startSector = rootMiniStart;

  const regularStarts = new Map<number, number>();
  for (let index = 0; index < regularStreams.length; index += 1) {
    const node = regularStreams[index] as CfbFixtureNode;
    regularStarts.set(node.id, nextSector);
    node.startSector = nextSector;
    nextSector += regularSectorCounts[index] as number;
  }

  const fatStart = nextSector;
  const totalSectors = nonFatSectors + fatSectorCount;
  assert(fatStart + fatSectorCount === totalSectors, "CFB fixture FAT allocation mismatch.");

  const fat = new Array<number>(fatSectorCount * (sectorSize / 4)).fill(0xffffffff);
  const chain = (start: number, count: number, terminal = 0xfffffffe) => {
    for (let index = 0; index < count; index += 1) {
      fat[start + index] = index === count - 1 ? terminal : start + index + 1;
    }
  };

  chain(directoryStart, directorySectorCount);
  if (miniFatSectorCount) chain(miniFatStart, miniFatSectorCount);
  if (rootMiniSectorCount) chain(rootMiniStart, rootMiniSectorCount);
  for (let index = 0; index < regularStreams.length; index += 1) {
    chain(regularStarts.get(regularStreams[index]!.id) as number, regularSectorCounts[index] as number);
  }
  for (let index = 0; index < fatSectorCount; index += 1) {
    fat[fatStart + index] = 0xfffffffd;
  }

  const directory = Buffer.alloc(directoryBytesLength);
  for (const node of nodes) {
    const entry = directory.subarray(node.id * 128, node.id * 128 + 128);
    const nameBytes = Buffer.from(`${node.name}\u0000`, "utf16le");
    assert(nameBytes.length <= 64, `CFB fixture directory name too long: ${node.name}`);
    nameBytes.copy(entry, 0);
    entry.writeUInt16LE(nameBytes.length, 64);
    entry[66] = node.type;
    entry[67] = 1;
    entry.writeUInt32LE(node.left >>> 0, 68);
    entry.writeUInt32LE(node.right >>> 0, 72);
    entry.writeUInt32LE(node.child >>> 0, 76);
    entry.writeUInt32LE(node.startSector >>> 0, 116);
    entry.writeUInt32LE(node.streamSize >>> 0, 120);
    entry.writeUInt32LE(0, 124);
  }

  for (
    let entryId = nodes.length;
    entryId < directoryBytesLength / 128;
    entryId += 1
  ) {
    const entry = directory.subarray(
      entryId * 128,
      entryId * 128 + 128,
    );
    entry.writeUInt32LE(0xffffffff, 68);
    entry.writeUInt32LE(0xffffffff, 72);
    entry.writeUInt32LE(0xffffffff, 76);
  }

  const miniFatBytes = Buffer.alloc(miniFatSectorCount * sectorSize, 0xff);
  for (let index = 0; index < miniFatEntries.length; index += 1) {
    miniFatBytes.writeUInt32LE(miniFatEntries[index] as number, index * 4);
  }

  const rootMiniBytes = Buffer.alloc(rootMiniSectorCount * sectorSize);
  miniStream.copy(rootMiniBytes);

  const regularBytes: Buffer[] = [];
  for (let index = 0; index < regularStreams.length; index += 1) {
    const node = regularStreams[index] as CfbFixtureNode;
    const allocated = Buffer.alloc((regularSectorCounts[index] as number) * sectorSize);
    node.data!.copy(allocated);
    regularBytes.push(allocated);
  }

  const fatBytes = Buffer.alloc(fatSectorCount * sectorSize, 0xff);
  for (let index = 0; index < fat.length; index += 1) {
    fatBytes.writeUInt32LE(fat[index] as number, index * 4);
  }

  const header = Buffer.alloc(sectorSize);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(majorVersion, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(majorVersion === 3 ? 9 : 12, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(majorVersion === 4 ? directorySectorCount : 0, 40);
  header.writeUInt32LE(fatSectorCount, 44);
  header.writeUInt32LE(directoryStart, 48);
  header.writeUInt32LE(0, 52);
  header.writeUInt32LE(4096, 56);
  header.writeUInt32LE(miniFatStart >>> 0, 60);
  header.writeUInt32LE(miniFatSectorCount, 64);
  header.writeUInt32LE(0xfffffffe, 68);
  header.writeUInt32LE(0, 72);
  for (let index = 0; index < 109; index += 1) {
    header.writeUInt32LE(index < fatSectorCount ? fatStart + index : 0xffffffff, 76 + index * 4);
  }

  return Buffer.concat([
    header,
    directory,
    miniFatBytes,
    rootMiniBytes,
    ...regularBytes,
    fatBytes,
  ]);
}

function legacyOfficeFixture(
  extension: "doc" | "xls" | "ppt",
  extras: CfbFixtureStream[] = [],
  majorVersion: 3 | 4 = 3,
) {
  const applicationName =
    extension === "doc"
      ? "WordDocument"
      : extension === "xls"
        ? "Workbook"
        : "PowerPoint Document";
  return buildCfb([
    {
      path: applicationName,
      data: Buffer.alloc(4096, extension === "doc" ? 0x57 : extension === "xls" ? 0x58 : 0x50),
    },
    { path: "\u0005SummaryInformation", data: Buffer.alloc(100, 0x53) },
    ...extras,
  ], majorVersion);
}


function powerPointRecordHeader(
  recVer: number,
  recType: number,
  recLen: number,
  recInstance = 0,
) {
  const bytes = Buffer.alloc(8);
  bytes.writeUInt16LE(((recInstance << 4) | recVer) >>> 0, 0);
  bytes.writeUInt16LE(recType, 2);
  bytes.writeUInt32LE(recLen >>> 0, 4);
  return bytes;
}

function powerPointCurrentUserAtom(args: {
  currentEditOffset: number;
  headerToken?: number;
  recType?: number;
}) {
  const bytes = Buffer.alloc(32);
  powerPointRecordHeader(
    0,
    args.recType ?? 0x0ff6,
    24,
  ).copy(bytes, 0);
  bytes.writeUInt32LE(0x14, 8);
  bytes.writeUInt32LE(
    args.headerToken ?? 0xe391c05f,
    12,
  );
  bytes.writeUInt32LE(args.currentEditOffset >>> 0, 16);
  bytes.writeUInt16LE(0, 20);
  bytes.writeUInt16LE(0x03f4, 22);
  bytes[24] = 3;
  bytes[25] = 0;
  bytes.writeUInt32LE(8, 28);
  return bytes;
}

function powerPointUserEditAtom(args: {
  offsetLastEdit: number;
  offsetPersistDirectory: number;
  docPersistIdRef?: number;
  persistIdSeed?: number;
  encryptSessionPersistIdRef?: number | null;
}) {
  const encryptedRef = args.encryptSessionPersistIdRef ?? null;
  const recLen = encryptedRef === null ? 0x1c : 0x20;
  const bytes = Buffer.alloc(8 + recLen);
  powerPointRecordHeader(0, 0x0ff5, recLen).copy(bytes, 0);
  bytes[14] = 0;
  bytes[15] = 3;
  bytes.writeUInt32LE(args.offsetLastEdit >>> 0, 16);
  bytes.writeUInt32LE(args.offsetPersistDirectory >>> 0, 20);
  bytes.writeUInt32LE((args.docPersistIdRef ?? 1) >>> 0, 24);
  bytes.writeUInt32LE((args.persistIdSeed ?? 1) >>> 0, 28);
  if (encryptedRef !== null) {
    bytes.writeUInt32LE(encryptedRef >>> 0, 36);
  }
  return bytes;
}

function powerPointPersistDirectoryAtom(
  entries: readonly Readonly<{
    persistId: number;
    offsets: readonly number[];
  }>[],
  recType = 0x1772,
) {
  const payloadParts: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(
      ((entry.offsets.length << 20) | entry.persistId) >>> 0,
      0,
    );
    const offsets = Buffer.alloc(entry.offsets.length * 4);
    entry.offsets.forEach((offset, index) => {
      offsets.writeUInt32LE(offset >>> 0, index * 4);
    });
    payloadParts.push(header, offsets);
  }
  const payload = Buffer.concat(payloadParts);
  return Buffer.concat([
    powerPointRecordHeader(0, recType, payload.length),
    payload,
  ]);
}

function powerPointDocumentContainer(recType = 0x03e8) {
  return powerPointRecordHeader(0x0f, recType, 0);
}

function powerPointPersistFixture(args?: {
  mutate?: (powerPointDocument: Buffer, currentUser: Buffer) => void;
}) {
  const powerPointDocument = Buffer.alloc(4096);
  powerPointDocumentContainer().copy(powerPointDocument, 64);
  powerPointPersistDirectoryAtom([
    { persistId: 1, offsets: [64] },
  ]).copy(powerPointDocument, 256);
  powerPointUserEditAtom({
    offsetLastEdit: 0,
    offsetPersistDirectory: 256,
    docPersistIdRef: 1,
    persistIdSeed: 1,
  }).copy(powerPointDocument, 320);

  const currentUser = powerPointCurrentUserAtom({
    currentEditOffset: 320,
  });
  args?.mutate?.(powerPointDocument, currentUser);

  return buildCfb([
    { path: "PowerPoint Document", data: powerPointDocument },
    { path: "Current User", data: currentUser },
    { path: "\u0005SummaryInformation", data: Buffer.alloc(100, 0x53) },
  ]);
}

function powerPointTwoEditPersistFixture(args: {
  oldDocumentRecordType: number;
  newestDocumentRecordType: number;
}) {
  const powerPointDocument = Buffer.alloc(4096);

  powerPointDocumentContainer(args.oldDocumentRecordType).copy(
    powerPointDocument,
    64,
  );
  powerPointPersistDirectoryAtom([
    { persistId: 1, offsets: [64] },
  ]).copy(powerPointDocument, 128);
  powerPointUserEditAtom({
    offsetLastEdit: 0,
    offsetPersistDirectory: 128,
    persistIdSeed: 1,
  }).copy(powerPointDocument, 192);

  powerPointDocumentContainer(args.newestDocumentRecordType).copy(
    powerPointDocument,
    512,
  );
  powerPointPersistDirectoryAtom([
    { persistId: 1, offsets: [512] },
  ]).copy(powerPointDocument, 640);
  powerPointUserEditAtom({
    offsetLastEdit: 192,
    offsetPersistDirectory: 640,
    persistIdSeed: 1,
  }).copy(powerPointDocument, 704);

  return buildCfb([
    { path: "PowerPoint Document", data: powerPointDocument },
    {
      path: "Current User",
      data: powerPointCurrentUserAtom({ currentEditOffset: 704 }),
    },
  ]);
}

function powerPointRecord(
  recVer: number,
  recType: number,
  payload: Buffer,
  recInstance = 0,
) {
  return Buffer.concat([
    powerPointRecordHeader(recVer, recType, payload.length, recInstance),
    payload,
  ]);
}

function powerPointVbaInfoContainer(args: {
  persistIdRef: number;
  fHasMacros?: number;
  version?: number;
}) {
  const payload = Buffer.alloc(12);
  payload.writeUInt32LE(args.persistIdRef >>> 0, 0);
  payload.writeUInt32LE((args.fHasMacros ?? 1) >>> 0, 4);
  payload.writeUInt32LE((args.version ?? 2) >>> 0, 8);
  const atom = powerPointRecord(2, 0x0400, payload);
  return powerPointRecord(0x0f, 0x03ff, atom, 1);
}

function powerPointDocInfoList(children: readonly Buffer[]) {
  return powerPointRecord(0x0f, 0x07d0, Buffer.concat(children));
}

function powerPointExOleObjAtom(persistIdRef: number) {
  const payload = Buffer.alloc(0x18);
  payload.writeUInt32LE(persistIdRef >>> 0, 16);
  return powerPointRecord(1, 0x0fc3, payload);
}

function powerPointExternalObjectContainer(
  recType: 0x0fcc | 0x0fce | 0x0fee,
  persistIdRef: number,
) {
  const boundedCompanionAtom =
    recType === 0x0fcc
      ? powerPointRecord(0, 0x0fcd, Buffer.alloc(8))
      : recType === 0x0fee
        ? powerPointRecord(0, 0x0ffb, Buffer.alloc(4))
        : powerPointRecord(0, 0x0fd1, Buffer.alloc(4));
  return powerPointRecord(
    0x0f,
    recType,
    Buffer.concat([boundedCompanionAtom, powerPointExOleObjAtom(persistIdRef)]),
  );
}

function powerPointExternalObjectList(children: readonly Buffer[]) {
  const listAtom = powerPointRecord(0, 0x040a, Buffer.alloc(4));
  return powerPointRecord(
    0x0f,
    0x0409,
    Buffer.concat([listAtom, ...children]),
  );
}

function powerPointExternalStorage(args?: {
  recType?: number;
  recInstance?: 0 | 1;
  decompressedSize?: number;
}) {
  const recInstance = args?.recInstance ?? 1;
  const payload =
    recInstance === 1
      ? (() => {
          const bytes = Buffer.alloc(5);
          bytes.writeUInt32LE((args?.decompressedSize ?? 32) >>> 0, 0);
          bytes[4] = 0x78;
          return bytes;
        })()
      : Buffer.from([0x01]);
  return powerPointRecord(
    0,
    args?.recType ?? 0x1011,
    payload,
    recInstance,
  );
}

function powerPointM6E2BFixture(args?: {
  documentChildren?: readonly Buffer[];
  mappedStorage?: Buffer | null;
  mappedStoragePersistId?: number;
  staleStorage?: Buffer | null;
  persistIdSeed?: number;
}) {
  const powerPointDocument = Buffer.alloc(4096);
  const document = powerPointRecord(
    0x0f,
    0x03e8,
    Buffer.concat(args?.documentChildren ?? []),
  );
  document.copy(powerPointDocument, 64);

  const mappings: Array<{ persistId: number; offsets: readonly number[] }> = [
    { persistId: 1, offsets: [64] },
  ];

  const mappedStoragePersistId = args?.mappedStoragePersistId ?? 2;
  if (args?.mappedStorage) {
    args.mappedStorage.copy(powerPointDocument, 1024);
    mappings.push({ persistId: mappedStoragePersistId, offsets: [1024] });
  }
  if (args?.staleStorage) {
    args.staleStorage.copy(powerPointDocument, 1280);
  }

  powerPointPersistDirectoryAtom(mappings).copy(powerPointDocument, 2048);
  powerPointUserEditAtom({
    offsetLastEdit: 0,
    offsetPersistDirectory: 2048,
    docPersistIdRef: 1,
    persistIdSeed:
      args?.persistIdSeed ?? Math.max(1, mappedStoragePersistId),
  }).copy(powerPointDocument, 2304);

  return buildCfb([
    { path: "PowerPoint Document", data: powerPointDocument },
    {
      path: "Current User",
      data: powerPointCurrentUserAtom({ currentEditOffset: 2304 }),
    },
  ]);
}

function powerPointEncryptedSingleEditPersistFixture() {
  const powerPointDocument = Buffer.alloc(4096);
  Buffer.alloc(8, 0xa5).copy(powerPointDocument, 64);
  powerPointRecordHeader(0x0f, 0x2f14, 0).copy(
    powerPointDocument,
    96,
  );
  powerPointPersistDirectoryAtom([
    { persistId: 1, offsets: [64, 96] },
  ]).copy(powerPointDocument, 256);
  powerPointUserEditAtom({
    offsetLastEdit: 0,
    offsetPersistDirectory: 256,
    docPersistIdRef: 1,
    persistIdSeed: 2,
    encryptSessionPersistIdRef: 2,
  }).copy(powerPointDocument, 320);

  return buildCfb([
    { path: "PowerPoint Document", data: powerPointDocument },
    {
      path: "Current User",
      data: powerPointCurrentUserAtom({
        currentEditOffset: 320,
        headerToken: 0xf3d1c4df,
      }),
    },
  ]);
}

function powerPointEncryptedMultipleEditPersistFixture() {
  const powerPointDocument = Buffer.alloc(4096);

  Buffer.alloc(8, 0x4f).copy(powerPointDocument, 64);
  powerPointPersistDirectoryAtom([
    { persistId: 1, offsets: [64] },
  ]).copy(powerPointDocument, 128);
  powerPointUserEditAtom({
    offsetLastEdit: 0,
    offsetPersistDirectory: 128,
    persistIdSeed: 1,
  }).copy(powerPointDocument, 192);

  Buffer.alloc(8, 0x4e).copy(powerPointDocument, 512);
  powerPointRecordHeader(0x0f, 0x2f14, 0).copy(
    powerPointDocument,
    544,
  );
  powerPointPersistDirectoryAtom([
    { persistId: 1, offsets: [512] },
    { persistId: 3, offsets: [544] },
  ]).copy(powerPointDocument, 640);
  powerPointUserEditAtom({
    offsetLastEdit: 192,
    offsetPersistDirectory: 640,
    docPersistIdRef: 1,
    persistIdSeed: 3,
    encryptSessionPersistIdRef: 3,
  }).copy(powerPointDocument, 704);

  return buildCfb([
    { path: "PowerPoint Document", data: powerPointDocument },
    {
      path: "Current User",
      data: powerPointCurrentUserAtom({
        currentEditOffset: 704,
        headerToken: 0xf3d1c4df,
      }),
    },
  ]);
}

function cfbDirectoryEntryOffset(entryId: number) {
  return 512 + entryId * 128;
}

function cfbDirectoryStartSector(bytes: Buffer, entryId: number) {
  return bytes.readUInt32LE(cfbDirectoryEntryOffset(entryId) + 116);
}

function patchCfbDirectoryStartSector(bytes: Buffer, entryId: number, sectorId: number) {
  const copy = Buffer.from(bytes);
  copy.writeUInt32LE(sectorId >>> 0, cfbDirectoryEntryOffset(entryId) + 116);
  return copy;
}

function patchCfbFatEntry(bytes: Buffer, sectorId: number, value: number) {
  const copy = Buffer.from(bytes);
  const sectorSize = 1 << copy.readUInt16LE(30);
  const fatSectorId = copy.readUInt32LE(76);
  const fatOffset = (fatSectorId + 1) * sectorSize;
  copy.writeUInt32LE(value >>> 0, fatOffset + sectorId * 4);
  return copy;
}

function patchCfbMiniFatEntry(bytes: Buffer, miniSectorId: number, value: number) {
  const copy = Buffer.from(bytes);
  const sectorSize = 1 << copy.readUInt16LE(30);
  const miniFatSectorId = copy.readUInt32LE(60);
  assert(miniFatSectorId < 0xfffffffa, "CFB fixture MiniFAT sector must exist.");
  const miniFatOffset = (miniFatSectorId + 1) * sectorSize;
  copy.writeUInt32LE(value >>> 0, miniFatOffset + miniSectorId * 4);
  return copy;
}


function patchHeaderDifatEntry(bytes: Buffer, index: number, sectorId: number) {
  const copy = Buffer.from(bytes);
  copy.writeUInt32LE(sectorId >>> 0, 76 + index * 4);
  return copy;
}

function patchHeaderMiniFatCount(bytes: Buffer, count: number) {
  const copy = Buffer.from(bytes);
  copy.writeUInt32LE(count >>> 0, 64);
  return copy;
}

function patchCfbDirectoryColorFlag(
  bytes: Buffer,
  entryId: number,
  colorFlag: number,
) {
  const copy = Buffer.from(bytes);
  copy[cfbDirectoryEntryOffset(entryId) + 67] = colorFlag;
  return copy;
}

function patchCfbDirectoryName(bytes: Buffer, entryId: number, name: string) {
  const copy = Buffer.from(bytes);
  const offset = cfbDirectoryEntryOffset(entryId);
  copy.fill(0, offset, offset + 64);
  const encoded = Buffer.from(`${name}\u0000`, "utf16le");
  assert(encoded.length <= 64, "CFB adversarial directory name must fit the fixed field.");
  encoded.copy(copy, offset);
  copy.writeUInt16LE(encoded.length, offset + 64);
  return copy;
}


function patchCfbDirectoryPointer(
  bytes: Buffer,
  entryId: number,
  field: "left" | "right" | "child",
  targetId: number,
) {
  const copy = Buffer.from(bytes);
  const fieldOffset =
    field === "left" ? 68 : field === "right" ? 72 : 76;
  copy.writeUInt32LE(
    targetId >>> 0,
    cfbDirectoryEntryOffset(entryId) + fieldOffset,
  );
  return copy;
}

function patchCfbDirectoryBytes(
  bytes: Buffer,
  entryId: number,
  relativeOffset: number,
  patch: Buffer,
) {
  const copy = Buffer.from(bytes);
  patch.copy(
    copy,
    cfbDirectoryEntryOffset(entryId) + relativeOffset,
  );
  return copy;
}

function patchCfbUnallocatedAsStream(
  bytes: Buffer,
  entryId: number,
  name: string,
) {
  const copy = patchCfbDirectoryName(bytes, entryId, name);
  const offset = cfbDirectoryEntryOffset(entryId);
  copy[offset + 66] = 2;
  copy[offset + 67] = 1;
  copy.writeUInt32LE(0xffffffff, offset + 68);
  copy.writeUInt32LE(0xffffffff, offset + 72);
  copy.writeUInt32LE(0xffffffff, offset + 76);
  copy.writeUInt32LE(0xfffffffe, offset + 116);
  copy.writeUInt32LE(0, offset + 120);
  copy.writeUInt32LE(0, offset + 124);
  return copy;
}

function m6e3DirectoryFixture() {
  return buildCfb([
    { path: "WordDocument", data: Buffer.alloc(4096, 0x57) },
    { path: "Aaaa", data: Buffer.alloc(100, 0x41) },
    { path: "Bbbb", data: Buffer.alloc(100, 0x42) },
    { path: "Cccc", data: Buffer.alloc(100, 0x43) },
  ]);
}


function buildClassicPdf(args?: {
  prefix?: Buffer;
  headerComment?: Buffer;
}) {
  const objectBodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];

  const chunks: Buffer[] = [];
  let byteLength = 0;

  if (args?.prefix?.length) {
    chunks.push(Buffer.from(args.prefix));
    byteLength += args.prefix.length;
  }

  const header = Buffer.from("%PDF-1.7\n%HDS-M6B\n", "latin1");
  chunks.push(header);
  byteLength += header.length;

  if (args?.headerComment?.length) {
    const comment = Buffer.concat([
      Buffer.from("%", "latin1"),
      Buffer.from(args.headerComment),
      Buffer.from("\n", "latin1"),
    ]);
    chunks.push(comment);
    byteLength += comment.length;
  }

  const offsets: number[] = [0];

  objectBodies.forEach((body, index) => {
    offsets[index + 1] = byteLength;

    const objectBytes = Buffer.from(
      `${index + 1} 0 obj\n${body}\nendobj\n`,
      "latin1",
    );

    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  });

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objectBodies.length + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (
    let objectNumber = 1;
    objectNumber <= objectBodies.length;
    objectNumber += 1
  ) {
    xref +=
      `${String(offsets[objectNumber]).padStart(10, "0")}` +
      " 00000 n \n";
  }

  xref +=
    `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}

function buildM6DClassicPdf(objectBodies: readonly string[]) {
  const chunks: Buffer[] = [];
  let byteLength = 0;

  const header = Buffer.from("%PDF-1.7\n%HDS-M6D1\n", "latin1");
  chunks.push(header);
  byteLength += header.length;

  const offsets: number[] = [0];

  objectBodies.forEach((body, index) => {
    offsets[index + 1] = byteLength;
    const objectBytes = Buffer.from(
      `${index + 1} 0 obj\n${body}\nendobj\n`,
      "latin1",
    );
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  });

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objectBodies.length + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (let objectNumber = 1; objectNumber <= objectBodies.length; objectNumber += 1) {
    xref +=
      `${String(offsets[objectNumber]).padStart(10, "0")}` +
      " 00000 n \n";
  }

  xref +=
    `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

type M6D2ClassicFixture = Readonly<{
  bytes: Buffer;
  xrefOffset: number;
  objectOffsets: readonly number[];
}>;

function buildM6D2ClassicFixture(args?: {
  objectBodies?: readonly string[];
  rootGeneration?: number;
  sizeOverride?: number;
}): M6D2ClassicFixture {
  const objectBodies = args?.objectBodies ?? [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];

  const chunks: Buffer[] = [
    Buffer.from("%PDF-1.7\n%HDS-M6D2\n", "latin1"),
  ];
  const objectOffsets: number[] = [0];
  let byteLength = chunks[0]!.length;

  objectBodies.forEach((body, index) => {
    objectOffsets[index + 1] = byteLength;
    const objectBytes = Buffer.from(
      `${index + 1} 0 obj\n${body}\nendobj\n`,
      "latin1",
    );
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  });

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objectBodies.length + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (let objectNumber = 1; objectNumber <= objectBodies.length; objectNumber += 1) {
    xref +=
      `${String(objectOffsets[objectNumber]).padStart(10, "0")}` +
      " 00000 n \n";
  }

  xref +=
    `trailer\n<< /Size ${args?.sizeOverride ?? objectBodies.length + 1}` +
    ` /Root 1 ${args?.rootGeneration ?? 0} R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(Buffer.from(xref, "latin1"));

  return Object.freeze({
    bytes: Buffer.concat(chunks),
    xrefOffset,
    objectOffsets: Object.freeze([...objectOffsets]),
  });
}

function appendM6D2IncrementalObject(args: {
  base: M6D2ClassicFixture;
  objectNumber: number;
  body: string;
  size: number;
}) {
  const objectOffset = args.base.bytes.length;
  const objectBytes = Buffer.from(
    `${args.objectNumber} 0 obj\n${args.body}\nendobj\n`,
    "latin1",
  );
  const xrefOffset = objectOffset + objectBytes.length;
  const xref =
    `xref\n${args.objectNumber} 1\n` +
    `${String(objectOffset).padStart(10, "0")} 00000 n \n` +
    `trailer\n<< /Size ${args.size} /Root 1 0 R /Prev ${args.base.xrefOffset} >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.concat([
    args.base.bytes,
    objectBytes,
    Buffer.from(xref, "latin1"),
  ]);
}

function appendM6D2FreeEntry(args: {
  base: M6D2ClassicFixture;
  objectNumber: number;
  size: number;
}) {
  const xrefOffset = args.base.bytes.length;
  const xref =
    `xref\n${args.objectNumber} 1\n` +
    "0000000000 00001 f \n" +
    `trailer\n<< /Size ${args.size} /Root 1 0 R /Prev ${args.base.xrefOffset} >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.concat([
    args.base.bytes,
    Buffer.from(xref, "latin1"),
  ]);
}

function appendM6D2RawClassicUpdate(args: {
  base: M6D2ClassicFixture;
  xrefBody: string;
  trailerBody: string;
}) {
  const xrefOffset = args.base.bytes.length;
  const update = Buffer.from(
    `${args.xrefBody}trailer\n<< ${args.trailerBody} >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`,
    "latin1",
  );

  return Buffer.concat([args.base.bytes, update]);
}

function m6d2XrefRow(type: number, field1: number, field2: number) {
  const row = Buffer.alloc(7);
  row[0] = type & 0xff;
  row.writeUInt32BE(field1 >>> 0, 1);
  row.writeUInt16BE(field2 & 0xffff, 5);
  return row;
}

function buildM6D2HybridConflictPdf() {
  const base = buildM6D2ClassicFixture();
  const chunks: Buffer[] = [base.bytes];
  let byteLength = base.bytes.length;

  const conflictingObjectOffset = byteLength;
  const conflictingObject = Buffer.from(
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (HDS-M6D2) >> >>\nendobj\n",
    "latin1",
  );
  chunks.push(conflictingObject);
  byteLength += conflictingObject.length;

  const xrefStreamOffset = byteLength;
  const xrefRow = m6d2XrefRow(1, conflictingObjectOffset, 0);
  const xrefStream = Buffer.concat([
    Buffer.from(
      `5 0 obj\n<< /Type /XRef /Size 6 /W [1 4 2] /Index [1 1]` +
        ` /Length ${xrefRow.length} >>\nstream\n`,
      "latin1",
    ),
    xrefRow,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
  chunks.push(xrefStream);
  byteLength += xrefStream.length;

  const updateXrefOffset = byteLength;
  const updateXref =
    "xref\n" +
    "1 1\n" +
    `${String(base.objectOffsets[1]).padStart(10, "0")} 00000 n \n` +
    "5 1\n" +
    `${String(xrefStreamOffset).padStart(10, "0")} 00000 n \n` +
    `trailer\n<< /Size 6 /Root 1 0 R /Prev ${base.xrefOffset}` +
    ` /XRefStm ${xrefStreamOffset} >>\n` +
    `startxref\n${updateXrefOffset}\n%%EOF\n`;

  chunks.push(Buffer.from(updateXref, "latin1"));
  return Buffer.concat(chunks);
}

function buildM6D2LengthGenerationMismatchPdf() {
  return buildM6D2ClassicFixture({
    objectBodies: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
      "5",
      "<< /Length 4 1 R >>\nstream\nHELLO\nendstream",
    ],
  }).bytes;
}

type M6D3ObjectStreamOptions = Readonly<{
  objectStreamGeneration?: number;
  extraCompressedObject?: Readonly<{
    objectNumber: number;
    body: string;
  }>;
  compressedObjectZero?: boolean;
  duplicateContainedObjectNumber?: boolean;
  rootObjectStreamIndex?: number;
  relativeOffsetsOverride?: readonly number[];
}>;

function buildM6D3ObjectStreamPdf(
  options: M6D3ObjectStreamOptions = {},
) {
  const chunks: Buffer[] = [
    Buffer.from("%PDF-1.7\n%HDS-M6D3\n", "latin1"),
  ];
  const offsets = new Map<number, number>();
  let byteLength = chunks[0]!.length;

  const addObject = (
    objectNumber: number,
    generation: number,
    body: Buffer,
  ) => {
    offsets.set(objectNumber, byteLength);
    const objectBytes = Buffer.concat([
      Buffer.from(`${objectNumber} ${generation} obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  };

  addObject(
    3,
    0,
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
      "latin1",
    ),
  );

  const objectNumbers: number[] = [1, 2];
  const objectBodies: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "latin1"),
  ];

  if (options.compressedObjectZero) {
    objectNumbers.unshift(0);
    objectBodies.unshift(
      Buffer.from(
        "<< /S /JavaScript /JS (HDS-M6D3-OBJECT-ZERO) >>",
        "latin1",
      ),
    );
  }

  if (options.extraCompressedObject) {
    objectNumbers.push(options.extraCompressedObject.objectNumber);
    objectBodies.push(
      Buffer.from(options.extraCompressedObject.body, "latin1"),
    );
  }

  if (options.duplicateContainedObjectNumber) {
    objectNumbers.splice(1, 0, objectNumbers[0]!);
    objectBodies.splice(
      1,
      0,
      Buffer.from("<< /Type /DuplicateProbe >>", "latin1"),
    );
  }

  const calculatedOffsets: number[] = [];
  let objectDataOffset = 0;
  for (const body of objectBodies) {
    calculatedOffsets.push(objectDataOffset);
    objectDataOffset += body.length + 1;
  }

  const relativeOffsets =
    options.relativeOffsetsOverride
      ? [...options.relativeOffsetsOverride]
      : calculatedOffsets;

  assert(
    relativeOffsets.length === objectNumbers.length,
    "M6D3 fixture relative offsets must match the contained-object count.",
  );

  let header = "";
  objectNumbers.forEach((objectNumber, index) => {
    header += `${objectNumber} ${relativeOffsets[index]} `;
  });

  const headerBytes = Buffer.from(header, "latin1");
  const decodedParts: Buffer[] = [headerBytes];
  objectBodies.forEach((body, index) => {
    decodedParts.push(body);
    if (index + 1 < objectBodies.length) {
      decodedParts.push(Buffer.from(" ", "latin1"));
    }
  });

  const decodedObjectStream = Buffer.concat(decodedParts);
  const encodedObjectStream = deflateSync(decodedObjectStream);
  const objectStreamGeneration = options.objectStreamGeneration ?? 0;

  addObject(
    4,
    objectStreamGeneration,
    Buffer.concat([
      Buffer.from(
        `<< /Type /ObjStm /N ${objectNumbers.length}` +
          ` /First ${headerBytes.length} /Length ${encodedObjectStream.length}` +
          " /Filter /FlateDecode >>\nstream\n",
        "latin1",
      ),
      encodedObjectStream,
      Buffer.from("\nendstream", "latin1"),
    ]),
  );

  const xrefObjectNumber = 5;
  const xrefOffset = byteLength;
  const highestObjectNumber = Math.max(5, ...objectNumbers);
  const size = highestObjectNumber + 1;
  const rows: Buffer[] = [];

  for (let objectNumber = 0; objectNumber < size; objectNumber += 1) {
    const containedIndex = objectNumbers.indexOf(objectNumber);

    if (containedIndex >= 0) {
      rows.push(
        m6d2XrefRow(
          2,
          4,
          objectNumber === 1
            ? options.rootObjectStreamIndex ?? containedIndex
            : containedIndex,
        ),
      );
    } else if (objectNumber === 3) {
      rows.push(m6d2XrefRow(1, offsets.get(3)!, 0));
    } else if (objectNumber === 4) {
      rows.push(
        m6d2XrefRow(1, offsets.get(4)!, objectStreamGeneration),
      );
    } else if (objectNumber === xrefObjectNumber) {
      rows.push(m6d2XrefRow(1, xrefOffset, 0));
    } else {
      rows.push(
        m6d2XrefRow(
          0,
          0,
          objectNumber === 0 ? 65535 : 0,
        ),
      );
    }
  }

  const xrefData = deflateSync(Buffer.concat(rows));
  chunks.push(
    Buffer.concat([
      Buffer.from(
        `${xrefObjectNumber} 0 obj\n` +
          `<< /Type /XRef /Size ${size} /Root 1 0 R /W [1 4 2]` +
          ` /Index [0 ${size}] /Length ${xrefData.length}` +
          " /Filter /FlateDecode >>\nstream\n",
        "latin1",
      ),
      xrefData,
      Buffer.from(
        `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`,
        "latin1",
      ),
    ]),
  );

  return Buffer.concat(chunks);
}

function buildM6D3CompressedLengthPdf() {
  const chunks: Buffer[] = [
    Buffer.from("%PDF-1.7\n%HDS-M6D3-LENGTH\n", "latin1"),
  ];
  const offsets = new Map<number, number>();
  let byteLength = chunks[0]!.length;

  const addObject = (objectNumber: number, body: Buffer) => {
    offsets.set(objectNumber, byteLength);
    const objectBytes = Buffer.concat([
      Buffer.from(`${objectNumber} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  };

  addObject(
    1,
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
  );
  addObject(
    2,
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "latin1"),
  );
  addObject(
    3,
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
      "latin1",
    ),
  );

  const targetDecoded = Buffer.from("8 0 << /Type /Example >>", "latin1");
  const targetEncoded = deflateSync(targetDecoded);

  const lengthDecoded = Buffer.from(
    `7 0 ${targetEncoded.length}`,
    "latin1",
  );
  const lengthEncoded = deflateSync(lengthDecoded);

  addObject(
    6,
    Buffer.concat([
      Buffer.from(
        `<< /Type /ObjStm /N 1 /First 4 /Length ${lengthEncoded.length}` +
          " /Filter /FlateDecode >>\nstream\n",
        "latin1",
      ),
      lengthEncoded,
      Buffer.from("\nendstream", "latin1"),
    ]),
  );

  addObject(
    4,
    Buffer.concat([
      Buffer.from(
        "<< /Type /ObjStm /N 1 /First 4 /Length 7 0 R" +
          " /Filter /FlateDecode >>\nstream\n",
        "latin1",
      ),
      targetEncoded,
      Buffer.from("\nendstream", "latin1"),
    ]),
  );

  const xrefObjectNumber = 5;
  const xrefOffset = byteLength;
  const size = 9;
  const rows: Buffer[] = [];

  for (let objectNumber = 0; objectNumber < size; objectNumber += 1) {
    if (objectNumber === 0) {
      rows.push(m6d2XrefRow(0, 0, 65535));
    } else if ([1, 2, 3, 4, 6].includes(objectNumber)) {
      rows.push(m6d2XrefRow(1, offsets.get(objectNumber)!, 0));
    } else if (objectNumber === xrefObjectNumber) {
      rows.push(m6d2XrefRow(1, xrefOffset, 0));
    } else if (objectNumber === 7) {
      rows.push(m6d2XrefRow(2, 6, 0));
    } else if (objectNumber === 8) {
      rows.push(m6d2XrefRow(2, 4, 0));
    } else {
      rows.push(m6d2XrefRow(0, 0, 0));
    }
  }

  const xrefData = deflateSync(Buffer.concat(rows));
  chunks.push(
    Buffer.concat([
      Buffer.from(
        `${xrefObjectNumber} 0 obj\n` +
          `<< /Type /XRef /Size ${size} /Root 1 0 R /W [1 4 2]` +
          ` /Index [0 ${size}] /Length ${xrefData.length}` +
          " /Filter /FlateDecode >>\nstream\n",
        "latin1",
      ),
      xrefData,
      Buffer.from(
        `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`,
        "latin1",
      ),
    ]),
  );

  return Buffer.concat(chunks);
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

type StoredZipEntry = Readonly<{
  name: string;
  data: Buffer;
}>;

function buildStoredZipRecords(entries: readonly StoredZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const localOffsets: number[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const flags = 0x0800;
    const checksum = crc32(entry.data);

    localOffsets.push(localOffset);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    localParts.push(local, entry.data);
    localOffset += local.length + entry.data.length;
  }

  entries.forEach((entry, index) => {
    const name = Buffer.from(entry.name, "utf8");
    const flags = 0x0800;
    const checksum = crc32(entry.data);
    const central = Buffer.alloc(46 + name.length);

    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffsets[index]!, 42);
    name.copy(central, 46);

    centralParts.push(central);
  });

  return {
    localDirectory: Buffer.concat(localParts),
    centralDirectory: Buffer.concat(centralParts),
  };
}

function buildStoredZip(entries: readonly StoredZipEntry[]) {
  const records = buildStoredZipRecords(entries);
  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(records.centralDirectory.length, 12);
  eocd.writeUInt32LE(records.localDirectory.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([
    records.localDirectory,
    records.centralDirectory,
    eocd,
  ]);
}

type M6COoxmlApplication = "docx" | "xlsx" | "pptx";

const M6C_OOXML_PROFILES = Object.freeze({
  docx: Object.freeze({
    mainPartPath: "word/document.xml",
    mainRelationshipsPath: "word/_rels/document.xml.rels",
    mainContentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    mainXml: "<document/>",
  }),
  xlsx: Object.freeze({
    mainPartPath: "xl/workbook.xml",
    mainRelationshipsPath: "xl/_rels/workbook.xml.rels",
    mainContentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    mainXml: "<workbook/>",
  }),
  pptx: Object.freeze({
    mainPartPath: "ppt/presentation.xml",
    mainRelationshipsPath: "ppt/_rels/presentation.xml.rels",
    mainContentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    mainXml: "<presentation/>",
  }),
});

function buildM6COoxmlPackage(args: {
  application: M6COoxmlApplication;
  mainRelationships?: readonly string[];
  additionalEntries?: readonly StoredZipEntry[];
  additionalContentTypeOverrides?: readonly string[];
}) {
  const profile = M6C_OOXML_PROFILES[args.application];
  const contentTypes = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      `<Override PartName="/${profile.mainPartPath}" ContentType="${profile.mainContentType}"/>` +
      (args.additionalContentTypeOverrides ?? []).join("") +
      "</Types>",
    "utf8",
  );

  const rootRelationships = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${profile.mainPartPath}"/>` +
      "</Relationships>",
    "utf8",
  );

  const entries: StoredZipEntry[] = [
    Object.freeze({
      name: "[Content_Types].xml",
      data: contentTypes,
    }),
    Object.freeze({
      name: "_rels/.rels",
      data: rootRelationships,
    }),
    Object.freeze({
      name: profile.mainPartPath,
      data: Buffer.from(profile.mainXml, "utf8"),
    }),
  ];

  if (args.mainRelationships?.length) {
    entries.push(
      Object.freeze({
        name: profile.mainRelationshipsPath,
        data: Buffer.from(
          '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            args.mainRelationships.join("") +
            "</Relationships>",
          "utf8",
        ),
      }),
    );
  }

  for (const entry of args.additionalEntries ?? []) {
    entries.push(entry);
  }

  return buildStoredZip(entries);
}

function buildOoxmlPdfPolyglot() {
  const contentTypes = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>",
    "utf8",
  );

  const rootRelationships = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>",
    "utf8",
  );

  const records = buildStoredZipRecords([
    Object.freeze({
      name: "[Content_Types].xml",
      data: contentTypes,
    }),
    Object.freeze({
      name: "_rels/.rels",
      data: rootRelationships,
    }),
    Object.freeze({
      name: "word/document.xml",
      data: Buffer.from("<document/>", "utf8"),
    }),
  ]);

  const objectBodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];

  const pdfChunks: Buffer[] = [
    Buffer.from("%PDF-1.7\n%HDS-M6B-TRUE-POLYGLOT\n", "latin1"),
  ];
  const objectOffsets: number[] = [0];
  let absoluteLength =
    records.localDirectory.length +
    pdfChunks[0]!.length;

  objectBodies.forEach((body, index) => {
    objectOffsets[index + 1] = absoluteLength;
    const objectBytes = Buffer.from(
      `${index + 1} 0 obj\n${body}\nendobj\n`,
      "latin1",
    );
    pdfChunks.push(objectBytes);
    absoluteLength += objectBytes.length;
  });

  const pdfBody = Buffer.concat(pdfChunks);
  const centralDirectoryOffset =
    records.localDirectory.length +
    pdfBody.length;

  const eocdOffset =
    centralDirectoryOffset +
    records.centralDirectory.length;

  const xrefOffset = eocdOffset + 22;

  let xref = `xref\n0 ${objectBodies.length + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (
    let objectNumber = 1;
    objectNumber <= objectBodies.length;
    objectNumber += 1
  ) {
    xref +=
      `${String(objectOffsets[objectNumber]).padStart(10, "0")}` +
      " 00000 n \n";
  }

  xref +=
    `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  const zipComment = Buffer.from(xref, "latin1");

  assert(
    zipComment.length <= 0xffff,
    "The deterministic ZIP/PDF polyglot comment must fit the ZIP EOCD comment field.",
  );

  assert(
    records.localDirectory.length <= 1019,
    "The deterministic ZIP/PDF polyglot PDF header must remain inside the supported 1024-byte PDF preamble window.",
  );

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(3, 8);
  eocd.writeUInt16LE(3, 10);
  eocd.writeUInt32LE(
    records.centralDirectory.length,
    12,
  );
  eocd.writeUInt32LE(
    centralDirectoryOffset,
    16,
  );
  eocd.writeUInt16LE(
    zipComment.length,
    20,
  );

  return Buffer.concat([
    records.localDirectory,
    pdfBody,
    records.centralDirectory,
    eocd,
    zipComment,
  ]);
}

function zipFrontedWithInnerPdfMarker() {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(48, 0x41),
    Buffer.from("%PDF-1.7\n", "ascii"),
    Buffer.alloc(128, 0x42),
  ]);
}

function oleFrontedWithInnerPdfMarker() {
  const bytes = Buffer.alloc(512);

  Buffer.from([
    0xd0,
    0xcf,
    0x11,
    0xe0,
    0xa1,
    0xb1,
    0x1a,
    0xe1,
  ]).copy(bytes, 0);

  Buffer.from("%PDF-1.7\n", "ascii").copy(
    bytes,
    64,
  );

  return bytes;
}

function executableFrontedWithInnerPdfMarker(
  kind: "PE" | "ELF",
) {
  const bytes = Buffer.alloc(128);

  if (kind === "PE") {
    Buffer.from([0x4d, 0x5a]).copy(bytes, 0);
  } else {
    Buffer.from([
      0x7f,
      0x45,
      0x4c,
      0x46,
    ]).copy(bytes, 0);
  }

  Buffer.from("%PDF-1.7\n", "ascii").copy(
    bytes,
    24,
  );

  return bytes;
}

async function inspectDocument(args: {
  bytes: Buffer;
  filename: string;
  extension: string;
  mimeType: string;
  expectedSizeBytes?: number;
  expectedSha256?: string;
}) {
  return inspectNativeDocumentIdentity({
    source: sourceFromDeterministicFragments(args.bytes),
    expectedSizeBytes:
      args.expectedSizeBytes ?? args.bytes.length,
    expectedSha256:
      args.expectedSha256 ?? sha256(args.bytes),
    declaredFilename: args.filename,
    declaredExtension: args.extension,
    declaredMimeType: args.mimeType,
    limits: {
      maxBytes: ONE_MEBIBYTE,
      archive: ARCHIVE_LIMITS,
      pdf: PDF_LIMITS,
      ole: OLE_LIMITS,
    },
  });
}

async function inspectPdf(args: {
  bytes: Buffer;
  expectedSizeBytes?: number;
  expectedSha256?: string;
}) {
  return inspectDocument({
    bytes: args.bytes,
    expectedSizeBytes: args.expectedSizeBytes,
    expectedSha256: args.expectedSha256,
    filename: "m6a-sentinel.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
  });
}

function assertResultMatchesContract(
  result: NativeDocumentScannerResult,
  contract: CorpusCaseContract,
) {
  assert(
    result.verdict === contract.expectedVerdict,
    `${contract.caseId} expected verdict ${contract.expectedVerdict}, received ${result.verdict}.`,
  );

  assert(
    result.reasonCodes.includes(contract.expectedReasonCode),
    `${contract.caseId} expected reason ${contract.expectedReasonCode}.`,
  );

  assert(
    String(result.verdict) !== "CLEAN",
    `${contract.caseId} must never grant CLEAN authority during M6.`,
  );

  assert(
    result.inspectionComplete === false,
    `${contract.caseId} must preserve inspectionComplete=false during M6.`,
  );

  if (contract.expectedDetectedContainer !== undefined) {
    assert(
      result.identityEvidence.detectedContainer ===
        contract.expectedDetectedContainer,
      `${contract.caseId} expected container ${contract.expectedDetectedContainer}, received ${result.identityEvidence.detectedContainer}.`,
    );
  }

  if (contract.expectedSignatureKind !== undefined) {
    assert(
      result.identityEvidence.signatureKind ===
        contract.expectedSignatureKind,
      `${contract.caseId} expected signature ${contract.expectedSignatureKind}, received ${result.identityEvidence.signatureKind}.`,
    );
  }

  if (contract.expectedRuleId !== null) {
    assert(
      result.rulePackEvaluation?.matchedRules.some(
        (rule) => rule.ruleId === contract.expectedRuleId,
      ) === true,
      `${contract.caseId} expected matched rule ${contract.expectedRuleId}.`,
    );
  }
}

function validateManifest() {
  assert(
    THREAT_FAMILIES.length === 21,
    "M6A must register the exact 21-family adversarial coverage seed.",
  );

  assert(
    THREAT_FAMILY_MANIFEST.length === THREAT_FAMILIES.length,
    "Every registered threat family must have exactly one manifest entry.",
  );

  const expectedFamilies = new Set<string>(THREAT_FAMILIES);
  const observedFamilies = new Set<string>();

  for (const entry of THREAT_FAMILY_MANIFEST) {
    assert(
      Object.isFrozen(entry),
      `Manifest entry ${entry.threatFamily} must be immutable.`,
    );
    assert(
      expectedFamilies.has(entry.threatFamily),
      `Manifest entry ${entry.threatFamily} is not a registered threat family.`,
    );
    assert(
      !observedFamilies.has(entry.threatFamily),
      `Threat family ${entry.threatFamily} is registered more than once.`,
    );
    const expectedCertification =
      entry.threatFamily === "IDENTITY_AMBIGUITY" ||
      entry.threatFamily === "POLYGLOT"
        ? "CERTIFIED_M6B"
        : entry.threatFamily === "OOXML_CONTAINER_EVASION" ||
            entry.threatFamily === "OOXML_RELATIONSHIP_EVASION" ||
            entry.threatFamily === "OOXML_MACRO_EVASION"
          ? "CERTIFIED_M6C"
          : entry.threatFamily === "PDF_INCREMENTAL_UPDATE_EVASION" ||
              entry.threatFamily === "PDF_XREF_EVASION"
            ? "CERTIFIED_M6D2"
            : entry.threatFamily === "PDF_OBJECT_STREAM_EVASION"
              ? "CERTIFIED_M6D3"
              : entry.threatFamily === "PDF_ACTION_EVASION"
                ? "CERTIFIED_M6D4"
                : entry.threatFamily === "PDF_URI_EVASION"
                  ? "CERTIFIED_M6D5"
                  : entry.threatFamily === "PDF_EMBEDDED_CONTENT_EVASION"
                    ? "CERTIFIED_M6D5B"
                    : entry.threatFamily === "OLE_FAT_DIFAT_EVASION" ||
                        entry.threatFamily === "OLE_MINIFAT_EVASION"
                      ? "CERTIFIED_M6E1"
                      : entry.threatFamily === "OLE_VBA_EVASION" ||
                          entry.threatFamily === "OLE_EMBEDDED_OBJECT_EVASION"
                        ? "CERTIFIED_M6E2B"
                        : entry.threatFamily === "OLE_DIRECTORY_EVASION"
                          ? "CERTIFIED_M6E3"
                          : entry.threatFamily === "HASH_SIZE_IDENTITY_RACE"
                            ? "CERTIFIED_M6F1"
                            : entry.threatFamily === "RESOURCE_EXHAUSTION"
                              ? "CERTIFIED_M6F2"
                              : "NOT_CERTIFIED";

    assert(
      entry.certificationStatus === expectedCertification,
      `${entry.threatFamily} has an unexpected M6 certification state.`,
    );
    assert(
      entry.objective.trim().length >= 24,
      `Threat family ${entry.threatFamily} must have an explicit adversarial objective.`,
    );

    observedFamilies.add(entry.threatFamily);
  }

  assert(
    observedFamilies.size === expectedFamilies.size,
    "M6 manifest coverage must be complete and non-duplicated.",
  );

  assert(
    Object.isFrozen(THREAT_FAMILY_MANIFEST),
    "M6 threat-family manifest must be immutable.",
  );
}

function validateCaseContract() {
  const caseIds = new Set<string>();

  for (const testCase of HARNESS_SENTINEL_CASES) {
    assert(
      Object.isFrozen(testCase),
      `Sentinel ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6A-SENTINEL-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `Sentinel case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate sentinel case id: ${testCase.caseId}`,
    );
    assert(
      testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must declare deterministic generated provenance.`,
    );
    assert(
      testCase.certificationPhase === "M6A" &&
        testCase.certificationCredit === false,
      `${testCase.caseId} is a harness sentinel and must not earn certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 24,
      `${testCase.caseId} must describe its attack/control technique.`,
    );

    caseIds.add(testCase.caseId);
  }

  assert(
    Object.isFrozen(HARNESS_SENTINEL_CASES),
    "M6A sentinel case registry must be immutable.",
  );
}

function validateM6BCertificationCases() {
  const caseIds = new Set<string>();

  assert(
    M6B_CERTIFICATION_CASES.length === 11,
    "M6B must execute the exact 11-case identity/polyglot certification matrix.",
  );

  for (const testCase of M6B_CERTIFICATION_CASES) {
    assert(
      Object.isFrozen(testCase),
      `M6B case ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6B-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6B case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate M6B case id: ${testCase.caseId}`,
    );
    assert(
      testCase.threatFamily === "IDENTITY_AMBIGUITY" ||
        testCase.threatFamily === "POLYGLOT",
      `${testCase.caseId} must certify only the bounded M6B threat families.`,
    );
    assert(
      testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must use deterministic generated provenance.`,
    );
    assert(
      testCase.certificationPhase === "M6B" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn explicit M6B certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.expectedDetectedContainer !== undefined &&
        testCase.expectedSignatureKind !== undefined,
      `${testCase.caseId} must assert exact container and signature identity.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 48,
      `${testCase.caseId} must describe the adversarial identity technique precisely.`,
    );

    caseIds.add(testCase.caseId);
  }

  assert(
    Object.isFrozen(M6B_CERTIFICATION_CASES),
    "M6B certification registry must be immutable.",
  );
}

function validateM6CCertificationCases() {
  const caseIds = new Set<string>();
  const familyCounts = new Map<ThreatFamily, number>();

  assert(
    M6C_CERTIFICATION_CASES.length === 9,
    "M6C must execute the exact nine-case OOXML evasion certification matrix.",
  );

  for (const testCase of M6C_CERTIFICATION_CASES) {
    assert(
      Object.isFrozen(testCase),
      `M6C case ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6C-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6C case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate M6C case id: ${testCase.caseId}`,
    );
    assert(
      testCase.threatFamily === "OOXML_CONTAINER_EVASION" ||
        testCase.threatFamily === "OOXML_RELATIONSHIP_EVASION" ||
        testCase.threatFamily === "OOXML_MACRO_EVASION",
      `${testCase.caseId} must certify only the bounded M6C OOXML threat families.`,
    );
    assert(
      testCase.format === "OOXML" &&
        testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must be a deterministic generated OOXML fixture.`,
    );
    assert(
      testCase.certificationPhase === "M6C" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn explicit M6C certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.expectedDetectedContainer === "ZIP" &&
        testCase.expectedSignatureKind === "ZIP_SIGNATURE",
      `${testCase.caseId} must preserve exact OOXML ZIP identity.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 64,
      `${testCase.caseId} must describe the OOXML evasion technique precisely.`,
    );

    familyCounts.set(
      testCase.threatFamily,
      (familyCounts.get(testCase.threatFamily) ?? 0) + 1,
    );
    caseIds.add(testCase.caseId);
  }

  for (const family of [
    "OOXML_CONTAINER_EVASION",
    "OOXML_RELATIONSHIP_EVASION",
    "OOXML_MACRO_EVASION",
  ] as const) {
    assert(
      familyCounts.get(family) === 3,
      `${family} must have exactly three bounded M6C certification cases.`,
    );
  }

  assert(
    M6C_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 1,
    "M6C must preserve one encoded ordinary-hyperlink benign control.",
  );

  assert(
    Object.isFrozen(M6C_CERTIFICATION_CASES),
    "M6C certification registry must be immutable.",
  );
}

function validateM6D2CertificationCases() {
  const caseIds = new Set<string>();
  const familyCounts = new Map<ThreatFamily, number>();

  assert(
    M6D2_CERTIFICATION_CASES.length === 12,
    "M6D2 must execute the exact twelve-case PDF revision/xref authority certification matrix.",
  );

  for (const testCase of M6D2_CERTIFICATION_CASES) {
    assert(
      Object.isFrozen(testCase),
      `M6D2 case ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6D2-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6D2 case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate M6D2 case id: ${testCase.caseId}`,
    );
    assert(
      testCase.threatFamily === "PDF_INCREMENTAL_UPDATE_EVASION" ||
        testCase.threatFamily === "PDF_XREF_EVASION",
      `${testCase.caseId} must certify only the bounded M6D2 PDF authority families.`,
    );
    assert(
      testCase.format === "PDF" &&
        testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must be a deterministic generated PDF fixture.`,
    );
    assert(
      testCase.certificationPhase === "M6D" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn explicit M6D2 certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.expectedDetectedContainer === "PDF" &&
        testCase.expectedSignatureKind === "PDF_HEADER",
      `${testCase.caseId} must preserve exact PDF identity.`,
    );
    assert(
      testCase.expectedRuleId === null,
      `${testCase.caseId} must fail/pass at parser authority rather than invent a new M4 threat rule.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 80,
      `${testCase.caseId} must describe the revision/xref ambiguity precisely.`,
    );

    familyCounts.set(
      testCase.threatFamily,
      (familyCounts.get(testCase.threatFamily) ?? 0) + 1,
    );
    caseIds.add(testCase.caseId);
  }

  assert(
    familyCounts.get("PDF_INCREMENTAL_UPDATE_EVASION") === 5,
    "PDF incremental-update evasion must have exactly five M6D2 certification cases.",
  );
  assert(
    familyCounts.get("PDF_XREF_EVASION") === 7,
    "PDF xref evasion must have exactly seven M6D2 certification cases.",
  );
  assert(
    M6D2_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 1,
    "M6D2 must preserve one ordinary incremental-update benign control.",
  );
  assert(
    Object.isFrozen(M6D2_CERTIFICATION_CASES),
    "M6D2 certification registry must be immutable.",
  );
}

function validateM6D3CertificationCases() {
  const caseIds = new Set<string>();

  assert(
    M6D3_CERTIFICATION_CASES.length === 8,
    "M6D3 must execute the exact eight-case PDF object-stream evasion certification matrix.",
  );

  for (const testCase of M6D3_CERTIFICATION_CASES) {
    assert(
      Object.isFrozen(testCase),
      `M6D3 case ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6D3-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6D3 case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate M6D3 case id: ${testCase.caseId}`,
    );
    assert(
      testCase.threatFamily === "PDF_OBJECT_STREAM_EVASION",
      `${testCase.caseId} must certify only PDF object-stream evasion.`,
    );
    assert(
      testCase.format === "PDF" &&
        testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must be a deterministic generated PDF fixture.`,
    );
    assert(
      testCase.certificationPhase === "M6D" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn explicit M6D3 certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.expectedDetectedContainer === "PDF" &&
        testCase.expectedSignatureKind === "PDF_HEADER",
      `${testCase.caseId} must preserve exact PDF identity.`,
    );
    assert(
      testCase.expectedRuleId === null,
      `${testCase.caseId} must exercise parser authority rather than invent a new M4 threat rule.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 80,
      `${testCase.caseId} must describe the object-stream evasion technique precisely.`,
    );

    caseIds.add(testCase.caseId);
  }

  assert(
    M6D3_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 1,
    "M6D3 must preserve exactly one valid object-stream benign control.",
  );
  assert(
    Object.isFrozen(M6D3_CERTIFICATION_CASES),
    "M6D3 certification registry must be immutable.",
  );
}

function validateM6D4CertificationCases() {
  const caseIds = new Set<string>();

  assert(
    M6D4_CERTIFICATION_CASES.length === 11,
    "M6D4 must execute the exact eleven-case PDF action-evasion certification matrix.",
  );

  for (const testCase of M6D4_CERTIFICATION_CASES) {
    assert(
      Object.isFrozen(testCase),
      `M6D4 case ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6D4-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6D4 case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate M6D4 case id: ${testCase.caseId}`,
    );
    assert(
      testCase.threatFamily === "PDF_ACTION_EVASION",
      `${testCase.caseId} must certify only PDF action evasion.`,
    );
    assert(
      testCase.format === "PDF" &&
        testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must be a deterministic generated PDF fixture.`,
    );
    assert(
      testCase.certificationPhase === "M6D" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn explicit M6D4 certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.expectedDetectedContainer === "PDF" &&
        testCase.expectedSignatureKind === "PDF_HEADER",
      `${testCase.caseId} must preserve exact PDF identity.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 80,
      `${testCase.caseId} must describe the action-evasion technique precisely.`,
    );

    caseIds.add(testCase.caseId);
  }

  assert(
    M6D4_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 2,
    "M6D4 must preserve exactly two internal-navigation benign controls.",
  );
  assert(
    Object.isFrozen(M6D4_CERTIFICATION_CASES),
    "M6D4 certification registry must be immutable.",
  );
}


function validateM6D5CertificationCases() {
  const caseIds = new Set<string>();

  assert(
    M6D5_CERTIFICATION_CASES.length === 12,
    "M6D5 must execute the exact twelve-case PDF URI-evasion certification matrix.",
  );

  for (const testCase of M6D5_CERTIFICATION_CASES) {
    assert(
      Object.isFrozen(testCase),
      `M6D5 case ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6D5-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6D5 case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate M6D5 case id: ${testCase.caseId}`,
    );
    assert(
      testCase.threatFamily === "PDF_URI_EVASION",
      `${testCase.caseId} must certify only PDF URI evasion.`,
    );
    assert(
      testCase.format === "PDF" &&
        testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must be a deterministic generated PDF fixture.`,
    );
    assert(
      testCase.certificationPhase === "M6D" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn explicit M6D5 certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.expectedDetectedContainer === "PDF" &&
        testCase.expectedSignatureKind === "PDF_HEADER",
      `${testCase.caseId} must preserve exact PDF identity.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 80,
      `${testCase.caseId} must describe the URI-evasion technique precisely.`,
    );

    caseIds.add(testCase.caseId);
  }

  assert(
    M6D5_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 4,
    "M6D5 must preserve exactly four ordinary HTTP(S)/mailto URI benign controls.",
  );
  assert(
    Object.isFrozen(M6D5_CERTIFICATION_CASES),
    "M6D5 certification registry must be immutable.",
  );
}

function validateM6D5BCertificationCases() {
  const caseIds = new Set<string>();

  assert(
    M6D5B_CERTIFICATION_CASES.length === 12,
    "M6D5B must execute the exact twelve-case PDF embedded-content evasion certification matrix.",
  );

  for (const testCase of M6D5B_CERTIFICATION_CASES) {
    assert(
      Object.isFrozen(testCase),
      `M6D5B case ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6D5B-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6D5B case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate M6D5B case id: ${testCase.caseId}`,
    );
    assert(
      testCase.threatFamily === "PDF_EMBEDDED_CONTENT_EVASION",
      `${testCase.caseId} must certify only PDF embedded-content evasion.`,
    );
    assert(
      testCase.format === "PDF" &&
        testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must be a deterministic generated PDF fixture.`,
    );
    assert(
      testCase.certificationPhase === "M6D" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn explicit M6D5B certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.expectedDetectedContainer === "PDF" &&
        testCase.expectedSignatureKind === "PDF_HEADER",
      `${testCase.caseId} must preserve exact PDF identity.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 80,
      `${testCase.caseId} must describe the embedded-content evasion technique precisely.`,
    );

    caseIds.add(testCase.caseId);
  }

  assert(
    M6D5B_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 1,
    "M6D5B must preserve exactly one benign indirect annotation-subtype control.",
  );
  assert(
    Object.isFrozen(M6D5B_CERTIFICATION_CASES),
    "M6D5B certification registry must be immutable.",
  );
}


function validateM6E1CertificationCases() {
  assert(
    M6E1_CERTIFICATION_CASES.length === 11,
    "M6E1 must execute the exact 11-case FAT/DIFAT + MiniFAT certification matrix.",
  );

  const ids = new Set<string>();
  for (const testCase of M6E1_CERTIFICATION_CASES) {
    assert(Object.isFrozen(testCase), `${testCase.caseId} must be immutable.`);
    assert(
      /^HDS-M6E1-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6E1 certification case id is invalid: ${testCase.caseId}`,
    );
    assert(!ids.has(testCase.caseId), `Duplicate M6E1 case id: ${testCase.caseId}`);
    assert(
      testCase.threatFamily === "OLE_FAT_DIFAT_EVASION" ||
        testCase.threatFamily === "OLE_MINIFAT_EVASION",
      `${testCase.caseId} must certify only the bounded M6E1 allocator families.`,
    );
    assert(
      testCase.certificationPhase === "M6E" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn bounded M6E1 certification credit.`,
    );
    assert(
      testCase.provenance === "DETERMINISTIC_GENERATED" &&
        testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve deterministic no-CLEAN evidence.`,
    );
    ids.add(testCase.caseId);
  }

  assert(
    M6E1_DIRECTORY_REPAIR_CASES.length === 2 &&
      M6E1_DIRECTORY_REPAIR_CASES.every(
        (testCase) =>
          Object.isFrozen(testCase) &&
          testCase.threatFamily === "OLE_DIRECTORY_EVASION" &&
          testCase.certificationPhase === "M6E" &&
          testCase.certificationCredit === false,
      ),
    "M6E1 directory conformance repairs must remain non-certifying evidence for the still-open directory family.",
  );
}

function validateM6E2APowerPointAuthorityCases() {
  assert(
    M6E2A_POWERPOINT_AUTHORITY_CASES.length === 15,
    "M6E2A must execute the exact 15-case PowerPoint live-persist authority matrix.",
  );

  const ids = new Set<string>();
  for (const testCase of M6E2A_POWERPOINT_AUTHORITY_CASES) {
    assert(Object.isFrozen(testCase), `${testCase.caseId} must be immutable.`);
    assert(
      /^HDS-M6E2A-AUTH-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6E2A authority case id is invalid: ${testCase.caseId}`,
    );
    assert(!ids.has(testCase.caseId), `Duplicate M6E2A case id: ${testCase.caseId}`);
    assert(
      testCase.attackTechnique.trim().length >= 100,
      `${testCase.caseId} must describe the live-persist authority challenge precisely.`,
    );
    ids.add(testCase.caseId);
  }

  assert(
    M6E2A_POWERPOINT_AUTHORITY_CASES.filter(
      (testCase) => testCase.authorityCredit,
    ).length === 15,
    "M6E2A must earn bounded authority credit for all 15 live-persist authority cases, including fail-closed rejection when Current User is missing.",
  );
  assert(
    M6E2A_POWERPOINT_AUTHORITY_CASES[11]!.expectedReasonCode ===
      "OLE_APPLICATION_STREAM_MISSING",
    "M6E2A must make the required Current User stream a fail-closed authority prerequisite.",
  );
  assert(
    Object.isFrozen(M6E2A_POWERPOINT_AUTHORITY_CASES),
    "M6E2A authority registry must be immutable.",
  );
}

function validateM6E2BPowerPointActiveContentCases() {
  assert(
    M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES.length === 12,
    "M6E2B must execute the exact 12-case live PowerPoint VBA/OLE/ActiveX matrix.",
  );
  const ids = new Set<string>();
  for (const testCase of M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES) {
    assert(Object.isFrozen(testCase), `${testCase.caseId} must be immutable.`);
    assert(
      /^HDS-M6E2B-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6E2B case id is invalid: ${testCase.caseId}`,
    );
    assert(!ids.has(testCase.caseId), `Duplicate M6E2B case id: ${testCase.caseId}`);
    assert(
      testCase.certificationPhase === "M6E" &&
        testCase.certificationCredit === true &&
        (testCase.threatFamily === "OLE_VBA_EVASION" ||
          testCase.threatFamily === "OLE_EMBEDDED_OBJECT_EVASION"),
      `${testCase.caseId} must earn bounded M6E2B credit only for live VBA or external-object evasion.`,
    );
    ids.add(testCase.caseId);
  }
  assert(
    M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 2,
    "M6E2B must retain exactly two benign controls, including stale unreferenced storage.",
  );
  assert(
    Object.isFrozen(M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES),
    "M6E2B active-content registry must be immutable.",
  );
}

function validateM6E3DirectoryCertificationCases() {
  assert(
    M6E3_DIRECTORY_CERTIFICATION_CASES.length === 15,
    "M6E3 must execute the exact 15-case OLE directory adversarial matrix.",
  );

  const ids = new Set<string>();
  for (const testCase of M6E3_DIRECTORY_CERTIFICATION_CASES) {
    assert(Object.isFrozen(testCase), `${testCase.caseId} must be immutable.`);
    assert(
      /^HDS-M6E3-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6E3 case id is invalid: ${testCase.caseId}`,
    );
    assert(!ids.has(testCase.caseId), `Duplicate M6E3 case id: ${testCase.caseId}`);
    assert(
      testCase.threatFamily === "OLE_DIRECTORY_EVASION" &&
        testCase.certificationPhase === "M6E" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn bounded M6E3 directory certification credit.`,
    );
    ids.add(testCase.caseId);
  }

  assert(
    M6E3_DIRECTORY_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 1,
    "M6E3 must retain exactly one benign sorted-directory control.",
  );
  assert(
    Object.isFrozen(M6E3_DIRECTORY_CERTIFICATION_CASES),
    "M6E3 directory certification registry must be immutable.",
  );
}

function validateM6F1IdentityIntegrityCertificationCases() {
  assert(
    M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES.length === 5,
    "M6F1 must execute the exact five-case source identity/integrity matrix.",
  );

  const ids = new Set<string>();
  for (const testCase of M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES) {
    assert(Object.isFrozen(testCase), `${testCase.caseId} must be immutable.`);
    assert(
      /^HDS-M6F1-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6F1 case id is invalid: ${testCase.caseId}`,
    );
    assert(!ids.has(testCase.caseId), `Duplicate M6F1 case id: ${testCase.caseId}`);
    assert(
      testCase.threatFamily === "HASH_SIZE_IDENTITY_RACE" &&
        testCase.certificationPhase === "M6F" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn bounded M6F1 identity-integrity certification credit.`,
    );
    ids.add(testCase.caseId);
  }

  assert(
    M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 1,
    "M6F1 must retain exactly one ordinary fragmented benign control while separately proving adversarial mutable-backing snapshot safety.",
  );
  assert(
    Object.isFrozen(M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES),
    "M6F1 identity-integrity certification registry must be immutable.",
  );
}


function validateM6F2ResourceExhaustionCertificationCases() {
  assert(
    M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES.length === 18,
    "M6F2 must execute the exact eighteen-case resource-exhaustion matrix.",
  );

  const ids = new Set<string>();
  for (const testCase of M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES) {
    assert(Object.isFrozen(testCase), `${testCase.caseId} must be immutable.`);
    assert(
      /^HDS-M6F2-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `M6F2 case id is invalid: ${testCase.caseId}`,
    );
    assert(!ids.has(testCase.caseId), `Duplicate M6F2 case id: ${testCase.caseId}`);
    assert(
      testCase.threatFamily === "RESOURCE_EXHAUSTION" &&
        testCase.certificationPhase === "M6F" &&
        testCase.certificationCredit === true,
      `${testCase.caseId} must earn bounded M6F2 resource-exhaustion certification credit.`,
    );
    ids.add(testCase.caseId);
  }

  assert(
    M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES.filter(
      (testCase) => testCase.benignControl,
    ).length === 3,
    "M6F2 must retain exactly three benign resource controls spanning PDF, OOXML, and OLE.",
  );
  assert(
    Object.isFrozen(M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES),
    "M6F2 resource-exhaustion certification registry must be immutable.",
  );
}

function validateRulePackBoundary() {
  assert(
    HEHXAGON_DOCUMENT_SECURITY_RULE_IDS.length === 21,
    "M6A must remain grounded to the immutable 21-rule M4 ingress rule pack.",
  );

  assert(
    new Set(HEHXAGON_DOCUMENT_SECURITY_RULE_IDS).size ===
      HEHXAGON_DOCUMENT_SECURITY_RULE_IDS.length,
    "M4 rule ids must remain unique.",
  );

  assert(
    HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION ===
      "HDS-M4-DOCUMENT-INGRESS-RULES-V1",
    "M6A must not silently change the certified M4 rule-pack version.",
  );

  assert(
    HEHXAGON_DOCUMENT_SECURITY_ENGINE ===
      "HEHXAGON_DOCUMENT_SECURITY",
    "M6A must exercise the Hehxagon native document security engine.",
  );

  assert(
    HEHXAGON_DOCUMENT_SECURITY_ENGINE_VERSION ===
      "0.4.13-m6f2",
    "M6F2 must preserve M6F1 owned-byte identity while enforcing bounded source iteration and parser resource ceilings.",
  );
}

async function executeSentinels() {
  const safePdf = buildClassicPdf();

  const safeResult = await inspectPdf({
    bytes: safePdf,
  });

  assertResultMatchesContract(
    safeResult,
    HARNESS_SENTINEL_CASES[0]!,
  );

  assert(
    safeResult.pdfStructuralInspectionComplete === true &&
      safeResult.rulePackEvaluationComplete === true &&
      safeResult.rulePackEvaluation?.outcome === "PASS",
    "The safe PDF sentinel must traverse complete PDF structural inspection and the M4 rule pack.",
  );

  const executable = Buffer.from([
    0x4d, 0x5a, 0x90, 0x00,
    0x03, 0x00, 0x00, 0x00,
  ]);

  const executableResult =
    await inspectNativeDocumentIdentity({
      source: sourceFromDeterministicFragments(executable),
      expectedSizeBytes: executable.length,
      expectedSha256: sha256(executable),
      declaredFilename: "m6a-sentinel.pdf",
      declaredExtension: "pdf",
      declaredMimeType: "application/pdf",
      limits: {
        maxBytes: ONE_MEBIBYTE,
        pdf: PDF_LIMITS,
      },
    });

  assertResultMatchesContract(
    executableResult,
    HARNESS_SENTINEL_CASES[1]!,
  );

  const shaMismatchResult = await inspectPdf({
    bytes: safePdf,
    expectedSha256: "0".repeat(64),
  });

  assertResultMatchesContract(
    shaMismatchResult,
    HARNESS_SENTINEL_CASES[2]!,
  );

  const truncatedSizeResult = await inspectPdf({
    bytes: safePdf,
    expectedSizeBytes: safePdf.length + 1,
  });

  assertResultMatchesContract(
    truncatedSizeResult,
    HARNESS_SENTINEL_CASES[3]!,
  );

  const sizeExceededResult = await inspectPdf({
    bytes: safePdf,
    expectedSizeBytes: safePdf.length - 1,
  });

  assertResultMatchesContract(
    sizeExceededResult,
    HARNESS_SENTINEL_CASES[4]!,
  );

  return [
    safeResult,
    executableResult,
    shaMismatchResult,
    truncatedSizeResult,
    sizeExceededResult,
  ] as const;
}

async function executeM6BCertification() {
  const zipInnerPdf = zipFrontedWithInnerPdfMarker();
  const oleInnerPdf = oleFrontedWithInnerPdfMarker();
  const peInnerPdf = executableFrontedWithInnerPdfMarker("PE");
  const elfInnerPdf = executableFrontedWithInnerPdfMarker("ELF");

  const boundedPreamblePdf = buildClassicPdf({
    prefix: Buffer.from(
      "HDS-M6B-BOUNDED-NON-CONTAINER-PREAMBLE\n",
      "ascii",
    ),
  });

  const pdfWithInternalZipMagic = buildClassicPdf({
    headerComment: Buffer.concat([
      Buffer.from("HDS-M6B-INTERNAL-ZIP:", "ascii"),
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    ]),
  });

  const pdfWithInternalOleMagic = buildClassicPdf({
    headerComment: Buffer.concat([
      Buffer.from("HDS-M6B-INTERNAL-OLE:", "ascii"),
      Buffer.from([
        0xd0,
        0xcf,
        0x11,
        0xe0,
        0xa1,
        0xb1,
        0x1a,
        0xe1,
      ]),
    ]),
  });

  const trueOoxmlPdfPolyglot =
    buildOoxmlPdfPolyglot();

  const directPolyglotPdf =
    inspectPdfStructuralSecurity({
      bytes: trueOoxmlPdfPolyglot,
      limits: PDF_LIMITS,
    });

  assert(
    directPolyglotPdf.ok &&
      directPolyglotPdf.structuralInspectionComplete === true,
    "The M6B true polyglot must independently satisfy the bounded PDF structural parser.",
  );

  const directPolyglotOoxml =
    inspectOoxmlArchive({
      bytes: trueOoxmlPdfPolyglot,
      declaredExtension: "docx",
      limits: ARCHIVE_LIMITS,
    });

  assert(
    directPolyglotOoxml.ok &&
      directPolyglotOoxml.format === "WORD_OOXML",
    "The M6B true polyglot must independently satisfy the bounded OOXML archive parser.",
  );

  const results = [
    await inspectDocument({
      bytes: zipInnerPdf,
      filename: "m6b-zip-inner-pdf.docx",
      extension: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    await inspectDocument({
      bytes: oleInnerPdf,
      filename: "m6b-ole-inner-pdf.doc",
      extension: "doc",
      mimeType: "application/msword",
    }),
    await inspectDocument({
      bytes: peInnerPdf,
      filename: "m6b-pe-inner-pdf.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
    await inspectDocument({
      bytes: elfInnerPdf,
      filename: "m6b-elf-inner-pdf.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
    await inspectDocument({
      bytes: zipInnerPdf,
      filename: "m6b-zip-masquerade.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
    await inspectDocument({
      bytes: oleInnerPdf,
      filename: "m6b-ole-masquerade.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
    await inspectDocument({
      bytes: boundedPreamblePdf,
      filename: "m6b-preamble.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
    await inspectDocument({
      bytes: pdfWithInternalZipMagic,
      filename: "m6b-secondary-zip.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
    await inspectDocument({
      bytes: trueOoxmlPdfPolyglot,
      filename: "m6b-true-polyglot.docx",
      extension: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    await inspectDocument({
      bytes: trueOoxmlPdfPolyglot,
      filename: "m6b-true-polyglot.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
    await inspectDocument({
      bytes: pdfWithInternalOleMagic,
      filename: "m6b-secondary-ole.pdf",
      extension: "pdf",
      mimeType: "application/pdf",
    }),
  ] as const;

  M6B_CERTIFICATION_CASES.forEach(
    (testCase, index) => {
      assertResultMatchesContract(
        results[index]!,
        testCase,
      );
    },
  );

  const polyglotAsDocx = results[8]!;
  assert(
    polyglotAsDocx.archiveInspectionComplete === true &&
      polyglotAsDocx.ooxmlStructuralInspectionComplete === true &&
      polyglotAsDocx.rulePackEvaluationComplete === true &&
      polyglotAsDocx.rulePackEvaluation?.outcome === "PASS",
    "The true OOXML/PDF polyglot must traverse complete OOXML structural inspection when ZIP identity is authoritative.",
  );

  const boundedPreambleResult = results[6]!;
  assert(
    boundedPreambleResult.pdfStructuralInspectionComplete === true &&
      boundedPreambleResult.rulePackEvaluationComplete === true &&
      boundedPreambleResult.rulePackEvaluation?.outcome === "PASS",
    "The bounded PDF preamble control must preserve complete PDF structural inspection.",
  );

  const secondarySignatureControls = [
    results[7]!,
    results[10]!,
  ];

  assert(
    secondarySignatureControls.every(
      (result) =>
        result.pdfStructuralInspectionComplete === true &&
        result.rulePackEvaluationComplete === true &&
        result.rulePackEvaluation?.outcome === "PASS",
    ),
    "Non-leading secondary ZIP/OLE magic inside valid PDFs must not trigger broad magic-byte overblocking.",
  );

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6B certification must never grant CLEAN or completed document-trust authority.",
  );

  return {
    results,
    directPolyglotPdf,
    directPolyglotOoxml,
  } as const;
}

async function executeM6CCertification() {
  const docxCaseCollision = buildM6COoxmlPackage({
    application: "docx",
    additionalEntries: [
      Object.freeze({
        name: "word/custom/item.xml",
        data: Buffer.from("<item/>", "utf8"),
      }),
      Object.freeze({
        name: "WORD/CUSTOM/ITEM.XML",
        data: Buffer.from("<other/>", "utf8"),
      }),
    ],
  });

  const xlsxPathTraversal = buildM6COoxmlPackage({
    application: "xlsx",
    additionalEntries: [
      Object.freeze({
        name: "xl/../outside.xml",
        data: Buffer.from("<outside/>", "utf8"),
      }),
    ],
  });

  const pptxUnicodeCollision = buildM6COoxmlPackage({
    application: "pptx",
    additionalEntries: [
      Object.freeze({
        name: "ppt/custom/caf\u00e9.xml",
        data: Buffer.from("<one/>", "utf8"),
      }),
      Object.freeze({
        name: "ppt/custom/cafe\u0301.xml",
        data: Buffer.from("<two/>", "utf8"),
      }),
    ],
  });

  const docxRemoteTemplateEntity = buildM6COoxmlPackage({
    application: "docx",
    mainRelationships: [
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTempl&#x61;te" Target="https://example.invalid/template.dotx" TargetMode="External"/>',
    ],
  });

  const xlsxHyperlinkEntityControl = buildM6COoxmlPackage({
    application: "xlsx",
    mainRelationships: [
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="h&#x74;tps://example.com/policy" TargetMode="External"/>',
    ],
  });

  const pptxOleRelationshipEntity = buildM6COoxmlPackage({
    application: "pptx",
    mainRelationships: [
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObj&#101;ct" Target="components/item.dat" TargetMode="Internal"/>',
    ],
    additionalEntries: [
      Object.freeze({
        name: "ppt/components/item.dat",
        data: Buffer.from("HDS-M6C-OLE-RELATIONSHIP-EVIDENCE", "ascii"),
      }),
    ],
    additionalContentTypeOverrides: [
      '<Override PartName="/ppt/components/item.dat" ContentType="application/octet-stream"/>',
    ],
  });

  const docxVbaRelationshipEntity = buildM6COoxmlPackage({
    application: "docx",
    mainRelationships: [
      '<Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProj&#x65;ct" Target="components/state.dat" TargetMode="Internal"/>',
    ],
    additionalEntries: [
      Object.freeze({
        name: "word/components/state.dat",
        data: Buffer.from("HDS-M6C-VBA-RELATIONSHIP-EVIDENCE", "ascii"),
      }),
    ],
    additionalContentTypeOverrides: [
      '<Override PartName="/word/components/state.dat" ContentType="application/octet-stream"/>',
    ],
  });

  const xlsxVbaContentTypeEntity = buildM6COoxmlPackage({
    application: "xlsx",
    additionalEntries: [
      Object.freeze({
        name: "xl/components/state.dat",
        data: Buffer.from("HDS-M6C-VBA-CONTENT-TYPE-EVIDENCE", "ascii"),
      }),
    ],
    additionalContentTypeOverrides: [
      '<Override PartName="/xl/components/state.dat" ContentType="application/vnd.ms-office.vbaProj&#101;ct"/>',
    ],
  });

  const pptxMacroContentTypeEntity = buildM6COoxmlPackage({
    application: "pptx",
    additionalEntries: [
      Object.freeze({
        name: "ppt/components/alternate.xml",
        data: Buffer.from("<alternate/>", "utf8"),
      }),
    ],
    additionalContentTypeOverrides: [
      '<Override PartName="/ppt/components/alternate.xml" ContentType="application/vnd.ms-powerpoint.presentation.macro&#69;nabled.main+xml"/>',
    ],
  });

  const results = [
    await inspectDocument({
      bytes: docxCaseCollision,
      filename: "m6c-case-collision.docx",
      extension: "docx",
      mimeType: M6C_OOXML_PROFILES.docx.mimeType,
    }),
    await inspectDocument({
      bytes: xlsxPathTraversal,
      filename: "m6c-path-traversal.xlsx",
      extension: "xlsx",
      mimeType: M6C_OOXML_PROFILES.xlsx.mimeType,
    }),
    await inspectDocument({
      bytes: pptxUnicodeCollision,
      filename: "m6c-unicode-collision.pptx",
      extension: "pptx",
      mimeType: M6C_OOXML_PROFILES.pptx.mimeType,
    }),
    await inspectDocument({
      bytes: docxRemoteTemplateEntity,
      filename: "m6c-remote-template-entity.docx",
      extension: "docx",
      mimeType: M6C_OOXML_PROFILES.docx.mimeType,
    }),
    await inspectDocument({
      bytes: xlsxHyperlinkEntityControl,
      filename: "m6c-hyperlink-entity-control.xlsx",
      extension: "xlsx",
      mimeType: M6C_OOXML_PROFILES.xlsx.mimeType,
    }),
    await inspectDocument({
      bytes: pptxOleRelationshipEntity,
      filename: "m6c-ole-relationship-entity.pptx",
      extension: "pptx",
      mimeType: M6C_OOXML_PROFILES.pptx.mimeType,
    }),
    await inspectDocument({
      bytes: docxVbaRelationshipEntity,
      filename: "m6c-vba-relationship-entity.docx",
      extension: "docx",
      mimeType: M6C_OOXML_PROFILES.docx.mimeType,
    }),
    await inspectDocument({
      bytes: xlsxVbaContentTypeEntity,
      filename: "m6c-vba-content-type-entity.xlsx",
      extension: "xlsx",
      mimeType: M6C_OOXML_PROFILES.xlsx.mimeType,
    }),
    await inspectDocument({
      bytes: pptxMacroContentTypeEntity,
      filename: "m6c-macro-content-type-entity.pptx",
      extension: "pptx",
      mimeType: M6C_OOXML_PROFILES.pptx.mimeType,
    }),
  ] as const;

  M6C_CERTIFICATION_CASES.forEach(
    (testCase, index) => {
      assertResultMatchesContract(
        results[index]!,
        testCase,
      );
    },
  );

  const hyperlinkControl = results[4]!;
  assert(
    hyperlinkControl.archiveInspectionComplete === true &&
      hyperlinkControl.ooxmlStructuralInspectionComplete === true &&
      hyperlinkControl.ooxmlStructuralEvidence?.externalHyperlinksObserved === 1 &&
      hyperlinkControl.rulePackEvaluationComplete === true &&
      hyperlinkControl.rulePackEvaluation?.outcome === "PASS",
    "The numeric-reference HTTPS control must remain a fully inspected allowed external hyperlink.",
  );

  const numericAttribute = ooxmlTagAttributes(
    '<Relationship Target="h&#x74;tps://example.com"/>',
  );
  assert(
    numericAttribute.get("Target") === "https://example.com",
    "OOXML attribute decoding must normalize valid hexadecimal XML character references.",
  );

  const decimalAttribute = ooxmlTagAttributes(
    '<Override ContentType="application/vnd.ms-office.vbaProj&#101;ct"/>',
  );
  assert(
    decimalAttribute.get("ContentType") ===
      "application/vnd.ms-office.vbaProject",
    "OOXML attribute decoding must normalize valid decimal XML character references.",
  );

  const singlePassAttribute = ooxmlTagAttributes(
    '<Relationship Target="h&amp;#x74;tps://example.com"/>',
  );
  assert(
    singlePassAttribute.get("Target") ===
      "h&#x74;tps://example.com",
    "OOXML entity decoding must remain single-pass and must not recursively reinterpret escaped entity text.",
  );

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6C certification must never grant CLEAN or completed document-trust authority.",
  );

  return { results } as const;
}

async function executeM6D1ParserAmbiguityRepair() {
  const baseObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ] as const;

  const duplicateActionKey = buildM6DClassicPdf([
    ...baseObjects,
    "<< /S /JavaScript /S /URI /URI (https://example.com) >>",
  ]);

  const encodedDuplicateActionKey = buildM6DClassicPdf([
    ...baseObjects,
    "<< /S /JavaScript /#53 /URI /URI (https://example.com) >>",
  ]);

  const benignControl = buildClassicPdf();

  const duplicateResult = await inspectPdf({ bytes: duplicateActionKey });
  const encodedDuplicateResult = await inspectPdf({ bytes: encodedDuplicateActionKey });
  const benignResult = await inspectPdf({ bytes: benignControl });

  for (const [caseId, result] of [
    ["HDS-M6D1-001-DUPLICATE-ACTION-KEY", duplicateResult],
    ["HDS-M6D1-002-ENCODED-DUPLICATE-ACTION-KEY", encodedDuplicateResult],
  ] as const) {
    assert(
      result.verdict === "FAILED",
      `${caseId} must fail closed on an ambiguous PDF dictionary.`,
    );
    assert(
      result.reasonCodes.includes("PDF_OBJECT_SYNTAX_INVALID"),
      `${caseId} must report PDF_OBJECT_SYNTAX_INVALID.`,
    );
    assert(
      result.rulePackEvaluation === null,
      `${caseId} must fail before rule-pack trust evaluation.`,
    );
  }

  assert(
    benignResult.verdict === "IDENTITY_VERIFIED" &&
      benignResult.reasonCodes.includes(
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      ),
    "HDS-M6D1-003-BENIGN-PDF-CONTROL must preserve an ordinary PDF pass.",
  );

  assert(
    [duplicateResult, encodedDuplicateResult, benignResult].every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6D1 must preserve the no-CLEAN authority boundary.",
  );

  return {
    duplicateResult,
    encodedDuplicateResult,
    benignResult,
  } as const;
}

async function executeM6D2RevisionXrefAuthorityCertification() {
  const maliciousBase = buildM6D2ClassicFixture({
    objectBodies: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
      "<< /S /JavaScript /JS (HDS-M6D2-OLDER-ACTIVE) >>",
    ],
  });

  const newestReplacement = appendM6D2IncrementalObject({
    base: maliciousBase,
    objectNumber: 4,
    body: "<< /Type /Example >>",
    size: 5,
  });

  const newestFree = appendM6D2FreeEntry({
    base: maliciousBase,
    objectNumber: 4,
    size: 5,
  });

  const cycleBase = buildM6D2ClassicFixture();
  const cycleOffset = cycleBase.bytes.length;
  const prevCycle = Buffer.concat([
    cycleBase.bytes,
    Buffer.from(
      `xref\n0 1\n0000000000 65535 f \n` +
        `trailer\n<< /Size 4 /Root 1 0 R /Prev ${cycleOffset} >>\n` +
        `startxref\n${cycleOffset}\n%%EOF\n`,
      "latin1",
    ),
  ]);

  const invalidPrevBase = buildM6D2ClassicFixture();
  const invalidPrev = appendM6D2RawClassicUpdate({
    base: invalidPrevBase,
    xrefBody: "xref\n0 1\n0000000000 65535 f \n",
    trailerBody: "/Size 4 /Root 1 0 R /Prev /Bad",
  });

  const invalidXrefStmBase = buildM6D2ClassicFixture();
  const invalidXrefStm = appendM6D2RawClassicUpdate({
    base: invalidXrefStmBase,
    xrefBody: "xref\n0 1\n0000000000 65535 f \n",
    trailerBody: "/Size 4 /Root 1 0 R /XRefStm /Bad",
  });

  const duplicateBase = buildM6D2ClassicFixture();
  const duplicateXrefOffset = duplicateBase.bytes.length;
  const duplicateClassicXref = Buffer.concat([
    duplicateBase.bytes,
    Buffer.from(
      "xref\n1 2\n" +
        `${String(duplicateBase.objectOffsets[1]).padStart(10, "0")} 00000 n \n` +
        `${String(duplicateBase.objectOffsets[2]).padStart(10, "0")} 00000 n \n` +
        "2 1\n" +
        `${String(duplicateBase.objectOffsets[2]).padStart(10, "0")} 00000 n \n` +
        `trailer\n<< /Size 4 /Root 1 0 R /Prev ${duplicateBase.xrefOffset} >>\n` +
        `startxref\n${duplicateXrefOffset}\n%%EOF\n`,
      "latin1",
    ),
  ]);

  const hybridConflict = buildM6D2HybridConflictPdf();

  const rootGenerationMismatch = buildM6D2ClassicFixture({
    rootGeneration: 1,
  }).bytes;

  const pagesGenerationMismatch = buildM6D2ClassicFixture({
    objectBodies: [
      "<< /Type /Catalog /Pages 2 1 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
    ],
  }).bytes;

  const lengthGenerationMismatch = buildM6D2LengthGenerationMismatchPdf();

  const sizeContradiction = buildM6D2ClassicFixture({
    sizeOverride: 3,
  }).bytes;

  const ordinaryBase = buildM6D2ClassicFixture();
  const ordinaryIncremental = appendM6D2IncrementalObject({
    base: ordinaryBase,
    objectNumber: 4,
    body: "<< /Type /Example >>",
    size: 5,
  });

  const fixtureBytes = [
    newestReplacement,
    newestFree,
    prevCycle,
    invalidPrev,
    invalidXrefStm,
    duplicateClassicXref,
    hybridConflict,
    rootGenerationMismatch,
    pagesGenerationMismatch,
    lengthGenerationMismatch,
    sizeContradiction,
    ordinaryIncremental,
  ] as const;

  const results: NativeDocumentScannerResult[] = [];

  for (let index = 0; index < fixtureBytes.length; index += 1) {
    const result = await inspectPdf({ bytes: fixtureBytes[index]! });
    const contract = M6D2_CERTIFICATION_CASES[index]!;
    assertResultMatchesContract(result, contract);

    if (contract.expectedVerdict === "FAILED") {
      assert(
        result.rulePackEvaluation === null,
        `${contract.caseId} must fail before the M4 rule pack can grant structural-pass evidence.`,
      );
    }

    results.push(result);
  }

  for (const index of [0, 1, 11] as const) {
    const result = results[index]!;
    assert(
      result.pdfStructuralInspectionComplete === true &&
        result.rulePackEvaluation?.outcome === "PASS" &&
        result.pdfStructuralEvidence?.javascriptDetected === false &&
        result.pdfStructuralEvidence.incrementalUpdates === 1,
      `${M6D2_CERTIFICATION_CASES[index]!.caseId} must preserve a complete one-update PDF pass without stale JavaScript authority.`,
    );
  }

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6D2 certification must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}

async function executeM6D3ObjectStreamEvasionCertification() {
  const validControl = buildM6D3ObjectStreamPdf();
  const nonzeroGeneration = buildM6D3ObjectStreamPdf({
    objectStreamGeneration: 1,
  });
  const soleReference = buildM6D3ObjectStreamPdf({
    extraCompressedObject: {
      objectNumber: 6,
      body: "3 0 R",
    },
  });
  const compressedLength = buildM6D3CompressedLengthPdf();
  const compressedObjectZero = buildM6D3ObjectStreamPdf({
    compressedObjectZero: true,
  });
  const duplicateContainedObject = buildM6D3ObjectStreamPdf({
    duplicateContainedObjectNumber: true,
  });
  const xrefIndexMismatch = buildM6D3ObjectStreamPdf({
    rootObjectStreamIndex: 1,
  });
  const descendingOffsets = buildM6D3ObjectStreamPdf({
    relativeOffsetsOverride: [32, 0],
  });

  const fixtureBytes = [
    validControl,
    nonzeroGeneration,
    soleReference,
    compressedLength,
    compressedObjectZero,
    duplicateContainedObject,
    xrefIndexMismatch,
    descendingOffsets,
  ] as const;

  const results: NativeDocumentScannerResult[] = [];

  for (let index = 0; index < fixtureBytes.length; index += 1) {
    const result = await inspectPdf({ bytes: fixtureBytes[index]! });
    const contract = M6D3_CERTIFICATION_CASES[index]!;
    assertResultMatchesContract(result, contract);

    if (contract.expectedVerdict === "FAILED") {
      assert(
        result.rulePackEvaluation === null,
        `${contract.caseId} must fail before M4 rule-pack trust evaluation.`,
      );
    }

    results.push(result);
  }

  const control = results[0]!;
  assert(
    control.pdfStructuralInspectionComplete === true &&
      control.rulePackEvaluation?.outcome === "PASS" &&
      control.pdfStructuralEvidence?.objectStreamsDetected === true &&
      control.pdfStructuralEvidence.objectStreamCount === 1 &&
      control.pdfStructuralEvidence.compressedObjectCount === 2,
    "The M6D3 valid control must preserve complete bounded object-stream parsing without granting CLEAN.",
  );

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6D3 certification must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}

async function executeM6D4ActionEvasionCertification() {
  const baseObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ] as const;

  const fixtures = [
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /GoTo /D [3 0 R /Fit] >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /J#61vaScript /JS (HDS-M6D4) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /GoTo /D [3 0 R /Fit] /Next << /Type /Action /S /JavaScript /JS (HDS-M6D4-NEXT) >> >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /GoTo /D [3 0 R /Fit] /Next 5 0 R >>",
      "<< /Type /Action /S /Launch /F (payload.exe) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S 5 0 R /F (payload.exe) >>",
      "/Launch",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S 5 0 R /F (remote.pdf) >>",
      "/GoToR",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S 5 0 R /F (https://example.invalid/submit) >>",
      "/SubmitForm",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S 5 1 R /F (payload.exe) >>",
      "/Launch",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /Sound /Sound 5 0 R >>",
      "<< /Type /Example >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /HdsUnknownVendorAction >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S 5 0 R /D [3 0 R /Fit] >>",
      "/GoTo",
    ]),
  ] as const;

  const results: NativeDocumentScannerResult[] = [];

  for (let index = 0; index < fixtures.length; index += 1) {
    const result = await inspectPdf({ bytes: fixtures[index]! });
    const contract = M6D4_CERTIFICATION_CASES[index]!;
    assertResultMatchesContract(result, contract);

    if (contract.expectedVerdict === "FAILED") {
      assert(
        result.rulePackEvaluation === null,
        `${contract.caseId} must fail before rule-pack trust evaluation.`,
      );
    }

    results.push(result);
  }

  for (const index of [0, 10] as const) {
    const result = results[index]!;
    assert(
      result.pdfStructuralInspectionComplete === true &&
        result.rulePackEvaluation?.outcome === "PASS" &&
        result.pdfStructuralEvidence?.javascriptDetected === false &&
        result.pdfStructuralEvidence.launchActionDetected === false &&
        result.pdfStructuralEvidence.blockedExternalActionDetected === false &&
        result.pdfStructuralEvidence.richMediaDetected === false,
      `${M6D4_CERTIFICATION_CASES[index]!.caseId} must remain an allowed internal-navigation control.`,
    );
  }

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6D4 certification must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}


async function executeM6D5UriEvasionCertification() {
  const baseObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ] as const;

  const fixtures = [
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (https://example.com/policy) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (HtTp://example.com/policy) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (mailto:records@example.com) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (\\150ttps://example.com/escaped) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (javascript:alert\\(1\\)) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (data:text/html,HDS-M6D5) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (file:///C:/Windows/System32/calc.exe) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (\\152avascript:alert\\(1\\)) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI <6A6176617363726970743A616C657274283129> >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /U#52I (javascript:alert\\(1\\)) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI 5 0 R >>",
      "(javascript:alert\\(1\\))",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Action /S /URI /URI (\\000javascript:alert\\(1\\)) >>",
    ]),
  ] as const;

  const results: NativeDocumentScannerResult[] = [];

  for (let index = 0; index < fixtures.length; index += 1) {
    const result = await inspectPdf({ bytes: fixtures[index]! });
    const contract = M6D5_CERTIFICATION_CASES[index]!;
    assertResultMatchesContract(result, contract);
    results.push(result);
  }

  for (const index of [0, 1, 2, 3] as const) {
    const result = results[index]!;
    assert(
      result.pdfStructuralInspectionComplete === true &&
        result.rulePackEvaluation?.outcome === "PASS" &&
        result.pdfStructuralEvidence?.safeUriActionsObserved === 1 &&
        result.pdfStructuralEvidence.unsafeUriActionDetected === false,
      `${M6D5_CERTIFICATION_CASES[index]!.caseId} must remain an ordinary allowed URI control.`,
    );
  }

  for (let index = 4; index < results.length; index += 1) {
    const result = results[index]!;
    assert(
      result.pdfStructuralEvidence?.unsafeUriActionDetected === true &&
        result.rulePackEvaluation?.matchedRules.some(
          (rule) => rule.ruleId === "HDS-PDF-010-UNSAFE-URI",
        ) === true,
      `${M6D5_CERTIFICATION_CASES[index]!.caseId} must reach the existing unsafe-URI M4 rule.`,
    );
  }

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6D5 certification must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}

async function executeM6D5BEmbeddedContentEvasionCertification() {
  const baseObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ] as const;

  const embeddedStream =
    "<< /Type /EmbeddedFile /Length 1 >>\nstream\nX\nendstream";

  const soundStream =
    "<< /R 8000 /C 1 /B 8 /Length 1 >>\nstream\nX\nendstream";

  const threeDStream =
    "<< /Type /3D /Subtype /U3D /Length 1 >>\nstream\nX\nendstream";

  const fixtures = [
    buildM6DClassicPdf([
      ...baseObjects,
      "/Text",
      "<< /Type /Annot /Subtype 4 0 R /Rect [0 0 10 10] /Contents (HDS-M6D5B control) >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Filespec /F (payload.bin) /EF << /F 5 0 R >> >>",
      embeddedStream,
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Filespec /F (payload.bin) /E#46 << /F 5 0 R >> >>",
      embeddedStream,
    ]),
    buildM6DClassicPdf([
      "<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(payload.bin) 4 0 R] >> >> >>",
      baseObjects[1],
      baseObjects[2],
      "<< /Type /Filespec /F (payload.bin) /EF << /F 5 0 R >> >>",
      embeddedStream,
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Filespec /F (payload.bin) /EF << /F 6 0 R >> >>",
      "<< /Type /Annot /Subtype /FileAttachment /Rect [0 0 10 10] /FS 4 0 R >>",
      embeddedStream,
    ]),
    buildM6DClassicPdf([
      "<< /Type /Catalog /Pages 2 0 R /AF [4 0 R] >>",
      baseObjects[1],
      baseObjects[2],
      "<< /Type /Filespec /F (payload.bin) /EF << /F 5 0 R >> >>",
      embeddedStream,
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "<< /Type /Annot /Subtype /RichMedia /Rect [0 0 10 10] /RichMediaContent << >> >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "/RichMedia",
      "<< /Type /Annot /Subtype 4 0 R /Rect [0 0 10 10] /RichMediaContent << >> >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "/Sound",
      "<< /Type /Annot /Subtype 4 0 R /Rect [0 0 10 10] /Sound 6 0 R >>",
      soundStream,
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "/Movie",
      "<< /Type /Annot /Subtype 4 0 R /Rect [0 0 10 10] /Movie << /F (movie.mov) >> >>",
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "/3D",
      "<< /Type /Annot /Subtype 4 0 R /Rect [0 0 10 10] /3DD 6 0 R >>",
      threeDStream,
    ]),
    buildM6DClassicPdf([
      ...baseObjects,
      "/RichMedia",
      "<< /Type /Annot /Subtype 4 1 R /Rect [0 0 10 10] /RichMediaContent << >> >>",
    ]),
  ] as const;

  const results: NativeDocumentScannerResult[] = [];

  for (let index = 0; index < fixtures.length; index += 1) {
    const result = await inspectPdf({ bytes: fixtures[index]! });
    const contract = M6D5B_CERTIFICATION_CASES[index]!;
    assertResultMatchesContract(result, contract);

    if (contract.expectedVerdict === "FAILED") {
      assert(
        result.rulePackEvaluation === null,
        `${contract.caseId} must fail before rule-pack trust evaluation.`,
      );
    }

    results.push(result);
  }

  const control = results[0]!;
  assert(
    control.pdfStructuralInspectionComplete === true &&
      control.rulePackEvaluation?.outcome === "PASS" &&
      control.pdfStructuralEvidence?.embeddedFileDetected === false &&
      control.pdfStructuralEvidence.richMediaDetected === false,
    "The M6D5B indirect Text annotation control must remain accepted without embedded/rich-media evidence.",
  );

  for (const index of [1, 2, 3, 4, 5] as const) {
    const result = results[index]!;
    assert(
      result.pdfStructuralEvidence?.embeddedFileDetected === true &&
        result.rulePackEvaluation?.matchedRules.some(
          (rule) => rule.ruleId === "HDS-PDF-006-EMBEDDED-FILE",
        ) === true,
      `${M6D5B_CERTIFICATION_CASES[index]!.caseId} must reach the existing embedded-file M4 rule.`,
    );
  }

  for (const index of [6, 7, 8, 9, 10] as const) {
    const result = results[index]!;
    assert(
      result.pdfStructuralEvidence?.richMediaDetected === true &&
        result.rulePackEvaluation?.matchedRules.some(
          (rule) => rule.ruleId === "HDS-PDF-007-RICH-MEDIA",
        ) === true,
      `${M6D5B_CERTIFICATION_CASES[index]!.caseId} must reach the existing rich-media M4 rule.`,
    );
  }

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6D5B certification must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}


async function executeM6E1AllocatorCertification() {
  const base = legacyOfficeFixture("doc");
  const fatSectorId = base.readUInt32LE(76);
  const directoryStart = base.readUInt32LE(48);
  const summaryStart = cfbDirectoryStartSector(base, 2);
  const sectorSize = 1 << base.readUInt16LE(30);
  const miniFatSectorId = base.readUInt32LE(60);
  const miniFatOffset = (miniFatSectorId + 1) * sectorSize;
  const summaryNext = base.readUInt32LE(miniFatOffset + summaryStart * 4);

  const aliasBase = legacyOfficeFixture("doc", [
    { path: "Extra", data: Buffer.alloc(10, 0x45) },
  ]);
  const aliasSummaryStart = cfbDirectoryStartSector(aliasBase, 2);

  const fixtures = [
    base,
    patchHeaderDifatEntry(base, 1, fatSectorId),
    patchCfbFatEntry(base, fatSectorId, 0xfffffffe),
    patchCfbFatEntry(base, directoryStart, directoryStart),
    patchCfbDirectoryStartSector(base, 1, directoryStart),
    base,
    patchCfbMiniFatEntry(base, summaryStart, summaryStart),
    patchCfbMiniFatEntry(base, summaryStart, 0xfffffffe),
    patchCfbMiniFatEntry(base, summaryNext, summaryNext + 1),
    patchCfbDirectoryStartSector(aliasBase, 3, aliasSummaryStart),
    patchHeaderMiniFatCount(base, 0),
  ] as const;

  const results: NativeDocumentScannerResult[] = [];
  for (let index = 0; index < fixtures.length; index += 1) {
    const result = await inspectDocument({
      bytes: fixtures[index]!,
      filename: "m6e1-legacy.doc",
      extension: "doc",
      mimeType: "application/msword",
    });
    const contract = M6E1_CERTIFICATION_CASES[index]!;
    assertResultMatchesContract(result, contract);
    if (contract.expectedVerdict === "FAILED") {
      assert(
        result.rulePackEvaluation === null,
        `${contract.caseId} must fail before rule-pack trust evaluation.`,
      );
    } else {
      assert(
        result.oleStructuralInspectionComplete === true &&
          result.rulePackEvaluation?.outcome === "PASS" &&
          result.oleStructuralEvidence?.sectorOwnershipVerified === true &&
          result.oleStructuralEvidence.directoryTreeVerified === true,
        `${contract.caseId} must preserve successful bounded CFB structural evidence without CLEAN.`,
      );
    }
    results.push(result);
  }

  const directoryBase = legacyOfficeFixture("doc", [
    { path: "Extra", data: Buffer.from("x") },
  ]);
  const directoryFixtures = [
    patchCfbDirectoryColorFlag(directoryBase, 3, 2),
    patchCfbDirectoryName(directoryBase, 3, "Bad/Name"),
  ] as const;
  const directoryRepairResults: NativeDocumentScannerResult[] = [];

  for (let index = 0; index < directoryFixtures.length; index += 1) {
    const result = await inspectDocument({
      bytes: directoryFixtures[index]!,
      filename: "m6e1-directory-repair.doc",
      extension: "doc",
      mimeType: "application/msword",
    });
    const contract = M6E1_DIRECTORY_REPAIR_CASES[index]!;
    assertResultMatchesContract(result, contract);
    assert(
      result.rulePackEvaluation === null,
      `${contract.caseId} must fail during CFB parsing before rule-pack evaluation.`,
    );
    directoryRepairResults.push(result);
  }

  assert(
    [...results, ...directoryRepairResults].every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6E1 must preserve the no-CLEAN authority boundary.",
  );

  return { results, directoryRepairResults } as const;
}

async function executeM6E2APowerPointPersistAuthority() {
  const fixtures = [
    powerPointPersistFixture(),
    powerPointTwoEditPersistFixture({
      oldDocumentRecordType: 0x1111,
      newestDocumentRecordType: 0x03e8,
    }),
    powerPointTwoEditPersistFixture({
      oldDocumentRecordType: 0x03e8,
      newestDocumentRecordType: 0x1111,
    }),
    powerPointPersistFixture({
      mutate: (_powerPointDocument, currentUser) => {
        currentUser.writeUInt16LE(0x1111, 2);
      },
    }),
    powerPointPersistFixture({
      mutate: (powerPointDocument, currentUser) => {
        currentUser.writeUInt32LE(powerPointDocument.length, 16);
      },
    }),
    powerPointPersistFixture({
      mutate: (powerPointDocument) => {
        powerPointDocument.writeUInt32LE(320, 320 + 16);
      },
    }),
    powerPointPersistFixture({
      mutate: (powerPointDocument) => {
        powerPointDocument.writeUInt16LE(0x1111, 256 + 2);
      },
    }),
    powerPointPersistFixture({
      mutate: (powerPointDocument) => {
        powerPointDocument.writeUInt32LE(300, 256 + 12);
      },
    }),
    powerPointPersistFixture({
      mutate: (powerPointDocument) => {
        powerPointDocument.writeUInt32LE(2, 320 + 24);
      },
    }),
    powerPointPersistFixture({
      mutate: (powerPointDocument) => {
        powerPointDocumentContainer().copy(powerPointDocument, 96);
        powerPointPersistDirectoryAtom([
          { persistId: 1, offsets: [64, 96] },
        ]).copy(powerPointDocument, 256);
      },
    }),
    powerPointPersistFixture({
      mutate: (_powerPointDocument, currentUser) => {
        currentUser.writeUInt32LE(0xf3d1c4df, 12);
      },
    }),
    legacyOfficeFixture("ppt"),
    powerPointPersistFixture({
      mutate: (powerPointDocument) => {
        powerPointDocumentContainer().copy(powerPointDocument, 96);
        powerPointPersistDirectoryAtom([
          { persistId: 1, offsets: [64] },
          { persistId: 1, offsets: [96] },
        ]).copy(powerPointDocument, 256);
      },
    }),
    powerPointEncryptedSingleEditPersistFixture(),
    powerPointEncryptedMultipleEditPersistFixture(),
  ] as const;

  const results: NativeDocumentScannerResult[] = [];
  for (let index = 0; index < fixtures.length; index += 1) {
    const result = await inspectDocument({
      bytes: fixtures[index]!,
      filename: "m6e2a-persist-authority.ppt",
      extension: "ppt",
      mimeType: "application/vnd.ms-powerpoint",
    });
    const contract = M6E2A_POWERPOINT_AUTHORITY_CASES[index]!;
    assert(
      result.verdict === contract.expectedVerdict,
      `${contract.caseId} expected verdict ${contract.expectedVerdict}, received ${result.verdict}.`,
    );
    assert(
      result.reasonCodes.includes(contract.expectedReasonCode),
      `${contract.caseId} must expose reason ${contract.expectedReasonCode}.`,
    );
    assert(
      result.identityEvidence.detectedContainer === "OLE" &&
        result.identityEvidence.signatureKind === "OLE_COMPOUND_FILE_SIGNATURE",
      `${contract.caseId} must preserve exact OLE identity evidence.`,
    );
    results.push(result);
  }

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6E2A PowerPoint persist authority must preserve the no-CLEAN boundary.",
  );

  return { results } as const;
}

async function executeM6E2BPowerPointActiveContentCertification() {
  const fixtures = [
    powerPointM6E2BFixture(),
    powerPointM6E2BFixture({
      staleStorage: powerPointExternalStorage(),
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointDocInfoList([
          powerPointVbaInfoContainer({ persistIdRef: 2 }),
        ]),
      ],
      mappedStorage: powerPointExternalStorage(),
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointDocInfoList([
          powerPointVbaInfoContainer({ persistIdRef: 2 }),
        ]),
      ],
      mappedStoragePersistId: 3,
      mappedStorage: powerPointExternalStorage(),
      persistIdSeed: 3,
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointDocInfoList([
          powerPointVbaInfoContainer({
            persistIdRef: 2,
            fHasMacros: 2,
          }),
        ]),
      ],
      mappedStorage: powerPointExternalStorage(),
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointExternalObjectList([
          powerPointExternalObjectContainer(0x0fcc, 2),
        ]),
      ],
      mappedStorage: powerPointExternalStorage(),
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointExternalObjectList([
          powerPointExternalObjectContainer(0x0fee, 2),
        ]),
      ],
      mappedStorage: powerPointExternalStorage(),
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointExternalObjectList([
          powerPointExternalObjectContainer(0x0fce, 2),
        ]),
      ],
      mappedStorage: powerPointExternalStorage(),
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointExternalObjectList([
          powerPointExternalObjectContainer(0x0fcc, 2),
        ]),
      ],
      mappedStoragePersistId: 3,
      mappedStorage: powerPointExternalStorage(),
      persistIdSeed: 3,
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointExternalObjectList([
          powerPointExternalObjectContainer(0x0fcc, 2),
        ]),
      ],
      mappedStorage: powerPointExternalStorage({ recType: 0x2222 }),
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointExternalObjectList([
          powerPointExternalObjectContainer(0x0fcc, 2),
        ]),
      ],
      mappedStorage: powerPointExternalStorage({
        recInstance: 1,
        decompressedSize: 0,
      }),
    }),
    powerPointM6E2BFixture({
      documentChildren: [
        powerPointDocInfoList([
          powerPointVbaInfoContainer({ persistIdRef: 2 }),
        ]),
      ],
      mappedStorage: powerPointExternalStorage({ recType: 0x2222 }),
    }),
  ] as const;

  const results: NativeDocumentScannerResult[] = [];
  for (let index = 0; index < fixtures.length; index += 1) {
    const result = await inspectDocument({
      bytes: fixtures[index]!,
      filename: "m6e2b-live-active-content.ppt",
      extension: "ppt",
      mimeType: "application/vnd.ms-powerpoint",
    });
    const contract = M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES[index]!;
    assertResultMatchesContract(result, contract);

    if (contract.expectedVerdict === "FAILED") {
      assert(
        result.rulePackEvaluation === null,
        `${contract.caseId} must fail during live PowerPoint semantic resolution before rule-pack trust.`,
      );
    }
    results.push(result);
  }

  for (const index of [2] as const) {
    const result = results[index]!;
    assert(
      result.oleStructuralEvidence?.vbaProjectDetected === true &&
        result.rulePackEvaluation?.matchedRules.some(
          (rule) => rule.ruleId === "HDS-OLE-001-VBA",
        ) === true,
      `${M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES[index]!.caseId} must reach the existing VBA rule from live persist authority.`,
    );
  }

  for (const index of [5, 6, 7] as const) {
    const result = results[index]!;
    assert(
      result.oleStructuralEvidence?.embeddedObjectDetected === true &&
        result.rulePackEvaluation?.matchedRules.some(
          (rule) => rule.ruleId === "HDS-OLE-002-EMBEDDED-OBJECT",
        ) === true,
      `${M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES[index]!.caseId} must reach the existing embedded-object rule from live persist authority.`,
    );
  }

  for (const index of [0, 1] as const) {
    const result = results[index]!;
    assert(
      result.verdict === "IDENTITY_VERIFIED" &&
        result.rulePackEvaluation?.outcome === "PASS" &&
        result.oleStructuralEvidence?.vbaProjectDetected === false &&
        result.oleStructuralEvidence.embeddedObjectDetected === false,
      `${M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES[index]!.caseId} must preserve benign live/stale controls without CLEAN authority.`,
    );
  }

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6E2B must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}

async function executeM6E3DirectoryCertification() {
  const baseFixture = m6e3DirectoryFixture();
  const rootChild = baseFixture.readUInt32LE(
    cfbDirectoryEntryOffset(0) + 76,
  );
  const rootChildLeft = baseFixture.readUInt32LE(
    cfbDirectoryEntryOffset(rootChild) + 68,
  );
  const rootChildRight = baseFixture.readUInt32LE(
    cfbDirectoryEntryOffset(rootChild) + 72,
  );

  assert(
    rootChild !== 0xffffffff &&
      rootChildLeft !== 0xffffffff &&
      rootChildRight !== 0xffffffff,
    "M6E3 deterministic fixture must expose both left and right sibling-tree branches.",
  );

  const fixtures = [
    baseFixture,
    patchCfbDirectoryColorFlag(baseFixture, 1, 2),
    patchCfbDirectoryName(baseFixture, 2, "Bad/"),
    patchCfbDirectoryName(baseFixture, rootChildLeft, "Zzzz"),
    patchCfbDirectoryName(baseFixture, rootChildRight, "A000"),
    patchCfbDirectoryName(baseFixture, rootChildLeft, "CCCC"),
    patchCfbDirectoryColorFlag(
      patchCfbDirectoryColorFlag(baseFixture, rootChild, 0),
      rootChildLeft,
      0,
    ),
    patchCfbDirectoryPointer(baseFixture, 1, "child", 2),
    patchCfbDirectoryPointer(baseFixture, 1, "right", 127),
    patchCfbDirectoryPointer(baseFixture, rootChildLeft, "left", rootChildLeft),
    patchCfbUnallocatedAsStream(baseFixture, 5, "Ghost"),
    patchCfbDirectoryBytes(baseFixture, 5, 80, Buffer.from([0x01])),
    patchCfbDirectoryBytes(baseFixture, 1, 80, Buffer.from([0x01])),
    patchCfbDirectoryBytes(baseFixture, 1, 100, Buffer.from([0x01])),
    patchCfbDirectoryBytes(baseFixture, 0, 100, Buffer.from([0x01])),
  ] as const;

  const results: NativeDocumentScannerResult[] = [];
  for (let index = 0; index < fixtures.length; index += 1) {
    const result = await inspectDocument({
      bytes: fixtures[index]!,
      filename: "m6e3-directory.doc",
      extension: "doc",
      mimeType: "application/msword",
    });
    const contract = M6E3_DIRECTORY_CERTIFICATION_CASES[index]!;
    assertResultMatchesContract(result, contract);

    if (contract.expectedVerdict === "FAILED") {
      assert(
        result.rulePackEvaluation === null,
        `${contract.caseId} must fail during OLE directory authority before rule-pack trust.`,
      );
    }
    results.push(result);
  }

  assert(
    results[0]!.verdict === "IDENTITY_VERIFIED" &&
      results[0]!.rulePackEvaluation?.outcome === "PASS",
    "M6E3 benign sorted-directory control must remain accepted without CLEAN authority.",
  );

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6E3 directory certification must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}

async function executeM6F1IdentityIntegrityCertification() {
  const safePdf = buildClassicPdf();

  const fragmented = await inspectPdf({
    bytes: safePdf,
  });

  const shaMismatch = await inspectPdf({
    bytes: safePdf,
    expectedSha256: "0".repeat(64),
  });

  const shorterThanExpected = await inspectPdf({
    bytes: safePdf,
    expectedSizeBytes: safePdf.length + 1,
  });

  const largerThanExpected = await inspectPdf({
    bytes: safePdf,
    expectedSizeBytes: safePdf.length - 1,
  });

  const sharedBacking = new SharedArrayBuffer(safePdf.length);
  const sharedBytes = new Uint8Array(sharedBacking);
  sharedBytes.set(safePdf);

  const expectedSharedSha256 = sha256(safePdf);
  const hashPrototype = Object.getPrototypeOf(createHash("sha256")) as object;
  const originalUpdate = Reflect.get(hashPrototype, "update");

  assert(
    typeof originalUpdate === "function",
    "M6F1 requires the Node Hash update function for deterministic mutable-backing snapshot injection.",
  );

  let mutationInjected = false;

  const patchedUpdate = function (this: object, ...args: unknown[]) {
    const output = Reflect.apply(originalUpdate, this, args);

    if (!mutationInjected) {
      mutationInjected = true;
      sharedBytes[0] = 0x58;
    }

    return output;
  };

  assert(
    Reflect.set(hashPrototype, "update", patchedUpdate),
    "M6F1 could not install the deterministic hash/update mutation hook.",
  );

  let mutableBackingSnapshot: NativeDocumentScannerResult;

  try {
    mutableBackingSnapshot = await inspectNativeDocumentIdentity({
      source: (async function* () {
        yield sharedBytes;
      })(),
      expectedSizeBytes: safePdf.length,
      expectedSha256: expectedSharedSha256,
      declaredFilename: "m6f1-shared-backing.pdf",
      declaredExtension: "pdf",
      declaredMimeType: "application/pdf",
      limits: {
        maxBytes: ONE_MEBIBYTE,
        archive: ARCHIVE_LIMITS,
        pdf: PDF_LIMITS,
        ole: OLE_LIMITS,
      },
    });
  } finally {
    assert(
      Reflect.set(hashPrototype, "update", originalUpdate),
      "M6F1 could not restore the Node Hash update function.",
    );
  }

  assert(
    mutationInjected,
    "M6F1 mutable-backing case must inject mutation immediately after the scanner hash update.",
  );

  const results = [
    fragmented,
    shaMismatch,
    shorterThanExpected,
    largerThanExpected,
    mutableBackingSnapshot,
  ] as const;

  for (let index = 0; index < results.length; index += 1) {
    assertResultMatchesContract(
      results[index]!,
      M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES[index]!,
    );
  }

  assert(
    fragmented.bytesScanned === safePdf.length &&
      fragmented.sha256Hash === expectedSharedSha256 &&
      fragmented.identityEvidence.sizeMatched === true &&
      fragmented.identityEvidence.sha256Matched === true,
    "M6F1 fragmented benign control must preserve exact byte-count and SHA-256 identity evidence.",
  );

  assert(
    mutableBackingSnapshot.bytesScanned === safePdf.length &&
      mutableBackingSnapshot.sha256Hash === expectedSharedSha256 &&
      mutableBackingSnapshot.identityEvidence.sizeMatched === true &&
      mutableBackingSnapshot.identityEvidence.sha256Matched === true &&
      mutableBackingSnapshot.pdfStructuralInspectionComplete === true &&
      mutableBackingSnapshot.rulePackEvaluation?.outcome === "PASS",
    "M6F1 must hash and structurally parse the same owned source snapshot even when the original shared backing mutates after hash update.",
  );

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6F1 identity-integrity certification must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}


async function executeM6F2ResourceExhaustionCertification() {
  const safePdf = buildClassicPdf();
  const safeOoxml = buildM6COoxmlPackage({ application: "docx" });
  const safeOle = legacyOfficeFixture("doc");

  const benignPdf = await inspectDocumentWithResourceLimits({
    bytes: safePdf,
    filename: "m6f2-resource-control.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
  });

  const sourceMaxBytes = await inspectDocumentWithResourceLimits({
    bytes: safePdf,
    filename: "m6f2-source-max.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    maxBytes: safePdf.length - 1,
  });

  const emptyChunkFlood = await inspectDocumentWithResourceLimits({
    bytes: safePdf,
    filename: "m6f2-empty-chunks.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    source: sourceWithEmptyChunkFlood(safePdf),
  });

  const benignOoxml = await inspectDocumentWithResourceLimits({
    bytes: safeOoxml,
    filename: "m6f2-resource-control.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const ooxmlEntryCount = await inspectDocumentWithResourceLimits({
    bytes: safeOoxml,
    filename: "m6f2-entry-count.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archive: Object.freeze({
      ...ARCHIVE_LIMITS,
      maxEntries: 2,
    }),
  });

  const ooxmlEntrySize = await inspectDocumentWithResourceLimits({
    bytes: safeOoxml,
    filename: "m6f2-entry-size.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archive: Object.freeze({
      ...ARCHIVE_LIMITS,
      maxEntryUncompressedBytes: 64,
      maxTotalUncompressedBytes: 1024,
      maxControlPartBytes: 64,
    }),
  });

  const expandedOoxml = buildM6COoxmlPackage({
    application: "docx",
    additionalEntries: [
      Object.freeze({
        name: "word/media/m6f2-a.bin",
        data: Buffer.alloc(400, 0x41),
      }),
      Object.freeze({
        name: "word/media/m6f2-b.bin",
        data: Buffer.alloc(400, 0x42),
      }),
    ],
  });

  const ooxmlTotalExpanded = await inspectDocumentWithResourceLimits({
    bytes: expandedOoxml,
    filename: "m6f2-total-expanded.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archive: Object.freeze({
      ...ARCHIVE_LIMITS,
      maxEntryUncompressedBytes: 512,
      maxTotalUncompressedBytes: 700,
      maxControlPartBytes: 256,
    }),
  });

  const ratioOoxml = patchFirstZipCentralCompressedSize(safeOoxml, 1);
  const ooxmlCompressionRatio = await inspectDocumentWithResourceLimits({
    bytes: ratioOoxml,
    filename: "m6f2-ratio.docx",
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    archive: Object.freeze({
      ...ARCHIVE_LIMITS,
      maxCompressionRatio: 2,
    }),
  });

  const pdfObjectCount = await inspectDocumentWithResourceLimits({
    bytes: safePdf,
    filename: "m6f2-object-count.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    pdf: Object.freeze({
      ...PDF_LIMITS,
      maxObjects: 3,
    }),
  });

  const nestedPdf = buildM6DClassicPdf([
    "<< /Type /Catalog /Pages 2 0 R /Deep [[[[0]]]] >>",
    "<< /Type /Pages /Kids [] /Count 0 >>",
  ]);
  const pdfNesting = await inspectDocumentWithResourceLimits({
    bytes: nestedPdf,
    filename: "m6f2-nesting.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    pdf: Object.freeze({
      ...PDF_LIMITS,
      maxNestingDepth: 2,
    }),
  });

  const stringPdf = buildM6DClassicPdf([
    `<< /Type /Catalog /Pages 2 0 R /Long (${`A`.repeat(32)}) >>`,
    "<< /Type /Pages /Kids [] /Count 0 >>",
  ]);
  const pdfString = await inspectDocumentWithResourceLimits({
    bytes: stringPdf,
    filename: "m6f2-string.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    pdf: Object.freeze({
      ...PDF_LIMITS,
      maxStringBytes: 8,
    }),
  });

  const xrefStreamPdf = buildM6D3ObjectStreamPdf();
  const pdfXrefDecode = await inspectDocumentWithResourceLimits({
    bytes: xrefStreamPdf,
    filename: "m6f2-xref-decode.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    pdf: Object.freeze({
      ...PDF_LIMITS,
      maxDecodedXrefStreamBytes: 8,
    }),
  });

  const benignOle = await inspectDocumentWithResourceLimits({
    bytes: safeOle,
    filename: "m6f2-resource-control.doc",
    extension: "doc",
    mimeType: "application/msword",
  });

  const oleDirectoryEntries = await inspectDocumentWithResourceLimits({
    bytes: safeOle,
    filename: "m6f2-directory-entries.doc",
    extension: "doc",
    mimeType: "application/msword",
    ole: Object.freeze({
      ...OLE_LIMITS,
      maxDirectoryEntries: 3,
    }),
  });

  const oleStreamCount = await inspectDocumentWithResourceLimits({
    bytes: safeOle,
    filename: "m6f2-stream-count.doc",
    extension: "doc",
    mimeType: "application/msword",
    ole: Object.freeze({
      ...OLE_LIMITS,
      maxStreams: 1,
    }),
  });

  const oleSectorChain = await inspectDocumentWithResourceLimits({
    bytes: safeOle,
    filename: "m6f2-sector-chain.doc",
    extension: "doc",
    mimeType: "application/msword",
    ole: Object.freeze({
      ...OLE_LIMITS,
      maxSectorChainLength: 4,
    }),
  });

  const oleStreamSize = await inspectDocumentWithResourceLimits({
    bytes: safeOle,
    filename: "m6f2-stream-size.doc",
    extension: "doc",
    mimeType: "application/msword",
    ole: Object.freeze({
      ...OLE_LIMITS,
      maxStreamBytes: 1024,
    }),
  });

  const oleTotalStreamBytes = await inspectDocumentWithResourceLimits({
    bytes: safeOle,
    filename: "m6f2-total-stream-bytes.doc",
    extension: "doc",
    mimeType: "application/msword",
    ole: Object.freeze({
      ...OLE_LIMITS,
      maxTotalStreamBytes: 4000,
    }),
  });

  const results = [
    benignPdf,
    sourceMaxBytes,
    emptyChunkFlood,
    benignOoxml,
    ooxmlEntryCount,
    ooxmlEntrySize,
    ooxmlTotalExpanded,
    ooxmlCompressionRatio,
    pdfObjectCount,
    pdfNesting,
    pdfString,
    pdfXrefDecode,
    benignOle,
    oleDirectoryEntries,
    oleStreamCount,
    oleSectorChain,
    oleStreamSize,
    oleTotalStreamBytes,
  ] as const;

  for (let index = 0; index < results.length; index += 1) {
    assertResultMatchesContract(
      results[index]!,
      M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES[index]!,
    );
  }

  assert(
    emptyChunkFlood.bytesScanned === 0,
    "M6F2 empty-chunk flooding must stop without consuming attacker-controlled document bytes.",
  );

  assert(
    benignPdf.pdfStructuralInspectionComplete === true &&
      benignOoxml.archiveInspectionComplete === true &&
      benignOoxml.ooxmlStructuralInspectionComplete === true &&
      benignOle.oleStructuralInspectionComplete === true,
    "M6F2 benign controls must traverse complete bounded PDF, OOXML, and OLE structural inspection.",
  );

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6F2 resource-exhaustion certification must preserve the no-CLEAN authority boundary.",
  );

  return { results } as const;
}

async function run() {
  validateManifest();
  validateCaseContract();
  validateM6BCertificationCases();
  validateM6CCertificationCases();
  validateM6D2CertificationCases();
  validateM6D3CertificationCases();
  validateM6D4CertificationCases();
  validateM6D5CertificationCases();
  validateM6D5BCertificationCases();
  validateM6E1CertificationCases();
  validateM6E2APowerPointAuthorityCases();
  validateM6E2BPowerPointActiveContentCases();
  validateM6E3DirectoryCertificationCases();
  validateM6F1IdentityIntegrityCertificationCases();
  validateM6F2ResourceExhaustionCertificationCases();
  validateRulePackBoundary();

  const sentinelResults = await executeSentinels();
  const m6b = await executeM6BCertification();
  const m6c = await executeM6CCertification();
  const m6d1 = await executeM6D1ParserAmbiguityRepair();
  const m6d2 = await executeM6D2RevisionXrefAuthorityCertification();
  const m6d3 = await executeM6D3ObjectStreamEvasionCertification();
  const m6d4 = await executeM6D4ActionEvasionCertification();
  const m6d5 = await executeM6D5UriEvasionCertification();
  const m6d5b = await executeM6D5BEmbeddedContentEvasionCertification();
  const m6e1 = await executeM6E1AllocatorCertification();
  const m6e2a = await executeM6E2APowerPointPersistAuthority();
  const m6e2b = await executeM6E2BPowerPointActiveContentCertification();
  const m6e3 = await executeM6E3DirectoryCertification();
  const m6f1 = await executeM6F1IdentityIntegrityCertification();
  const m6f2 = await executeM6F2ResourceExhaustionCertification();

  const sentinelSummary =
    HARNESS_SENTINEL_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: sentinelResults[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          sentinelResults[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
      }),
    );

  const m6bSummary =
    M6B_CERTIFICATION_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: m6b.results[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          m6b.results[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
        expectedDetectedContainer:
          testCase.expectedDetectedContainer,
        actualDetectedContainer:
          m6b.results[index]!.identityEvidence.detectedContainer,
        expectedSignatureKind:
          testCase.expectedSignatureKind,
        actualSignatureKind:
          m6b.results[index]!.identityEvidence.signatureKind,
      }),
    );

  const m6cSummary =
    M6C_CERTIFICATION_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: m6c.results[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          m6c.results[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
        expectedRuleId: testCase.expectedRuleId,
        actualMatchedRuleIds:
          m6c.results[index]!.rulePackEvaluation?.matchedRules.map(
            (rule) => rule.ruleId,
          ) ?? [],
        expectedDetectedContainer:
          testCase.expectedDetectedContainer,
        actualDetectedContainer:
          m6c.results[index]!.identityEvidence.detectedContainer,
        expectedSignatureKind:
          testCase.expectedSignatureKind,
        actualSignatureKind:
          m6c.results[index]!.identityEvidence.signatureKind,
      }),
    );

  const m6d2Summary =
    M6D2_CERTIFICATION_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: m6d2.results[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          m6d2.results[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
        expectedDetectedContainer:
          testCase.expectedDetectedContainer,
        actualDetectedContainer:
          m6d2.results[index]!.identityEvidence.detectedContainer,
        expectedSignatureKind:
          testCase.expectedSignatureKind,
        actualSignatureKind:
          m6d2.results[index]!.identityEvidence.signatureKind,
      }),
    );

  const m6d3Summary =
    M6D3_CERTIFICATION_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: m6d3.results[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          m6d3.results[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
        expectedDetectedContainer:
          testCase.expectedDetectedContainer,
        actualDetectedContainer:
          m6d3.results[index]!.identityEvidence.detectedContainer,
        expectedSignatureKind:
          testCase.expectedSignatureKind,
        actualSignatureKind:
          m6d3.results[index]!.identityEvidence.signatureKind,
      }),
    );

  const m6d4Summary =
    M6D4_CERTIFICATION_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: m6d4.results[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          m6d4.results[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
        expectedDetectedContainer:
          testCase.expectedDetectedContainer,
        actualDetectedContainer:
          m6d4.results[index]!.identityEvidence.detectedContainer,
        expectedSignatureKind:
          testCase.expectedSignatureKind,
        actualSignatureKind:
          m6d4.results[index]!.identityEvidence.signatureKind,
      }),
    );


  const m6d5Summary =
    M6D5_CERTIFICATION_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: m6d5.results[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          m6d5.results[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
        expectedDetectedContainer:
          testCase.expectedDetectedContainer,
        actualDetectedContainer:
          m6d5.results[index]!.identityEvidence.detectedContainer,
        expectedSignatureKind:
          testCase.expectedSignatureKind,
        actualSignatureKind:
          m6d5.results[index]!.identityEvidence.signatureKind,
      }),
    );

  const m6d5bSummary =
    M6D5B_CERTIFICATION_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: m6d5b.results[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          m6d5b.results[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
        expectedDetectedContainer:
          testCase.expectedDetectedContainer,
        actualDetectedContainer:
          m6d5b.results[index]!.identityEvidence.detectedContainer,
        expectedSignatureKind:
          testCase.expectedSignatureKind,
        actualSignatureKind:
          m6d5b.results[index]!.identityEvidence.signatureKind,
      }),
    );

  const m6bCertifiedThreatFamilies =
    THREAT_FAMILY_MANIFEST
      .filter(
        (entry) =>
          entry.certificationStatus === "CERTIFIED_M6B",
      )
      .map((entry) => entry.threatFamily);

  const m6cCertifiedThreatFamilies =
    THREAT_FAMILY_MANIFEST
      .filter(
        (entry) =>
          entry.certificationStatus === "CERTIFIED_M6C",
      )
      .map((entry) => entry.threatFamily);


  const m6d2CertifiedThreatFamilies =
    THREAT_FAMILY_MANIFEST
      .filter(
        (entry) =>
          entry.certificationStatus === "CERTIFIED_M6D2",
      )
      .map((entry) => entry.threatFamily);

  const m6d3CertifiedThreatFamilies =
    THREAT_FAMILY_MANIFEST
      .filter(
        (entry) =>
          entry.certificationStatus === "CERTIFIED_M6D3",
      )
      .map((entry) => entry.threatFamily);

  const m6d4CertifiedThreatFamilies =
    THREAT_FAMILY_MANIFEST
      .filter(
        (entry) =>
          entry.certificationStatus === "CERTIFIED_M6D4",
      )
      .map((entry) => entry.threatFamily);

  const m6d5CertifiedThreatFamilies =
    THREAT_FAMILY_MANIFEST
      .filter(
        (entry) =>
          entry.certificationStatus === "CERTIFIED_M6D5",
      )
      .map((entry) => entry.threatFamily);

  const m6d5bCertifiedThreatFamilies =
    THREAT_FAMILY_MANIFEST
      .filter(
        (entry) =>
          entry.certificationStatus === "CERTIFIED_M6D5B",
      )
      .map((entry) => entry.threatFamily);

  assert(
    m6bCertifiedThreatFamilies.length === 2 &&
      m6bCertifiedThreatFamilies.includes("IDENTITY_AMBIGUITY") &&
      m6bCertifiedThreatFamilies.includes("POLYGLOT"),
    "M6B certification state must remain exactly identity ambiguity plus polyglot.",
  );

  assert(
    m6cCertifiedThreatFamilies.length === 3 &&
      m6cCertifiedThreatFamilies.includes("OOXML_CONTAINER_EVASION") &&
      m6cCertifiedThreatFamilies.includes("OOXML_RELATIONSHIP_EVASION") &&
      m6cCertifiedThreatFamilies.includes("OOXML_MACRO_EVASION"),
    "M6C must certify exactly the three bounded OOXML evasion families.",
  );

  const m6dThreatFamilies = THREAT_FAMILY_MANIFEST.filter(
    (entry) => entry.plannedPhase === "M6D",
  );

  assert(
    m6d2CertifiedThreatFamilies.length === 2 &&
      m6d2CertifiedThreatFamilies.includes("PDF_INCREMENTAL_UPDATE_EVASION") &&
      m6d2CertifiedThreatFamilies.includes("PDF_XREF_EVASION"),
    "M6D2 must certify exactly incremental-update and xref authority evasion.",
  );

  assert(
    m6d3CertifiedThreatFamilies.length === 1 &&
      m6d3CertifiedThreatFamilies.includes("PDF_OBJECT_STREAM_EVASION"),
    "M6D3 must certify exactly PDF object-stream evasion.",
  );

  assert(
    m6d4CertifiedThreatFamilies.length === 1 &&
      m6d4CertifiedThreatFamilies.includes("PDF_ACTION_EVASION"),
    "M6D4 must certify exactly PDF action evasion.",
  );

  assert(
    m6d5CertifiedThreatFamilies.length === 1 &&
      m6d5CertifiedThreatFamilies.includes("PDF_URI_EVASION"),
    "M6D5 must certify exactly PDF URI evasion.",
  );

  assert(
    m6d5bCertifiedThreatFamilies.length === 1 &&
      m6d5bCertifiedThreatFamilies.includes("PDF_EMBEDDED_CONTENT_EVASION"),
    "M6D5B must certify exactly PDF embedded-content evasion.",
  );

  assert(
    m6dThreatFamilies.length === 6 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "CERTIFIED_M6D2",
      ).length === 2 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "CERTIFIED_M6D3",
      ).length === 1 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "CERTIFIED_M6D4",
      ).length === 1 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "CERTIFIED_M6D5",
      ).length === 1 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "CERTIFIED_M6D5B",
      ).length === 1 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "NOT_CERTIFIED",
      ).length === 0,
    "M6D5B must certify the final PDF threat family while leaving formal M6D closeout to M6D6.",
  );


  const m6e1Summary = M6E1_CERTIFICATION_CASES.map((testCase, index) => {
    const result = m6e1.results[index]!;
    return Object.freeze({
      caseId: testCase.caseId,
      threatFamily: testCase.threatFamily,
      benignControl: testCase.benignControl,
      certificationCredit: testCase.certificationCredit,
      expectedVerdict: testCase.expectedVerdict,
      actualVerdict: result.verdict,
      expectedReasonCode: testCase.expectedReasonCode,
      reasonMatched: result.reasonCodes.includes(testCase.expectedReasonCode),
      expectedDetectedContainer: testCase.expectedDetectedContainer ?? null,
      actualDetectedContainer: result.identityEvidence.detectedContainer,
      expectedSignatureKind: testCase.expectedSignatureKind ?? null,
      actualSignatureKind: result.identityEvidence.signatureKind,
    });
  });

  const m6e1DirectoryRepairSummary = M6E1_DIRECTORY_REPAIR_CASES.map(
    (testCase, index) => {
      const result = m6e1.directoryRepairResults[index]!;
      return Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: result.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched: result.reasonCodes.includes(testCase.expectedReasonCode),
      });
    },
  );

  const m6e2aSummary = M6E2A_POWERPOINT_AUTHORITY_CASES.map(
    (testCase, index) => {
      const result = m6e2a.results[index]!;
      return Object.freeze({
        caseId: testCase.caseId,
        benignControl: testCase.benignControl,
        authorityCredit: testCase.authorityCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: result.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched: result.reasonCodes.includes(testCase.expectedReasonCode),
        actualDetectedContainer: result.identityEvidence.detectedContainer,
        actualSignatureKind: result.identityEvidence.signatureKind,
      });
    },
  );

  const m6e2bSummary = M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES.map(
    (testCase, index) => {
      const result = m6e2b.results[index]!;
      return Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: result.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched: result.reasonCodes.includes(testCase.expectedReasonCode),
        expectedRuleId: testCase.expectedRuleId,
        actualMatchedRuleIds:
          result.rulePackEvaluation?.matchedRules.map((rule) => rule.ruleId) ?? [],
        actualDetectedContainer: result.identityEvidence.detectedContainer,
        actualSignatureKind: result.identityEvidence.signatureKind,
      });
    },
  );

  const m6e3Summary = M6E3_DIRECTORY_CERTIFICATION_CASES.map(
    (testCase, index) => {
      const result = m6e3.results[index]!;
      return Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: result.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched: result.reasonCodes.includes(testCase.expectedReasonCode),
        actualDetectedContainer: result.identityEvidence.detectedContainer,
        actualSignatureKind: result.identityEvidence.signatureKind,
      });
    },
  );

  const m6f1Summary = M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES.map(
    (testCase, index) => {
      const result = m6f1.results[index]!;
      return Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: result.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched: result.reasonCodes.includes(testCase.expectedReasonCode),
        expectedDetectedContainer: testCase.expectedDetectedContainer ?? null,
        actualDetectedContainer: result.identityEvidence.detectedContainer,
        expectedSignatureKind: testCase.expectedSignatureKind ?? null,
        actualSignatureKind: result.identityEvidence.signatureKind,
        bytesScanned: result.bytesScanned,
        sha256Hash: result.sha256Hash,
      });
    },
  );


  const m6f2Summary = M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES.map(
    (testCase, index) => {
      const result = m6f2.results[index]!;
      return Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: result.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched: result.reasonCodes.includes(testCase.expectedReasonCode),
        actualDetectedContainer: result.identityEvidence.detectedContainer,
        actualSignatureKind: result.identityEvidence.signatureKind,
        bytesScanned: result.bytesScanned,
      });
    },
  );

  const m6e1CertifiedThreatFamilies = THREAT_FAMILY_MANIFEST.filter(
    (entry) => entry.certificationStatus === "CERTIFIED_M6E1",
  ).map((entry) => entry.threatFamily);

  const m6e2bCertifiedThreatFamilies = THREAT_FAMILY_MANIFEST.filter(
    (entry) => entry.certificationStatus === "CERTIFIED_M6E2B",
  ).map((entry) => entry.threatFamily);

  const m6e3CertifiedThreatFamilies = THREAT_FAMILY_MANIFEST.filter(
    (entry) => entry.certificationStatus === "CERTIFIED_M6E3",
  ).map((entry) => entry.threatFamily);

  const m6f1CertifiedThreatFamilies = THREAT_FAMILY_MANIFEST.filter(
    (entry) => entry.certificationStatus === "CERTIFIED_M6F1",
  ).map((entry) => entry.threatFamily);

  const m6f2CertifiedThreatFamilies = THREAT_FAMILY_MANIFEST.filter(
    (entry) => entry.certificationStatus === "CERTIFIED_M6F2",
  ).map((entry) => entry.threatFamily);

  const m6dCertifiedThreatFamilies =
    m6dThreatFamilies.map((entry) => entry.threatFamily);

  const remainingM6dThreatFamilies =
    m6dThreatFamilies
      .filter(
        (entry) => entry.certificationStatus === "NOT_CERTIFIED",
      )
      .map((entry) => entry.threatFamily);

  const remainingNonPdfThreatFamilies =
    THREAT_FAMILY_MANIFEST
      .filter(
        (entry) =>
          entry.plannedPhase === "M6E" ||
          entry.plannedPhase === "M6F" ||
          entry.plannedPhase === "M6G",
      )
      .filter(
        (entry) => entry.certificationStatus === "NOT_CERTIFIED",
      )
      .map((entry) => entry.threatFamily);

  const m6dCertificationCaseCount =
    M6D2_CERTIFICATION_CASES.length +
    M6D3_CERTIFICATION_CASES.length +
    M6D4_CERTIFICATION_CASES.length +
    M6D5_CERTIFICATION_CASES.length +
    M6D5B_CERTIFICATION_CASES.length;

  const m6dCertificationCredit =
    M6D2_CERTIFICATION_CASES.filter(
      (testCase) => testCase.certificationCredit,
    ).length +
    M6D3_CERTIFICATION_CASES.filter(
      (testCase) => testCase.certificationCredit,
    ).length +
    M6D4_CERTIFICATION_CASES.filter(
      (testCase) => testCase.certificationCredit,
    ).length +
    M6D5_CERTIFICATION_CASES.filter(
      (testCase) => testCase.certificationCredit,
    ).length +
    M6D5B_CERTIFICATION_CASES.filter(
      (testCase) => testCase.certificationCredit,
    ).length;

  assert(
    m6dCertifiedThreatFamilies.length === 6 &&
      m6dCertifiedThreatFamilies.includes("PDF_INCREMENTAL_UPDATE_EVASION") &&
      m6dCertifiedThreatFamilies.includes("PDF_XREF_EVASION") &&
      m6dCertifiedThreatFamilies.includes("PDF_OBJECT_STREAM_EVASION") &&
      m6dCertifiedThreatFamilies.includes("PDF_ACTION_EVASION") &&
      m6dCertifiedThreatFamilies.includes("PDF_URI_EVASION") &&
      m6dCertifiedThreatFamilies.includes("PDF_EMBEDDED_CONTENT_EVASION") &&
      remainingM6dThreatFamilies.length === 0,
    "M6D6 requires all six planned PDF threat families to be certified with none remaining open.",
  );

  assert(
    m6dCertificationCaseCount === 55 &&
      m6dCertificationCredit === 55,
    "M6D6 requires all 55 bounded M6D certification cases to retain certification credit.",
  );

  assert(
    m6e2bCertifiedThreatFamilies.length === 2 &&
      m6e2bCertifiedThreatFamilies.includes("OLE_VBA_EVASION") &&
      m6e2bCertifiedThreatFamilies.includes("OLE_EMBEDDED_OBJECT_EVASION"),
    "M6E2B must certify exactly live PowerPoint VBA and embedded/external-object evasion.",
  );

  assert(
    m6e3CertifiedThreatFamilies.length === 1 &&
      m6e3CertifiedThreatFamilies[0] === "OLE_DIRECTORY_EVASION",
    "M6E3 must certify the final OLE directory evasion family.",
  );

  assert(
    m6f1CertifiedThreatFamilies.length === 1 &&
      m6f1CertifiedThreatFamilies[0] === "HASH_SIZE_IDENTITY_RACE",
    "M6F1 must certify exactly the source hash/size identity race family.",
  );

  assert(
    m6f2CertifiedThreatFamilies.length === 1 &&
      m6f2CertifiedThreatFamilies[0] === "RESOURCE_EXHAUSTION",
    "M6F2 must certify exactly the resource-exhaustion family.",
  );

  assert(
    remainingNonPdfThreatFamilies.length === 3 &&
      remainingNonPdfThreatFamilies.every(
        (family) =>
          family === "TRUNCATION" ||
          family === "RULE_ORDER_DETERMINISM" ||
          family === "FALSE_POSITIVE_CONTROL",
      ),
    "M6F2 must close resource exhaustion while leaving truncation, rule-order determinism, and M6G false-positive control open.",
  );

  assert(
    sentinelResults.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ) &&
      m6b.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6c.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      [
        m6d1.duplicateResult,
        m6d1.encodedDuplicateResult,
        m6d1.benignResult,
      ].every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6d2.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6d3.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6d4.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6d5.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6d5b.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6e1.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6e1.directoryRepairResults.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6e2a.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6e2b.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6e3.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6f1.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ) &&
      m6f2.results.every(
        (result) =>
          String(result.verdict) !== "CLEAN" &&
          result.inspectionComplete === false,
      ),
    "M6 execution must never grant CLEAN or completed document-trust authority.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        event:
          "HDS_M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_PASSED",
        corpusSchemaVersion:
          HDS_M6_ADVERSARIAL_CORPUS_SCHEMA_VERSION,
        harnessVersion:
          HDS_M6F2_HARNESS_VERSION,
        priorHarnessVersion:
          HDS_M6F1_HARNESS_VERSION,
        priorOoxmlHarnessVersion:
          HDS_M6C_HARNESS_VERSION,
        scannerEngine:
          HEHXAGON_DOCUMENT_SECURITY_ENGINE,
        scannerEngineVersion:
          HEHXAGON_DOCUMENT_SECURITY_ENGINE_VERSION,
        rulePackVersion:
          HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION,
        threatFamilyCount:
          THREAT_FAMILY_MANIFEST.length,
        threatFamilies:
          THREAT_FAMILY_MANIFEST.map(
            (entry) => ({
              threatFamily:
                entry.threatFamily,
              plannedPhase:
                entry.plannedPhase,
              certificationStatus:
                entry.certificationStatus,
            }),
          ),
        m6bCertifiedThreatFamilies,
        m6bCertificationComplete: true,
        m6cCertifiedThreatFamilies,
        m6cCertificationComplete: true,
        m6d2CertifiedThreatFamilies,
        m6d2CertificationComplete: true,
        m6d3CertifiedThreatFamilies,
        m6d3CertificationComplete: true,
        m6d4CertifiedThreatFamilies,
        m6d4CertificationComplete: true,
        m6d5CertifiedThreatFamilies,
        m6d5CertificationComplete: true,
        m6d5bCertifiedThreatFamilies,
        m6d5bCertificationComplete: true,
        ooxmlNormalizationInvariant:
          "SINGLE_PASS_NAMED_DECIMAL_AND_HEX_XML_ATTRIBUTE_ENTITIES",
        identityPrecedenceInvariant:
          "EXECUTABLE_THEN_LEADING_ZIP_OLE_THEN_BOUNDED_PDF_PREAMBLE",
        truePolyglotProof: {
          formatPair:
            "OOXML_PDF",
          sameBytesPassOoxmlArchive:
            m6b.directPolyglotOoxml.ok,
          sameBytesPassPdfStructure:
            m6b.directPolyglotPdf.ok &&
            m6b.directPolyglotPdf.structuralInspectionComplete,
          scannerAuthoritativeContainer:
            m6b.results[8]!.identityEvidence.detectedContainer,
          pdfMasqueradeRejected:
            m6b.results[9]!.verdict === "BLOCKED" &&
            m6b.results[9]!.reasonCodes.includes(
              "EXTENSION_CONTAINER_MISMATCH",
            ),
        },
        corpusProvenance:
          "DETERMINISTIC_GENERATED",
        externalBinaryCorpusFiles: 0,
        filesystemExtractionRequired: false,
        networkAccessRequired: false,
        sentinelCaseCount:
          HARNESS_SENTINEL_CASES.length,
        sentinelCertificationCredit: 0,
        sentinelResults:
          sentinelSummary,
        m6bCaseCount:
          M6B_CERTIFICATION_CASES.length,
        m6bCertificationCredit:
          M6B_CERTIFICATION_CASES.filter(
            (testCase) =>
              testCase.certificationCredit,
          ).length,
        m6bResults:
          m6bSummary,
        m6cCaseCount:
          M6C_CERTIFICATION_CASES.length,
        m6cCertificationCredit:
          M6C_CERTIFICATION_CASES.filter(
            (testCase) =>
              testCase.certificationCredit,
          ).length,
        m6cBenignControlCount:
          M6C_CERTIFICATION_CASES.filter(
            (testCase) =>
              testCase.benignControl,
          ).length,
        m6cResults:
          m6cSummary,
        m6d1ParserAmbiguityRepairComplete: true,
        m6d1RepairCaseCount: 3,
        m6d1Results: [
          {
            caseId: "HDS-M6D1-001-DUPLICATE-ACTION-KEY",
            expectedVerdict: "FAILED",
            actualVerdict: m6d1.duplicateResult.verdict,
            expectedReasonCode: "PDF_OBJECT_SYNTAX_INVALID",
            reasonMatched: m6d1.duplicateResult.reasonCodes.includes(
              "PDF_OBJECT_SYNTAX_INVALID",
            ),
          },
          {
            caseId: "HDS-M6D1-002-ENCODED-DUPLICATE-ACTION-KEY",
            expectedVerdict: "FAILED",
            actualVerdict: m6d1.encodedDuplicateResult.verdict,
            expectedReasonCode: "PDF_OBJECT_SYNTAX_INVALID",
            reasonMatched: m6d1.encodedDuplicateResult.reasonCodes.includes(
              "PDF_OBJECT_SYNTAX_INVALID",
            ),
          },
          {
            caseId: "HDS-M6D1-003-BENIGN-PDF-CONTROL",
            expectedVerdict: "IDENTITY_VERIFIED",
            actualVerdict: m6d1.benignResult.verdict,
            expectedReasonCode:
              "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
            reasonMatched: m6d1.benignResult.reasonCodes.includes(
              "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
            ),
          },
        ],
        m6d2RevisionXrefAuthorityRepairComplete: true,
        m6d2CaseCount:
          M6D2_CERTIFICATION_CASES.length,
        m6d2CertificationCredit:
          M6D2_CERTIFICATION_CASES.filter(
            (testCase) =>
              testCase.certificationCredit,
          ).length,
        m6d2BenignControlCount:
          M6D2_CERTIFICATION_CASES.filter(
            (testCase) =>
              testCase.benignControl,
          ).length,
        m6d2Results:
          m6d2Summary,
        m6d3ObjectStreamRepairComplete: true,
        m6d3CaseCount:
          M6D3_CERTIFICATION_CASES.length,
        m6d3CertificationCredit:
          M6D3_CERTIFICATION_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6d3BenignControlCount:
          M6D3_CERTIFICATION_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6d3Results:
          m6d3Summary,
        m6d4ActionAuthorityRepairComplete: true,
        m6d4CaseCount:
          M6D4_CERTIFICATION_CASES.length,
        m6d4CertificationCredit:
          M6D4_CERTIFICATION_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6d4BenignControlCount:
          M6D4_CERTIFICATION_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6d4Results:
          m6d4Summary,
        m6d5UriEvasionCertificationComplete: true,
        m6d5CaseCount:
          M6D5_CERTIFICATION_CASES.length,
        m6d5CertificationCredit:
          M6D5_CERTIFICATION_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6d5BenignControlCount:
          M6D5_CERTIFICATION_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6d5IndirectSafeUriCompatibilityDeferredToM6G: true,
        m6d5Results:
          m6d5Summary,
        m6d5bEmbeddedContentRepairComplete: true,
        m6d5bCaseCount:
          M6D5B_CERTIFICATION_CASES.length,
        m6d5bCertificationCredit:
          M6D5B_CERTIFICATION_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6d5bBenignControlCount:
          M6D5B_CERTIFICATION_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6d5bResults:
          m6d5bSummary,
        m6dCertificationComplete: true,
        m6dCertifiedThreatFamilies,
        m6dCertifiedThreatFamilyCount:
          m6dCertifiedThreatFamilies.length,
        m6dCertificationCaseCount,
        m6dCertificationCredit,
        remainingM6dThreatFamilies,
        m6e1CertifiedThreatFamilies,
        m6e1CertificationComplete:
          m6e1CertifiedThreatFamilies.length === 2,
        m6e1CaseCount:
          M6E1_CERTIFICATION_CASES.length,
        m6e1CertificationCredit:
          M6E1_CERTIFICATION_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6e1BenignControlCount:
          M6E1_CERTIFICATION_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6e1Results:
          m6e1Summary,
        m6e1DirectoryConformanceRepairComplete: true,
        m6e1DirectoryRepairCaseCount:
          M6E1_DIRECTORY_REPAIR_CASES.length,
        m6e1DirectoryRepairCertificationCredit: 0,
        m6e1DirectoryRepairResults:
          m6e1DirectoryRepairSummary,
        m6e2aPowerPointPersistAuthorityRepairComplete: true,
        m6e2aAuthorityCaseCount:
          M6E2A_POWERPOINT_AUTHORITY_CASES.length,
        m6e2aAuthorityCredit:
          M6E2A_POWERPOINT_AUTHORITY_CASES.filter(
            (testCase) => testCase.authorityCredit,
          ).length,
        m6e2aBenignControlCount:
          M6E2A_POWERPOINT_AUTHORITY_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6e2aCurrentUserAuthorityRequired: true,
        m6e2aThreatFamilyCertificationGranted: false,
        m6e2aResults: m6e2aSummary,
        m6e2bLiveActiveContentCertificationComplete: true,
        m6e2bCertifiedThreatFamilies,
        m6e2bCaseCount: M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES.length,
        m6e2bCertificationCredit:
          M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6e2bBenignControlCount:
          M6E2B_POWERPOINT_ACTIVE_CONTENT_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6e2bStaleHistoricalBytesIgnored: true,
        m6e2bResults: m6e2bSummary,
        m6e3DirectoryCertificationComplete: true,
        m6e3CertifiedThreatFamilies,
        m6e3CaseCount: M6E3_DIRECTORY_CERTIFICATION_CASES.length,
        m6e3CertificationCredit:
          M6E3_DIRECTORY_CERTIFICATION_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6e3BenignControlCount:
          M6E3_DIRECTORY_CERTIFICATION_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6e3ComplexUnicodeComparatorCompatibilityDeferredToM6G: true,
        m6e3Results: m6e3Summary,
        m6eCertificationComplete: true,
        m6eCertifiedThreatFamilies: [
          ...m6e1CertifiedThreatFamilies,
          ...m6e2bCertifiedThreatFamilies,
          ...m6e3CertifiedThreatFamilies,
        ],
        remainingM6eThreatFamilies: [],
        oleDirectoryCertificationComplete: true,
        oleVbaCertificationComplete: true,
        oleEmbeddedObjectCertificationComplete: true,
        m6f1IdentityIntegrityCertificationComplete: true,
        m6f1CertifiedThreatFamilies,
        m6f1CaseCount:
          M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES.length,
        m6f1CertificationCredit:
          M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6f1BenignControlCount:
          M6F1_IDENTITY_INTEGRITY_CERTIFICATION_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6f1OwnedSnapshotBeforeHash: true,
        m6f1MutableBackingMutationInjected: true,
        m6f1Results: m6f1Summary,
        m6f2ResourceExhaustionCertificationComplete: true,
        m6f2CertifiedThreatFamilies,
        m6f2CaseCount:
          M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES.length,
        m6f2CertificationCredit:
          M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES.filter(
            (testCase) => testCase.certificationCredit,
          ).length,
        m6f2BenignControlCount:
          M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_CASES.filter(
            (testCase) => testCase.benignControl,
          ).length,
        m6f2SourceEmptyChunkBudgetEnforced: true,
        m6f2ResourceFamiliesExercised: [
          "SOURCE",
          "OOXML",
          "PDF",
          "OLE",
        ],
        m6f2Results: m6f2Summary,
        resourceExhaustionCertificationComplete: true,
        truncationCertificationComplete: false,
        ruleOrderDeterminismCertificationComplete: false,
        remainingNonPdfThreatFamilies,
        adversarialCertificationComplete: false,
        fullM6CertificationComplete: false,
        cleanAuthorityGranted: false,
        immutablePromotionAuthorityGranted: false,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        event:
          "HDS_M6F2_RESOURCE_EXHAUSTION_CERTIFICATION_FAILED",
        errorCode:
          error instanceof Error
            ? error.message
            : "M6F2_UNKNOWN_FAILURE",
      },
      null,
      2,
    ),
  );

  process.exitCode = 1;
});
