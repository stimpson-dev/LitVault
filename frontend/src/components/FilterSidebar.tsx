import type { SearchFacets, SearchFilters } from "@/lib/types"

interface FilterSidebarProps {
  facets?: SearchFacets
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

  return (
    <div className="flex flex-col text-sm text-zinc-400">
      {facets.categories.length > 0 && (
        <div className="border-b border-zinc-800 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Kategorien
          </h3>
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
        </div>
      )}

      {facets.doc_types.length > 0 && (
        <div className="border-b border-zinc-800 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Dokumenttyp
          </h3>
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
        </div>
      )}

      {facets.years.length > 0 && (
        <div className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Jahr
          </h3>
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
        </div>
      )}
    </div>
  )
}
