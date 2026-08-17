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

type OoxmlThreatSignals = {
  vbaProjectDetected: boolean;
  macroEnabledContentTypeDetected: boolean;
  activeXDetected: boolean;
  embeddedObjectDetected: boolean;
  blockedExternalRelationshipDetected: boolean;
  remoteTemplateDetected: boolean;
  executablePackagePartDetected: boolean;
};

function blankThreatSignals(): OoxmlThreatSignals {
  return {
    vbaProjectDetected: false,
    macroEnabledContentTypeDetected: false,
    activeXDetected: false,
    embeddedObjectDetected: false,
    blockedExternalRelationshipDetected: false,
    remoteTemplateDetected: false,
    executablePackagePartDetected: false,
  };
}

function packagePartEvidence(
  context: OoxmlArchiveContext,
): OoxmlThreatSignals {
  const signals = blankThreatSignals();

  for (const entry of context.entries) {
    const path = entry.normalizedName;
    const basename = path.split("/").pop() ?? "";

    if (
      basename === "vbaproject.bin" ||
      basename === "vbaproject.xml" ||
      basename === "vbadata.xml"
    ) {
      signals.vbaProjectDetected = true;
    }

    if (
      path.startsWith("activex/") ||
      path.includes("/activex/")
    ) {
      signals.activeXDetected = true;
    }

    if (
      path.startsWith("embeddings/") ||
      path.includes("/embeddings/")
    ) {
      signals.embeddedObjectDetected = true;
    }

    if (
      path.startsWith("xl/externallinks/") ||
      path.includes("/externallinks/")
    ) {
      signals.blockedExternalRelationshipDetected = true;
    }

    const extension = basenameExtension(path);

    if (
      extension &&
      EXECUTABLE_PACKAGE_EXTENSIONS.has(extension)
    ) {
      signals.executablePackagePartDetected = true;
    }
  }

  return signals;
}

function contentTypeEvidence(
  contentTypesXml: string,
): OoxmlThreatSignals | OoxmlStructuralInspectionFailure {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(contentTypesXml)) {
    return failed(
      "OOXML_CONTROL_XML_INVALID",
      "The OOXML content-types control part contains unsupported XML declarations.",
    );
  }

  const signals = blankThreatSignals();
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
      signals.macroEnabledContentTypeDetected = true;
    }

    if (
      contentType.includes("vbaproject") ||
      contentType.includes("vbadata")
    ) {
      signals.vbaProjectDetected = true;
    }

    if (contentType.includes("activex")) {
      signals.activeXDetected = true;
    }

    if (contentType.includes("oleobject")) {
      signals.embeddedObjectDetected = true;
    }

    if (
      contentType.includes("x-msdownload") ||
      contentType.includes("portable-executable") ||
      contentType.includes("x-msdos-program")
    ) {
      signals.executablePackagePartDetected = true;
    }
  }

  return signals;
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

function relationshipEvidence(args: {
  bytes: Buffer;
  context: OoxmlArchiveContext;
  limits: NativeDocumentArchiveLimits;
}):
  | {
      ok: true;
      relationshipPartsInspected: number;
      relationshipsInspected: number;
      externalHyperlinksObserved: number;
      signals: OoxmlThreatSignals;
    }
  | OoxmlStructuralInspectionFailure {
  const relationshipParts = args.context.entries.filter(
    (entry) => entry.normalizedName.endsWith(".rels"),
  );

  let relationshipsInspected = 0;
  let externalHyperlinksObserved = 0;
  const signals = blankThreatSignals();

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

      if (kind === "VBA") signals.vbaProjectDetected = true;
      if (kind === "ACTIVEX") signals.activeXDetected = true;
      if (kind === "OLE") signals.embeddedObjectDetected = true;
      if (kind === "REMOTE_TEMPLATE") signals.remoteTemplateDetected = true;
      if (kind === "EXTERNAL_LINK") {
        signals.blockedExternalRelationshipDetected = true;
      }

      if (targetMode === "external") {
        if (
          kind === "HYPERLINK" &&
          isAllowedExternalHyperlink(target)
        ) {
          externalHyperlinksObserved += 1;
          continue;
        }

        if (kind !== "REMOTE_TEMPLATE") {
          signals.blockedExternalRelationshipDetected = true;
        }
        continue;
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
    signals,
  };
}

export function inspectOoxmlStructuralSecurity(args: {
  bytes: Buffer;
  context: OoxmlArchiveContext;
  limits: NativeDocumentArchiveLimits;
}): OoxmlStructuralInspectionResult {
  const packageSignals = packagePartEvidence(args.context);
  const contentTypeSignals = contentTypeEvidence(
    args.context.contentTypesXml,
  );

  if ("ok" in contentTypeSignals) return contentTypeSignals;

  const relationships = relationshipEvidence(args);
  if (!relationships.ok) return relationships;

  const signals: OoxmlThreatSignals = {
    vbaProjectDetected:
      packageSignals.vbaProjectDetected ||
      contentTypeSignals.vbaProjectDetected ||
      relationships.signals.vbaProjectDetected,
    macroEnabledContentTypeDetected:
      contentTypeSignals.macroEnabledContentTypeDetected,
    activeXDetected:
      packageSignals.activeXDetected ||
      contentTypeSignals.activeXDetected ||
      relationships.signals.activeXDetected,
    embeddedObjectDetected:
      packageSignals.embeddedObjectDetected ||
      contentTypeSignals.embeddedObjectDetected ||
      relationships.signals.embeddedObjectDetected,
    blockedExternalRelationshipDetected:
      packageSignals.blockedExternalRelationshipDetected ||
      relationships.signals.blockedExternalRelationshipDetected,
    remoteTemplateDetected:
      relationships.signals.remoteTemplateDetected,
    executablePackagePartDetected:
      packageSignals.executablePackagePartDetected ||
      contentTypeSignals.executablePackagePartDetected,
  };

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
      ...signals,
    },
  };
}
