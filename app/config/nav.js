/**
 * In-app navigation: collapsible groups with link items.
 * Filterable via the sidebar search.
 * Optional `roles` on items/groups: 'platform' | 'orgAdmin'
 * (omit = visible to all authenticated app users).
 *
 * `icon` on a group is a key from `app/utils/navIcons.js` (shown in the
 * collapsed rail and beside the group label when expanded).
 *
 * Order note: `administration` is always rendered last by useAppNav
 * (regardless of position in this array). Prefer keeping it last here too.
 *
 * @typedef {{ id: string, label: string, to: string, roles?: Array<'platform'|'orgAdmin'> }} NavItem
 * @typedef {{ id: string, label: string, icon?: string, to?: string, children: NavItem[], roles?: Array<'platform'|'orgAdmin'> }} NavGroup
 */

/** @type {NavGroup[]} */
export const appNavGroups = [
  {
    id: 'dashboards',
    label: 'Dashboards',
    icon: 'dashboard',
    to: '/dashboards',
    children: [
      {
        id: 'dashboards-view',
        label: 'View Dashboards',
        to: '/dashboards',
      },
      {
        id: 'dashboards-configure',
        label: 'Configure Dashboards',
        to: '/dashboards/configure',
        roles: ['platform', 'orgAdmin'],
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'reports',
    to: '/reports',
    children: [
      {
        id: 'reports-view',
        label: 'View Reports',
        to: '/reports',
      },
      {
        id: 'reports-configure',
        label: 'Configure Reports',
        to: '/reports/configure',
        roles: ['platform', 'orgAdmin'],
      },
    ],
  },
  {
    id: 'demo',
    label: 'Demo',
    icon: 'demo',
    roles: ['platform'],
    children: [
      {
        id: 'grid',
        label: 'Grid',
        to: '/grid',
        roles: ['platform'],
      },
      {
        id: 'widgets',
        label: 'Widgets',
        to: '/widgets',
        roles: ['platform'],
      },
    ],
  },
  {
    id: 'data-sources',
    label: 'Data Sources',
    icon: 'data-sources',
    to: '/data-sources',
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
    icon: 'administration',
    to: '/administration',
    roles: ['platform', 'orgAdmin'],
    children: [
      {
        id: 'platform-orgs',
        label: 'Organizations',
        to: '/platform/organizations',
        roles: ['platform'],
      },
      {
        id: 'admin-licence',
        label: 'Licence & usage',
        to: '/administration/licence',
        roles: ['platform', 'orgAdmin'],
      },
      {
        id: 'admin-billing',
        label: 'Billing',
        to: '/administration/billing',
        roles: ['platform', 'orgAdmin'],
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
