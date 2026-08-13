import { appNavGroups } from '~/config/nav.js'

/**
 * App shell sidebar state (collapse / pin) + filtered nav.
 *
 * Pin ON  → stay expanded after navigating (manual collapse still allowed).
 * Pin OFF → collapse to icon rail (desktop) / hide drawer (mobile) after a menu selection.
 */
export function useAppNav() {
  const PIN_KEY = 'zorro-sidebar-pinned'
  const COLLAPSED_KEY = 'zorro-sidebar-collapsed'

  const pinned = useState('app-sidebar-pinned', () => true)
  const collapsed = useState('app-sidebar-collapsed', () => false)
  const searchQuery = useState('app-sidebar-search', () => '')
  const openGroups = useState('app-sidebar-open-groups', () => ({}))

  const { allowsRoles } = usePermissions()

  /**
   * Administration must stay last even if nav config order changes.
   * @param {Array<{ id: string }>} list
   */
  function withAdministrationLast(list) {
    const admin = []
    const rest = []
    for (const group of list) {
      if (group.id === 'administration') admin.push(group)
      else rest.push(group)
    }
    return [...rest, ...admin]
  }

  const groups = computed(() => {
    const visible = appNavGroups
      .map((group) => {
        if (!allowsRoles(group.roles)) return null
        const children = (group.children || []).filter((item) =>
          allowsRoles(item.roles),
        )
        if (!children.length) return null
        return { ...group, children }
      })
      .filter(Boolean)

    return withAdministrationLast(visible)
  })

  const filteredGroups = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return groups.value

    const filtered = groups.value
      .map((group) => {
        const groupMatch = group.label.toLowerCase().includes(q)
        const children = (group.children || []).filter(
          (item) =>
            groupMatch
            || item.label.toLowerCase().includes(q)
            || item.to.toLowerCase().includes(q),
        )
        if (!children.length && !groupMatch) return null
        return {
          ...group,
          children: groupMatch && !children.length ? group.children : children,
        }
      })
      .filter(Boolean)

    return withAdministrationLast(filtered)
  })

  function initSidebar() {
    if (!import.meta.client) return
    const savedPin = localStorage.getItem(PIN_KEY)
    const savedCollapsed = localStorage.getItem(COLLAPSED_KEY)
    if (savedPin !== null) pinned.value = savedPin === '1'
    if (savedCollapsed !== null) collapsed.value = savedCollapsed === '1'
    // First visit: pinned + expanded
    if (savedPin === null && savedCollapsed === null) {
      pinned.value = true
      collapsed.value = false
    }
    // Pin means “prefer open”; recover from a stale collapsed+pinned combo on load
    if (pinned.value) collapsed.value = false
  }

  function persist() {
    if (!import.meta.client) return
    localStorage.setItem(PIN_KEY, pinned.value ? '1' : '0')
    localStorage.setItem(COLLAPSED_KEY, collapsed.value ? '1' : '0')
  }

  function togglePinned() {
    pinned.value = !pinned.value
    if (pinned.value) {
      collapsed.value = false
    }
    persist()
  }

  function toggleCollapsed() {
    collapsed.value = !collapsed.value
    persist()
  }

  function setCollapsed(value) {
    collapsed.value = Boolean(value)
    persist()
  }

  /**
   * After choosing a nav destination: keep open if pinned, otherwise collapse.
   */
  function collapseAfterNavigate() {
    if (!pinned.value) {
      setCollapsed(true)
    }
  }

  function isGroupOpen(groupId) {
    if (searchQuery.value.trim()) return true
    if (openGroups.value[groupId] === undefined) return true
    return Boolean(openGroups.value[groupId])
  }

  function setGroupOpen(groupId, open) {
    openGroups.value = {
      ...openGroups.value,
      [groupId]: Boolean(open),
    }
  }

  function toggleGroup(groupId) {
    setGroupOpen(groupId, !isGroupOpen(groupId))
  }

  /**
   * Open the group hub page (same targets as Back). Does not toggle expand.
   * @param {{ id: string, to?: string }} group
   */
  async function openGroupHub(group) {
    if (!group?.to) return
    await navigateTo(group.to)
  }

  /**
   * From the collapsed rail: expand the sidebar and open only this group.
   * @param {{ id: string }} group
   */
  function expandGroupFromRail(group) {
    if (!group?.id) return
    const next = {}
    for (const g of groups.value) {
      next[g.id] = g.id === group.id
    }
    openGroups.value = next
    setCollapsed(false)
  }

  return {
    pinned,
    collapsed,
    searchQuery,
    groups,
    filteredGroups,
    initSidebar,
    togglePinned,
    toggleCollapsed,
    setCollapsed,
    collapseAfterNavigate,
    isGroupOpen,
    toggleGroup,
    setGroupOpen,
    openGroupHub,
    expandGroupFromRail,
  }
}
