/**
 * Dashboard-wide cross-filter bus.
 */
export const useDashboardFilters = () => {
  const filters = useState('dashboard-cross-filters', () => [])

  /**
   * @param {{ field: string, op?: string, value: string, sourceWidgetId?: string, label?: string }} filter
   */
  function setFilter(filter) {
    if (!filter?.field) return
    const next = {
      field: String(filter.field),
      op: filter.op === 'neq' ? 'neq' : 'eq',
      value: String(filter.value ?? ''),
      sourceWidgetId: filter.sourceWidgetId || null,
      label: filter.label || `${filter.field}=${filter.value}`,
    }
    filters.value = [
      ...filters.value.filter((f) => f.field !== next.field),
      next,
    ]
  }

  /**
   * @param {string} [field]
   */
  function clearFilters(field) {
    if (!field) {
      filters.value = []
      return
    }
    filters.value = filters.value.filter((f) => f.field !== field)
  }

  const filterPayload = computed(() =>
    filters.value.map(({ field, op, value }) => ({ field, op, value })),
  )

  const focusLabel = computed(() =>
    filters.value.map((f) => f.label || `${f.field}=${f.value}`).join(' · '),
  )

  return {
    filters,
    filterPayload,
    focusLabel,
    setFilter,
    clearFilters,
  }
}
