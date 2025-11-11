// src/app/api/consent/students/list/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianSmsOptIn: boolean;
  healthConsentAt: string | null; // ISO string
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = (searchParams.get('tenantId') || '').trim();
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 100)));

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Use raw SQL so we’re not blocked by stale Prisma types.
    // Make sure your DB has these columns on "Student":
    //   guardianSmsOptIn BOOLEAN NOT NULL DEFAULT false
    //   healthConsentAt TIMESTAMP NULL
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        s."id",
        s."firstName",
        s."lastName",
        s."guardianName",
        s."guardianPhone",
        s."guardianSmsOptIn",
        (s."healthConsentAt")::text AS "healthConsentAt"
      FROM "edulife_os"."Student" s
      WHERE s."tenantId" = ${tenantId}
        AND (
          ${q === ''} OR
          s."firstName" ILIKE ${'%' + q + '%'} OR
          s."lastName"  ILIKE ${'%' + q + '%'} OR
          s."guardianName" ILIKE ${'%' + q + '%'} OR
          s."guardianPhone" ILIKE ${'%' + q + '%'}
        )
      ORDER BY s."lastName" NULLS LAST, s."firstName" NULLS LAST
      LIMIT ${limit}
    `;

    return new Response(
      JSON.stringify({
        tenantId,
        count: rows.length,
        items: rows.map(r => ({
          id: r.id,
          name: `${r.firstName} ${r.lastName}`.trim(),
          guardianName: r.guardianName,
          guardianPhone: r.guardianPhone,
          guardianSmsOptIn: r.guardianSmsOptIn,
          healthConsentAt: r.healthConsentAt, // ISO string or null
        })),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (err: any) {
    // Helpful diagnostics if a column is missing
    const msg = String(err?.message || err);
    if (msg.includes('column') && msg.includes('does not exist')) {
      console.error('consent/students/list: missing column. Did you run the SQL patch? ->', msg);
    } else {
      console.error('consent/students/list error:', err);
    }
    return new Response(JSON.stringify({ error: 'Failed to load students' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
