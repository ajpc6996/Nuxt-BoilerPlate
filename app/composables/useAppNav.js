import { appNavGroups } from '~/config/nav.js'

/**
 * App shell sidebar state (collapse / pin) + filtered nav.
 */
export function useAppNav() {
  const PIN_KEY = 'zorro-sidebar-pinned'
  const COLLAPSED_KEY = 'zorro-sidebar-collapsed'

  const pinned = useState('app-sidebar-pinned', () => true)
  const collapsed = useState('app-sidebar-collapsed', () => false)
  const searchQuery = useState('app-sidebar-search', () => '')
  const openGroups = useState('app-sidebar-open-groups', () => ({}))

  const { allowsRoles } = usePermissions()

  const groups = computed(() => {
    return appNavGroups
      .map((group) => {
        if (!allowsRoles(group.roles)) return null
        const children = (group.children || []).filter((item) =>
          allowsRoles(item.roles),
        )
        if (!children.length) return null
        return { ...group, children }
      })
      .filter(Boolean)
  })

  const filteredGroups = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return groups.value

    return groups.value
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
  })

  function initSidebar() {
    if (!import.meta.client) return
    const savedPin = localStorage.getItem(PIN_KEY)
    const savedCollapsed = localStorage.getItem(COLLAPSED_KEY)
    if (savedPin !== null) pinned.value = savedPin === '1'
    if (savedCollapsed !== null) collapsed.value = savedCollapsed === '1'
    // Default: expanded when pinned
    if (savedPin === null && savedCollapsed === null) {
      pinned.value = true
      collapsed.value = false
    }
  }

  function persist() {
    if (!import.meta.client) return
    localStorage.setItem(PIN_KEY, pinned.value ? '1' : '0')
    localStorage.setItem(COLLAPSED_KEY, collapsed.value ? '1' : '0')
  }

  function togglePinned() {
    pinned.value = !pinned.value
    if (pinned.value) collapsed.value = false
    persist()
  }

  function toggleCollapsed() {
    if (pinned.value && !collapsed.value) {
      // Unpinning via collapse when pinned: just collapse temporarily
      collapsed.value = true
    } else {
      collapsed.value = !collapsed.value
    }
    if (!collapsed.value) {
      // expanding implies useful to keep open
    }
    persist()
  }

  function setCollapsed(value) {
    collapsed.value = Boolean(value)
    persist()
  }

  function isGroupOpen(groupId) {
    if (searchQuery.value.trim()) return true
    if (openGroups.value[groupId] === undefined) return true
    return Boolean(openGroups.value[groupId])
  }

  function toggleGroup(groupId) {
    openGroups.value = {
      ...openGroups.value,
      [groupId]: !isGroupOpen(groupId),
    }
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
    isGroupOpen,
    toggleGroup,
  }
}
