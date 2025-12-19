// src/app/api/consent/teachers/csv/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[], headerOrder: string[]): string {
  const header = headerOrder.join(',');
  const lines = rows.map(r => headerOrder.map(k => csvEscape(r[k])).join(','));
  return [header, ...lines].join('\n');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId') || '';
  const actorId =
    searchParams.get('actorId') ||
    req.headers.get('x-actor-id') ||
    undefined;

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }
  if (!actorId) {
    // Mirrors your current UX: require actorId (from /api/me) before enabling the export
    return NextResponse.json({ error: 'actorId is required' }, { status: 401 });
  }

  // Pull users via Memberships (User has no tenantId field)
  // Assumes a model: Membership { tenantId, userId, user: User }
  const memberships = await prisma.membership.findMany({
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
    orderBy: { userId: 'asc' },
  });

  // Flatten + de-dupe users by id (in case a user has multiple memberships)
  const userMap = new Map<string, { id: string; name: string | null; email: string | null; smsOptIn: boolean | null }>();
  for (const m of memberships) {
    if (m.user) userMap.set(m.user.id, m.user);
  }
  const users = Array.from(userMap.values());

  const rows = users.map(u => ({
    userId: u.id,
    name: u.name ?? '',
    email: u.email ?? '',
    smsOptIn: u.smsOptIn ? 'Yes' : 'No',
  }));

  const headerOrder = ['userId', 'name', 'email', 'smsOptIn'];
  const csv = toCsv(rows, headerOrder);
  const filename = `teachers-smsoptin-${tenantId}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
