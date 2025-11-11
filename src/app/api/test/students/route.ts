// app/api/test/students/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const classroomId = String(searchParams.get('classroomId') || '').trim()
    if (!classroomId) {
      return new Response(JSON.stringify({ error: 'classroomId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const students = await prisma.student.findMany({
      where: { classroomId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    return Response.json({ students })
  } catch (err: any) {
    console.error('List students error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list students' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
