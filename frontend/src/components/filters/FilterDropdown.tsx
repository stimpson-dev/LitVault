import { useState, useRef, useEffect } from 'react'
import { Check, X, Circle, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { FilterStateMap } from './FilterSelectionModel'
import * as FSM from './FilterSelectionModel'

interface FilterDropdownItem {
  value: string
  label: string
  count: number
}

interface FilterDropdownProps {
  title: string
  icon: LucideIcon
  items: FilterDropdownItem[]
  selections: FilterStateMap
  onSelectionChange: (selections: FilterStateMap) => void
}

export function FilterDropdown({
  title,
  icon: Icon,
  items,
  selections,
  onSelectionChange,
}: FilterDropdownProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

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

  const activeCount = FSM.count(selections)
  const isActive = activeCount > 0

  const filtered = search.trim()
    ? items.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
    : items

  function handleToggle(value: string) {
    onSelectionChange(FSM.toggle(selections, value))
  }

  function handleClear() {
    onSelectionChange(FSM.clear())
    setSearch('')
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
        <Icon size={14} />
        <span>{title}</span>
        {isActive && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-medium text-white">
            {activeCount}
          </span>
        )}
        <ChevronDown
          size={12}
          className={`ml-0.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-zinc-700 bg-zinc-900 shadow-lg">
          <div className="border-b border-zinc-800 p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('filter.search')}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-500">—</li>
            ) : (
              filtered.map((item) => {
                const state = selections.get(item.value) ?? 'none'
                return (
                  <li key={item.value}>
                    <button
                      type="button"
                      onClick={() => handleToggle(item.value)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-800"
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {state === 'included' && (
                          <Check size={13} className="text-green-400" />
                        )}
                        {state === 'excluded' && (
                          <X size={13} className="text-red-400" />
                        )}
                        {state === 'none' && (
                          <Circle size={13} className="text-zinc-600" />
                        )}
                      </span>
                      <span
                        className={`flex-1 text-left ${
                          state === 'included'
                            ? 'text-green-300'
                            : state === 'excluded'
                              ? 'text-red-300'
                              : 'text-zinc-300'
                        }`}
                      >
                        {item.label}
                      </span>
                      <span className="text-xs text-zinc-500">{item.count}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          {isActive && (
            <div className="border-t border-zinc-800 p-2">
              <button
                type="button"
                onClick={handleClear}
                className="w-full rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                {t('filter.clear')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
