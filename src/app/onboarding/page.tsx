/**
 * Onboarding Page
 * 
 * Chat-style onboarding where Harvey asks questions to understand:
 * - What project the user is working on
 * - Their availability and schedule constraints
 * - Their work preferences (morning/evening, rest days, capacity)
 * 
 * For MVP: Hardcoded conversation showing the full flow
 * Future: Real chat input with AI responses
 * 
 * Flow: User completes conversation → clicks "Build my schedule" → navigates to /loading
 */

'use client'

import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()

  /**
   * Handle "Build my schedule" button click
   * Navigates to loading page where AI generates the schedule
   */
  const handleBuildSchedule = () => {
    try {
      console.log('[OnboardingPage] Building schedule, navigating to loading...')
      router.push('/loading')
    } catch (error) {
      console.error('[OnboardingPage] Navigation error:', error)
    }
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-x-hidden bg-[#FAF9F6]">
      
      {/* Progress Header */}
      <div className="w-full flex justify-center pt-8 px-4">
        <div className="w-full max-w-[700px] flex flex-col gap-3">
          
          {/* Progress Title and Percentage */}
          <div className="flex gap-6 justify-between items-end">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#8B5CF6] text-xl">check_circle</span>
              <p className="text-[#110d1c] text-base font-semibold leading-normal">
                Onboarding Complete
              </p>
            </div>
            <p className="text-[#8B5CF6] text-sm font-bold leading-normal">100%</p>
          </div>

          {/* Progress Bar */}
          <div className="rounded-full bg-[#8B5CF6]/20 h-3 overflow-hidden shadow-sm">
            <div 
              className="h-full rounded-full bg-[#8B5CF6] transition-all duration-500" 
              style={{ width: '100%' }}
            />
          </div>

          {/* Status Text */}
          <p className="text-[#8B5CF6] text-xs font-medium uppercase tracking-wider">
            Setup Finished • Harvey is ready
          </p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-10 overflow-y-auto">
        <div className="w-full max-w-[700px] flex flex-col gap-6">
          
          {/* Headline Text */}
          <div className="flex flex-col items-center mb-4">
            <div className="bg-[#8B5CF6]/10 text-[#8B5CF6] px-4 py-1 rounded-full text-xs font-bold mb-3 uppercase tracking-widest">
              Success
            </div>
            <h2 className="text-[#110d1c] tracking-tight text-[32px] font-extrabold leading-tight text-center">
              The finish line is just <br />
              <span className="text-[#8B5CF6] italic">the beginning.</span>
            </h2>
          </div>

          {/* Chat Conversation */}
          <div className="flex flex-col gap-8 w-full">
            
            {/* Message 1: Harvey Welcome */}
            <div className="flex items-end gap-4 p-2">
              <div className="bg-[#8B5CF6] aspect-square rounded-xl w-12 h-12 shrink-0 flex items-center justify-center shadow-lg shadow-[#8B5CF6]/20">
                <span className="material-symbols-outlined text-white text-3xl">smart_toy</span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 items-start">
                <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal ml-1">Harvey</p>
                <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-bl-none px-6 py-4 bg-white text-[#110d1c] shadow-md">
                  Hey! I'm Harvey, your AI project coach. I'm here to turn "I want to build something" into "Here's exactly what to do today." Let's start with the basics - what project are you working on?
                </div>
              </div>
            </div>

            {/* Message 2: User Project Description */}
            <div className="flex items-end gap-4 p-2 justify-end">
              <div className="flex flex-1 flex-col gap-1.5 items-end">
                <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal mr-1">You</p>
                <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-br-none px-6 py-4 bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/30">
                  I'm building Harvey - an AI accountability coach that helps people with side projects break down their ideas into daily tasks and stay on track.
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED] aspect-square rounded-xl w-12 h-12 shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                M
              </div>
            </div>

            {/* Message 3: Harvey Asks About Availability */}
            <div className="flex items-end gap-4 p-2">
              <div className="bg-[#8B5CF6] aspect-square rounded-xl w-12 h-12 shrink-0 flex items-center justify-center shadow-lg shadow-[#8B5CF6]/20">
                <span className="material-symbols-outlined text-white text-3xl">smart_toy</span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 items-start">
                <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal ml-1">Harvey</p>
                <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-bl-none px-6 py-4 bg-white text-[#110d1c] shadow-md">
                  Love it! That's exactly the kind of project I'm built for. Now, when can you actually work on this? Tell me about your schedule - work hours, commute, any existing commitments.
                </div>
              </div>
            </div>

            {/* Message 4: User Availability */}
            <div className="flex items-end gap-4 p-2 justify-end">
              <div className="flex flex-1 flex-col gap-1.5 items-end">
                <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal mr-1">You</p>
                <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-br-none px-6 py-4 bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/30">
                  I work 9am-5:30pm with a 2-hour commute. So I'm free evenings from 8pm and weekends. I also want to keep up my workout routine.
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED] aspect-square rounded-xl w-12 h-12 shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                M
              </div>
            </div>

            {/* Message 5: Harvey Asks About Preferences */}
            <div className="flex items-end gap-4 p-2">
              <div className="bg-[#8B5CF6] aspect-square rounded-xl w-12 h-12 shrink-0 flex items-center justify-center shadow-lg shadow-[#8B5CF6]/20">
                <span className="material-symbols-outlined text-white text-3xl">smart_toy</span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 items-start">
                <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal ml-1">Harvey</p>
                <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-bl-none px-6 py-4 bg-white text-[#110d1c] shadow-md">
                  Perfect! A few more questions: Are you more productive in the morning or evening? How many hours per day can you dedicate? Any days you want to keep as rest days?
                </div>
              </div>
            </div>

            {/* Message 6: User Preferences */}
            <div className="flex items-end gap-4 p-2 justify-end">
              <div className="flex flex-1 flex-col gap-1.5 items-end">
                <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal mr-1">You</p>
                <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-br-none px-6 py-4 bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/30">
                  Definitely evenings - I'm a night owl. I can do 2-3 hours on weeknights, more on weekends. Let's keep Fridays light, that's when I'm usually exhausted.
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED] aspect-square rounded-xl w-12 h-12 shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                M
              </div>
            </div>

            {/* Message 7: Harvey Final Message */}
            <div className="flex items-end gap-4 p-2">
              <div className="bg-[#8B5CF6] aspect-square rounded-xl w-12 h-12 shrink-0 flex items-center justify-center shadow-lg shadow-[#8B5CF6]/20">
                <span className="material-symbols-outlined text-white text-3xl">smart_toy</span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 items-start">
                <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal ml-1">Harvey</p>
                <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-bl-none px-6 py-4 bg-white text-[#110d1c] shadow-md">
                  That's everything I need! I've got a clear picture of your goals, constraints, and work style. Ready to see your custom roadmap? I'll break down Harvey's development into specific, executable tasks scheduled around your life.
                </div>
              </div>
            </div>

            {/* Message 8: User Ready */}
            <div className="flex items-end gap-4 p-2 justify-end">
              <div className="flex flex-1 flex-col gap-1.5 items-end">
                <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal mr-1">You</p>
                <div className="text-base font-medium leading-relaxed flex max-w-[85%] rounded-2xl rounded-br-none px-6 py-4 bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/30">
                  Let's do it! 🚀
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED] aspect-square rounded-xl w-12 h-12 shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                M
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Final CTA Section */}
      <div className="w-full bg-white/40 backdrop-blur-md border-t border-[#8B5CF6]/10 py-10 px-4">
        <div className="max-w-[700px] mx-auto flex flex-col items-center gap-6">
          
          {/* CTA Text */}
          <div className="text-center">
            <p className="text-[#8B5CF6] text-sm font-medium mb-2 uppercase tracking-wide">
              Final Step
            </p>
            <p className="text-[#110d1c] text-lg font-medium">
              Harvey is ready to transform your goals into a step-by-step plan.
            </p>
          </div>

          {/* Build Schedule Button */}
          <div className="flex flex-col items-center gap-4 w-full">
            <button 
              onClick={handleBuildSchedule}
              className="group relative flex w-full max-w-[420px] cursor-pointer items-center justify-center overflow-hidden rounded-xl h-16 px-8 bg-[#8B5CF6] text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-[#8B5CF6]/40"
            >
              {/* Shimmer effect on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              
              <div className="flex items-center gap-3 relative z-10">
                <span className="material-symbols-outlined text-[28px] group-hover:rotate-12 transition-transform">
                  rocket_launch
                </span>
                <span className="text-xl font-bold tracking-tight">Build my schedule</span>
              </div>
            </button>

            <p className="text-xs text-[#8B5CF6]/60 font-normal">
              Takes about 30 seconds to generate your roadmap
            </p>
          </div>
        </div>
      </div>

      {/* Background Gradient Decorations */}
      <div className="fixed top-[-10%] left-[-5%] w-[40%] h-[40%] bg-[#8B5CF6]/5 rounded-full blur-[100px] -z-10" />
      <div className="fixed bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-[#8B5CF6]/10 rounded-full blur-[80px] -z-10" />
    </div>
  )
}