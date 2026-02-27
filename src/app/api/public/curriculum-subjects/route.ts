// src/app/api/public/curriculum-subjects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function upper(v: unknown) {
  return cleanStr(v).toUpperCase();
}

// Strip level/phase prefixes from a JHS subject name.
// Examples it normalizes:
// "JHS 1 Mathematics" -> "Mathematics"
// "JHS (1,2,3) Mathematics" -> "Mathematics"
function stripJhsDecorators(nameRaw: string) {
  let s = cleanStr(nameRaw);

  // Leading: JHS 1 / JHS2 / JHS (1,2,3)
  s = s.replace(
    /^\s*JHS\s*(?:\(?\s*[1-3](?:\s*,\s*[1-3])*\s*\)?|[1-3])\s*[-:–—]?\s*/i,
    ""
  );

  // Leading: Junior High School 1
  s = s.replace(/^\s*JUNIOR\s+HIGH\s+SCHOOL\s*[1-3]?\s*[-:–—]?\s*/i, "");

  // Trailing: (JHS 1) / (JHS 1,2,3)
  s = s.replace(/\s*\(\s*JHS\s*[1-3](?:\s*,\s*[1-3])*\s*\)\s*$/i, "");

  // Cleanup multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function normalizeSubjectKey(name: string) {
  return cleanStr(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Maps UI/API phase tokens to DB phase strings.
 * Your DB uses: KG, Lower Primary, Upper Primary, Junior High School
 */
function phaseToDbFilters(phaseParamRaw: string) {
  const p = upper(phaseParamRaw);

  if (!p) return { phases: [] as string[], levels: [] as string[] };

  if (p === "KG" || p === "KINDERGARTEN") {
    return { phases: ["KG", "Kindergarten"], levels: ["KG1", "KG2", "KG 1", "KG 2"] };
  }

  if (p === "PRIMARY") {
    return {
      phases: ["Lower Primary", "Upper Primary", "Primary"],
      levels: ["Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5", "Basic 6"],
    };
  }

  if (p === "LOWER PRIMARY" || p === "LOWER_PRIMARY") {
    return { phases: ["Lower Primary"], levels: ["Basic 1", "Basic 2", "Basic 3"] };
  }

  if (p === "UPPER PRIMARY" || p === "UPPER_PRIMARY") {
    return { phases: ["Upper Primary"], levels: ["Basic 4", "Basic 5", "Basic 6"] };
  }

  if (p === "JHS" || p === "JUNIOR HIGH SCHOOL" || p === "JUNIOR_HIGH_SCHOOL") {
    return {
      phases: ["Junior High School", "JHS", "Junior High"],
      levels: ["Basic 7", "Basic 8", "Basic 9", "JHS 1", "JHS 2", "JHS 3"],
    };
  }

  // If caller already passes DB phase value like "Junior High School"
  return { phases: [cleanStr(phaseParamRaw)], levels: [] as string[] };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const phaseParam = cleanStr(url.searchParams.get("phase") || "");
  const tenantId = cleanStr(url.searchParams.get("tenantId") || "");

  const isJhsRequest = upper(phaseParam) === "JHS" || upper(phaseParam) === "JUNIOR HIGH SCHOOL" || upper(phaseParam) === "JUNIOR_HIGH_SCHOOL";
  const { phases, levels } = phaseToDbFilters(phaseParam);

  // global + optional tenant override
  const tenantScope = tenantId ? { OR: [{ tenantId: null }, { tenantId }] } : { tenantId: null };

  const and: any[] = [{ isActive: true }, tenantScope];

  if (phases.length) {
    if (isJhsRequest) {
      and.push({
        OR: [
          { phase: { in: phases } },
          ...(levels.length ? [{ level: { in: levels } }] : []),
        ],
      });
    } else {
      and.push({ phase: { in: phases } });
    }
  }

  const rows = await prisma.curriculumSubject.findMany({
    where: { AND: and },
    orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
    select: { name: true, slug: true, phase: true, level: true },
  });

  // ✅ For JHS, return canonical subject list (no "JHS 1 ..." variants).
  if (isJhsRequest) {
    type Item = { name: string; slug: string; phase: string | null; level: string | null };

    const bestByKey = new Map<string, Item & { score: number }>();

    for (const r of rows) {
      const rawName = cleanStr(r.name);
      const canonicalName = stripJhsDecorators(rawName);
      if (!canonicalName) continue;

      const key = normalizeSubjectKey(canonicalName);
      if (!key) continue;

      const slug = cleanStr(r.slug);
      if (!slug) continue;

      // Prefer the cleanest/shortest display name as the representative
      const noisy =
        /\bJHS\b/i.test(rawName) || /\bBASIC\s*[7-9]\b/i.test(rawName) || /\([^\)]*\d[^\)]*\)/.test(rawName);

      const score = (noisy ? 1000 : 0) + rawName.length;

      const existing = bestByKey.get(key);
      if (!existing || score < existing.score) {
        bestByKey.set(key, {
          name: canonicalName,
          slug,
          phase: r.phase ? cleanStr(r.phase) : null,
          level: null,
          score,
        });
      }
    }

    const items = Array.from(bestByKey.values())
      .map(({ score, ...it }) => it)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      { ok: true, items },
      { status: 200, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
    );
  }

  // Non-JHS: return as-is
  const items = rows
    .map((r) => ({
      name: cleanStr(r.name),
      slug: cleanStr(r.slug),
      phase: r.phase ? cleanStr(r.phase) : null,
      level: r.level ? cleanStr(r.level) : null,
    }))
    .filter((x) => x.name && x.slug);

  return NextResponse.json(
    { ok: true, items },
    { status: 200, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}