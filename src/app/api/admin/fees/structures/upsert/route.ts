// src/app/api/admin/fees/structures/upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type UpsertBody = {
  tenantId?: string;
  name?: string;
  description?: string | null;
  term?: string;
  academicYear?: string;
  amountCedis?: string; // from UI, we convert to pesewas
  isActive?: boolean;
};

function parseAmountToPesewas(amountStr: string): number | null {
  const trimmed = amountStr.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", ""));
  if (!Number.isFinite(parsed)) return null;
  // Convert GHS to pesewas
  const pesewas = Math.round(parsed * 100);
  return pesewas >= 0 ? pesewas : null;
}

export async function POST(req: Request) {
  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const tenantId = body.tenantId?.trim();
  const name = body.name?.trim();
  const term = body.term?.trim();
  const academicYear = body.academicYear?.trim();
  const description = body.description?.trim() || null;
  const isActive = body.isActive ?? true;

  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId is required." },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Name is required." },
      { status: 400 }
    );
  }
  if (!term) {
    return NextResponse.json(
      { ok: false, error: "Term is required (e.g. '1st Term')." },
      { status: 400 }
    );
  }
  if (!academicYear) {
    return NextResponse.json(
      { ok: false, error: "Academic year is required (e.g. '2025/2026')." },
      { status: 400 }
    );
  }
  if (!body.amountCedis) {
    return NextResponse.json(
      { ok: false, error: "Amount (GHS) is required." },
      { status: 400 }
    );
  }

  const amountPesewas = parseAmountToPesewas(body.amountCedis);
  if (amountPesewas === null) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid amount format. Please enter a number like 150, 150.50, or 12.3.",
      },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.feeStructure.create({
      data: {
        tenantId,
        name,
        description,
        term,
        academicYear,
        amountPesewas,
        isActive,
      },
    });

    return NextResponse.json(
      { ok: true, item: created },
      { status: 201 }
    );
  } catch (err) {
    console.error("[ADMIN_FEE_STRUCTURES_UPSERT_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to save fee structure. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
