//src/app/teacher/lesson-notes/[id]/print/page.tsx
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { notFound, redirect } from "next/navigation";
import HeadteacherReviewPanel from "./HeadteacherReviewPanel";
import { mediaUrl } from "@/lib/media";
import ZoomableImage from "./ZoomableImage";

export const dynamic = "force-dynamic";

/** ----------------------- small, safe helpers ----------------------- */

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeClassLabel(value: string | null | undefined): string | null {
  const trimmed = normalizeLabel(value);
  if (!trimmed) return null;

  const compact = trimmed.replace(/\s+/g, " ");
  const duplicatePhase = compact.match(/^([A-Za-z]+)\s*[–-]\s*\1\s*(.+)$/i);
  if (duplicatePhase?.[1] && duplicatePhase?.[2]) {
    return `${duplicatePhase[1].toUpperCase()} ${duplicatePhase[2].trim()}`.replace(/\s+/g, " ");
  }

  return compact;
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function safeLower(v: unknown) {
  return typeof v === "string" ? v.toLowerCase().trim() : "";
}

function titleCase(s: string) {
  const x = clean(s);
  if (!x) return "";
  return x
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\b(i|ii|iii|iv|v|vi)\b/gi, (m) => m.toUpperCase());
}

function firstMeaningfulLine(text: string) {
  const s = clean(text);
  if (!s) return "";
  const parts = s
    .split(/\n|[.!?]/)
    .map((x) => clean(x))
    .filter(Boolean);
  return parts[0] ?? s;
}

function uniq<T>(arr: T[]) {
  return [...new Set(arr)];
}

function parseListish(input: unknown): string[] {
  const s = clean(input);
  if (!s) return [];
  const normalized = s.replace(/[•·]/g, "\n").replace(/;/g, "\n").replace(/,/g, "\n");
  return uniq(
    normalized
      .split("\n")
      .map((x) => clean(x))
      .filter(Boolean)
      .map((x) => x.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
  );
}

function joinForPrint(list: string[], fallback: string) {
  const xs = uniq(list.map((x) => clean(x)).filter(Boolean));
  return xs.length ? xs.join("; ") : fallback;
}

function signatureDataUrlFromSvg(svgRaw: unknown): string | null {
  if (typeof svgRaw !== "string") return null;
  const svg = svgRaw.trim();
  if (!svg) return null;

  const lower = svg.toLowerCase();
  if (!lower.startsWith("<svg")) return null;
  if (
    lower.includes("<script") ||
    lower.includes("javascript:") ||
    lower.includes("onload=") ||
    lower.includes("onerror=")
  ) {
    return null;
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isAbsoluteUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function normalizeStorageKey(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

function canonicalKgFolderForSubjectSlug(subjectSlug: string | null | undefined) {
  const slug = safeLower(subjectSlug);

  switch (slug) {
    case "kg1-mathematics":
    case "kg2-numeracy":
      return "mathematics";

    case "kg1-language-and-literacy":
    case "kg2-language-and-literacy":
      return "language-and-literacy";

    case "kg1-our-world-and-our-people":
    case "kg2-our-world-and-our-people":
      return "our-world-and-our-people";

    case "kg1-creative-arts":
    case "kg2-creative-arts":
      return "creative-arts";

    default:
      return "";
  }
}

function inferSubjectSlugFromRuntime(args: {
  subject: string;
  phase: string | null;
  level: string | null;
}) {
  const subject = safeLower(args.subject);
  const phase = clean(args.phase).toUpperCase();
  const level = clean(args.level).toUpperCase();

  if (phase === "KG" && level === "KG1") {
    if (subject.includes("math")) return "kg1-mathematics";
    if (subject.includes("language") || subject.includes("literacy")) {
      return "kg1-language-and-literacy";
    }
    if (subject.includes("our world") || subject.includes("owop")) {
      return "kg1-our-world-and-our-people";
    }
    if (subject.includes("creative")) return "kg1-creative-arts";
  }

  if (phase === "KG" && level === "KG2") {
    if (subject.includes("math") || subject.includes("numeracy")) return "kg2-numeracy";
    if (subject.includes("language") || subject.includes("literacy")) {
      return "kg2-language-and-literacy";
    }
    if (subject.includes("our world") || subject.includes("owop")) {
      return "kg2-our-world-and-our-people";
    }
    if (subject.includes("creative")) return "kg2-creative-arts";
  }

  return null;
}

function normalizeMediaPathForRender(args: {
  path: string;
  subject: string;
  phase: string | null;
  level: string | null;
  subjectSlug: string | null;
}) {
  const raw = normalizeStorageKey(args.path);
  if (!raw || isAbsoluteUrl(raw)) return raw;

  const lower = raw.toLowerCase();
  const phase = clean(args.phase).toUpperCase();
  const level = clean(args.level).toUpperCase();

  const subjectSlug =
    args.subjectSlug ??
    inferSubjectSlugFromRuntime({
      subject: args.subject,
      phase: args.phase,
      level: args.level,
    });

  const folder = canonicalKgFolderForSubjectSlug(subjectSlug);

  if (
    folder &&
    phase === "KG" &&
    (level === "KG1" || level === "KG2") &&
    lower.startsWith(`curriculum/${level.toLowerCase()}/${folder}/`)
  ) {
    return raw.replace(
      new RegExp(`^curriculum/${level.toLowerCase()}/${folder}/`, "i"),
      `lower-primary/${level.toLowerCase()}/${folder}/`
    );
  }

  return raw;
}

function isCanonicalLowerPrimaryPath(path: string) {
  return normalizeStorageKey(path).toLowerCase().startsWith("lower-primary/");
}

function isKnownBadLegacyKg2Path(path: string, subjectSlug: string | null | undefined) {
  const p = normalizeStorageKey(path).toLowerCase();
  const slug = safeLower(subjectSlug);

  if (slug === "kg2-numeracy" && p.startsWith("curriculum/kg2/mathematics/")) return true;
  if (
    slug === "kg2-language-and-literacy" &&
    p.startsWith("curriculum/kg2/language-and-literacy/")
  ) {
    return true;
  }

  return false;
}

/** ----------------------- subject-aware defaults ----------------------- */

function subjectKind(subjectRaw: string) {
  const s = safeLower(subjectRaw);
  if (s.includes("math") || s.includes("numeracy")) return "MATH" as const;
  if (s.includes("comput") || s.includes("ict")) return "COMPUTING" as const;
  if (s.includes("social")) return "SOCIAL" as const;
  if (s.includes("english") || s.includes("language") || s.includes("literacy")) {
    return "ENGLISH" as const;
  }
  return "GENERAL" as const;
}

function defaultCoreCompetencies(subject: string) {
  const k = subjectKind(subject);
  if (k === "ENGLISH") {
    return [
      "Communication and Collaboration",
      "Creativity and Innovation",
      "Critical Thinking and Problem-Solving",
      "Personal Development and Leadership",
    ];
  }
  if (k === "MATH") {
    return [
      "Critical Thinking and Problem-Solving",
      "Creativity and Innovation",
      "Communication and Collaboration",
    ];
  }
  return [
    "Critical Thinking and Problem-Solving",
    "Communication and Collaboration",
    "Personal Development and Leadership",
  ];
}

function defaultTeachingResources(subject: string) {
  const k = subjectKind(subject);
  if (k === "MATH") {
    return [
      "Chalk/marker + board",
      "Exercise books",
      "Counters (bottle tops/beans)",
      "Number line/strip (paper)",
      "Place-value/base-ten materials (or improvised bundles/strips)",
    ];
  }
  if (k === "COMPUTING") {
    return [
      "Chalk/marker + board",
      "Computer/phone (if available)",
      "Printed screenshots (teacher-made)",
      "Exercise books",
    ];
  }
  if (k === "SOCIAL") {
    return [
      "Chalk/marker + board",
      "Pictures/charts (phone if available)",
      "Short local examples (home/school/community)",
      "Exercise books",
    ];
  }
  if (k === "ENGLISH") {
    return [
      "Chalk/marker + board",
      "Word/sentence cards (paper)",
      "Short reading text (teacher-made)",
      "Exercise books",
    ];
  }
  return [
    "Chalk/marker + board",
    "Exercise books",
    "Locally available safe objects (if needed)",
  ];
}

/** ----------------------- seeded-curriculum keyword extraction ----------------------- */

const STOPWORDS = new Set([
  "the",
  "and",
  "or",
  "of",
  "to",
  "a",
  "an",
  "in",
  "on",
  "for",
  "with",
  "as",
  "at",
  "by",
  "from",
  "into",
  "that",
  "this",
  "these",
  "those",
  "is",
  "are",
  "be",
  "being",
  "been",
  "was",
  "were",
  "will",
  "can",
  "should",
  "may",
  "might",
  "must",
  "do",
  "does",
  "did",
  "done",
  "use",
  "using",
  "show",
  "exhibit",
  "demonstrate",
  "understanding",
  "understand",
  "explain",
  "identify",
  "describe",
  "discuss",
  "learners",
  "students",
  "pupils",
  "teacher",
  "lesson",
  "topic",
  "today",
  "their",
  "they",
  "them",
  "we",
  "our",
  "your",
  "kg1",
  "kg2",
  "subject",
  "classroom",
  "children",
  "child",
  "ghanaian",
]);

function extractKeywords(parts: string[], max = 6) {
  const bag: string[] = [];
  for (const p of parts) {
    const t = clean(p).replace(/[“”"’']/g, "").toLowerCase();
    if (!t) continue;
    const words = t.split(/[^a-z0-9-]+/g).filter(Boolean);
    for (const w of words) {
      if (w.length < 4) continue;
      if (STOPWORDS.has(w)) continue;
      bag.push(w);
    }
  }

  const counts = new Map<string, number>();
  for (const w of bag) counts.set(w, (counts.get(w) ?? 0) + 1);

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  const out: string[] = [];
  for (const w of sorted) {
    if (out.length >= max) break;
    const pretty = w.includes("-")
      ? w
          .split("-")
          .map((x) => (x ? x[0]!.toUpperCase() + x.slice(1) : ""))
          .join("-")
      : w[0]!.toUpperCase() + w.slice(1);
    out.push(pretty);
  }
  return out;
}

function normalizeSearchText(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[“”"’']/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForSearch(...parts: Array<string | null | undefined>) {
  const out = new Set<string>();

  for (const part of parts) {
    const s = normalizeSearchText(part);
    if (!s) continue;

    const words = s.split(/[\s-]+/g).map((x) => x.trim()).filter(Boolean);

    for (const w of words) {
      if (w.length < 3) continue;
      if (STOPWORDS.has(w)) continue;

      out.add(w);

      if (w.endsWith("s") && w.length > 4) out.add(w.slice(0, -1));
      if (w.endsWith("es") && w.length > 5) out.add(w.slice(0, -2));
      if (w.endsWith("ing") && w.length > 6) out.add(w.slice(0, -3));
      if (w.endsWith("ed") && w.length > 5) out.add(w.slice(0, -2));
    }
  }

  return out;
}

function overlapCount(a: Set<string>, b: Set<string>) {
  let count = 0;
  for (const x of a) {
    if (b.has(x)) count += 1;
  }
  return count;
}

function parseCodeNumbers(code: string | null | undefined) {
  const s = clean(code);
  if (!s) return [] as number[];
  const matches = s.match(/\d+/g);
  if (!matches) return [];
  return matches.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

function codeDistance(a: string | null | undefined, b: string | null | undefined) {
  const ax = parseCodeNumbers(a);
  const bx = parseCodeNumbers(b);
  if (!ax.length || !bx.length) return 999;

  const len = Math.max(ax.length, bx.length);
  let diff = 0;

  for (let i = 0; i < len; i += 1) {
    diff += Math.abs((ax[i] ?? 0) - (bx[i] ?? 0));
  }

  return diff;
}

function buildSearchBigrams(text: string) {
  const words = normalizeSearchText(text).split(/\s+/g).filter(Boolean);
  const out = new Set<string>();

  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i];
    const b = words[i + 1];
    if (!a || !b) continue;
    if (STOPWORDS.has(a) && STOPWORDS.has(b)) continue;
    out.add(`${a} ${b}`);
  }

  return out;
}

async function fetchExemplarText(args: {
  indicatorId?: string | null;
  indicatorCode?: string | null;
  contentStandardCode?: string | null;
}): Promise<string[]> {
  const indicatorId = clean(args.indicatorId);
  const indicatorCode = clean(args.indicatorCode);
  const contentStandardCode = clean(args.contentStandardCode);

  const hasIndicatorModel = typeof (prisma as any)?.curriculumIndicator?.findFirst === "function";
  const hasCSModel =
    typeof (prisma as any)?.curriculumContentStandard?.findFirst === "function";
  if (!hasIndicatorModel) return [];

  if (indicatorId) {
    try {
      const row = await (prisma as any).curriculumIndicator.findFirst({
        where: { id: indicatorId },
        select: {
          exemplars: {
            orderBy: { orderIndex: "asc" },
            take: 6,
            select: { description: true },
          },
        },
      });
      const xs = Array.isArray(row?.exemplars) ? row.exemplars : [];
      return xs.map((x: any) => clean(x?.description)).filter(Boolean);
    } catch {
      // ignore
    }
  }

  if (!indicatorCode) return [];

  if (contentStandardCode && hasCSModel) {
    try {
      const cs = await (prisma as any).curriculumContentStandard.findFirst({
        where: { code: contentStandardCode },
        select: { id: true },
      });

      if (cs?.id) {
        const row = await (prisma as any).curriculumIndicator.findFirst({
          where: { code: indicatorCode, contentStandardId: cs.id },
          select: {
            exemplars: {
              orderBy: { orderIndex: "asc" },
              take: 6,
              select: { description: true },
            },
          },
        });

        const xs = Array.isArray(row?.exemplars) ? row.exemplars : [];
        const out = xs.map((x: any) => clean(x?.description)).filter(Boolean);
        if (out.length) return out;
      }
    } catch {
      // ignore
    }
  }

  try {
    const row = await (prisma as any).curriculumIndicator.findFirst({
      where: { code: indicatorCode },
      select: {
        exemplars: {
          orderBy: { orderIndex: "asc" },
          take: 6,
          select: { description: true },
        },
      },
    });

    const xs = Array.isArray(row?.exemplars) ? row.exemplars : [];
    return xs.map((x: any) => clean(x?.description)).filter(Boolean);
  } catch {
    return [];
  }
}

/** ----------------------- media fallback engine ----------------------- */

type FallbackScope =
  | "EXACT"
  | "SAME_CONTENT_STANDARD"
  | "SAME_SUBSTRAND"
  | "SAME_STRAND"
  | "CROSS_SUBJECT";

function humanizeFallbackScope(scope: FallbackScope) {
  switch (scope) {
    case "EXACT":
      return "Exact indicator match";
    case "SAME_CONTENT_STANDARD":
      return "Smart reuse — same content standard";
    case "SAME_SUBSTRAND":
      return "Smart reuse — same sub-strand";
    case "SAME_STRAND":
      return "Smart reuse — same strand";
    case "CROSS_SUBJECT":
      return "Smart reuse — related curriculum subject";
    default:
      return "Smart reuse";
  }
}

type IndicatorContext = {
  id: string | null;
  code: string | null;
  description: string | null;
  contentStandardCode: string | null;
  contentStandardDescription: string | null;
  subStrandCode: string | null;
  subStrandTitle: string | null;
  strandCode: string | null;
  strandTitle: string | null;
  subjectSlug: string | null;
  subjectName: string | null;
  phase: string | null;
  level: string | null;
};

type MediaCandidate = {
  id: string;
  imagePath: string;
  altText: string | null;
  detailedDescription: string | null;
  figureLabel: string | null;
  tags: string | null;
  pageNumberInPdf: number;

  indicatorId: string | null;
  indicatorCode: string | null;
  indicatorDescription: string | null;

  contentStandardCode: string | null;
  contentStandardDescription: string | null;

  subStrandCode: string | null;
  subStrandTitle: string | null;

  strandCode: string | null;
  strandTitle: string | null;

  subjectSlug: string | null;
  subjectName: string | null;
  phase: string | null;
  level: string | null;

  fallbackScope: FallbackScope;
};

type MediaScoreTarget = {
  subject: string;
  subjectSlug: string | null;
  phase: string | null;
  level: string | null;

  strand: string;
  substrand: string;
  contentStandard: string;
  indicator: string;

  strandCode: string | null;
  subStrandCode: string | null;
  contentStandardCode: string | null;
  indicatorCode: string | null;
};

type CrossSubjectReusePlan = {
  subjectSlugs: string[];
  allowedLevels: string[];
};

async function resolveIndicatorContext(args: {
  indicatorIdExact?: string | null;
  indicatorCode?: string | null;
  contentStandardCode?: string | null;
  strandCode?: string | null;
  subjectSlugHint?: string | null;
}): Promise<IndicatorContext | null> {
  const indicatorIdExact = clean(args.indicatorIdExact);
  const indicatorCode = clean(args.indicatorCode);
  const contentStandardCode = clean(args.contentStandardCode);
  const strandCode = clean(args.strandCode);
  const subjectSlugHint = clean(args.subjectSlugHint);

  if (indicatorIdExact) {
    try {
      const row = await prisma.curriculumIndicator.findFirst({
        where: { id: indicatorIdExact },
        select: {
          id: true,
          code: true,
          description: true,
          contentStandard: {
            select: {
              code: true,
              description: true,
              subStrand: {
                select: {
                  code: true,
                  title: true,
                  strand: {
                    select: {
                      code: true,
                      title: true,
                      subject: {
                        select: {
                          slug: true,
                          name: true,
                          phase: true,
                          level: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (row) {
        return {
          id: row.id,
          code: row.code,
          description: row.description ?? null,
          contentStandardCode: row.contentStandard?.code ?? null,
          contentStandardDescription: row.contentStandard?.description ?? null,
          subStrandCode: row.contentStandard?.subStrand?.code ?? null,
          subStrandTitle: row.contentStandard?.subStrand?.title ?? null,
          strandCode: row.contentStandard?.subStrand?.strand?.code ?? null,
          strandTitle: row.contentStandard?.subStrand?.strand?.title ?? null,
          subjectSlug: row.contentStandard?.subStrand?.strand?.subject?.slug ?? null,
          subjectName: row.contentStandard?.subStrand?.strand?.subject?.name ?? null,
          phase: row.contentStandard?.subStrand?.strand?.subject?.phase ?? null,
          level: row.contentStandard?.subStrand?.strand?.subject?.level ?? null,
        };
      }
    } catch {
      // ignore
    }
  }

  if (!indicatorCode) return null;

  try {
    const where: any = { code: indicatorCode };

    if (contentStandardCode || strandCode || subjectSlugHint) {
      where.contentStandard = {};

      if (contentStandardCode) {
        where.contentStandard.code = contentStandardCode;
      }

      if (strandCode || subjectSlugHint) {
        where.contentStandard.subStrand = { strand: {} as any };

        if (strandCode) {
          where.contentStandard.subStrand.strand.code = strandCode;
        }

        if (subjectSlugHint) {
          where.contentStandard.subStrand.strand.subject = { slug: subjectSlugHint };
        }
      }
    }

    const row = await prisma.curriculumIndicator.findFirst({
      where,
      select: {
        id: true,
        code: true,
        description: true,
        contentStandard: {
          select: {
            code: true,
            description: true,
            subStrand: {
              select: {
                code: true,
                title: true,
                strand: {
                  select: {
                    code: true,
                    title: true,
                    subject: {
                      select: {
                        slug: true,
                        name: true,
                        phase: true,
                        level: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      code: row.code,
      description: row.description ?? null,
      contentStandardCode: row.contentStandard?.code ?? null,
      contentStandardDescription: row.contentStandard?.description ?? null,
      subStrandCode: row.contentStandard?.subStrand?.code ?? null,
      subStrandTitle: row.contentStandard?.subStrand?.title ?? null,
      strandCode: row.contentStandard?.subStrand?.strand?.code ?? null,
      strandTitle: row.contentStandard?.subStrand?.strand?.title ?? null,
      subjectSlug: row.contentStandard?.subStrand?.strand?.subject?.slug ?? null,
      subjectName: row.contentStandard?.subStrand?.strand?.subject?.name ?? null,
      phase: row.contentStandard?.subStrand?.strand?.subject?.phase ?? null,
      level: row.contentStandard?.subStrand?.strand?.subject?.level ?? null,
    };
  } catch {
    return null;
  }
}

function rowToCandidate(row: any, fallbackScope: FallbackScope): MediaCandidate {
  return {
    id: row.id,
    imagePath: row.imagePath,
    altText: row.altText ?? null,
    detailedDescription: row.detailedDescription ?? null,
    figureLabel: row.figureLabel ?? null,
    tags: row.tags ?? null,
    pageNumberInPdf: row.pageNumberInPdf ?? 0,

    indicatorId: row.indicator?.id ?? null,
    indicatorCode: row.indicator?.code ?? null,
    indicatorDescription: row.indicator?.description ?? null,

    contentStandardCode: row.indicator?.contentStandard?.code ?? null,
    contentStandardDescription: row.indicator?.contentStandard?.description ?? null,

    subStrandCode: row.indicator?.contentStandard?.subStrand?.code ?? null,
    subStrandTitle: row.indicator?.contentStandard?.subStrand?.title ?? null,

    strandCode: row.indicator?.contentStandard?.subStrand?.strand?.code ?? null,
    strandTitle: row.indicator?.contentStandard?.subStrand?.strand?.title ?? null,

    subjectSlug: row.indicator?.contentStandard?.subStrand?.strand?.subject?.slug ?? null,
    subjectName: row.indicator?.contentStandard?.subStrand?.strand?.subject?.name ?? null,
    phase: row.indicator?.contentStandard?.subStrand?.strand?.subject?.phase ?? null,
    level: row.indicator?.contentStandard?.subStrand?.strand?.subject?.level ?? null,

    fallbackScope,
  };
}

async function queryMediaCandidates(where: any, fallbackScope: FallbackScope, take = 25) {
  const rows = await prisma.curriculumMedia.findMany({
    where,
    take,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      imagePath: true,
      altText: true,
      detailedDescription: true,
      figureLabel: true,
      tags: true,
      pageNumberInPdf: true,
      indicator: {
        select: {
          id: true,
          code: true,
          description: true,
          contentStandard: {
            select: {
              code: true,
              description: true,
              subStrand: {
                select: {
                  code: true,
                  title: true,
                  strand: {
                    select: {
                      code: true,
                      title: true,
                      subject: {
                        select: {
                          slug: true,
                          name: true,
                          phase: true,
                          level: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return rows
    .map((row) => rowToCandidate(row, fallbackScope))
    .filter(
      (row) => !isKnownBadLegacyKg2Path(row.imagePath, row.subjectSlug)
    );
}

function getCrossSubjectReusePlan(target: IndicatorContext | null): CrossSubjectReusePlan {
  const slug = safeLower(target?.subjectSlug);
  const phase = clean(target?.phase).toUpperCase();
  const level = clean(target?.level).toUpperCase();

  if (phase !== "KG") {
    return {
      subjectSlugs: target?.subjectSlug ? [target.subjectSlug] : [],
      allowedLevels: level ? [level] : [],
    };
  }

  if (slug === "kg1-language-and-literacy") {
    return {
      subjectSlugs: [
        "kg1-language-and-literacy",
        "kg1-our-world-and-our-people",
        "kg1-creative-arts",
      ],
      allowedLevels: ["KG1"],
    };
  }

  if (slug === "kg2-language-and-literacy") {
    return {
      subjectSlugs: [
        "kg2-language-and-literacy",
        "kg1-language-and-literacy",
        "kg1-our-world-and-our-people",
        "kg1-creative-arts",
      ],
      allowedLevels: ["KG2", "KG1"],
    };
  }

  if (slug === "kg1-mathematics") {
    return {
      subjectSlugs: ["kg1-mathematics"],
      allowedLevels: ["KG1"],
    };
  }

  if (slug === "kg2-numeracy") {
    return {
      subjectSlugs: ["kg2-numeracy", "kg1-mathematics"],
      allowedLevels: ["KG2", "KG1"],
    };
  }

  if (slug === "kg1-our-world-and-our-people") {
    return {
      subjectSlugs: ["kg1-our-world-and-our-people"],
      allowedLevels: ["KG1"],
    };
  }

  if (slug === "kg2-our-world-and-our-people") {
    return {
      subjectSlugs: ["kg2-our-world-and-our-people", "kg1-our-world-and-our-people"],
      allowedLevels: ["KG2", "KG1"],
    };
  }

  if (slug === "kg1-creative-arts") {
    return {
      subjectSlugs: ["kg1-creative-arts"],
      allowedLevels: ["KG1"],
    };
  }

  if (slug === "kg2-creative-arts") {
    return {
      subjectSlugs: ["kg2-creative-arts", "kg1-creative-arts"],
      allowedLevels: ["KG2", "KG1"],
    };
  }

  return {
    subjectSlugs: target?.subjectSlug ? [target.subjectSlug] : [],
    allowedLevels: level ? [level] : [],
  };
}

async function collectMediaCandidates(target: IndicatorContext | null): Promise<MediaCandidate[]> {
  if (!target) return [];

  const all: MediaCandidate[] = [];
  const seen = new Set<string>();

  const pushUnique = (rows: MediaCandidate[]) => {
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      all.push(row);
    }
  };

  if (target.id) {
    pushUnique(await queryMediaCandidates({ indicatorId: target.id }, "EXACT", 10));
  }

  if (target.subjectSlug && target.contentStandardCode) {
    pushUnique(
      await queryMediaCandidates(
        {
          indicator: {
            contentStandard: {
              code: target.contentStandardCode,
              subStrand: {
                strand: {
                  subject: { slug: target.subjectSlug },
                },
              },
            },
          },
        },
        "SAME_CONTENT_STANDARD",
        15
      )
    );
  }

  if (target.subjectSlug && target.subStrandCode) {
    pushUnique(
      await queryMediaCandidates(
        {
          indicator: {
            contentStandard: {
              subStrand: {
                code: target.subStrandCode,
                strand: {
                  subject: { slug: target.subjectSlug },
                },
              },
            },
          },
        },
        "SAME_SUBSTRAND",
        20
      )
    );
  }

  if (target.subjectSlug && target.strandCode) {
    pushUnique(
      await queryMediaCandidates(
        {
          indicator: {
            contentStandard: {
              subStrand: {
                strand: {
                  code: target.strandCode,
                  subject: { slug: target.subjectSlug },
                },
              },
            },
          },
        },
        "SAME_STRAND",
        30
      )
    );
  }

  const reusePlan = getCrossSubjectReusePlan(target);

  if (reusePlan.subjectSlugs.length > 1) {
    pushUnique(
      await queryMediaCandidates(
        {
          indicator: {
            contentStandard: {
              subStrand: {
                strand: {
                  subject: {
                    slug: { in: reusePlan.subjectSlugs },
                    level: { in: reusePlan.allowedLevels },
                  },
                },
              },
            },
          },
        },
        "CROSS_SUBJECT",
        220
      )
    );
  }

  return all;
}

function scoreMediaCandidate(row: MediaCandidate, target: MediaScoreTarget) {
  let score = 0;

  if (row.fallbackScope === "EXACT") score += 10000;
  if (row.fallbackScope === "SAME_CONTENT_STANDARD") score += 2500;
  if (row.fallbackScope === "SAME_SUBSTRAND") score += 1600;
  if (row.fallbackScope === "SAME_STRAND") score += 900;
  if (row.fallbackScope === "CROSS_SUBJECT") score += 300;

  if (row.subjectSlug && row.subjectSlug === target.subjectSlug) score += 120;
  if (row.strandCode && row.strandCode === target.strandCode) score += 90;
  if (row.subStrandCode && row.subStrandCode === target.subStrandCode) score += 70;
  if (row.contentStandardCode && row.contentStandardCode === target.contentStandardCode) {
    score += 60;
  }

  if (isCanonicalLowerPrimaryPath(row.imagePath)) score += 40;
  if ((row.pageNumberInPdf ?? 0) === 0) score += 6;
  if (normalizeStorageKey(row.imagePath).toLowerCase().endsWith(".png")) score += 5;

  const targetIndicatorTokens = tokenizeForSearch(target.indicator);
  const targetContentTokens = tokenizeForSearch(target.contentStandard);
  const targetSubStrandTokens = tokenizeForSearch(target.substrand);
  const targetAllTokens = tokenizeForSearch(
    target.subject,
    target.strand,
    target.substrand,
    target.contentStandard,
    target.indicator,
    target.subjectSlug ?? "",
    target.strandCode ?? "",
    target.subStrandCode ?? "",
    target.contentStandardCode ?? "",
    target.indicatorCode ?? ""
  );

  const fileStem =
    normalizeStorageKey(row.imagePath).split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "";

  const candidatePrimaryTokens = tokenizeForSearch(
    row.figureLabel,
    row.indicatorDescription,
    row.contentStandardDescription,
    row.subStrandTitle,
    row.strandTitle,
    fileStem
  );

  const candidateSecondaryTokens = tokenizeForSearch(
    row.altText,
    row.detailedDescription,
    row.tags,
    row.subjectName,
    row.subjectSlug ?? ""
  );

  const indicatorOverlapPrimary = overlapCount(targetIndicatorTokens, candidatePrimaryTokens);
  const indicatorOverlapSecondary = overlapCount(
    targetIndicatorTokens,
    candidateSecondaryTokens
  );
  const contentOverlapPrimary = overlapCount(targetContentTokens, candidatePrimaryTokens);
  const contentOverlapSecondary = overlapCount(
    targetContentTokens,
    candidateSecondaryTokens
  );
  const subStrandOverlap = overlapCount(targetSubStrandTokens, candidatePrimaryTokens);
  const broadPrimaryOverlap = overlapCount(targetAllTokens, candidatePrimaryTokens);
  const broadSecondaryOverlap = overlapCount(targetAllTokens, candidateSecondaryTokens);

  score += indicatorOverlapPrimary * 240;
  score += indicatorOverlapSecondary * 120;
  score += contentOverlapPrimary * 90;
  score += contentOverlapSecondary * 45;
  score += subStrandOverlap * 70;
  score += broadPrimaryOverlap * 22;
  score += broadSecondaryOverlap * 10;

  const targetText = [target.substrand, target.contentStandard, target.indicator]
    .map(normalizeSearchText)
    .join(" ");

  const candidateText = [
    row.figureLabel,
    row.altText,
    row.detailedDescription,
    row.indicatorDescription,
    row.contentStandardDescription,
    row.subStrandTitle,
    row.strandTitle,
    fileStem,
    row.tags,
  ]
    .map(normalizeSearchText)
    .join(" ");

  const targetBigrams = buildSearchBigrams(targetText);
  const candidateBigrams = buildSearchBigrams(candidateText);
  score += overlapCount(targetBigrams, candidateBigrams) * 160;

  const distance = codeDistance(target.indicatorCode, row.indicatorCode);
  if (row.subjectSlug === target.subjectSlug && distance < 999) {
    score += Math.max(0, 40 - distance * 4);
  }

  const thematicBoosts: Array<[string, number]> = [
    ["body", 130],
    ["parts", 120],
    ["feature", 140],
    ["features", 140],
    ["unique", 150],
    ["wonderful", 120],
    ["identity", 140],
    ["creation", 120],
    ["internal", 150],
    ["heart", 170],
    ["lungs", 170],
    ["stomach", 160],
    ["intestines", 150],
    ["function", 120],
    ["poster", 90],
    ["book", 75],
    ["human", 90],
    ["food", 90],
    ["family", 110],
    ["clean", 90],
    ["hygiene", 140],
    ["environment", 90],
    ["respect", 90],
    ["belief", 80],
    ["community", 100],
    ["occupation", 110],
    ["leader", 110],
    ["leaders", 110],
    ["water", 110],
    ["plant", 120],
    ["animal", 110],
    ["animals", 110],
    ["weather", 120],
    ["light", 110],
    ["air", 110],
    ["soil", 120],
    ["garden", 90],
    ["global", 100],
    ["communication", 100],
    ["transport", 100],
    ["writing", 85],
    ["letter", 80],
    ["reading", 60],
    ["story", 45],
  ];

  for (const [term, bonus] of thematicBoosts) {
    if (targetAllTokens.has(term) && candidateText.includes(term)) {
      score += bonus;
    }
  }

  const phraseBoosts: Array<[string, number]> = [
    ["body features", 300],
    ["unique body", 220],
    ["unique creation", 230],
    ["self identity", 220],
    ["wonderful features", 220],
    ["parts of the body", 280],
    ["body parts", 260],
    ["internal body", 220],
    ["internal body parts", 280],
    ["personal hygiene", 240],
    ["safe and unsafe", 220],
    ["road safety", 240],
    ["family story", 200],
    ["community leaders", 220],
    ["domestic and wild", 220],
    ["sources of water", 220],
    ["parts of a plant", 260],
    ["types of soil", 240],
    ["weather conditions", 240],
    ["global community", 220],
    ["conversation poster", 180],
    ["front cover", 120],
    ["back cover", 120],
    ["pre writing", 180],
    ["own name", 180],
  ];

  for (const [phrase, bonus] of phraseBoosts) {
    if (targetText.includes(phrase) && candidateText.includes(phrase)) {
      score += bonus;
    }
  }

  const mismatchPenalties: Array<[string, number]> = [
    ["festival", 150],
    ["celebration", 150],
    ["feelings", 140],
    ["emotion", 140],
    ["pre-writing", 180],
    ["writing own name", 220],
    ["name card", 180],
    ["environmental print", 180],
    ["story circle", 160],
    ["listening and responding", 140],
    ["traditional songs", 130],
  ];

  for (const [phrase, penalty] of mismatchPenalties) {
    const normalizedPhrase = normalizeSearchText(phrase);
    const phraseTokens = tokenizeForSearch(normalizedPhrase);
    const targetHasTheme = overlapCount(targetAllTokens, phraseTokens) > 0;
    const candidateHasTheme = candidateText.includes(normalizedPhrase);
    if (!targetHasTheme && candidateHasTheme) {
      score -= penalty;
    }
  }

  if (
    target.subjectSlug === "kg1-language-and-literacy" &&
    row.subjectSlug === "kg1-our-world-and-our-people"
  ) {
    score += 80;
  }

  if (
    target.subjectSlug === "kg1-language-and-literacy" &&
    row.subjectSlug === "kg1-creative-arts"
  ) {
    score += 25;
  }

  if (
    target.subjectSlug === "kg2-language-and-literacy" &&
    row.subjectSlug === "kg1-language-and-literacy"
  ) {
    score += 140;
  }

  if (
    target.subjectSlug === "kg2-language-and-literacy" &&
    row.subjectSlug === "kg1-our-world-and-our-people"
  ) {
    score += 110;
  }

  if (
    target.subjectSlug === "kg2-language-and-literacy" &&
    row.subjectSlug === "kg1-creative-arts"
  ) {
    score += 80;
  }

  if (
    target.subjectSlug === "kg2-numeracy" &&
    row.subjectSlug === "kg1-mathematics"
  ) {
    score += 160;
  }

  return score;
}

function pickBestMedia(rows: MediaCandidate[], target: MediaScoreTarget): MediaCandidate | null {
  if (!rows.length) return null;

  const scored = rows.map((row) => ({
    row,
    score: scoreMediaCandidate(row, target),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.row.id.localeCompare(b.row.id);
  });

  return scored[0]?.row ?? null;
}

function classroomExampleFor(subject: string, topic: string) {
  const k = subjectKind(subject);

  if (k === "MATH") {
    return `Use counters (bottle tops/beans) to model one problem related to “${topic}”, then learners explain their steps.`;
  }
  if (k === "ENGLISH") {
    return `Ask learners to explain “${topic}” in 2–3 simple sentences and give one example from home/school/community.`;
  }
  if (k === "COMPUTING") {
    return `Demonstrate one simple step related to “${topic}” on the board; learners practise in pairs and explain what each step does.`;
  }
  if (k === "SOCIAL") {
    return `Let learners mention 2 real-life examples related to “${topic}” and explain one clearly in a sentence.`;
  }
  return `Ask learners to mention 2 examples related to “${topic}” from their home/community and explain one in simple words.`;
}

/** ----------------------- page ----------------------- */

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const embedRaw = Array.isArray(sp.embed) ? sp.embed[0] : sp.embed;
  const isEmbed = clean(embedRaw) === "1" || clean(embedRaw).toLowerCase() === "true";

  const noteId = clean(id);

  const ctx = await requireServerUserContext({
    redirectTo: `/teacher/lesson-notes/${encodeURIComponent(noteId)}/print`,
    requireTenant: true,
  });

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") redirect("/app/dashboard");

  const roleName = membership.role?.name ?? "";
  const isReviewer =
    roleName === "HEADTEACHER" || roleName === "SCHOOL_ADMIN" || roleName === "SUPERADMIN";

  const note = await prisma.lessonNote.findFirst({
    where: isReviewer
      ? { id: noteId, tenantId: ctx.tenantId }
      : { id: noteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
    select: {
      id: true,
      tenantId: true,
      teacherUserId: true,
      classroomId: true,

      weekNumber: true,
      term: true,
      academicYear: true,

      subject: true,
      strand: true,
      substrand: true,
      contentStandard: true,
      indicator: true,

      lessonTitle: true,
      objectives: true,
      priorKnowledge: true,
      introduction: true,
      lessonDevelopment: true,
      conclusion: true,
      assessment: true,
      homework: true,
      coreCompetencies: true,
      teachingLearningResources: true,
      differentiationNotes: true,
      reflectionNotes: true,

      lessonDate: true,
      createdAt: true,
      updatedAt: true,

      phase: true,
      level: true,

      curriculumUnitId: true,
      schemeOfWorkItemId: true,

      status: true,
      headteacherComment: true,
      approvedAt: true,
      approvalSignatureSvg: true,
    },
  });

  if (!note) return notFound();
  if (isReviewer && note.teacherUserId === ctx.userId) return notFound();

  const [tenantRow, teacherRow, classroomRow, unitRow, schemeItemRow] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: note.tenantId },
      select: { name: true },
    }),
    prisma.user.findUnique({
      where: { id: note.teacherUserId },
      select: { name: true, email: true },
    }),
    note.classroomId
      ? prisma.classroom.findUnique({
          where: { id: note.classroomId },
          select: { name: true },
        })
      : Promise.resolve(null),
    note.curriculumUnitId
      ? prisma.curriculumUnit.findFirst({
          where: {
            id: note.curriculumUnitId,
            OR: [{ tenantId: note.tenantId }, { tenantId: null }],
          } as any,
          select: {
            phase: true,
            level: true,
            subject: true,
            strandCode: true,
            strand: true,
            substrandCode: true,
            substrand: true,
            contentStandardCode: true,
            contentStandard: true,
            indicatorCode: true,
            indicator: true,
          },
        })
      : Promise.resolve(null),
    note.schemeOfWorkItemId
      ? prisma.schemeOfWorkItem.findFirst({
          where: { id: note.schemeOfWorkItemId },
          select: {
            indicatorId: true,
            curriculumIndicatorId: true,
            indicatorCode: true,
            contentStandardCode: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const subject = note.subject ?? unitRow?.subject ?? "";
  const strand = note.strand ?? unitRow?.strand ?? "";
  const substrand = note.substrand ?? unitRow?.substrand ?? "";
  const contentStandard = note.contentStandard ?? unitRow?.contentStandard ?? "";
  const indicator = note.indicator ?? unitRow?.indicator ?? "";

  const strandCode = unitRow?.strandCode ?? null;
  const contentStandardCode =
    unitRow?.contentStandardCode ?? schemeItemRow?.contentStandardCode ?? null;
  const indicatorCode = unitRow?.indicatorCode ?? schemeItemRow?.indicatorCode ?? null;

  let indicatorIdExact =
    clean(schemeItemRow?.curriculumIndicatorId) || clean(schemeItemRow?.indicatorId) || null;

  if (!indicatorIdExact && unitRow?.indicatorCode) {
    try {
      let resolvedContentStandardId: string | null = null;

      if (unitRow.contentStandardCode) {
        const cs = await prisma.curriculumContentStandard.findFirst({
          where: { code: unitRow.contentStandardCode },
          select: { id: true },
        });
        resolvedContentStandardId = cs?.id ?? null;
      }

      const indicatorRow = await prisma.curriculumIndicator.findFirst({
        where: resolvedContentStandardId
          ? {
              code: unitRow.indicatorCode,
              contentStandardId: resolvedContentStandardId,
            }
          : {
              code: unitRow.indicatorCode,
            },
        select: { id: true },
      });

      indicatorIdExact = indicatorRow?.id ?? null;
    } catch {
      indicatorIdExact = null;
    }
  }

  const subjectSlugHint =
    inferSubjectSlugFromRuntime({
      subject,
      phase: note.phase ?? unitRow?.phase ?? null,
      level: note.level ?? unitRow?.level ?? null,
    }) ?? null;

  const indicatorContext = await resolveIndicatorContext({
    indicatorIdExact,
    indicatorCode,
    contentStandardCode,
    strandCode,
    subjectSlugHint,
  });

  const mediaCandidates = await collectMediaCandidates(indicatorContext);

  const pickedMedia = pickBestMedia(mediaCandidates, {
    subject,
    subjectSlug: indicatorContext?.subjectSlug ?? subjectSlugHint ?? null,
    phase: note.phase ?? unitRow?.phase ?? indicatorContext?.phase ?? null,
    level: note.level ?? unitRow?.level ?? indicatorContext?.level ?? null,

    strand,
    substrand,
    contentStandard,
    indicator,

    strandCode: indicatorContext?.strandCode ?? strandCode ?? null,
    subStrandCode: indicatorContext?.subStrandCode ?? null,
    contentStandardCode: indicatorContext?.contentStandardCode ?? contentStandardCode ?? null,
    indicatorCode: indicatorContext?.code ?? indicatorCode ?? null,
  });

  const rawPath = pickedMedia?.imagePath
    ? normalizeMediaPathForRender({
        path: String(pickedMedia.imagePath).trim(),
        subject,
        phase: note.phase ?? unitRow?.phase ?? indicatorContext?.phase ?? null,
        level: note.level ?? unitRow?.level ?? indicatorContext?.level ?? null,
        subjectSlug: pickedMedia.subjectSlug ?? indicatorContext?.subjectSlug ?? subjectSlugHint,
      })
    : "";

  const finalUrl = rawPath ? mediaUrl(rawPath) : "";

  const baseMissing = !String(process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").trim();
  const relativeNeedsBase = !!rawPath && !isAbsoluteUrl(rawPath) && baseMissing;

  let lessonTitle: string;
  if (note.lessonTitle && note.lessonTitle.trim().length > 0) {
    lessonTitle = note.lessonTitle;
  } else if (unitRow?.indicator?.trim()) {
    lessonTitle = unitRow.indicator;
  } else if (unitRow?.substrand?.trim()) {
    lessonTitle = unitRow.substrand ?? "";
  } else if (substrand?.trim()) {
    lessonTitle = substrand;
  } else {
    lessonTitle = "______________________________________________";
  }

  const topic =
    titleCase(
      lessonTitle === "______________________________________________" ? clean(indicator) : lessonTitle
    ) || "Lesson";

  const schoolName = tenantRow?.name ?? "__________________________";
  const teacherName = teacherRow?.name ?? "__________________________";
  const teacherEmail = teacherRow?.email ?? "";

  const classroomName = normalizeClassLabel(classroomRow?.name);
  const phaseLabel = normalizeClassLabel(note.phase ?? unitRow?.phase ?? indicatorContext?.phase ?? null);
  const levelLabel = normalizeClassLabel(note.level ?? unitRow?.level ?? indicatorContext?.level ?? null);

  const classLabel =
    classroomName ??
    levelLabel ??
    phaseLabel ??
    "________________";

  const termLabel = note.term ?? "";
  const academicYearLabel = note.academicYear ?? "";
  const weekNumberLabel =
    typeof note.weekNumber === "number" ? note.weekNumber.toString() : "____";
  const durationLabel = "40 minutes";

  const weekEndingSource = note.lessonDate ?? note.createdAt;
  const weekEndingLabel = formatDate(weekEndingSource);

  const exemplarText: string[] = await fetchExemplarText({
    indicatorId: indicatorContext?.id ?? indicatorIdExact,
    indicatorCode,
    contentStandardCode,
  });

  const dbCore =
    normalizeLabel(note.coreCompetencies) ?? normalizeLabel((unitRow as any)?.coreCompetencies);

  const coreList = dbCore ? parseListish(dbCore) : defaultCoreCompetencies(subject);
  const coreCompetenciesText = joinForPrint(coreList, defaultCoreCompetencies(subject).join("; "));

  const dbKeywords =
    normalizeLabel((note as any).keywords) ?? normalizeLabel((unitRow as any)?.keywords);

  const generatedKeywords = extractKeywords(
    [
      topic,
      clean(subject),
      clean(strand),
      clean(substrand),
      clean(contentStandard),
      clean(indicator),
      ...exemplarText.map((t) => firstMeaningfulLine(t)),
    ],
    6
  );

  const keywordsText = dbKeywords
    ? joinForPrint(parseListish(dbKeywords), generatedKeywords.join(", "))
    : generatedKeywords.length
      ? generatedKeywords.join(", ")
      : "—";

  const teachingResources =
    note.teachingLearningResources ?? defaultTeachingResources(subject).join("; ");

  const lessonObjectives =
    note.objectives ??
    (indicator
      ? `Learning Outcomes (By the end of the lesson, learners can):\n• ${clean(indicator)}.`
      : `Learning Outcomes (By the end of the lesson, learners can):\n• Explain ${topic} and give examples.`);

  const priorKnowledgeText =
    note.priorKnowledge ?? `Learners can share relevant experiences about ${topic}.`;

  const introductionText =
    note.introduction ?? `Introduce ${topic} with a quick question, short discussion, or local example.`;

  const developmentText =
    note.lessonDevelopment ??
    (() => {
      const k = subjectKind(subject);
      if (k === "SOCIAL") {
        return `Teacher explains ${topic} with 1 clear local example; learners discuss in pairs/groups, identify key ideas, and share short answers. Use a short scenario/role-play if helpful.`;
      }
      if (k === "ENGLISH") {
        return `Use a short text/picture prompt; model the skill once, practise together, then learners work independently while teacher supports.`;
      }
      if (k === "MATH") {
        return `Model one example (I do); practise together (We do); learners solve similar items (You do) while teacher coaches.`;
      }
      if (k === "COMPUTING") {
        return `Demonstrate the steps once; learners practise in pairs, then complete a short task independently while teacher supports.`;
      }
      return `Explain the key idea; demonstrate once; practise together; then learners complete a short task while teacher supports.`;
    })();

  const conclusionText =
    note.conclusion ??
    `Review key points; invite 2 learners to share an example/answer; summarise in one sentence.`;

  const assessmentText =
    note.assessment ??
    `Use short oral questions and a quick exit task aligned to the indicator. Note learners who need support.`;

  const homeworkText =
    note.homework ??
    `Find one example of ${topic} from home/community and write 2–3 lines (or draw) to share next lesson.`;

  const differentiationText =
    note.differentiationNotes ??
    `Support: break tasks into smaller steps; pair struggling learners with supportive peers.\nExtension: ask fast learners to explain “why” and create one new example.`;

  const reflectionText =
    note.reflectionNotes ??
    `After the lesson, reflect on what worked, challenges faced, and what to improve next time.`;

  const createdAtLabel = formatDate(note.createdAt);
  const updatedAtLabel = formatDate(note.updatedAt);

  const headteacherComment = note.headteacherComment ?? "";
  const approvedAtLabel = formatDate(note.approvedAt);
  const isApproved = String(note.status ?? "").toUpperCase() === "APPROVED";
  const signatureDataUrl = signatureDataUrlFromSvg(note.approvalSignatureSvg);

  const referencesText = `Official NaCCA ${subject || "Curriculum"}; Teacher Resource Pack; EduLife OS Teacher Lesson Design Studio printout.`;

  const classroomExample = classroomExampleFor(subject, topic);

  return (
    <main className="flex min-h-screen justify-center bg-[linear-gradient(180deg,#05070B_0%,#071A3D_55%,#05070B_100%)] px-2 py-4 print:bg-white sm:py-6">
      <div className="mx-auto w-full max-w-5xl overflow-x-hidden rounded-[28px] border border-white/10 bg-white p-3 text-black shadow-[0_28px_90px_rgba(0,0,0,0.34)] print:rounded-none print:border-black print:shadow-none sm:p-4 md:p-6">
        <header className="mb-4 space-y-1 text-center">
          <h1 className="text-base font-bold tracking-wide md:text-lg">
            LEARNER PLAN – {subject || "____________________"}
          </h1>
          <p className="font-semibold">
            {schoolName}{" "}
            {classLabel ? (
              <span className="font-normal">
                &nbsp;| Class: <span className="font-semibold">{classLabel}</span>
              </span>
            ) : null}
          </p>
          <p className="text-[11px]">
            Teacher: <span className="font-semibold">{teacherName}</span>{" "}
            {teacherEmail && <span>({teacherEmail})</span>}
          </p>
          {(termLabel || academicYearLabel) && (
            <p className="text-[11px]">
              Term: <span className="font-semibold">{termLabel || "________"}</span> | Academic
              Year:{" "}
              <span className="font-semibold">
                {academicYearLabel || "________/________"}
              </span>
            </p>
          )}
          <p className="text-[10px] text-zinc-600">
            EduLife OS – NaCCA-aligned lesson note (print-ready)
          </p>
        </header>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="mb-4 min-w-[860px] w-full table-fixed border border-black border-collapse text-[11px] sm:min-w-0 print:min-w-0">
            <tbody>
              <tr>
                <td className="w-[10%] border border-black px-1 py-1 font-semibold">SUBJECT</td>
                <td className="w-[20%] border border-black px-1 py-1 break-words">
                  {subject || "____________________"}
                </td>
                <td className="w-[8%] border border-black px-1 py-1 font-semibold">WEEK</td>
                <td className="w-[6%] border border-black px-1 py-1 text-center">
                  {weekNumberLabel}
                </td>
                <td className="w-[10%] border border-black px-1 py-1 font-semibold">
                  DURATION
                </td>
                <td className="w-[10%] border border-black px-1 py-1 text-center">
                  {durationLabel}
                </td>
                <td className="w-[8%] border border-black px-1 py-1 font-semibold">CLASS</td>
                <td className="w-[8%] border border-black px-1 py-1 text-center break-words">
                  {classLabel}
                </td>
                <td className="w-[12%] border border-black px-1 py-1 font-semibold">
                  WEEK ENDING
                </td>
                <td className="w-[8%] border border-black px-1 py-1 text-center">
                  {weekEndingLabel || "____________"}
                </td>
              </tr>

              <tr>
                <td className="border border-black px-1 py-1 font-semibold">STRAND</td>
                <td className="border border-black px-1 py-1 break-words" colSpan={9}>
                  {strandCode
                    ? `${strandCode} – ${strand || "______________________________________________"}`
                    : strand || "______________________________________________"}
                </td>
              </tr>

              <tr>
                <td className="border border-black px-1 py-1 font-semibold">SUB-STRAND</td>
                <td className="border border-black px-1 py-1 break-words" colSpan={9}>
                  {substrand || "______________________________________________"}
                </td>
              </tr>

              <tr>
                <td className="border border-black px-1 py-1 font-semibold">CONTENT</td>
                <td className="border border-black px-1 py-1 break-words" colSpan={9}>
                  {contentStandardCode
                    ? `${contentStandardCode} – ${
                        contentStandard || "______________________________________________"
                      }`
                    : contentStandard || "______________________________________________"}
                </td>
              </tr>

              <tr>
                <td className="border border-black px-1 py-1 font-semibold">INDICATOR</td>
                <td className="border border-black px-1 py-1 break-words" colSpan={9}>
                  {indicatorCode
                    ? `${indicatorCode} – ${indicator || "______________________________________________"}`
                    : indicator || "______________________________________________"}
                </td>
              </tr>

              <tr>
                <td className="border border-black px-1 py-1 font-semibold align-top">
                  CORE COMPETENCIES
                </td>
                <td className="border border-black px-1 py-1 break-words" colSpan={9}>
                  {coreCompetenciesText}
                </td>
              </tr>

              <tr>
                <td className="border border-black px-1 py-1 font-semibold align-top">
                  TEACHING &amp; LEARNING RESOURCES
                </td>
                <td className="border border-black px-1 py-1 break-words" colSpan={9}>
                  {teachingResources}
                </td>
              </tr>

              <tr>
                <td className="border border-black px-1 py-1 font-semibold align-top">
                  KEYWORDS
                </td>
                <td className="border border-black px-1 py-1 break-words" colSpan={9}>
                  {keywordsText}
                </td>
              </tr>

              <tr>
                <td className="border border-black px-1 py-1 font-semibold align-top">
                  REFERENCES
                </td>
                <td className="border border-black px-1 py-1 break-words" colSpan={9}>
                  {referencesText}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section className="mb-4 border border-black text-[11px]">
          <div className="border-b border-black px-2 py-1 font-semibold">
            INDICATOR ILLUSTRATION
          </div>

          <div className="px-2 py-2">
            {!indicatorIdExact && !indicatorCode ? (
              <div className="text-[11px] text-zinc-700">
                Link a NaCCA unit first to load the exact indicator image.
              </div>
            ) : !pickedMedia ? (
              <div className="text-[11px] text-zinc-700">
                No indicator image is available for this note after exact, same-subject and
                smart-reuse checks.
              </div>
            ) : relativeNeedsBase ? (
              <div className="text-[11px] text-zinc-700">
                This indicator has a relative imagePath, but{" "}
                <span className="font-semibold">NEXT_PUBLIC_MEDIA_BASE_URL</span> is not set.
              </div>
            ) : (
              <div className="w-full">
                <ZoomableImage
                  src={finalUrl}
                  alt={pickedMedia.altText ?? "Indicator illustration"}
                  heightClassName="h-[240px] sm:h-[320px] md:h-[380px] lg:h-[420px]"
                />

                <div className="mt-2 space-y-1 text-[10px] leading-snug text-zinc-800">
                  <div>
                    <span className="font-semibold">Indicator:</span>{" "}
                    {indicatorCode ? `${indicatorCode} — ` : ""}
                    {indicator ? indicator : "—"}
                  </div>

                  <div>
                    <span className="font-semibold">Topic:</span> {topic}
                  </div>

                  <div className="text-zinc-600">
                    <span className="font-semibold text-zinc-700">Image source:</span>{" "}
                    {humanizeFallbackScope(pickedMedia.fallbackScope)}
                    {pickedMedia.subjectName ? ` (${pickedMedia.subjectName})` : ""}
                  </div>

                  {pickedMedia.figureLabel ? (
                    <div className="text-zinc-600">
                      <span className="font-semibold text-zinc-700">Figure:</span>{" "}
                      {pickedMedia.figureLabel}
                    </div>
                  ) : null}

                  {pickedMedia.altText ? (
                    <div className="text-zinc-600">
                      <span className="font-semibold text-zinc-700">Illustration:</span>{" "}
                      {pickedMedia.altText}
                    </div>
                  ) : null}

                  <div className="text-zinc-600">
                    <span className="font-semibold text-zinc-700">Classroom example:</span>{" "}
                    {classroomExample}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="mb-4 min-w-[900px] w-full table-fixed border border-black border-collapse text-[11px] md:min-w-0 print:min-w-0">
            <thead>
              <tr>
                <th className="w-[12%] border border-black px-1 py-1">DAY</th>
                <th className="w-[30%] border border-black px-1 py-1">
                  PHASE 1: STARTER
                </th>
                <th className="w-[33%] border border-black px-1 py-1">
                  PHASE 2: NEW LEARNING &amp; ASSESSMENT
                </th>
                <th className="w-[25%] border border-black px-1 py-1">
                  PHASE 3: PLENARY / REFLECTION
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="align-top">
                <td className="border border-black px-1 py-1 font-semibold">
                  {weekNumberLabel ? "Monday" : "Day"}
                </td>
                <td className="border border-black px-1 py-1 whitespace-pre-line break-words">
                  <p className="mb-1 font-semibold underline">LESSON OBJECTIVES</p>
                  <p className="mb-2">{lessonObjectives}</p>
                  <p className="mb-1 font-semibold underline">PRIOR KNOWLEDGE</p>
                  <p className="mb-2">{priorKnowledgeText}</p>
                  <p className="mb-1 font-semibold underline">INTRODUCTION (STARTER)</p>
                  <p>{introductionText}</p>
                </td>
                <td className="border border-black px-1 py-1 whitespace-pre-line break-words">
                  <p className="mb-1 font-semibold underline">KEY LEARNING POINTS</p>
                  <p className="mb-2">
                    {contentStandard ||
                      `Highlight the main ideas and skills learners must acquire in ${topic}.`}
                  </p>
                  <p className="mb-1 font-semibold underline">
                    MAIN TEACHING &amp; LEARNING ACTIVITIES
                  </p>
                  <p>{developmentText}</p>
                </td>
                <td className="border border-black px-1 py-1 whitespace-pre-line break-words">
                  <p className="mb-1 font-semibold underline">CONCLUSION</p>
                  <p className="mb-2">{conclusionText}</p>
                  <p className="mb-1 font-semibold underline">REFLECTION</p>
                  <p>{reflectionText}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section className="mb-4 border border-black text-[11px]">
          <div className="border-b border-black px-2 py-1 font-semibold">
            ASSESSMENT / EVALUATION
          </div>
          <div className="px-2 py-1 whitespace-pre-line break-words">{assessmentText}</div>
          <div className="border-t border-black px-2 py-1 font-semibold">
            HOMEWORK / ASSIGNMENT
          </div>
          <div className="px-2 py-1 whitespace-pre-line break-words">{homeworkText}</div>
        </section>

        <section className="mb-4 border border-black text-[11px]">
          <div className="border-b border-black px-2 py-1 font-semibold">
            DIFFERENTIATION / SUPPORT FOR LEARNERS
          </div>
          <div className="px-2 py-1 whitespace-pre-line break-words">{differentiationText}</div>
          <div className="border-t border-black px-2 py-1 font-semibold">
            TEACHER&apos;S REMARKS
          </div>
          <div className="flex flex-col gap-1 px-2 py-1 text-[10px] text-zinc-700">
            <div>
              Date prepared:{" "}
              <span className="font-semibold">{createdAtLabel || "____________"}</span>
            </div>
            <div>
              Last updated:{" "}
              <span className="font-semibold">{updatedAtLabel || "____________"}</span>
            </div>
            <div className="mt-2">
              Signature: ____________________________ &nbsp;&nbsp; Date: __________________
            </div>
          </div>
        </section>

        <section className="mb-4 border border-black text-[11px]">
          <div className="border-b border-black px-2 py-1 font-semibold">
            HEADTEACHER&apos;S REVIEW / APPROVAL
          </div>
          <div className="min-h-[48px] px-2 py-1 whitespace-pre-line break-words">
            {headteacherComment || "______________________________________________"}
          </div>
          <div className="flex flex-col gap-3 border-t border-black px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] text-zinc-700">Headteacher&apos;s Signature:</span>
              <div className="flex h-10 items-center">
                {isApproved ? (
                  signatureDataUrl ? (
                    <img
                      src={signatureDataUrl}
                      alt="Headteacher Signature"
                      className="h-10 object-contain"
                    />
                  ) : (
                    <img
                      src="/images/headteacher-signature.png"
                      alt="Headteacher Signature"
                      className="h-10 object-contain"
                    />
                  )
                ) : (
                  <span>___________________________</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 sm:items-end">
              <span className="text-[10px] text-zinc-700">Date:</span>
              <div>{isApproved && approvedAtLabel ? approvedAtLabel : "________________"}</div>
            </div>
          </div>
        </section>

                {!isEmbed ? (
          <>
            <p className="mt-2 text-center text-[10px] text-zinc-500 print:hidden">
              Tip: Use your browser&apos;s <span className="font-semibold">Print</span> command
              (Ctrl+P) to export as PDF.
            </p>

            <div className="mt-6 rounded-[24px] border border-zinc-200 bg-zinc-50 p-3 print:hidden sm:p-4">
              <HeadteacherReviewPanel
                noteId={note.id}
                tenantId={note.tenantId}
                initialComment={headteacherComment}
                currentStatus={String(note.status ?? "")}
              />
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}