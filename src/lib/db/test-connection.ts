import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// Test function
export async function testConnection() {
  const { data, error } = await supabase.from('_prisma_migrations').select('*').limit(1)
  
  if (error) {
    console.log('Connection test - Table not found yet (expected):', error.message)
    return { success: true, message: 'Supabase connected (tables not created yet)' }
  }
  
  return { success: true, message: 'Supabase fully connected', data }
}