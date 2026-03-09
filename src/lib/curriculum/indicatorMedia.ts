// src/lib/curriculum/indicatorMedia.ts
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/media";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function dotBaseFromIndicatorCode(codeRaw: unknown) {
  // Examples:
  // "B5 1.1.1.1" -> "B5.1.1.1"
  // "CA1 1.1.1"  -> "CA1.1.1.1"
  const s = clean(codeRaw).replace(/\s+/g, " ");
  if (!s) return "";
  return s.replace(/\s+/g, "."); // keep dots as-is, just convert spaces to dots
}

function scorePath(pathRaw: unknown, canonicalBase: string) {
  const p = clean(pathRaw);
  if (!p) return -999;

  const lower = p.toLowerCase();
  const canonicalPng = canonicalBase ? `${canonicalBase}.png`.toLowerCase() : "";
  const canonicalWebp = canonicalBase ? `${canonicalBase}.webp`.toLowerCase() : "";

  let score = 0;

  // Strongest: canonical filename match
  if (canonicalPng && lower.endsWith(canonicalPng)) score += 120;
  else if (canonicalWebp && lower.endsWith(canonicalWebp)) score += 110;

  // Prefer R2 / CDN-ish URLs or bucket-like paths
  if (lower.includes(".r2.dev") || lower.includes("r2.dev")) score += 30;
  if (lower.startsWith("lower-primary/") || lower.startsWith("upper-primary/") || lower.startsWith("kg/")) score += 18;
  if (lower.startsWith("curriculum/") || lower.startsWith("/curriculum/")) score += 10;

  // Prefer common image formats
  if (lower.endsWith(".png")) score += 6;
  if (lower.endsWith(".webp")) score += 4;

  return score;
}

export type IndicatorImagePick = {
  href: string;
  imagePath: string;
  altText: string | null;
  mediaId: string | null;
  candidates: number;
};

export async function pickIndicatorImage(args: {
  indicatorId: string | null;
  indicatorCode: string | null;
  contentStandardCode?: string | null;
}): Promise<{ ok: true; pick: IndicatorImagePick | null } | { ok: false; error: string }> {
  try {
    const indicatorId = clean(args.indicatorId);
    const indicatorCode = clean(args.indicatorCode);

    // ✅ Bank-grade rule: if we don't have indicatorId, we do NOT guess by code.
    // (Code duplicates across subjects; your SQL proves it.)
    if (!indicatorId) {
      return { ok: true, pick: null };
    }

    const hasMediaModel = typeof (prisma as any)?.curriculumMedia?.findMany === "function";
    if (!hasMediaModel) return { ok: false, error: "CURRICULUM_MEDIA_MODEL_MISSING" };

    const rows = await (prisma as any).curriculumMedia.findMany({
      where: { indicatorId },
      select: {
        id: true,
        imagePath: true,
        altText: true,
        createdAt: true,
      },
      take: 50,
    });

    const candidates = Array.isArray(rows) ? rows : [];
    if (!candidates.length) return { ok: true, pick: null };

    const canonicalBase = dotBaseFromIndicatorCode(indicatorCode);

    const ranked = candidates
      .map((r: any) => {
        const imagePath = clean(r?.imagePath);
        const href = imagePath ? mediaUrl(imagePath) : "";
        const altText = r?.altText != null ? String(r.altText) : null;
        const sc = scorePath(imagePath, canonicalBase) + (altText ? 1 : 0);
        return { r, href, imagePath, altText, score: sc };
      })
      .filter((x) => !!x.href && !!x.imagePath)
      .sort((a, b) => {
        const d = b.score - a.score;
        if (d !== 0) return d;
        // deterministic tie-break: newest then path
        const at = new Date(a.r?.createdAt ?? 0).getTime();
        const bt = new Date(b.r?.createdAt ?? 0).getTime();
        if (bt !== at) return bt - at;
        return String(a.imagePath).localeCompare(String(b.imagePath));
      });

    const best = ranked[0];
    if (!best) return { ok: true, pick: null };

    return {
      ok: true,
      pick: {
        href: best.href,
        imagePath: best.imagePath,
        altText: best.altText,
        mediaId: clean(best.r?.id) || null,
        candidates: ranked.length,
      },
    };
  } catch (e) {
    console.error("[PICK_INDICATOR_IMAGE_ERROR]", e);
    return { ok: false, error: "FAILED_TO_PICK_INDICATOR_IMAGE" };
  }
}