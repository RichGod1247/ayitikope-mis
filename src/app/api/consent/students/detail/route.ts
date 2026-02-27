// src/app/api/consent/students/detail/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireServerUserContext } from '@/lib/serverAuth'

function jsonNoStore(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function isNextRedirectError(err: any) {
  return typeof err?.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')
}

function pickTenantIdFromCtx(ctx: any): string | null {
  const tid =
    ctx?.tenantId ??
    ctx?.activeTenantId ??
    ctx?.membership?.tenantId ??
    ctx?.membership?.tenant?.id ??
    ctx?.tenant?.id ??
    null
  return typeof tid === 'string' && tid.trim() ? tid.trim() : null
}

async function tryGetStaffTenantId(): Promise<string | null> {
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any)
    const ctx = r?.ctx ?? r
    return pickTenantIdFromCtx(ctx)
  } catch (err: any) {
    if (isNextRedirectError(err)) return null
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const studentId = String(searchParams.get('studentId') || '').trim()
    const tenantIdParam = String(searchParams.get('tenantId') || '').trim() || null

    if (!studentId) return jsonNoStore({ ok: false, error: 'studentId is required' }, 400)

    // If staff is logged in, enforce session tenant.
    const staffTenantId = await tryGetStaffTenantId()

    // Public mode: require tenantId in query to prevent cross-tenant guessing.
    const effectiveTenantId = staffTenantId || tenantIdParam
    if (!effectiveTenantId) {
      return jsonNoStore({ ok: false, error: 'tenantId is required for public access' }, 400)
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        healthConsentAt: true,
        guardianSmsOptIn: true,
        classroom: { select: { grade: true, arm: true, name: true } },
      },
    })

    if (!student) return jsonNoStore({ ok: false, error: 'Student not found' }, 404)
    if (student.tenantId !== effectiveTenantId) {
      return jsonNoStore({ ok: false, error: 'Forbidden: tenant mismatch' }, 403)
    }

    return jsonNoStore(
      {
        ok: true,
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          guardianName: student.guardianName,
          guardianPhone: student.guardianPhone,
          healthConsentAt: student.healthConsentAt ? student.healthConsentAt.toISOString() : null,
          smsOptIn: !!student.guardianSmsOptIn,
          classroom: student.classroom,
        },
      },
      200,
    )
  } catch (e) {
    console.error('consent/students/detail error:', e)
    return jsonNoStore({ ok: false, error: 'Failed to load student' }, 500)
  }
}
