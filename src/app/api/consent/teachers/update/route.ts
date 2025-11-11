// src/app/api/consent/teachers/update/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

type Body = {
  userId?: string;
  smsOptIn?: boolean; // optional; only update if provided
};

export async function POST(req: NextRequest) {
  try {
    const { userId, smsOptIn } = (await req.json()) as Body;
    const id = (userId || '').trim();
    if (!id) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    const data: any = {};
    if (typeof smsOptIn === 'boolean') data.smsOptIn = smsOptIn;

    if (Object.keys(data).length === 0) {
      return new Response(JSON.stringify({ ok: true, unchanged: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, smsOptIn: true },
    });

    return new Response(JSON.stringify({ ok: true, user: updated }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('consent/teachers/update error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update teacher consent' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
