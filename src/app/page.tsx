/**
 * Signin Page (Landing Page)
 * 
 * This is the main entry point of Harvey. Users land here and can sign in with:
 * - Google authentication
 * - Apple authentication  
 * - Email authentication
 * 
 * Features:
 * - Aurora gradient background effect for premium feel
 * - Glass-morphism card design (styles in globals.css)
 * - Responsive layout (mobile-first)
 * - Dark mode support (though we're starting with light mode)
 * 
 * Flow: User clicks any auth button → navigates to /onboarding
 * 
 * Note: Authentication logic not implemented yet - buttons just navigate for now
 */

'use client' // Client component because we need onClick and useRouter

import { useRouter } from 'next/navigation'

export default function SigninPage() {
  const router = useRouter()

  /**
   * Handle authentication button clicks
   * For MVP, all auth methods navigate to onboarding
   * Later: integrate actual Supabase Auth
   */
  const handleAuth = (method: 'google' | 'apple' | 'email') => {
    try {
      console.log(`[SigninPage] Auth method selected: ${method}`)
      // Navigate to onboarding regardless of auth method (MVP)
      router.push('/onboarding')
    } catch (error) {
      console.error(`[SigninPage] Navigation error for ${method}:`, error)
      // Fallback: could show an error toast here in production
    }
  }

  return (
    /* Main container - full screen with centered content */
    <div className="font-display bg-[#FAF9F6] min-h-screen flex items-center justify-center relative overflow-hidden">
      
      {/* Aurora Background Effect - animated gradient blob */}
      <div className="aurora-bg" />

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-[520px] px-6 py-12">
        
        {/* Glass-morphism Card */}
        <div className="glass-card rounded-2xl p-8 md:p-12 transition-all duration-300">
          
          {/* Logo Section */}
          <div className="flex flex-col items-center mb-8">
            {/* Harvey Logo Icon */}
            <div className="size-12 bg-[#425ff0] rounded-xl flex items-center justify-center text-white mb-6 shadow-lg shadow-[#425ff0]/20">
              <span className="material-symbols-outlined text-3xl">auto_awesome</span>
            </div>
            {/* Brand Name */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">Harvey</span>
            </div>
          </div>

          {/* Header Text */}
          <div className="text-center mb-10">
            <h1 className="text-[#0d101b] tracking-tight text-3xl font-bold leading-tight pb-3">
              Skyrocket Your Productivity
            </h1>
            <p className="text-slate-600 text-base font-normal leading-relaxed px-4">
              Meet Harvey, your AI-powered project coach designed to transform how you work.
            </p>
          </div>

          {/* Authentication Buttons */}
          <div className="flex flex-col gap-4 w-full">
            
            {/* Google Sign In Button */}
            <button 
              onClick={() => handleAuth('google')}
              className="flex items-center justify-center gap-3 w-full h-12 px-5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors duration-200 text-slate-700 font-semibold text-sm"
            >
              {/* Google Logo SVG */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            {/* Apple Sign In Button */}
            <button 
              onClick={() => handleAuth('apple')}
              className="flex items-center justify-center gap-3 w-full h-12 px-5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors duration-200 text-slate-700 font-semibold text-sm"
            >
              {/* Apple Logo SVG */}
              <svg className="w-5 h-5 fill-current" viewBox="0 0 384 512">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              Continue with Apple
            </button>

            {/* Divider with "or" text */}
            <div className="flex items-center gap-4 my-2">
              <div className="h-px bg-slate-200 flex-1" />
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">or</span>
              <div className="h-px bg-slate-200 flex-1" />
            </div>

            {/* Primary Email Button */}
            <button 
              onClick={() => handleAuth('email')}
              className="flex items-center justify-center gap-3 w-full h-12 px-5 bg-[#425ff0] hover:bg-[#425ff0]/90 text-white rounded-lg transition-all duration-200 font-bold text-base shadow-lg shadow-[#425ff0]/20"
            >
              <span className="material-symbols-outlined text-xl">mail</span>
              Continue with Email
            </button>
          </div>

          {/* Footer Terms Text */}
          <p className="text-slate-500 text-[13px] font-normal leading-normal mt-8 text-center max-w-[320px] mx-auto">
            By continuing, you agree to Harvey's{' '}
            <a className="text-[#425ff0] hover:underline font-medium" href="#">
              Terms of Service
            </a>{' '}
            and{' '}
            <a className="text-[#425ff0] hover:underline font-medium" href="#">
              Privacy Policy
            </a>.
          </p>
        </div>

        {/* Secondary Bottom Links */}
        <div className="mt-8 flex justify-center gap-6">
          <a className="text-sm font-medium text-slate-500 hover:text-[#425ff0] transition-colors" href="#">
            Help Center
          </a>
          <a className="text-sm font-medium text-slate-500 hover:text-[#425ff0] transition-colors" href="#">
            Contact Support
          </a>
          <a className="text-sm font-medium text-slate-500 hover:text-[#425ff0] transition-colors" href="#">
            Join Beta
          </a>
        </div>
      </div>

      {/* Decorative Background Gradient Blobs */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#425ff0]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
    </div>
  )
}