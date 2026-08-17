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
    | "CERTIFIED_M6D3";
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
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Represent prohibited PDF actions through indirect, nested, encoded and revision-dependent structures.",
    }),
    Object.freeze({
      threatFamily: "PDF_URI_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Challenge URI normalization and allowed-scheme boundaries with encoded and ambiguous targets.",
    }),
    Object.freeze({
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Hide files, rich media or executable-like payload capability behind indirect structural references.",
    }),
    Object.freeze({
      threatFamily: "OLE_FAT_DIFAT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Attack FAT/DIFAT ownership, marker consistency, chain termination and sector aliasing.",
    }),
    Object.freeze({
      threatFamily: "OLE_MINIFAT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Attack MiniFAT chains, root mini-stream bounds, mini-sector aliasing and declared-size semantics.",
    }),
    Object.freeze({
      threatFamily: "OLE_DIRECTORY_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Challenge directory reachability, sibling trees, duplicate names, parentage and application identity.",
    }),
    Object.freeze({
      threatFamily: "OLE_VBA_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Hide VBA capability through alternate storage names, paths and stream arrangements.",
    }),
    Object.freeze({
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Hide package and OLE-native embedded-object capability through alternate directory layouts.",
    }),
    Object.freeze({
      threatFamily: "RESOURCE_EXHAUSTION",
      plannedPhase: "M6F",
      certificationStatus: "NOT_CERTIFIED",
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
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Challenge expected size and SHA-256 integrity contracts across fragmented and inconsistent sources.",
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
      "0.4.5-m6d3",
    "M6D3 must run the bounded PDF object-stream authority repair while preserving the M4 rule pack.",
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

async function run() {
  validateManifest();
  validateCaseContract();
  validateM6BCertificationCases();
  validateM6CCertificationCases();
  validateM6D2CertificationCases();
  validateM6D3CertificationCases();
  validateRulePackBoundary();

  const sentinelResults = await executeSentinels();
  const m6b = await executeM6BCertification();
  const m6c = await executeM6CCertification();
  const m6d1 = await executeM6D1ParserAmbiguityRepair();
  const m6d2 = await executeM6D2RevisionXrefAuthorityCertification();
  const m6d3 = await executeM6D3ObjectStreamEvasionCertification();

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
    m6dThreatFamilies.length === 6 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "CERTIFIED_M6D2",
      ).length === 2 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "CERTIFIED_M6D3",
      ).length === 1 &&
      m6dThreatFamilies.filter(
        (entry) => entry.certificationStatus === "NOT_CERTIFIED",
      ).length === 3,
    "M6D3 must leave exactly the action, URI and embedded-content PDF evasion families uncertified.",
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
      ),
    "M6 execution must never grant CLEAN or completed document-trust authority.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        event:
          "HDS_M6D3_PDF_OBJECT_STREAM_EVASION_CERTIFICATION_PASSED",
        corpusSchemaVersion:
          HDS_M6_ADVERSARIAL_CORPUS_SCHEMA_VERSION,
        harnessVersion:
          HDS_M6D3_HARNESS_VERSION,
        priorHarnessVersion:
          HDS_M6D2_HARNESS_VERSION,
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
        m6dCertificationComplete: false,
        remainingM6dThreatFamilies:
          m6dThreatFamilies
            .filter(
              (entry) => entry.certificationStatus === "NOT_CERTIFIED",
            )
            .map((entry) => entry.threatFamily),
        adversarialCertificationComplete: false,
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
          "HDS_M6D3_PDF_OBJECT_STREAM_EVASION_CERTIFICATION_FAILED",
        errorCode:
          error instanceof Error
            ? error.message
            : "M6D3_UNKNOWN_FAILURE",
      },
      null,
      2,
    ),
  );

  process.exitCode = 1;
});
