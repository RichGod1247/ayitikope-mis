import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function norm(s: string) {
  return (s || '').trim().toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, phone, text } = await req.json();

    if (!tenantId || !phone || !text) {
      return new Response(JSON.stringify({ error: 'tenantId, phone, text required' }), { status: 400 });
    }

    const keyword = norm(text);
    const isStop = keyword === 'STOP' || keyword === 'OPTOUT';
    const isStart = keyword === 'START' || keyword === 'OPTIN';

    if (!isStop && !isStart) {
      // Accept silently (some providers need 200 on any inbound)
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Find any student under this tenant whose guardianPhone matches
    const students = await prisma.student.findMany({
      where: { tenantId, guardianPhone: phone },
      select: { id: true, guardianSmsOptIn: true, firstName: true, lastName: true },
      take: 20, // safety cap
    });

    if (students.length === 0) {
      return new Response(JSON.stringify({ ok: true, matched: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    for (const s of students) {
      await prisma.student.update({
        where: { id: s.id },
        data: { guardianSmsOptIn: isStart ? true : false },
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          action: isStart ? 'CONSENT_INBOUND_START' : 'CONSENT_INBOUND_STOP',
          resource: 'STUDENT',
          resourceId: s.id,
          metadata: { phone, text },
        },
      });
    }

    return new Response(JSON.stringify({ ok: true, matched: students.length }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('/api/sms/inbound/hook error:', err);
    return new Response(JSON.stringify({ error: 'failed to process inbound sms' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
