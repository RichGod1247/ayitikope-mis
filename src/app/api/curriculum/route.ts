// src/app/api/curriculum/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function asTrimmed(v: string | null) {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

export async function GET(req: NextRequest) {
  // ✅ API routes must not redirect. Ever.
  const ctx = await getServerUserContextOrNull({ requireTenant: true });
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });

  const { searchParams } = new URL(req.url);

  const phase = asTrimmed(searchParams.get("phase"));
  const level = asTrimmed(searchParams.get("level"));
  const subjectSlug = asTrimmed(searchParams.get("subjectSlug"));
  const subjectName = asTrimmed(searchParams.get("subject"));

  if (!subjectSlug && !subjectName) {
    return jsonNoStore(
      { ok: false, error: "Missing subjectSlug or subject." },
      { status: 400 }
    );
  }

  try {
    const subject = await prisma.curriculumSubject.findFirst({
      where: {
        isActive: true,
        ...(phase ? { phase } : {}),
        ...(level ? { level } : {}),
        ...(subjectSlug ? { slug: subjectSlug } : { name: subjectName! }),
        OR: [{ isGlobal: true }, { tenantId: ctx.tenantId }],
      },
      select: {
        id: true,
        phase: true,
        level: true,
        name: true,
        slug: true,
        description: true,
        orderIndex: true,

        curriculumFramework: true,
        frameworkVersion: true,
        countryCode: true,
        sourceDocumentTitle: true,
        sourceDocumentYear: true,
        sourceDocumentUrl: true,
        lastVerifiedAt: true,

        media: {
          select: {
            id: true,
            pageNumberInPdf: true,
            figureLabel: true,
            imagePath: true,
            altText: true,
            detailedDescription: true,
            tags: true,
          },
          orderBy: [{ pageNumberInPdf: "asc" }, { id: "asc" }],
        },

        strands: {
          orderBy: [{ orderIndex: "asc" }, { code: "asc" }, { id: "asc" }],
          select: {
            id: true,
            code: true,
            title: true,
            description: true,
            orderIndex: true,
            subStrands: {
              orderBy: [{ orderIndex: "asc" }, { code: "asc" }, { id: "asc" }],
              select: {
                id: true,
                code: true,
                title: true,
                description: true,
                orderIndex: true,
                contentStandards: {
                  orderBy: [{ orderIndex: "asc" }, { code: "asc" }, { id: "asc" }],
                  select: {
                    id: true,
                    code: true,
                    description: true,
                    orderIndex: true,
                    media: {
                      select: {
                        id: true,
                        pageNumberInPdf: true,
                        figureLabel: true,
                        imagePath: true,
                        altText: true,
                        detailedDescription: true,
                        tags: true,
                      },
                      orderBy: [{ pageNumberInPdf: "asc" }, { id: "asc" }],
                    },
                    indicators: {
                      orderBy: [{ orderIndex: "asc" }, { code: "asc" }, { id: "asc" }],
                      select: {
                        id: true,
                        code: true,
                        description: true,
                        orderIndex: true,
                        media: {
                          select: {
                            id: true,
                            pageNumberInPdf: true,
                            figureLabel: true,
                            imagePath: true,
                            altText: true,
                            detailedDescription: true,
                            tags: true,
                          },
                          orderBy: [{ pageNumberInPdf: "asc" }, { id: "asc" }],
                        },
                        exemplars: {
                          orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
                          select: {
                            id: true,
                            title: true,
                            description: true,
                            assessmentNotes: true,
                            orderIndex: true,
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

    if (!subject) {
      return jsonNoStore(
        { ok: false, error: "Curriculum subject not found for the selected filters." },
        { status: 404 }
      );
    }

    return jsonNoStore({ ok: true, item: subject }, { status: 200 });
  } catch (err) {
    console.error("[CURRICULUM_GET_ERROR]", err);
    return jsonNoStore(
      { ok: false, error: "Unexpected error while loading curriculum hierarchy. Please try again or contact the system administrator." },
      { status: 500 }
    );
  }
}
