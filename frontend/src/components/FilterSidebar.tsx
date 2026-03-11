import { useState } from "react"
import { ChevronDown } from "lucide-react"
import type { SearchFacets, SearchFilters } from "@/lib/types"

interface FilterSidebarProps {
  facets?: SearchFacets
  filters: SearchFilters
  onFilterChange: (filters: SearchFilters) => void
}

function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = true,
  borderBottom = true,
}: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
  borderBottom?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`p-4${borderBottom ? " border-b border-zinc-800" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mb-2 flex w-full cursor-pointer items-center justify-between"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {title}
          {!open && count !== undefined && (
            <span className="ml-2 text-zinc-600">{count}</span>
          )}
        </h3>
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-500 transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && children}
    </div>
  )
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

export function FilterSidebar({ facets, filters, onFilterChange }: FilterSidebarProps) {
  if (!facets) return null

  function handleCategoryClick(name: string) {
    onFilterChange({
      ...filters,
      category: filters.category === name ? undefined : name,
    })
  }

  function handleDocTypeClick(name: string) {
    onFilterChange({
      ...filters,
      doc_type: filters.doc_type === name ? undefined : name,
    })
  }

  function handleYearClick(year: string) {
    const yearNum = parseInt(year, 10)
    const isSelected = filters.year_min === yearNum && filters.year_max === yearNum
    onFilterChange({
      ...filters,
      year_min: isSelected ? undefined : yearNum,
      year_max: isSelected ? undefined : yearNum,
    })
  }

  function handleFileTypeClick(name: string) {
    onFilterChange({
      ...filters,
      file_type: filters.file_type === name ? undefined : name,
    })
  }

  function handleProcessingStatusClick(name: string) {
    onFilterChange({
      ...filters,
      processing_status: filters.processing_status === name ? undefined : name,
    })
  }

  function handleFileSizeClick(sizeMin: number | undefined, sizeMax: number | undefined) {
    const isSelected = filters.file_size_min === sizeMin && filters.file_size_max === sizeMax
    onFilterChange({
      ...filters,
      file_size_min: isSelected ? undefined : sizeMin,
      file_size_max: isSelected ? undefined : sizeMax,
    })
  }

  return (
    <div className="flex flex-col text-sm text-zinc-400">
      {facets.categories.length > 0 && (
        <CollapsibleSection title="Kategorien" count={facets.categories.length}>
          <ul className="flex flex-col gap-0.5">
            {facets.categories.map((item) => {
              const isSelected = filters.category === item.name
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => handleCategoryClick(item.name)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded px-3 py-1.5 hover:bg-zinc-800 ${
                      isSelected ? "bg-zinc-700 text-white" : ""
                    }`}
                  >
                    <span>{item.name}</span>
                    <span className="text-xs text-zinc-500">{item.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </CollapsibleSection>
      )}

      {facets.doc_types.length > 0 && (
        <CollapsibleSection title="Dokumenttyp" count={facets.doc_types.length}>
          <ul className="flex flex-col gap-0.5">
            {facets.doc_types.map((item) => {
              const isSelected = filters.doc_type === item.name
              const label = DOC_TYPE_LABELS[item.name] ?? item.name
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => handleDocTypeClick(item.name)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded px-3 py-1.5 hover:bg-zinc-800 ${
                      isSelected ? "bg-zinc-700 text-white" : ""
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs text-zinc-500">{item.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </CollapsibleSection>
      )}

      {facets.years.length > 0 && (
        <CollapsibleSection title="Jahr" count={facets.years.length}>
          <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
            {facets.years.map((item) => {
              const yearNum = parseInt(item.name, 10)
              const isSelected = filters.year_min === yearNum && filters.year_max === yearNum
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => handleYearClick(item.name)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded px-3 py-1.5 hover:bg-zinc-800 ${
                      isSelected ? "bg-zinc-700 text-white" : ""
                    }`}
                  >
                    <span>{item.name}</span>
                    <span className="text-xs text-zinc-500">{item.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </CollapsibleSection>
      )}

      {facets.file_types.length > 0 && (
        <CollapsibleSection title="Dateityp" count={facets.file_types.length}>
          <ul className="flex flex-col gap-0.5">
            {facets.file_types.map((item) => {
              const isSelected = filters.file_type === item.name
              const label = FILE_TYPE_LABELS[item.name] ?? item.name
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => handleFileTypeClick(item.name)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded px-3 py-1.5 hover:bg-zinc-800 ${
                      isSelected ? "bg-zinc-700 text-white" : ""
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs text-zinc-500">{item.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Dateigröße" count={4}>
        <ul className="flex flex-col gap-0.5">
          {[
            { label: "< 1 MB", sizeMin: undefined, sizeMax: 1048576 },
            { label: "1–10 MB", sizeMin: 1048576, sizeMax: 10485760 },
            { label: "10–100 MB", sizeMin: 10485760, sizeMax: 104857600 },
            { label: "> 100 MB", sizeMin: 104857600, sizeMax: undefined },
          ].map(({ label, sizeMin, sizeMax }) => {
            const isSelected = filters.file_size_min === sizeMin && filters.file_size_max === sizeMax
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => handleFileSizeClick(sizeMin, sizeMax)}
                  className={`flex w-full cursor-pointer items-center justify-between rounded px-3 py-1.5 hover:bg-zinc-800 ${
                    isSelected ? "bg-zinc-700 text-white" : ""
                  }`}
                >
                  <span>{label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </CollapsibleSection>

      {facets.statuses.length > 0 && (
        <CollapsibleSection title="Status" count={facets.statuses.length} borderBottom={false}>
          <ul className="flex flex-col gap-0.5">
            {facets.statuses.map((item) => {
              const isSelected = filters.processing_status === item.name
              const label = STATUS_LABELS[item.name] ?? item.name
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => handleProcessingStatusClick(item.name)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded px-3 py-1.5 hover:bg-zinc-800 ${
                      isSelected ? "bg-zinc-700 text-white" : ""
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs text-zinc-500">{item.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  )
}
