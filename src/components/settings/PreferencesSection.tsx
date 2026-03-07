'use client'

const ENERGY_OPTIONS = [
  { value: 'mornings', label: '🌅 Morning', short: 'Morning' },
  { value: 'afternoons', label: '☀️ Afternoon', short: 'Afternoon' },
  { value: 'evenings', label: '🌙 Evening', short: 'Evening' },
] as const

const SESSION_LENGTHS = [15, 30, 60, 90, 120] as const
const SESSION_LABELS: Record<number, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  90: '1.5h',
  120: '2h',
}
const REST_DAYS = [
  { value: 'sunday', label: 'Sun' },
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
] as const

const COMMUNICATION_OPTIONS = [
  { value: 'direct', label: 'Direct & Brief', description: 'Short, actionable feedback' },
  { value: 'encouraging', label: 'Encouraging', description: 'Supportive and motivating' },
  { value: 'detailed', label: 'Detailed', description: 'In-depth explanations' },
] as const

interface PreferencesSectionProps {
  energyPeak?: string
  restDays: string[]
  preferredSessionLength: number | null
  communicationStyle: string | null
  onChangeUser: (preferred_session_length: number | null, communication_style: string | null) => void
  onChangePreferences: (preferences: { energy_peak?: string; rest_days?: string[] }) => void
  variant?: 'default' | 'grid'
}

export function PreferencesSection({
  energyPeak,
  restDays,
  preferredSessionLength,
  communicationStyle,
  onChangeUser,
  onChangePreferences,
  variant = 'default',
}: PreferencesSectionProps) {
  const isCustomSession = preferredSessionLength != null && !SESSION_LENGTHS.includes(preferredSessionLength as 15 | 30 | 60 | 90 | 120)
  const customMinutes = isCustomSession ? preferredSessionLength : 60

  if (variant === 'grid') {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-12 gap-x-6 gap-y-0">
          {/* Energy Pattern */}
          <div className="col-span-4 pt-4 pb-4 border-b border-black/[0.04]">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Energy pattern</p>
            <p className="text-sm text-slate-500 mt-1">When you&apos;re most productive</p>
          </div>
          <div className="col-span-8 pt-4 pb-4 border-b border-black/[0.04] flex items-center">
            <div className="flex rounded-xl p-1 bg-[rgba(0,0,0,0.03)] gap-0.5">
              {ENERGY_OPTIONS.map((opt) => {
                const selected = (energyPeak ?? '') === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangePreferences({ energy_peak: opt.value })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selected
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Rest Days */}
          <div className="col-span-4 py-4 border-b border-black/[0.04]">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Rest days</p>
            <p className="text-sm text-slate-500 mt-1">Days Harvey won&apos;t schedule work</p>
          </div>
          <div className="col-span-8 py-4 border-b border-black/[0.04] flex flex-wrap gap-2 items-center">
            {REST_DAYS.map(({ value, label }) => {
              const selected = restDays.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    const next = restDays.includes(value)
                      ? restDays.filter((d) => d !== value)
                      : [...restDays, value]
                    onChangePreferences({ rest_days: next })
                  }}
                  className={`w-10 h-10 rounded-full text-sm font-medium transition-colors shrink-0 ${
                    selected
                      ? 'bg-gradient-to-r from-[#895af6] to-[#7849d9] text-white'
                      : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Session Length */}
          <div className="col-span-4 py-4 border-b border-black/[0.04]">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Session length</p>
            <p className="text-sm text-slate-500 mt-1">How long you like to work in one sitting</p>
          </div>
          <div className="col-span-8 py-4 border-b border-black/[0.04] flex flex-wrap gap-2 items-center">
            <div className="flex rounded-xl p-1 bg-[rgba(0,0,0,0.03)] gap-0.5 flex-wrap">
              {SESSION_LENGTHS.map((m) => {
                const selected = !isCustomSession && (preferredSessionLength ?? 60) === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChangeUser(m, communicationStyle)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {SESSION_LABELS[m]}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => onChangeUser(customMinutes, communicationStyle)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isCustomSession ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Custom
              </button>
            </div>
            {isCustomSession && (
              <div className="flex items-center gap-2 mt-2 w-full">
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={customMinutes}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    if (!isNaN(n)) onChangeUser(n, communicationStyle)
                  }}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                />
                <span className="text-sm text-slate-400">min</span>
              </div>
            )}
          </div>

          {/* Communication Style */}
          <div className="col-span-4 py-4 border-b border-black/[0.04]">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Communication style</p>
            <p className="text-sm text-slate-500 mt-1">How Harvey talks to you</p>
          </div>
          <div className="col-span-8 py-4 border-b border-black/[0.04]">
            <div className="flex gap-3">
              {COMMUNICATION_OPTIONS.map((opt) => {
                const selected = (communicationStyle ?? 'encouraging') === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangeUser(preferredSessionLength, opt.value)}
                    className={`flex-1 rounded-xl border-2 p-4 text-left transition-colors ${
                      selected
                        ? 'border-violet-300 bg-violet-50/50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                    <p className="text-xs text-slate-400 mt-1">{opt.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Preferences</h2>
      <p className="text-slate-500 text-sm mb-5">
        How you like to work and how Harvey should communicate.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">Energy pattern</label>
        <div className="flex flex-wrap gap-3">
          {ENERGY_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="energy"
                value={opt.value}
                checked={(energyPeak ?? '') === opt.value}
                onChange={() => onChangePreferences({ energy_peak: opt.value })}
                className="text-[#895af6] focus:ring-[#895af6]"
              />
              <span className="text-sm text-slate-700">{opt.short}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">Rest days</label>
        <p className="text-xs text-slate-500 mb-2">Days you don&apos;t want to work on this project</p>
        <div className="flex flex-wrap gap-2">
          {REST_DAYS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={restDays.includes(value)}
                onChange={() => {
                  const next = restDays.includes(value)
                    ? restDays.filter((d) => d !== value)
                    : [...restDays, value]
                  onChangePreferences({ rest_days: next })
                }}
                className="rounded border-slate-300 text-[#895af6] focus:ring-[#895af6]"
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">Preferred session length (minutes)</label>
        <div className="flex flex-wrap gap-2 items-center">
          {SESSION_LENGTHS.map((m) => (
            <label key={m} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="session"
                value={m}
                checked={!isCustomSession && (preferredSessionLength ?? 60) === m}
                onChange={() => onChangeUser(m, communicationStyle)}
                className="text-[#895af6] focus:ring-[#895af6]"
              />
              <span className="text-sm text-slate-700">{m}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="session"
              checked={isCustomSession}
              onChange={() => onChangeUser(customMinutes, communicationStyle)}
              className="text-[#895af6] focus:ring-[#895af6]"
            />
            <span className="text-sm text-slate-700">Custom</span>
          </label>
          {isCustomSession && (
            <input
              type="number"
              min={5}
              max={240}
              value={customMinutes}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                if (!isNaN(n)) onChangeUser(n, communicationStyle)
              }}
              className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"
            />
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Communication style</label>
        <div className="flex flex-wrap gap-3">
          {COMMUNICATION_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="comm"
                value={opt.value}
                checked={(communicationStyle ?? 'encouraging') === opt.value}
                onChange={() => onChangeUser(preferredSessionLength, opt.value)}
                className="text-[#895af6] focus:ring-[#895af6]"
              />
              <span className="text-sm text-slate-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  )
}
