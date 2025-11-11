// src/app/api/test/students/seed/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/test/students/seed?tenantId=...&classroomId=...&count=20
 * - Seeds `count` demo students (default 20) into the specified classroom.
 * - Safe to call multiple times; it appends more demo students.
 * - For development/testing only.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const classroomId = String(searchParams.get('classroomId') || '').trim()
    const count = Math.max(1, Math.min(60, Number(searchParams.get('count') || 20)))

    if (!tenantId || !classroomId) {
      return new Response(JSON.stringify({ error: 'tenantId and classroomId are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    // Quick existence check
    const cls = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId },
      select: { id: true, name: true, grade: true, arm: true },
    })
    if (!cls) {
      return new Response(JSON.stringify({ error: 'Classroom not found for tenant' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      })
    }

    const firstNames = [
      'Emmanuel','Joseph','Kwame','Kojo','Yaw','Kofi','Kwesi','Ama','Akosua','Abena','Yaa','Afia','Adwoa',
      'Patience','Sarah','Deborah','Naomi','Gloria','Priscilla','Ruth','Samuel','Daniel','David','Evelyn'
    ]
    const lastNames = [
      'Mensah','Owusu','Addo','Asare','Boateng','Ofori','Adjei','Amoah','Quartey','Ankrah','Lamptey',
      'Tetteh','Appiah','Koomson','Sackey','Bediako','Anim','Arhin','Dede','Tagoe'
    ]

    function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)] }
    function phone() {
      // Simple Ghana phone generator (not real): 02X/05X/03X + 7 digits
      const prefixes = ['024','054','055','059','027','057','026','020','050','030']
      const p = pick(prefixes)
      const n = Math.floor(1000000 + Math.random() * 9000000).toString()
      return p + n
    }

    const toCreate: any[] = []
    for (let i = 0; i < count; i++) {
      const fn = pick(firstNames)
      const ln = pick(lastNames)
      toCreate.push({
        tenantId,
        classroomId,
        firstName: fn,
        lastName: ln,
        sex: Math.random() < 0.5 ? 'M' : 'F',
        guardianName: `Mr./Mrs. ${ln}`,
        guardianPhone: phone(),
        note: 'demo seed',
      })
    }

    const created = await prisma.student.createMany({ data: toCreate })
    return new Response(JSON.stringify({
      ok: true,
      created: created.count,
      classroom: { id: cls.id, name: cls.name, grade: cls.grade, arm: cls.arm },
    }), { status: 200, headers: { 'content-type': 'application/json' } })

  } catch (err: any) {
    console.error('test/students/seed error:', err)
    return new Response(JSON.stringify({ error: 'Failed to seed students' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
