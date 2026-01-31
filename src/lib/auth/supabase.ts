/**
 * Supabase Client Configuration
 * 
 * Centralized Supabase client initialization.
 * This file creates the Supabase client that will be used throughout the app.
 * 
 * Why separate this?
 * - Single source of truth for Supabase configuration
 * - Easy to modify client settings in one place
 * - Consistent client usage across all services
 * 
 * Flutter parallel: Like having a single FirebaseAuth.instance configuration
 */

import { createBrowserClient } from '@supabase/ssr'

/**
 * Create Supabase client for use in Client Components
 * 
 * Uses auth-helpers-nextjs for automatic cookie handling and session management.
 * This is the Next.js App Router way of handling Supabase auth.
 * 
 * @returns Configured Supabase client
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Export type for use in other files
 */
export type SupabaseClient = ReturnType<typeof createClient>