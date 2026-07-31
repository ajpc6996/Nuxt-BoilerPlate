const TOTAL_ROWS = 120

const departments = ['Design', 'Engineering', 'Ops', 'Sales']
const statuses = ['Active', 'Paused', 'Done']

const projectNames = [
  'Harbor Plan',
  'Atlas API',
  'North Depot',
  'Cedar Launch',
  'Pulse Board',
  'Drift Notes',
  'Amber Relay',
  'Cobalt Sprint',
  'Lumen Desk',
  'River Ledger',
  'Summit Kit',
  'Willow Route',
  'Forge Timeline',
  'Nimbus Vault',
  'Cascade Hub',
  'Beacon Draft',
  'Marble Ops',
  'Pine Console',
  'Silver Queue',
  'Orbit Brief',
]

/**
 * @returns {object[]}
 */
function buildItems() {
  return Array.from({ length: TOTAL_ROWS }, (_, index) => {
    const id = index + 1
    const baseName = projectNames[index % projectNames.length]
    const batch = Math.floor(index / projectNames.length) + 1

    return {
      id,
      name: batch === 1 ? baseName : `${baseName} ${batch}`,
      department: departments[id % departments.length],
      status: statuses[id % statuses.length],
      amount: Math.round(((id * 37) % 2400) + 120),
    }
  })
}

/** In-memory demo dataset shared across grid item API routes. */
export const gridItems = buildItems()

export const gridDepartments = departments
export const gridStatuses = statuses

/**
 * @param {number|string} id
 * @returns {object|undefined}
 */
export function findGridItem(id) {
  const numericId = Number(id)
  return gridItems.find((item) => item.id === numericId)
}

/**
 * @param {number|string} id
 * @param {object} patch
 * @returns {object|null}
 */
export function updateGridItem(id, patch) {
  const item = findGridItem(id)
  if (!item) return null

  if (typeof patch.name === 'string') item.name = patch.name.trim()
  if (typeof patch.department === 'string') item.department = patch.department
  if (typeof patch.status === 'string') item.status = patch.status
  if (patch.amount !== undefined && patch.amount !== null) {
    item.amount = Number(patch.amount)
  }

  return { ...item }
}
