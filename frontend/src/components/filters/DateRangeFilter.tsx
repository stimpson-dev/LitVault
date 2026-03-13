import { useState, useRef, useEffect } from 'react'
import { CalendarRange, ChevronDown } from 'lucide-react'
import { useTranslation } from '@/i18n'

interface DateRangeFilterProps {
  createdAfter?: string
  createdBefore?: string
  onChange: (after?: string, before?: string) => void
}

export function DateRangeFilter({ createdAfter, createdBefore, onChange }: DateRangeFilterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [localAfter, setLocalAfter] = useState(createdAfter ?? '')
  const [localBefore, setLocalBefore] = useState(createdBefore ?? '')
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync local state when props change (e.g. external clear)
  useEffect(() => {
    setLocalAfter(createdAfter ?? '')
    setLocalBefore(createdBefore ?? '')
  }, [createdAfter, createdBefore])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const isActive = createdAfter !== undefined || createdBefore !== undefined

  function applyPreset(after: string, before: string) {
    setLocalAfter(after)
    setLocalBefore(before)
    onChange(after || undefined, before || undefined)
  }

  function getPresets() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')

    const thisMonthStart = `${year}-${month}-01`
    const today = now.toISOString().slice(0, 10)

    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10)

    const thisYearStart = `${year}-01-01`
    const lastYearStart = `${year - 1}-01-01`
    const lastYearEnd = `${year - 1}-12-31`

    return [
      { label: t('filter.thisMonth'), after: thisMonthStart, before: today },
      { label: t('filter.last3Months'), after: threeMonthsAgoStr, before: today },
      { label: t('filter.thisYear'), after: thisYearStart, before: today },
      { label: t('filter.lastYear'), after: lastYearStart, before: lastYearEnd },
    ]
  }

  function handleApply() {
    onChange(localAfter || undefined, localBefore || undefined)
    setOpen(false)
  }

  function handleClear() {
    setLocalAfter('')
    setLocalBefore('')
    onChange(undefined, undefined)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
          isActive
            ? 'border-blue-500 bg-blue-500/10 text-blue-300'
            : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800'
        }`}
      >
        <CalendarRange size={14} />
        <span>{t('filter.dateRange')}</span>
        {isActive && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-medium text-white">
            1
          </span>
        )}
        <ChevronDown
          size={12}
          className={`ml-0.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-zinc-700 bg-zinc-900 shadow-lg">
          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">{t('filter.from')}</label>
              <input
                type="date"
                value={localAfter}
                onChange={(e) => setLocalAfter(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">{t('filter.to')}</label>
              <input
                type="date"
                value={localBefore}
                onChange={(e) => setLocalBefore(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {getPresets().map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.after, preset.before)}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 border-t border-zinc-800 p-2">
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
            >
              {t('filter.apply')}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              {t('filter.clear')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
