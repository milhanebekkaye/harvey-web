// src/app/api/schedule/reset/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma' // Make sure this path matches your project

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { projectId } = body

    console.log('[API] Received reset request for:', projectId)

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    // Direct database call to keep it simple for debugging
    const deleted = await prisma.task.deleteMany({
      where: { projectId: projectId }
    })

    console.log('[API] Deleted tasks count:', deleted.count)

    return NextResponse.json({ success: true, count: deleted.count })
  } catch (error) {
    console.error('[API] Reset Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' }, 
      { status: 500 }
    )
  }
}