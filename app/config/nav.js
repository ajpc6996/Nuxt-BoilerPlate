/**
 * In-app navigation: collapsible groups with link items.
 * Filterable via the sidebar search.
 *
 * @typedef {{ id: string, label: string, to: string }} NavItem
 * @typedef {{ id: string, label: string, children: NavItem[] }} NavGroup
 */

/** @type {NavGroup[]} */
export const appNavGroups = [
  {
    id: 'demo',
    label: 'Demo',
    children: [
      {
        id: 'grid',
        label: 'Grid',
        to: '/grid',
      },
      {
        id: 'widgets',
        label: 'Widgets',
        to: '/widgets',
      },
    ],
  },
]
