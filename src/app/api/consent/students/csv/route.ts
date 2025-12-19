// src/app/api/consent/students/csv/route.ts
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
    // Keep this so your frontend can enable the button only after it knows userId
    return NextResponse.json({ error: 'actorId is required' }, { status: 401 });
  }

  // Fetch student consent view
  const students = await prisma.student.findMany({
    where: { tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      healthConsentAt: true,
      guardianSmsOptIn: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const rows = students.map(s => ({
    studentId: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    guardianName: s.guardianName ?? '',
    guardianPhone: s.guardianPhone ?? '',
    healthConsentDate: s.healthConsentAt ? new Date(s.healthConsentAt).toISOString() : '',
    guardianSmsOptIn: s.guardianSmsOptIn ? 'Yes' : 'No',
  }));

  const headerOrder = [
    'studentId',
    'firstName',
    'lastName',
    'guardianName',
    'guardianPhone',
    'healthConsentDate',
    'guardianSmsOptIn',
  ];

  const csv = toCsv(rows, headerOrder);
  const filename = `students-consent-${tenantId}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
