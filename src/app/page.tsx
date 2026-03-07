/**
 * Root Page - Smart Router
 * 
 * This is the landing page (localhost:3000/)
 * 
 * Logic:
 * 1. Check if user is authenticated
 * 2. If authenticated → Redirect to /dashboard
 * 3. If not authenticated → Redirect to /signin
 * 
 * Why this approach?
 * - Single source of truth for auth routing
 * - Users always land in the right place
 * - No flashing of wrong pages
 * 
 * Flutter parallel: Like your main.dart checking FirebaseAuth.currentUser
 */

'use client'

import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth/auth-service'

export default function RootPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    checkAuthAndRedirect()
  }, [])

  /**
   * Check authentication status and redirect accordingly
   */
  async function checkAuthAndRedirect() {
    try {
      const session = await getSession()
      
      if (session) {
        // User is authenticated → Go to dashboard
        console.log('[RootPage] User authenticated, redirecting to dashboard')
        router.push('/dashboard')
      } else {
        // User is not authenticated → Go to signin
        console.log('[RootPage] No session found, redirecting to signin')
        router.push('/signin')
      }
    } catch (error) {
      console.error('[RootPage] Error checking auth:', error)
      // On error, default to signin
      router.push('/signin')
    }
  }

  /**
   * Loading state while checking auth
   * 
   * Show a nice loading screen instead of blank page
   */
  return (
    <div className="font-display bg-[#FAF9F6] min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        {/* Harvey Logo */}
        <div className="size-16 bg-[#425ff0] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#425ff0]/20 animate-pulse">
          <Sparkles className="w-10 h-10" />
        </div>
        
        {/* Loading Text */}
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-700 mb-2">
            Loading Harvey...
          </h2>
          <p className="text-sm text-slate-500">
            Checking your session
          </p>
        </div>

        {/* Loading Spinner */}
        <div className="flex gap-2">
          <div className="w-2 h-2 bg-[#425ff0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-[#425ff0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-[#425ff0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  )
}