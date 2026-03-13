export type FilterState = 'included' | 'excluded' | 'none'
export type FilterStateMap = ReadonlyMap<string, FilterState>

const EMPTY: FilterStateMap = new Map()

export function empty(): FilterStateMap {
  return EMPTY
}

export function toggle(map: FilterStateMap, id: string): FilterStateMap {
  const current = map.get(id) ?? 'none'
  const next: FilterState =
    current === 'none' ? 'included' : current === 'included' ? 'excluded' : 'none'
  const updated = new Map(map)
  if (next === 'none') {
    updated.delete(id)
  } else {
    updated.set(id, next)
  }
  return updated
}

export function getIncluded(map: FilterStateMap): string[] {
  const result: string[] = []
  for (const [id, state] of map) {
    if (state === 'included') result.push(id)
  }
  return result
}

export function getExcluded(map: FilterStateMap): string[] {
  const result: string[] = []
  for (const [id, state] of map) {
    if (state === 'excluded') result.push(id)
  }
  return result
}

export function clear(): FilterStateMap {
  return EMPTY
}

export function hasSelections(map: FilterStateMap): boolean {
  return map.size > 0
}

export function count(map: FilterStateMap): number {
  return map.size
}
