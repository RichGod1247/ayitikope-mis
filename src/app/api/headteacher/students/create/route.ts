// src/app/api/headteacher/students/create/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // 1) Ensure user is signed in
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId: string | undefined = user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    // 2) Find a membership so we know which tenant (school) this user belongs to
    const membership = await prisma.membership.findFirst({
      where: { userId },
    });

    if (!membership?.tenantId) {
      return NextResponse.json(
        { ok: false, error: "No tenant membership found for this user" },
        { status: 401 }
      );
    }

    const tenantId = membership.tenantId;

    // 3) Parse incoming data
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const {
      firstName,
      lastName,
      sex,
      guardianName,
      guardianPhone,
      guardianSmsOptIn,
      note,
    } = body as {
      firstName?: string;
      lastName?: string;
      sex?: string;
      guardianName?: string;
      guardianPhone?: string;
      guardianSmsOptIn?: boolean;
      note?: string;
    };

    // 4) Very basic validation (we can tighten later)
    if (!firstName || !lastName) {
      return NextResponse.json(
        { ok: false, error: "First name and last name are required" },
        { status: 400 }
      );
    }

    // 5) Create the student record
    // We only set fields we know exist and are safe;
    // Prisma will use defaults / nullability for the rest.
    const created = await prisma.student.create({
      data: {
        tenantId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        sex: sex?.trim() || "",
        guardianName: guardianName?.trim() || "",
        guardianPhone: guardianPhone?.trim() || "",
        guardianSmsOptIn: !!guardianSmsOptIn,
        note: note?.trim() || "",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        guardianName: true,
        guardianPhone: true,
        guardianSmsOptIn: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        student: {
          id: created.id,
          firstName: created.firstName ?? "",
          lastName: created.lastName ?? "",
          sex: created.sex ?? "",
          guardianName: created.guardianName ?? "",
          guardianPhone: created.guardianPhone ?? "",
          guardianSmsOptIn: !!created.guardianSmsOptIn,
          note: created.note ?? "",
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Error creating student", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while creating learner. Please try again.",
      },
      { status: 500 }
    );
  }
}
