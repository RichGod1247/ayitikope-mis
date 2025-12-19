// src/app/api/sms/send/route.ts
import type { NextRequest } from 'next/server';
import { sendViaHubtel } from '@/lib/sms/hubtel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tenantId, to, body: message, brand, actorId, meta } = body || {};

    if (!to || !message) {
      return Response.json({ ok: false, error: 'Missing "to" or "body"' }, { status: 400 });
    }

    const result = await sendViaHubtel({
      to,
      body: message,
      tenantId,
      brand,
      actorId: actorId ?? null,
      meta,
    });

    if (!result.ok) {
      return Response.json({ ok: false, error: 'Hubtel send failed', details: result }, { status: 502 });
    }
    return Response.json({ ok: true, details: result });
  } catch (err: any) {
    console.error('SMS send error:', err);
    return Response.json({ ok: false, error: err?.message || 'SMS send error' }, { status: 500 });
  }
}
