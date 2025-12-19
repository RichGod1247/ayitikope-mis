// src/app/api/admin/fees/structures/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseBool(value: string | null): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const term = url.searchParams.get("term");
  const academicYear = url.searchParams.get("academicYear");
  const onlyActiveParam = url.searchParams.get("onlyActive");
  const onlyActive = parseBool(onlyActiveParam);

  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "tenantId is required.",
      },
      { status: 400 }
    );
  }

  try {
    // Cast to any to avoid TS complaints about newly added models
    const client = prisma as any;

    const where: any = { tenantId };

    if (term) where.term = term;
    if (academicYear) where.academicYear = academicYear;
    if (typeof onlyActive === "boolean") {
      where.isActive = onlyActive;
    }

    const items = await client.feeStructure.findMany({
      where,
      orderBy: [
        { academicYear: "desc" },
        { term: "asc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(
      {
        ok: true,
        items,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[ADMIN_FEE_STRUCTURES_LIST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load fee structures from the database. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
