import type {
  NativeDocumentArchiveLimits,
  NativeDocumentOoxmlStructuralEvidence,
  NativeDocumentScannerReasonCode,
} from "./types";
import {
  decodeOoxmlXml,
  ooxmlTagAttributes,
  readOoxmlArchivePart,
  type OoxmlArchiveContext,
} from "./ooxmlArchiveInspector";

export type OoxmlStructuralInspectionResult =
  | {
      ok: true;
      evidence: NativeDocumentOoxmlStructuralEvidence;
    }
  | {
      ok: false;
      verdict: "BLOCKED" | "FAILED";
      reasonCode: NativeDocumentScannerReasonCode;
      message: string;
    };

type OoxmlStructuralInspectionFailure = Extract<
  OoxmlStructuralInspectionResult,
  { ok: false }
>;

const EXECUTABLE_PACKAGE_EXTENSIONS = new Set([
  "bat",
  "chm",
  "cmd",
  "com",
  "cpl",
  "dll",
  "exe",
  "hta",
  "jar",
  "js",
  "jse",
  "lnk",
  "msi",
  "ps1",
  "scr",
  "vbs",
  "wsf",
  "wsh",
]);

function blocked(
  reasonCode: NativeDocumentScannerReasonCode,
  message: string,
): OoxmlStructuralInspectionFailure {
  return {
    ok: false,
    verdict: "BLOCKED",
    reasonCode,
    message,
  };
}

function failed(
  reasonCode: NativeDocumentScannerReasonCode,
  message: string,
): OoxmlStructuralInspectionFailure {
  return {
    ok: false,
    verdict: "FAILED",
    reasonCode,
    message,
  };
}

function basenameExtension(path: string) {
  const basename = path.split("/").pop() ?? "";
  const dot = basename.lastIndexOf(".");

  if (dot <= 0 || dot === basename.length - 1) return null;
  return basename.slice(dot + 1).toLowerCase();
}

function packagePartPolicy(
  context: OoxmlArchiveContext,
): OoxmlStructuralInspectionFailure | null {
  for (const entry of context.entries) {
    const path = entry.normalizedName;
    const basename = path.split("/").pop() ?? "";

    if (
      basename === "vbaproject.bin" ||
      basename === "vbaproject.xml" ||
      basename === "vbadata.xml"
    ) {
      return blocked(
        "OOXML_VBA_PROJECT_BLOCKED",
        "A VBA project or VBA data part is not permitted in a macro-free institutional OOXML document.",
      );
    }

    if (
      path.startsWith("activex/") ||
      path.includes("/activex/")
    ) {
      return blocked(
        "OOXML_ACTIVEX_BLOCKED",
        "ActiveX package parts are not permitted in institutional OOXML documents.",
      );
    }

    if (
      path.startsWith("embeddings/") ||
      path.includes("/embeddings/")
    ) {
      return blocked(
        "OOXML_EMBEDDED_OBJECT_BLOCKED",
        "Embedded OLE or package objects are not permitted in institutional OOXML documents.",
      );
    }

    if (
      path.startsWith("xl/externallinks/") ||
      path.includes("/externallinks/")
    ) {
      return blocked(
        "OOXML_EXTERNAL_RELATIONSHIP_BLOCKED",
        "External workbook-link package parts are not permitted in institutional OOXML documents.",
      );
    }

    const extension = basenameExtension(path);

    if (
      extension &&
      EXECUTABLE_PACKAGE_EXTENSIONS.has(extension)
    ) {
      return blocked(
        "OOXML_EXECUTABLE_PACKAGE_PART_BLOCKED",
        "Executable or script-like package parts are not permitted in institutional OOXML documents.",
      );
    }
  }

  return null;
}

function contentTypePolicy(
  contentTypesXml: string,
): OoxmlStructuralInspectionFailure | null {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(contentTypesXml)) {
    return failed(
      "OOXML_CONTROL_XML_INVALID",
      "The OOXML content-types control part contains unsupported XML declarations.",
    );
  }

  const typeTags = contentTypesXml.match(
    /<(?:[A-Za-z_][A-Za-z0-9_.-]*:)?(?:Default|Override)\b[^>]*>/g,
  );

  for (const tag of typeTags ?? []) {
    const attributes = ooxmlTagAttributes(tag);
    const contentType = (
      attributes.get("ContentType") ?? ""
    )
      .trim()
      .toLowerCase();

    if (!contentType) continue;

    if (contentType.includes("macroenabled")) {
      return blocked(
        "OOXML_MACRO_ENABLED_CONTENT_TYPE_BLOCKED",
        "A macro-enabled OOXML content type is not permitted under DOCX/XLSX/PPTX policy.",
      );
    }

    if (
      contentType.includes("vbaproject") ||
      contentType.includes("vbadata")
    ) {
      return blocked(
        "OOXML_VBA_PROJECT_BLOCKED",
        "A VBA content type is not permitted in a macro-free institutional OOXML document.",
      );
    }

    if (contentType.includes("activex")) {
      return blocked(
        "OOXML_ACTIVEX_BLOCKED",
        "An ActiveX content type is not permitted in institutional OOXML documents.",
      );
    }

    if (contentType.includes("oleobject")) {
      return blocked(
        "OOXML_EMBEDDED_OBJECT_BLOCKED",
        "An embedded OLE-object content type is not permitted in institutional OOXML documents.",
      );
    }

    if (
      contentType.includes("x-msdownload") ||
      contentType.includes("portable-executable") ||
      contentType.includes("x-msdos-program")
    ) {
      return blocked(
        "OOXML_EXECUTABLE_PACKAGE_PART_BLOCKED",
        "An executable content type is not permitted in institutional OOXML documents.",
      );
    }
  }

  return null;
}

function relationshipsXmlLooksBounded(xml: string) {
  const trimmed = xml.trim();

  if (
    !trimmed ||
    /<!DOCTYPE\b|<!ENTITY\b/i.test(trimmed)
  ) {
    return false;
  }

  const opening = trimmed.match(
    /<(?:[A-Za-z_][A-Za-z0-9_.-]*:)?Relationships\b[^>]*>/,
  );

  if (!opening) return false;

  const openingText = opening[0];
  const selfClosing = /\/\s*>$/.test(openingText);

  if (selfClosing) return true;

  return /<\/(?:[A-Za-z_][A-Za-z0-9_.-]*:)?Relationships\s*>\s*$/.test(
    trimmed,
  );
}

function relationshipTypeKind(type: string) {
  const normalized = type.trim().toLowerCase();

  if (
    normalized.endsWith("/vbaproject") ||
    normalized.endsWith("/wordvbadata")
  ) {
    return "VBA" as const;
  }

  if (
    normalized.endsWith("/control") ||
    normalized.endsWith("/activexcontrolbinary")
  ) {
    return "ACTIVEX" as const;
  }

  if (normalized.endsWith("/oleobject")) {
    return "OLE" as const;
  }

  if (normalized.endsWith("/attachedtemplate")) {
    return "REMOTE_TEMPLATE" as const;
  }

  if (
    normalized.endsWith("/externallink") ||
    normalized.endsWith("/externallinkpath")
  ) {
    return "EXTERNAL_LINK" as const;
  }

  if (normalized.endsWith("/hyperlink")) {
    return "HYPERLINK" as const;
  }

  return "OTHER" as const;
}

function hasAbsoluteUriScheme(target: string) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target.trim());
}

function isAllowedExternalHyperlink(target: string) {
  const normalized = target.trim().toLowerCase();

  return (
    normalized.startsWith("https://") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("mailto:")
  );
}

function relationshipPolicy(args: {
  bytes: Buffer;
  context: OoxmlArchiveContext;
  limits: NativeDocumentArchiveLimits;
}):
  | {
      ok: true;
      relationshipPartsInspected: number;
      relationshipsInspected: number;
      externalHyperlinksObserved: number;
    }
  | OoxmlStructuralInspectionFailure {
  const relationshipParts = args.context.entries.filter(
    (entry) => entry.normalizedName.endsWith(".rels"),
  );

  let relationshipsInspected = 0;
  let externalHyperlinksObserved = 0;

  for (const entry of relationshipParts) {
    if (
      entry.uncompressedSize > args.limits.maxControlPartBytes
    ) {
      return blocked(
        "OOXML_RELATIONSHIP_PART_TOO_LARGE",
        "An OOXML relationship part exceeds the configured bounded-control-part limit.",
      );
    }

    const part = readOoxmlArchivePart({
      bytes: args.bytes,
      entry,
      maxControlPartBytes: args.limits.maxControlPartBytes,
    });

    if (!part.ok) {
      return {
        ok: false,
        verdict: part.verdict,
        reasonCode: part.reasonCode,
        message: part.message,
      };
    }

    const xml = decodeOoxmlXml(part.bytes);

    if (!xml || !relationshipsXmlLooksBounded(xml)) {
      return failed(
        "OOXML_RELATIONSHIP_XML_INVALID",
        "An OOXML relationship part is not valid bounded relationship XML.",
      );
    }

    const relationshipTags = xml.match(
      /<(?:[A-Za-z_][A-Za-z0-9_.-]*:)?Relationship\b[^>]*>/g,
    );

    for (const tag of relationshipTags ?? []) {
      const attributes = ooxmlTagAttributes(tag);
      const type = (attributes.get("Type") ?? "").trim();
      const target = (attributes.get("Target") ?? "").trim();
      const targetMode = (
        attributes.get("TargetMode") ?? ""
      )
        .trim()
        .toLowerCase();

      relationshipsInspected += 1;

      if (
        !type ||
        !target ||
        type.length > 2048 ||
        target.length > 4096 ||
        /[\u0000-\u001f\u007f]/.test(type) ||
        /[\u0000-\u001f\u007f]/.test(target)
      ) {
        return blocked(
          "OOXML_RELATIONSHIP_TARGET_INVALID",
          "An OOXML relationship contains invalid bounded metadata.",
        );
      }

      const kind = relationshipTypeKind(type);

      if (kind === "VBA") {
        return blocked(
          "OOXML_VBA_PROJECT_BLOCKED",
          "A VBA relationship is not permitted in a macro-free institutional OOXML document.",
        );
      }

      if (kind === "ACTIVEX") {
        return blocked(
          "OOXML_ACTIVEX_BLOCKED",
          "An ActiveX relationship is not permitted in institutional OOXML documents.",
        );
      }

      if (kind === "OLE") {
        return blocked(
          "OOXML_EMBEDDED_OBJECT_BLOCKED",
          "An OLE-object relationship is not permitted in institutional OOXML documents.",
        );
      }

      if (kind === "REMOTE_TEMPLATE") {
        return blocked(
          "OOXML_REMOTE_TEMPLATE_BLOCKED",
          "Attached or remote template relationships are not permitted in institutional OOXML documents.",
        );
      }

      if (kind === "EXTERNAL_LINK") {
        return blocked(
          "OOXML_EXTERNAL_RELATIONSHIP_BLOCKED",
          "External workbook or document-link relationships are not permitted in institutional OOXML documents.",
        );
      }

      if (targetMode === "external") {
        if (
          kind === "HYPERLINK" &&
          isAllowedExternalHyperlink(target)
        ) {
          externalHyperlinksObserved += 1;
          continue;
        }

        return blocked(
          "OOXML_EXTERNAL_RELATIONSHIP_BLOCKED",
          "External OOXML relationships other than ordinary HTTP(S)/mailto hyperlinks are not permitted.",
        );
      }

      if (
        targetMode &&
        targetMode !== "internal"
      ) {
        return blocked(
          "OOXML_RELATIONSHIP_TARGET_INVALID",
          "An OOXML relationship has an unsupported target mode.",
        );
      }

      if (hasAbsoluteUriScheme(target)) {
        return blocked(
          "OOXML_RELATIONSHIP_TARGET_INVALID",
          "An internal OOXML relationship cannot use an absolute URI target.",
        );
      }
    }
  }

  return {
    ok: true,
    relationshipPartsInspected: relationshipParts.length,
    relationshipsInspected,
    externalHyperlinksObserved,
  };
}

export function inspectOoxmlStructuralSecurity(args: {
  bytes: Buffer;
  context: OoxmlArchiveContext;
  limits: NativeDocumentArchiveLimits;
}): OoxmlStructuralInspectionResult {
  const packagePartFailure = packagePartPolicy(args.context);

  if (packagePartFailure) return packagePartFailure;

  const contentTypeFailure = contentTypePolicy(
    args.context.contentTypesXml,
  );

  if (contentTypeFailure) return contentTypeFailure;

  const relationships = relationshipPolicy(args);

  if (!relationships.ok) return relationships;

  return {
    ok: true,
    evidence: {
      relationshipPartsInspected:
        relationships.relationshipPartsInspected,
      relationshipsInspected:
        relationships.relationshipsInspected,
      externalHyperlinksObserved:
        relationships.externalHyperlinksObserved,
      contentTypePolicyVerified: true,
      relationshipPolicyVerified: true,
      packagePartPolicyVerified: true,
      vbaProjectDetected: false,
      macroEnabledContentTypeDetected: false,
      activeXDetected: false,
      embeddedObjectDetected: false,
      blockedExternalRelationshipDetected: false,
      remoteTemplateDetected: false,
      executablePackagePartDetected: false,
    },
  };
}
