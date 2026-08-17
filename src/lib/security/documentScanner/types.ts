export type NativeDocumentByteSource =
  | AsyncIterable<Uint8Array>
  | Iterable<Uint8Array>;

export type NativeDocumentExtension =
  | "pdf"
  | "doc"
  | "docx"
  | "ppt"
  | "pptx"
  | "xls"
  | "xlsx";

export type NativeDocumentContainer =
  | "PDF"
  | "ZIP"
  | "OLE"
  | "EXECUTABLE"
  | "UNKNOWN";

export type NativeDocumentFormat =
  | "PDF"
  | "ZIP_CONTAINER"
  | "WORD_OOXML"
  | "POWERPOINT_OOXML"
  | "EXCEL_OOXML"
  | "OLE_COMPOUND_FILE"
  | "WORD_BINARY"
  | "EXCEL_BINARY"
  | "POWERPOINT_BINARY"
  | "UNKNOWN";

/**
 * M4 still deliberately has no CLEAN verdict.
 *
 * IDENTITY_VERIFIED means that byte integrity and broad container identity have
 * been established, the applicable bounded structural parser completed, and
 * the versioned Hehxagon ingress rule pack found no prohibited structural
 * capability. It is still not a sendable or malware-clean state. Worker
 * integration and adversarial validation remain later milestones.
 */
export type NativeDocumentScannerVerdict =
  | "IDENTITY_VERIFIED"
  | "BLOCKED"
  | "FAILED";

export type NativeDocumentScannerReasonCode =
  | "IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED"
  | "OOXML_PACKAGE_IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED"
  | "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED"
  | "SCANNER_INPUT_INVALID"
  | "FILENAME_INVALID"
  | "FILENAME_EXTENSION_MISMATCH"
  | "UNSUPPORTED_EXTENSION"
  | "DECLARED_MIME_TYPE_MISMATCH"
  | "EMPTY_SOURCE"
  | "SOURCE_CHUNK_INVALID"
  | "SOURCE_READ_FAILED"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "SIZE_EXCEEDS_EXPECTED"
  | "SIZE_MISMATCH"
  | "SHA256_MISMATCH"
  | "EXECUTABLE_SIGNATURE_DETECTED"
  | "BINARY_SIGNATURE_UNSUPPORTED"
  | "EXTENSION_CONTAINER_MISMATCH"
  | "OOXML_ARCHIVE_LIMITS_REQUIRED"
  | "ZIP_END_OF_CENTRAL_DIRECTORY_MISSING"
  | "ZIP_MULTI_DISK_UNSUPPORTED"
  | "ZIP64_UNSUPPORTED"
  | "ZIP_CENTRAL_DIRECTORY_INVALID"
  | "ZIP_ENTRY_COUNT_LIMIT_EXCEEDED"
  | "ZIP_ENTRY_NAME_ENCODING_UNSUPPORTED"
  | "ZIP_ENTRY_PATH_INVALID"
  | "ZIP_ENTRY_PATH_TRAVERSAL"
  | "ZIP_ENTRY_ABSOLUTE_PATH"
  | "ZIP_DUPLICATE_ENTRY"
  | "ZIP_ENTRY_ENCRYPTED"
  | "ZIP_COMPRESSION_METHOD_UNSUPPORTED"
  | "ZIP_ENTRY_SIZE_LIMIT_EXCEEDED"
  | "ZIP_TOTAL_EXPANDED_SIZE_LIMIT_EXCEEDED"
  | "ZIP_COMPRESSION_RATIO_LIMIT_EXCEEDED"
  | "ZIP_LOCAL_HEADER_INVALID"
  | "ZIP_ENTRY_DATA_OVERLAP"
  | "OOXML_CONTENT_TYPES_MISSING"
  | "OOXML_ROOT_RELATIONSHIPS_MISSING"
  | "OOXML_CONTROL_PART_TOO_LARGE"
  | "OOXML_CONTROL_PART_DECOMPRESSION_FAILED"
  | "OOXML_CONTROL_PART_SIZE_MISMATCH"
  | "OOXML_CONTROL_PART_CRC_MISMATCH"
  | "OOXML_CONTROL_XML_INVALID"
  | "OOXML_MAIN_DOCUMENT_RELATIONSHIP_MISSING"
  | "OOXML_MAIN_DOCUMENT_RELATIONSHIP_AMBIGUOUS"
  | "OOXML_MAIN_DOCUMENT_RELATIONSHIP_EXTERNAL"
  | "OOXML_MAIN_DOCUMENT_PART_MISSING"
  | "OOXML_MAIN_DOCUMENT_CONTENT_TYPE_MISMATCH"
  | "OOXML_APPLICATION_MISMATCH"
  | "OOXML_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED"
  | "OOXML_RELATIONSHIP_PART_TOO_LARGE"
  | "OOXML_RELATIONSHIP_XML_INVALID"
  | "OOXML_RELATIONSHIP_TARGET_INVALID"
  | "OOXML_VBA_PROJECT_BLOCKED"
  | "OOXML_MACRO_ENABLED_CONTENT_TYPE_BLOCKED"
  | "OOXML_ACTIVEX_BLOCKED"
  | "OOXML_EMBEDDED_OBJECT_BLOCKED"
  | "OOXML_EXTERNAL_RELATIONSHIP_BLOCKED"
  | "OOXML_REMOTE_TEMPLATE_BLOCKED"
  | "OOXML_EXECUTABLE_PACKAGE_PART_BLOCKED"
  | "PDF_LIMITS_REQUIRED"
  | "PDF_HEADER_INVALID"
  | "PDF_STARTXREF_MISSING"
  | "PDF_STARTXREF_INVALID"
  | "PDF_XREF_TABLE_INVALID"
  | "PDF_STREAM_FILTER_UNSUPPORTED"
  | "PDF_STREAM_DECODE_PARAMETERS_UNSUPPORTED"
  | "PDF_STREAM_DECOMPRESSION_FAILED"
  | "PDF_STREAM_DECODE_LIMIT_EXCEEDED"
  | "PDF_XREF_STREAM_DICTIONARY_INVALID"
  | "PDF_XREF_STREAM_W_INVALID"
  | "PDF_XREF_STREAM_INDEX_INVALID"
  | "PDF_XREF_STREAM_ENTRY_INVALID"
  | "PDF_OBJECT_STREAM_DICTIONARY_INVALID"
  | "PDF_OBJECT_STREAM_OBJECT_LIMIT_EXCEEDED"
  | "PDF_OBJECT_STREAM_HEADER_INVALID"
  | "PDF_OBJECT_STREAM_INDEX_INVALID"
  | "PDF_COMPRESSED_OBJECT_REFERENCE_INVALID"
  | "PDF_INCREMENTAL_UPDATE_LIMIT_EXCEEDED"
  | "PDF_OBJECT_COUNT_LIMIT_EXCEEDED"
  | "PDF_OBJECT_OFFSET_INVALID"
  | "PDF_OBJECT_SYNTAX_INVALID"
  | "PDF_OBJECT_NESTING_LIMIT_EXCEEDED"
  | "PDF_TOKEN_LIMIT_EXCEEDED"
  | "PDF_STRING_LIMIT_EXCEEDED"
  | "PDF_STREAM_LENGTH_INVALID"
  | "PDF_STREAM_BOUNDARY_INVALID"
  | "PDF_ROOT_CATALOG_MISSING"
  | "PDF_PAGE_TREE_MISSING"
  | "PDF_ENCRYPTED_BLOCKED"
  | "PDF_JAVASCRIPT_BLOCKED"
  | "PDF_OPEN_ACTION_BLOCKED"
  | "PDF_ADDITIONAL_ACTION_BLOCKED"
  | "PDF_LAUNCH_ACTION_BLOCKED"
  | "PDF_EMBEDDED_FILE_BLOCKED"
  | "PDF_RICH_MEDIA_BLOCKED"
  | "PDF_XFA_BLOCKED"
  | "PDF_EXTERNAL_ACTION_BLOCKED"
  | "PDF_UNSAFE_URI_ACTION_BLOCKED"
  | "PDF_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED"
  | "OLE_LIMITS_REQUIRED"
  | "OLE_HEADER_INVALID"
  | "OLE_VERSION_UNSUPPORTED"
  | "OLE_SECTOR_GEOMETRY_INVALID"
  | "OLE_DIFAT_LIMIT_EXCEEDED"
  | "OLE_DIFAT_INVALID"
  | "OLE_FAT_LIMIT_EXCEEDED"
  | "OLE_FAT_INVALID"
  | "OLE_MINIFAT_LIMIT_EXCEEDED"
  | "OLE_MINIFAT_INVALID"
  | "OLE_SECTOR_CHAIN_LIMIT_EXCEEDED"
  | "OLE_SECTOR_CHAIN_LOOP"
  | "OLE_SECTOR_OWNERSHIP_CONFLICT"
  | "OLE_DIRECTORY_INVALID"
  | "OLE_DIRECTORY_ENTRY_LIMIT_EXCEEDED"
  | "OLE_DIRECTORY_TREE_INVALID"
  | "OLE_DIRECTORY_DEPTH_LIMIT_EXCEEDED"
  | "OLE_STREAM_COUNT_LIMIT_EXCEEDED"
  | "OLE_STREAM_SIZE_LIMIT_EXCEEDED"
  | "OLE_TOTAL_STREAM_SIZE_LIMIT_EXCEEDED"
  | "OLE_STREAM_CHAIN_INVALID"
  | "OLE_MINISTREAM_INVALID"
  | "OLE_APPLICATION_STREAM_MISSING"
  | "OLE_APPLICATION_MISMATCH"
  | "OLE_VBA_PROJECT_BLOCKED"
  | "OLE_EMBEDDED_OBJECT_BLOCKED"
  | "OLE_ENCRYPTED_PACKAGE_BLOCKED"
  | "OLE_EXECUTABLE_STREAM_BLOCKED"
  | "OLE_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED";

export type NativeDocumentScannerFinding = {
  code: NativeDocumentScannerReasonCode;
  severity: "INFO" | "BLOCK" | "ERROR";
  message: string;
};

/**
 * M2 archive limits are caller-supplied policy, not hidden parser defaults.
 * The scanner therefore cannot silently widen decompression/resource limits.
 */
export type NativeDocumentArchiveLimits = {
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxControlPartBytes: number;
};

export type NativeDocumentPdfLimits = {
  maxObjects: number;
  maxIncrementalUpdates: number;
  maxNestingDepth: number;
  maxTokenBytes: number;
  maxStringBytes: number;

  /** Maximum decoded bytes permitted for any single cross-reference stream. */
  maxDecodedXrefStreamBytes: number;

  /** Maximum decoded bytes permitted for any single object stream. */
  maxDecodedObjectStreamBytes: number;

  /** Maximum number of contained objects declared by a single object stream. */
  maxObjectsPerObjectStream: number;
};

export type NativeDocumentOleLimits = {
  maxDirectoryEntries: number;
  maxDirectoryDepth: number;
  maxFatSectors: number;
  maxDifatSectors: number;
  maxMiniFatSectors: number;
  maxSectorChainLength: number;
  maxStreams: number;
  maxStreamBytes: number;
  maxTotalStreamBytes: number;
};

export type NativeDocumentScannerLimits = {
  /** Maximum number of compressed/source bytes the scanner may consume. */
  maxBytes: number;

  /** Required for DOCX/XLSX/PPTX beginning with M2. */
  archive?: NativeDocumentArchiveLimits;

  /** Required for PDF structural inspection beginning with M3B1 and extended in M3B2. */
  pdf?: NativeDocumentPdfLimits;

  /** Required for legacy DOC/XLS/PPT compound-file inspection beginning with M3C. */
  ole?: NativeDocumentOleLimits;
};

export type NativeDocumentScannerInput = {
  source: NativeDocumentByteSource;
  expectedSizeBytes: number;
  expectedSha256: string;
  declaredFilename: string;
  declaredExtension: string;
  declaredMimeType: string;
  limits: NativeDocumentScannerLimits;
};

export type NativeDocumentIdentityEvidence = {
  filenameExtension: string | null;
  declaredExtension: string | null;
  declaredMimeType: string | null;
  detectedContainer: NativeDocumentContainer;
  detectedFormat: NativeDocumentFormat;
  signatureKind:
    | "PDF_HEADER"
    | "ZIP_SIGNATURE"
    | "OLE_COMPOUND_FILE_SIGNATURE"
    | "PE_EXECUTABLE_SIGNATURE"
    | "ELF_EXECUTABLE_SIGNATURE"
    | "UNKNOWN";
  sizeMatched: boolean;
  sha256Matched: boolean;
};

export type NativeDocumentArchiveEvidence = {
  entryCount: number;
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;

  packageFormat:
    | "WORD_OOXML"
    | "POWERPOINT_OOXML"
    | "EXCEL_OOXML";
  mainPartPath:
    | "word/document.xml"
    | "ppt/presentation.xml"
    | "xl/workbook.xml";

  contentTypesPartVerified: true;
  rootRelationshipsPartVerified: true;
  mainPartPresent: true;

  zip64: false;
  multiDisk: false;
  encryptedEntriesDetected: false;
  duplicatePathsDetected: false;
  pathTraversalDetected: false;
};

export type NativeDocumentOoxmlStructuralEvidence = {
  relationshipPartsInspected: number;
  relationshipsInspected: number;
  externalHyperlinksObserved: number;

  contentTypePolicyVerified: true;
  relationshipPolicyVerified: true;
  packagePartPolicyVerified: true;

  vbaProjectDetected: boolean;
  macroEnabledContentTypeDetected: boolean;
  activeXDetected: boolean;
  embeddedObjectDetected: boolean;
  blockedExternalRelationshipDetected: boolean;
  remoteTemplateDetected: boolean;
  executablePackagePartDetected: boolean;
};

export type NativeDocumentPdfStructuralEvidence = {
  pdfVersion: "1.0" | "1.1" | "1.2" | "1.3" | "1.4" | "1.5" | "1.6" | "1.7" | "2.0";
  xrefSections: number;
  activeObjectCount: number;
  incrementalUpdates: number;
  safeUriActionsObserved: number;

  encrypted: boolean;
  xrefStreamsDetected: boolean;
  objectStreamsDetected: boolean;
  xrefStreamCount: number;
  objectStreamCount: number;
  compressedObjectCount: number;
  catalogVerified: boolean;
  pageTreeRootVerified: boolean;

  javascriptDetected: boolean;
  openActionDetected: boolean;
  additionalActionDetected: boolean;
  launchActionDetected: boolean;
  embeddedFileDetected: boolean;
  richMediaDetected: boolean;
  xfaDetected: boolean;
  blockedExternalActionDetected: boolean;
  unsafeUriActionDetected: boolean;
};

export type NativeDocumentOleStructuralEvidence = {
  majorVersion: 3 | 4;
  sectorSize: 512 | 4096;
  miniSectorSize: 64;
  fatSectorCount: number;
  difatSectorCount: number;
  miniFatSectorCount: number;
  directoryEntryCount: number;
  streamCount: number;
  totalDeclaredStreamBytes: number;
  applicationFormat: "WORD_BINARY" | "EXCEL_BINARY" | "POWERPOINT_BINARY";
  applicationStreamVerified: true;
  vbaProjectDetected: boolean;
  embeddedObjectDetected: boolean;
  encryptedPackageDetected: boolean;
  executableStreamDetected: boolean;
  sectorOwnershipVerified: true;
  directoryTreeVerified: true;
};

export type NativeDocumentSecurityEvidenceFamily =
  | "OOXML"
  | "PDF"
  | "OLE";

export type NativeDocumentSecurityRuleId =
  | "HDS-OOXML-001-VBA"
  | "HDS-OOXML-002-MACRO-CONTENT-TYPE"
  | "HDS-OOXML-003-ACTIVEX"
  | "HDS-OOXML-004-EMBEDDED-OBJECT"
  | "HDS-OOXML-005-EXTERNAL-RELATIONSHIP"
  | "HDS-OOXML-006-REMOTE-TEMPLATE"
  | "HDS-OOXML-007-EXECUTABLE-PART"
  | "HDS-PDF-001-ENCRYPTED"
  | "HDS-PDF-002-JAVASCRIPT"
  | "HDS-PDF-003-OPEN-ACTION"
  | "HDS-PDF-004-ADDITIONAL-ACTION"
  | "HDS-PDF-005-LAUNCH-ACTION"
  | "HDS-PDF-006-EMBEDDED-FILE"
  | "HDS-PDF-007-RICH-MEDIA"
  | "HDS-PDF-008-XFA"
  | "HDS-PDF-009-EXTERNAL-ACTION"
  | "HDS-PDF-010-UNSAFE-URI"
  | "HDS-OLE-001-VBA"
  | "HDS-OLE-002-EMBEDDED-OBJECT"
  | "HDS-OLE-003-ENCRYPTED-PACKAGE"
  | "HDS-OLE-004-EXECUTABLE-STREAM";

export type NativeDocumentSecurityRuleMatch = {
  ruleId: NativeDocumentSecurityRuleId;
  family: NativeDocumentSecurityEvidenceFamily;
  reasonCode: NativeDocumentScannerReasonCode;
  severity: "BLOCK";
  message: string;
};

export type NativeDocumentSecurityRulePackEvaluation = {
  rulePackId: "HEHXAGON_BASELINE_DOCUMENT_INGRESS";
  rulePackVersion: string;
  outcome: "PASS" | "BLOCK";
  evidenceFamily: NativeDocumentSecurityEvidenceFamily;
  matchedRules: readonly NativeDocumentSecurityRuleMatch[];
};

export type NativeDocumentScannerResult = {
  engine: "HEHXAGON_DOCUMENT_SECURITY";
  engineVersion: string;
  rulePackVersion: string;
  rulePackEvaluationComplete: boolean;
  rulePackEvaluation: NativeDocumentSecurityRulePackEvaluation | null;

  verdict: NativeDocumentScannerVerdict;
  reasonCodes: NativeDocumentScannerReasonCode[];
  findings: NativeDocumentScannerFinding[];

  bytesScanned: number;
  sha256Hash: string | null;

  identityInspectionComplete: boolean;
  archiveInspectionComplete: boolean;
  archiveEvidence: NativeDocumentArchiveEvidence | null;

  /** True only when the M3A OOXML structural policy ran to completion. */
  ooxmlStructuralInspectionComplete: boolean;
  ooxmlStructuralEvidence: NativeDocumentOoxmlStructuralEvidence | null;

  /** True only when the M3B2 bounded PDF structural policy ran to completion. */
  pdfStructuralInspectionComplete: boolean;
  pdfStructuralEvidence: NativeDocumentPdfStructuralEvidence | null;

  /** True only when the M3C bounded OLE/CFBF structural policy ran to completion. */
  oleStructuralInspectionComplete: boolean;
  oleStructuralEvidence: NativeDocumentOleStructuralEvidence | null;

  /**
   * Always false through M4. The rule pack is now evaluated, but worker
   * integration and adversarial certification remain before full document trust.
   */
  inspectionComplete: false;

  identityEvidence: NativeDocumentIdentityEvidence;
};
