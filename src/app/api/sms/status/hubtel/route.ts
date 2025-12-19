import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  try {
    // grab both query + body (Hubtel may use either)
    const query = Object.fromEntries((await req.nextUrl.searchParams) as any);
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const payload = { query, body, headers: Object.fromEntries(await req.headers) };

    // optional: validate shared secret if you configure one
    const expected = process.env.HUBTEL_DLR_SHARED_SECRET;
    if (expected) {
      const provided = (await req.headers).get('x-hubtel-signature') || query.signature;
      if (!provided || provided !== expected) {
        return NextResponse.json({ ok: false, error: 'bad signature' }, { status: 403 });
      }
    }

    // Try outboundSms first, then auditLog
    const anyPrisma = prisma as any;
    if (anyPrisma.outboundSms?.create) {
      await anyPrisma.outboundSms.create({
        data: {
          tenantId: null,
          toPhone: payload.query?.msisdn || payload.body?.msisdn || null,
          channel: 'SMS',
          provider: 'Hubtel',
          status: 'DLR',
          payload,
          actorId: null,
        },
      });
    } else if (anyPrisma.auditLog?.create) {
      await anyPrisma.auditLog.create({
        data: {
          tenantId: null,
          action: 'SMS_DLR',
          actorId: null,
          targetType: 'PHONE',
          targetId: payload.query?.msisdn || payload.body?.msisdn || 'unknown',
          targetName: null,
          targetEmail: null,
          before: null,
          after: payload,
        },
      });
    } else {
      console.warn('No outboundSms/auditLog to store Hubtel DLR:', payload);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Hubtel DLR error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'DLR failed' }, { status: 500 });
  }
}
