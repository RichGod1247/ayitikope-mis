import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
    const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : '';

    if (!tenantId || !studentId) {
      return new Response(JSON.stringify({ ok: false, error: 'tenantId and studentId are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Verify the student belongs to the tenant
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, tenantId: true, guardianSmsOptIn: true, firstName: true, lastName: true, healthConsentAt: true },
    });

    if (!student || student.tenantId !== tenantId) {
      return new Response(JSON.stringify({ ok: false, error: 'Student not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Idempotent: if already opted-out, log and return ok
    if (student.guardianSmsOptIn === false) {
      try {
        await prisma.auditLog.create({
          data: {
            tenantId,
            action: 'CONSENT_STUDENT_OPTOUT',
            resource: 'STUDENT',
            resourceId: studentId,
            metadata: { note: 'idempotent' } as any,
          },
        });
      } catch {}
      return new Response(JSON.stringify({ ok: true, student }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { guardianSmsOptIn: false },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
      },
    });

    // Best-effort audit (don’t fail request on audit error)
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'CONSENT_STUDENT_OPTOUT',
          resource: 'STUDENT',
          resourceId: studentId,
          metadata: { after: { guardianSmsOptIn: false } } as any,
        },
      });
    } catch {}

    return new Response(JSON.stringify({ ok: true, student: updated }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('consent/optout/student error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Failed to opt-out' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}