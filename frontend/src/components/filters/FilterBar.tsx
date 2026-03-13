import { useState } from 'react'
import { FolderOpen, FileText, Calendar, File, CircleDot, RotateCcw } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { SearchFacets, SearchFilters } from '@/lib/types'
import { FilterDropdown } from './FilterDropdown'
import { DateRangeFilter } from './DateRangeFilter'
import type { FilterStateMap } from './FilterSelectionModel'
import * as FSM from './FilterSelectionModel'

interface FilterBarProps {
  facets?: SearchFacets
  filters: SearchFilters
  onFilterChange: (filters: SearchFilters) => void
}

function useDocTypeLabel() {
  const { t } = useTranslation()
  return (name: string): string => {
    const map: Record<string, TranslationKey> = {
      paper: 'docType.paper',
      dissertation: 'docType.dissertation',
      book: 'docType.book',
      buch: 'docType.book',
      report: 'docType.report',
      bericht: 'docType.report',
      thesis: 'docType.thesis',
      article: 'docType.article',
      artikel: 'docType.article',
      norm: 'docType.norm',
      presentation: 'docType.presentation',
      praesentation: 'docType.presentation',
      manual: 'docType.manual',
      internal: 'docType.internal',
      intern: 'docType.internal',
    }
    return map[name] ? t(map[name]) : name
  }
}

function useFileTypeLabel() {
  const { t } = useTranslation()
  return (name: string): string => {
    const map: Record<string, TranslationKey> = {
      '.pdf': 'fileType.pdf',
      '.docx': 'fileType.docx',
      '.pptx': 'fileType.pptx',
      '.txt': 'fileType.txt',
      '.doc': 'fileType.doc',
      '.ppt': 'fileType.ppt',
      '.xlsx': 'fileType.xlsx',
      '.xls': 'fileType.xls',
    }
    return map[name] ? t(map[name]) : name
  }
}

function useStatusLabel() {
  const { t } = useTranslation()
  return (name: string): string => {
    const map: Record<string, TranslationKey> = {
      done: 'status.done',
      error: 'status.error',
      processing: 'status.processing',
      pending: 'status.pending',
    }
    return map[name] ? t(map[name]) : name
  }
}

// Build a FilterStateMap seeded from the current single-value filter
function seedMap(value: string | undefined): FilterStateMap {
  if (!value) return FSM.empty()
  return new Map([[value, 'included']])
}

// Build a FilterStateMap for year: if year_min === year_max, seed that year as included
function seedYearMap(year_min: number | undefined, year_max: number | undefined): FilterStateMap {
  if (year_min !== undefined && year_max !== undefined && year_min === year_max) {
    return new Map([[String(year_min), 'included']])
  }
  return FSM.empty()
}

export function FilterBar({ facets, filters, onFilterChange }: FilterBarProps) {
  const { t } = useTranslation()
  const getDocTypeLabel = useDocTypeLabel()
  const getFileTypeLabel = useFileTypeLabel()
  const getStatusLabel = useStatusLabel()

  // Per-facet selection state, derived from filters on mount/prop change
  // We track these locally because the API only supports single-value inclusion
  const [categoryMap, setCategoryMap] = useState<FilterStateMap>(() =>
    seedMap(filters.category)
  )
  const [docTypeMap, setDocTypeMap] = useState<FilterStateMap>(() =>
    seedMap(filters.doc_type)
  )
  const [yearMap, setYearMap] = useState<FilterStateMap>(() =>
    seedYearMap(filters.year_min, filters.year_max)
  )
  const [fileTypeMap, setFileTypeMap] = useState<FilterStateMap>(() =>
    seedMap(filters.file_type)
  )
  const [statusMap, setStatusMap] = useState<FilterStateMap>(() =>
    seedMap(filters.processing_status)
  )

  const hasAnyFilter =
    FSM.hasSelections(categoryMap) ||
    FSM.hasSelections(docTypeMap) ||
    FSM.hasSelections(yearMap) ||
    FSM.hasSelections(fileTypeMap) ||
    FSM.hasSelections(statusMap) ||
    filters.created_after !== undefined ||
    filters.created_before !== undefined

  function applyFilters(
    catMap: FilterStateMap,
    dtMap: FilterStateMap,
    yrMap: FilterStateMap,
    ftMap: FilterStateMap,
    stMap: FilterStateMap,
    dateAfter?: string,
    dateBefore?: string,
  ) {
    const included_category = FSM.getIncluded(catMap)[0]
    const included_docType = FSM.getIncluded(dtMap)[0]
    const included_years = FSM.getIncluded(yrMap).map(Number).sort((a, b) => a - b)
    const included_fileType = FSM.getIncluded(ftMap)[0]
    const included_status = FSM.getIncluded(stMap)[0]

    const year_min = included_years.length > 0 ? included_years[0] : undefined
    const year_max = included_years.length > 0 ? included_years[included_years.length - 1] : undefined

    onFilterChange({
      ...filters,
      category: included_category,
      doc_type: included_docType,
      year_min,
      year_max,
      file_type: included_fileType,
      processing_status: included_status,
      created_after: dateAfter,
      created_before: dateBefore,
    })
  }

  function handleCategoryChange(map: FilterStateMap) {
    setCategoryMap(map)
    applyFilters(map, docTypeMap, yearMap, fileTypeMap, statusMap, filters.created_after, filters.created_before)
  }

  function handleDocTypeChange(map: FilterStateMap) {
    setDocTypeMap(map)
    applyFilters(categoryMap, map, yearMap, fileTypeMap, statusMap, filters.created_after, filters.created_before)
  }

  function handleYearChange(map: FilterStateMap) {
    setYearMap(map)
    applyFilters(categoryMap, docTypeMap, map, fileTypeMap, statusMap, filters.created_after, filters.created_before)
  }

  function handleFileTypeChange(map: FilterStateMap) {
    setFileTypeMap(map)
    applyFilters(categoryMap, docTypeMap, yearMap, map, statusMap, filters.created_after, filters.created_before)
  }

  function handleStatusChange(map: FilterStateMap) {
    setStatusMap(map)
    applyFilters(categoryMap, docTypeMap, yearMap, fileTypeMap, map, filters.created_after, filters.created_before)
  }

  function handleDateChange(after?: string, before?: string) {
    applyFilters(categoryMap, docTypeMap, yearMap, fileTypeMap, statusMap, after, before)
  }

  function handleResetAll() {
    const empty = FSM.empty()
    setCategoryMap(empty)
    setDocTypeMap(empty)
    setYearMap(empty)
    setFileTypeMap(empty)
    setStatusMap(empty)
    onFilterChange({})
  }

  const categoryItems = (facets?.categories ?? []).map((item) => ({
    value: item.name,
    label: item.name,
    count: item.count,
  }))

  const docTypeItems = (facets?.doc_types ?? []).map((item) => ({
    value: item.name,
    label: getDocTypeLabel(item.name),
    count: item.count,
  }))

  const yearItems = (facets?.years ?? []).map((item) => ({
    value: item.name,
    label: item.name,
    count: item.count,
  }))

  const fileTypeItems = (facets?.file_types ?? []).map((item) => ({
    value: item.name,
    label: getFileTypeLabel(item.name),
    count: item.count,
  }))

  const statusItems = (facets?.statuses ?? []).map((item) => ({
    value: item.name,
    label: getStatusLabel(item.name),
    count: item.count,
  }))

  return (
    <div className="sticky top-14 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        {categoryItems.length > 0 && (
          <FilterDropdown
            title={t('filter.categories')}
            icon={FolderOpen}
            items={categoryItems}
            selections={categoryMap}
            onSelectionChange={handleCategoryChange}
          />
        )}
        {docTypeItems.length > 0 && (
          <FilterDropdown
            title={t('filter.docType')}
            icon={FileText}
            items={docTypeItems}
            selections={docTypeMap}
            onSelectionChange={handleDocTypeChange}
          />
        )}
        {yearItems.length > 0 && (
          <FilterDropdown
            title={t('filter.year')}
            icon={Calendar}
            items={yearItems}
            selections={yearMap}
            onSelectionChange={handleYearChange}
          />
        )}
        {fileTypeItems.length > 0 && (
          <FilterDropdown
            title={t('filter.fileType')}
            icon={File}
            items={fileTypeItems}
            selections={fileTypeMap}
            onSelectionChange={handleFileTypeChange}
          />
        )}
        {statusItems.length > 0 && (
          <FilterDropdown
            title={t('filter.status')}
            icon={CircleDot}
            items={statusItems}
            selections={statusMap}
            onSelectionChange={handleStatusChange}
          />
        )}
        <DateRangeFilter
          createdAfter={filters.created_after}
          createdBefore={filters.created_before}
          onChange={handleDateChange}
        />
        <div className="ml-auto">
          <button
            type="button"
            onClick={handleResetAll}
            disabled={!hasAnyFilter}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300 disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCcw size={13} />
            {t('filter.resetAll')}
          </button>
        </div>
      </div>
    </div>
  )
}
