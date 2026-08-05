/**
 * In-app navigation: collapsible groups with link items.
 * Filterable via the sidebar search.
 * Optional `roles` on items/groups: 'platform' | 'orgAdmin'
 * (omit = visible to all authenticated app users).
 *
 * Order note: `administration` is always rendered last by useAppNav
 * (regardless of position in this array). Prefer keeping it last here too.
 *
 * @typedef {{ id: string, label: string, to: string, roles?: Array<'platform'|'orgAdmin'> }} NavItem
 * @typedef {{ id: string, label: string, children: NavItem[], roles?: Array<'platform'|'orgAdmin'> }} NavGroup
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
  {
    id: 'data-sources',
    label: 'Data Sources',
    roles: ['platform', 'orgAdmin'],
    children: [
      {
        id: 'connector-types',
        label: 'Connector Type',
        to: '/data-sources/connector-types',
        roles: ['platform'],
      },
      {
        id: 'connections',
        label: 'Connections',
        to: '/data-sources/connections',
        roles: ['platform', 'orgAdmin'],
      },
      {
        id: 'sources',
        label: 'Sources',
        to: '/data-sources/sources',
        roles: ['platform', 'orgAdmin'],
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    roles: ['platform', 'orgAdmin'],
    children: [
      {
        id: 'platform-orgs',
        label: 'Organizations',
        to: '/platform/organizations',
        roles: ['platform'],
      },
      {
        id: 'admin-users',
        label: 'Users',
        to: '/administration/users',
        roles: ['platform', 'orgAdmin'],
      },
      {
        id: 'admin-roles',
        label: 'Roles',
        to: '/administration/roles',
        roles: ['platform', 'orgAdmin'],
      },
    ],
  },
]
