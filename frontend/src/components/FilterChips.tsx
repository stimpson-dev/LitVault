import { X } from "lucide-react"
import type { SearchFilters } from "@/lib/types"
import { useTranslation } from "@/i18n"
import type { TranslationKey } from "@/i18n"

interface FilterChipsProps {
  filters: SearchFilters
  onFilterChange: (filters: SearchFilters) => void
}

export function FilterChips({ filters, onFilterChange }: FilterChipsProps) {
  const { t } = useTranslation()

  function getDocTypeLabel(name: string): string {
    const map: Record<string, TranslationKey> = {
      paper: "docType.paper",
      dissertation: "docType.dissertation",
      book: "docType.book",
      buch: "docType.book",
      report: "docType.report",
      bericht: "docType.report",
      thesis: "docType.thesis",
      article: "docType.article",
      artikel: "docType.article",
      norm: "docType.norm",
      presentation: "docType.presentation",
      praesentation: "docType.presentation",
      manual: "docType.manual",
      internal: "docType.internal",
      intern: "docType.internal",
    }
    return map[name] ? t(map[name]) : name
  }

  function getFileTypeLabel(name: string): string {
    const map: Record<string, TranslationKey> = {
      ".pdf": "fileType.pdf",
      ".docx": "fileType.docx",
      ".pptx": "fileType.pptx",
      ".txt": "fileType.txt",
      ".doc": "fileType.doc",
      ".ppt": "fileType.ppt",
      ".xlsx": "fileType.xlsx",
      ".xls": "fileType.xls",
    }
    return map[name] ? t(map[name]) : name
  }

  function getStatusLabel(name: string): string {
    const map: Record<string, TranslationKey> = {
      done: "status.done",
      error: "status.error",
      processing: "status.processing",
      pending: "status.pending",
    }
    return map[name] ? t(map[name]) : name
  }

  const hasFilters =
    filters.category !== undefined ||
    filters.doc_type !== undefined ||
    filters.year_min !== undefined ||
    filters.year_max !== undefined ||
    filters.language !== undefined ||
    filters.author !== undefined ||
    filters.has_text !== undefined ||
    filters.classification_source !== undefined ||
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
        ? `${t("chips.yearFrom")} ${filters.year_min}`
        : filters.year_max !== undefined
          ? `${t("chips.yearTo")} ${filters.year_max}`
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
              ? t("chips.size")
              : null

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2">
      {filters.category !== undefined && (
        <Chip label={filters.category} onRemove={() => removeFilter("category")} removeLabel={t("filter.removeFilter")} />
      )}
      {filters.doc_type !== undefined && (
        <Chip
          label={getDocTypeLabel(filters.doc_type)}
          onRemove={() => removeFilter("doc_type")}
          removeLabel={t("filter.removeFilter")}
        />
      )}
      {yearLabel !== null && (
        <Chip label={yearLabel} onRemove={() => removeFilter("year_min")} removeLabel={t("filter.removeFilter")} />
      )}
      {filters.language !== undefined && (
        <Chip label={filters.language} onRemove={() => removeFilter("language")} removeLabel={t("filter.removeFilter")} />
      )}
      {filters.author !== undefined && (
        <Chip label={filters.author} onRemove={() => removeFilter("author")} removeLabel={t("filter.removeFilter")} />
      )}
      {filters.file_type !== undefined && (
        <Chip
          label={getFileTypeLabel(filters.file_type)}
          onRemove={() => removeFilter("file_type")}
          removeLabel={t("filter.removeFilter")}
        />
      )}
      {filters.processing_status !== undefined && (
        <Chip
          label={getStatusLabel(filters.processing_status)}
          onRemove={() => removeFilter("processing_status")}
          removeLabel={t("filter.removeFilter")}
        />
      )}
      {filters.has_text !== undefined && (
        <Chip
          label={filters.has_text ? t("chips.hasText") : t("chips.noText")}
          onRemove={() => removeFilter("has_text")}
          removeLabel={t("filter.removeFilter")}
        />
      )}
      {filters.classification_source !== undefined && (
        <Chip
          label={t(`chips.cls.${filters.classification_source}` as TranslationKey)}
          onRemove={() => removeFilter("classification_source")}
          removeLabel={t("filter.removeFilter")}
        />
      )}
      {fileSizeLabel !== null && (
        <Chip label={fileSizeLabel} onRemove={() => removeFilter("file_size_min")} removeLabel={t("filter.removeFilter")} />
      )}
      {(filters.created_after !== undefined || filters.created_before !== undefined) && (
        <Chip
          label={
            filters.created_after && filters.created_before
              ? `${filters.created_after} – ${filters.created_before}`
              : filters.created_after
                ? `${t("chips.yearFrom")} ${filters.created_after}`
                : `${t("chips.yearTo")} ${filters.created_before}`
          }
          onRemove={() => removeFilter("created_after")}
          removeLabel={t("filter.removeFilter")}
        />
      )}
      <button
        type="button"
        onClick={clearAll}
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        {t("filter.clearAll")}
      </button>
    </div>
  )
}

interface ChipProps {
  label: string
  onRemove: () => void
  removeLabel: string
}

function Chip({ label, onRemove, removeLabel }: ChipProps) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-zinc-700 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-600">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${removeLabel}: ${label}`}
        className="flex items-center"
      >
        <X size={14} />
      </button>
    </span>
  )
}
