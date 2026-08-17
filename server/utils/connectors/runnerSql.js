/**
 * Shared SQL helpers for relational connector runners.
 */

/**
 * @param {string} ident
 * @param {'mysql'|'postgres'|'mssql'|'oracle'} dialect
 */
export function quoteIdent(ident, dialect = 'mysql') {
  const parts = String(ident || '').split('.').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid table name' })
  }
  return parts.map((p) => {
    if (!/^[a-zA-Z0-9_]+$/.test(p)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid table identifier: ${p}` })
    }
    if (dialect === 'mysql') return `\`${p}\``
    if (dialect === 'mssql') return `[${p}]`
    return `"${p}"`
  }).join('.')
}

/**
 * Batch INSERT rows into a table.
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 * @param {'mysql'|'postgres'|'mssql'|'oracle'} dialect
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} queryFn
 */
export async function insertRowsBatch(table, rows, dialect, queryFn) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : []
  if (!list.length) return 0

  const quotedTable = quoteIdent(table, dialect)
  const columns = [...new Set(list.flatMap((r) => Object.keys(r)))]
  if (!columns.length) return 0

  const colList = columns.map((c) => quoteIdent(c, dialect)).join(', ')
  let written = 0
  const batchSize = 100

  for (let i = 0; i < list.length; i += batchSize) {
    const chunk = list.slice(i, i + batchSize)
    const values = chunk.flatMap((row) => columns.map((c) => row[c] ?? null))

    if (dialect === 'postgres') {
      const placeholders = chunk
        .map((_, rowIdx) => `(${columns.map((__, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`)
        .join(', ')
      await queryFn(`INSERT INTO ${quotedTable} (${colList}) VALUES ${placeholders}`, values)
      written += chunk.length
    }
    else if (dialect === 'mysql') {
      const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')
      await queryFn(`INSERT INTO ${quotedTable} (${colList}) VALUES ${placeholders}`, values)
      written += chunk.length
    }
    else {
      for (const row of chunk) {
        const cols = Object.keys(row)
        const vals = cols.map((c) => row[c])
        const ph = cols.map(() => '?').join(', ')
        await queryFn(
          `INSERT INTO ${quotedTable} (${cols.map((c) => quoteIdent(c, dialect)).join(', ')}) VALUES (${ph})`,
          vals,
        )
        written += 1
      }
    }
  }

  return written
}
