import { X } from "lucide-react"
import type { SearchFilters } from "@/lib/types"

interface FilterChipsProps {
  filters: SearchFilters
  onFilterChange: (filters: SearchFilters) => void
}

const DOC_TYPE_LABELS: Record<string, string> = {
  paper: "Paper",
  dissertation: "Dissertation",
  book: "Buch",
  report: "Bericht",
  thesis: "Thesis",
  article: "Artikel",
}

export function FilterChips({ filters, onFilterChange }: FilterChipsProps) {
  const hasFilters =
    filters.category !== undefined ||
    filters.doc_type !== undefined ||
    filters.year_min !== undefined ||
    filters.year_max !== undefined ||
    filters.language !== undefined ||
    filters.author !== undefined

  if (!hasFilters) return null

  function removeFilter(key: keyof SearchFilters) {
    const updated = { ...filters }
    if (key === "year_min" || key === "year_max") {
      delete updated.year_min
      delete updated.year_max
    } else {
      delete updated[key]
    }
    onFilterChange(updated)
  }

  function clearAll() {
    onFilterChange({})
  }

  const yearLabel =
    filters.year_min !== undefined && filters.year_max !== undefined
      ? filters.year_min === filters.year_max
        ? String(filters.year_min)
        : `${filters.year_min}–${filters.year_max}`
      : filters.year_min !== undefined
        ? `ab ${filters.year_min}`
        : filters.year_max !== undefined
          ? `bis ${filters.year_max}`
          : null

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2">
      {filters.category !== undefined && (
        <Chip label={filters.category} onRemove={() => removeFilter("category")} />
      )}
      {filters.doc_type !== undefined && (
        <Chip
          label={DOC_TYPE_LABELS[filters.doc_type] ?? filters.doc_type}
          onRemove={() => removeFilter("doc_type")}
        />
      )}
      {yearLabel !== null && (
        <Chip label={yearLabel} onRemove={() => removeFilter("year_min")} />
      )}
      {filters.language !== undefined && (
        <Chip label={filters.language} onRemove={() => removeFilter("language")} />
      )}
      {filters.author !== undefined && (
        <Chip label={filters.author} onRemove={() => removeFilter("author")} />
      )}
      <button
        type="button"
        onClick={clearAll}
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        Alle Filter löschen
      </button>
    </div>
  )
}

interface ChipProps {
  label: string
  onRemove: () => void
}

function Chip({ label, onRemove }: ChipProps) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-zinc-700 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-600">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Filter "${label}" entfernen`}
        className="flex items-center"
      >
        <X size={14} />
      </button>
    </span>
  )
}
