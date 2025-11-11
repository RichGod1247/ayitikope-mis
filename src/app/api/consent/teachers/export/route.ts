// src/app/api/consent/teachers/export/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = (searchParams.get('tenantId') || '').trim();
    if (!tenantId) {
      return new Response('tenantId is required', { status: 400 });
    }

    // Teachers = Users with a Membership in this tenant (optionally filter by role later)
    const rows = await prisma.membership.findMany({
      where: { tenantId },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            smsOptIn: true,
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    const header = ['userId', 'name', 'email', 'smsOptIn'];
    const lines = [header.join(',')];

    for (const r of rows) {
      const u = r.user!;
      lines.push(
        [u.id, u.name ?? '', u.email ?? '', u.smsOptIn ? 'true' : 'false']
          .map(csvEscape)
          .join(',')
      );
    }

    const csv = lines.join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="teacher-consents.csv"',
      },
    });
  } catch (err) {
    console.error('consent/teachers/export error:', err);
    return new Response('Failed to export teachers', { status: 500 });
  }
}
