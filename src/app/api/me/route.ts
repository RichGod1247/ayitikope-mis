import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  try {
    // Load next-auth lazily to avoid build errors if not configured
    const nextAuth: any = await import('next-auth').catch(() => null)

    let userId: string | null = null
    let email: string | null = null
    let name: string | null = null

    if (nextAuth?.getServerSession) {
      // Load your auth options (cast to any to avoid TS union issues)
      const authMod: any = await import('@/lib/auth').catch(() => ({}))
      const authOptions = authMod?.authOptions

      const session = authOptions
        ? await nextAuth.getServerSession(authOptions)
        : null

      if (session?.user) {
        userId = (session.user as any).id ?? null
        email = (session.user as any).email ?? null
        name = (session.user as any).name ?? null
      }
    }

    return new Response(JSON.stringify({ ok: true, userId, email, name }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('/api/me error:', err)
    return new Response(JSON.stringify({ ok: false, userId: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}
