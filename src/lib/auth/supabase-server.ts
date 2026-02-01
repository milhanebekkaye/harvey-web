/**
 * Supabase Server Client Configuration
 *
 * Creates a Supabase client for use in Server Components and Route Handlers.
 * This is different from the browser client - it handles cookies properly
 * in the server environment.
 *
 * Use this in:
 * - Route handlers (/api/*, /auth/callback)
 * - Server Components
 * - Server Actions
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Create Supabase client for Server Components and Route Handlers
 *
 * Properly handles cookies in the server environment.
 * MUST be used in server-side code (route handlers, server components).
 *
 * @returns Configured Supabase server client
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
