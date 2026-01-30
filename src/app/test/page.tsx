import { prisma } from '@/lib/db/prisma'

export default async function TestPage() {
  try {
    const userCount = await prisma.user.count()
    const projectCount = await prisma.project.count()
    const taskCount = await prisma.task.count()
    const discussionCount = await prisma.discussion.count()
    
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">✅ Database Connection SUCCESS!</h1>
        <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
          <pre className="text-sm">
            {JSON.stringify({ 
              status: 'Connected to Supabase via Prisma 7',
              tables: {
                users: userCount,
                projects: projectCount,
                tasks: taskCount,
                discussions: discussionCount
              }
            }, null, 2)}
          </pre>
        </div>
      </div>
    )
  } catch (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4 text-red-600">❌ Connection Error</h1>
        <pre className="bg-red-50 border border-red-200 p-4 rounded">
          {JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Unknown error'
          }, null, 2)}
        </pre>
      </div>
    )
  }
}