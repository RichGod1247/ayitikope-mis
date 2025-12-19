// src/app/api/consent/audit/changes/route.ts
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/consent/audit/changes?tenantId=...&from=YYYY-MM-DD&to=YYYY-MM-DD&q=...&limit=100
 *
 * Returns audit entries for consent updates:
 * - action in ("CONSENT_STUDENT_UPDATE", "CONSENT_TEACHER_UPDATE")
 *
 * Notes:
 * - We didn’t always persist tenantId in the audit row (e.g., teacher update used null).
 *   So tenantId is optional here. If you pass tenantId, we include rows where audit.tenantId matches
 *   OR where the target entity (student) belongs to that tenant (best-effort enrichment for students).
 *
 * Response shape:
 * {
 *   items: Array<{
 *     id: string
 *     createdAt: string
 *     action: "CONSENT_STUDENT_UPDATE" | "CONSENT_TEACHER_UPDATE"
 *     actorId: string | null
 *     targetType: "STUDENT" | "TEACHER"
 *     targetId: string
 *     targetName?: string | null
 *     targetEmail?: string | null
 *     tenantId?: string | null
 *     before?: any
 *     after?: any
 *   }>
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim() || undefined
    const fromStr = searchParams.get('from') || ''
    const toStr = searchParams.get('to') || ''
    const q = searchParams.get('q')?.trim() || ''
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)

    const actions = ['CONSENT_STUDENT_UPDATE', 'CONSENT_TEACHER_UPDATE'] as const

    // Base where
    const where: any = {
      action: { in: actions as unknown as string[] },
    }

    // Optional date filter
    const createdAt: any = {}
    const fromOk = /^\d{4}-\d{2}-\d{2}$/.test(fromStr)
    const toOk = /^\d{4}-\d{2}-\d{2}$/.test(toStr)
    if (fromOk) createdAt.gte = new Date(`${fromStr}T00:00:00.000Z`)
    if (toOk) createdAt.lte = new Date(`${toStr}T23:59:59.999Z`)
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt

    // Optional simple q: match resourceId or action (we keep it lightweight)
    if (q) {
      where.OR = [
        { resourceId: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
      ]
    }

    // If tenantId provided, first pull rows that *directly* match tenantId
    // (Teacher updates may have tenantId null; we’ll enrich below for students.)
    if (tenantId) {
      where.tenantId = tenantId
    }

    const rows = await prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        action: true,
        tenantId: true,
        userId: true,       // actor
        resource: true,
        resourceId: true,   // target id (studentId or userId)
        metadata: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    })

    // Enrich with names/emails best-effort and widen tenant-scoped results:
    // - If tenantId was supplied, there may be additional student rows with audit.tenantId = null.
    //   We’ll fetch a second batch (without tenant filter) and then filter on student’s tenant.
    let extraStudentRows: typeof rows = []
    if (tenantId) {
      const orphans = await prisma.auditLog.findMany({
        where: {
          tenantId: null,
          action: { in: actions as unknown as string[] },
        },
        select: {
          id: true, createdAt: true, action: true, tenantId: true, userId: true,
          resource: true, resourceId: true, metadata: true,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      })
      // Keep only student updates whose student belongs to this tenant
      const studentIds = orphans
        .filter(r => r.action === 'CONSENT_STUDENT_UPDATE' && r.resourceId)
        .map(r => r.resourceId as string)

      if (studentIds.length) {
        const students = await prisma.student.findMany({
          where: { id: { in: studentIds }, tenantId },
          select: { id: true },
        })
        const allowed = new Set(students.map(s => s.id))
        extraStudentRows = orphans.filter(r => r.action === 'CONSENT_STUDENT_UPDATE' && allowed.has(r.resourceId || ''))
      }
    }

    const all = [...rows, ...extraStudentRows]
      // If both sets include duplicates, de-dupe by id
      .reduce((acc, r) => (acc.some(x => x.id === r.id) ? acc : acc.concat(r)), [] as typeof rows)

    // Fetch target display info in bulk
    const studentIds = all
      .filter(r => r.action === 'CONSENT_STUDENT_UPDATE' && r.resourceId)
      .map(r => r.resourceId as string)
    const teacherIds = all
      .filter(r => r.action === 'CONSENT_TEACHER_UPDATE' && r.resourceId)
      .map(r => r.resourceId as string)

    const [students, teachers] = await Promise.all([
      studentIds.length
        ? prisma.student.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, firstName: true, lastName: true, tenantId: true },
          })
        : Promise.resolve([]),
      teacherIds.length
        ? prisma.user.findMany({
            where: { id: { in: teacherIds } },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ])

    const studentMap = new Map(students.map(s => [s.id, s]))
    const teacherMap = new Map(teachers.map(t => [t.id, t]))

    const items = all.map(r => {
      const md = (r.metadata ?? {}) as any
      const actorId = (md?.actorId as string | null) ?? r.userId ?? null
      const before = md?.before
      const after = md?.after

      if (r.action === 'CONSENT_STUDENT_UPDATE') {
        const s = r.resourceId ? studentMap.get(r.resourceId) : undefined
        return {
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          action: r.action as 'CONSENT_STUDENT_UPDATE',
          actorId,
          targetType: 'STUDENT' as const,
          targetId: r.resourceId || '',
          targetName: s ? `${s.firstName} ${s.lastName}`.trim() : null,
          targetEmail: null,
          tenantId: s?.tenantId ?? r.tenantId ?? null,
          before,
          after,
        }
      } else {
        const t = r.resourceId ? teacherMap.get(r.resourceId) : undefined
        return {
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          action: r.action as 'CONSENT_TEACHER_UPDATE',
          actorId,
          targetType: 'TEACHER' as const,
          targetId: r.resourceId || '',
          targetName: t?.name ?? null,
          targetEmail: t?.email ?? null,
          tenantId: r.tenantId ?? null,
          before,
          after,
        }
      }
    })

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('consent/audit/changes error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list consent audit entries' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
