// src/app/api/schedule/reset/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { projectId } = body

    console.log('[API Reset] Received request for:', projectId)

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    // Delete tasks
    const deleted = await prisma.task.deleteMany({
      where: { projectId: projectId }
    })

    console.log('[API Reset] Successfully deleted:', deleted.count)

    return NextResponse.json({ success: true, count: deleted.count })
  } catch (error) {
    console.error('[API Reset] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Error' }, 
      { status: 500 }
    )
  }
}