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
  buch: "Buch",
  report: "Bericht",
  bericht: "Bericht",
  thesis: "Thesis",
  article: "Artikel",
  artikel: "Artikel",
  norm: "Norm",
  presentation: "Präsentation",
  praesentation: "Präsentation",
  manual: "Handbuch",
  internal: "Intern",
  intern: "Intern",
}

const FILE_TYPE_LABELS: Record<string, string> = {
  ".pdf": "PDF",
  ".docx": "Word (DOCX)",
  ".pptx": "PowerPoint (PPTX)",
  ".txt": "Text",
  ".doc": "Word (DOC)",
  ".ppt": "PowerPoint (PPT)",
  ".xlsx": "Excel (XLSX)",
  ".xls": "Excel (XLS)",
}

const STATUS_LABELS: Record<string, string> = {
  done: "Fertig",
  error: "Fehler",
  processing: "Verarbeitung",
  pending: "Wartend",
}

export function FilterChips({ filters, onFilterChange }: FilterChipsProps) {
  const hasFilters =
    filters.category !== undefined ||
    filters.doc_type !== undefined ||
    filters.year_min !== undefined ||
    filters.year_max !== undefined ||
    filters.language !== undefined ||
    filters.author !== undefined ||
    filters.file_type !== undefined ||
    filters.processing_status !== undefined ||
    filters.file_size_min !== undefined ||
    filters.file_size_max !== undefined ||
    filters.created_after !== undefined ||
    filters.created_before !== undefined

  if (!hasFilters) return null

  function removeFilter(key: keyof SearchFilters) {
    const updated = { ...filters }
    if (key === "year_min" || key === "year_max") {
      delete updated.year_min
      delete updated.year_max
    } else if (key === "file_size_min" || key === "file_size_max") {
      delete updated.file_size_min
      delete updated.file_size_max
    } else if (key === "created_after" || key === "created_before") {
      delete updated.created_after
      delete updated.created_before
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

  const fileSizeLabel =
    filters.file_size_min === undefined && filters.file_size_max === 1048576
      ? "< 1 MB"
      : filters.file_size_min === 1048576 && filters.file_size_max === 10485760
        ? "1–10 MB"
        : filters.file_size_min === 10485760 && filters.file_size_max === 104857600
          ? "10–100 MB"
          : filters.file_size_min === 104857600 && filters.file_size_max === undefined
            ? "> 100 MB"
            : filters.file_size_min !== undefined || filters.file_size_max !== undefined
              ? `Größe`
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
      {filters.file_type !== undefined && (
        <Chip
          label={FILE_TYPE_LABELS[filters.file_type] ?? filters.file_type}
          onRemove={() => removeFilter("file_type")}
        />
      )}
      {filters.processing_status !== undefined && (
        <Chip
          label={STATUS_LABELS[filters.processing_status] ?? filters.processing_status}
          onRemove={() => removeFilter("processing_status")}
        />
      )}
      {fileSizeLabel !== null && (
        <Chip label={fileSizeLabel} onRemove={() => removeFilter("file_size_min")} />
      )}
      {(filters.created_after !== undefined || filters.created_before !== undefined) && (
        <Chip
          label={
            filters.created_after && filters.created_before
              ? `${filters.created_after} – ${filters.created_before}`
              : filters.created_after
                ? `ab ${filters.created_after}`
                : `bis ${filters.created_before}`
          }
          onRemove={() => removeFilter("created_after")}
        />
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
