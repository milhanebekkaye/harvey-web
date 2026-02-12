'use client'

const ENERGY_OPTIONS = [
  { value: 'mornings', label: 'Morning Person' },
  { value: 'afternoons', label: 'Afternoon Person' },
  { value: 'evenings', label: 'Evening Person' },
] as const

const SESSION_LENGTHS = [15, 30, 60, 90, 120] as const
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
  { value: 'direct', label: 'Direct & Brief' },
  { value: 'encouraging', label: 'Encouraging' },
  { value: 'detailed', label: 'Detailed' },
] as const

interface PreferencesSectionProps {
  energyPeak?: string
  restDays: string[]
  preferredSessionLength: number | null
  communicationStyle: string | null
  onChangeUser: (preferred_session_length: number | null, communication_style: string | null) => void
  onChangePreferences: (preferences: { energy_peak?: string; rest_days?: string[] }) => void
}

export function PreferencesSection({
  energyPeak,
  restDays,
  preferredSessionLength,
  communicationStyle,
  onChangeUser,
  onChangePreferences,
}: PreferencesSectionProps) {
  const isCustomSession = preferredSessionLength != null && !SESSION_LENGTHS.includes(preferredSessionLength as 15 | 30 | 60 | 90 | 120)
  const customMinutes = isCustomSession ? preferredSessionLength : 60

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
              <span className="text-sm text-slate-700">{opt.label}</span>
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
