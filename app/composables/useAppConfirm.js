/**
 * App-wide confirm / alert modal. Prefer this over window.confirm / alert.
 *
 * Usage:
 *   const { confirm, alert } = useAppConfirm()
 *   const ok = await confirm({ title: 'Delete?', message: '…', danger: true })
 */

/** @type {import('vue').ShallowRef<null | {
 *   mode: 'confirm'|'alert',
 *   title: string,
 *   message: string,
 *   confirmLabel: string,
 *   cancelLabel: string,
 *   danger: boolean,
 *   resolve: (value: boolean) => void,
 * }>} */
const active = shallowRef(null)

/**
 * @param {{
 *   title?: string,
 *   message: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 * }} opts
 * @returns {Promise<boolean>}
 */
function confirm(opts) {
  if (import.meta.server) return Promise.resolve(false)
  return new Promise((resolve) => {
    if (active.value) {
      active.value.resolve(false)
    }
    active.value = {
      mode: 'confirm',
      title: opts.title || 'Confirm',
      message: opts.message || '',
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
      danger: Boolean(opts.danger),
      resolve,
    }
  })
}

/**
 * Informational OK-only dialog (replaces window.alert).
 * @param {{ title?: string, message: string, confirmLabel?: string }} opts
 * @returns {Promise<boolean>}
 */
function alert(opts) {
  if (import.meta.server) return Promise.resolve(true)
  return new Promise((resolve) => {
    if (active.value) {
      active.value.resolve(false)
    }
    active.value = {
      mode: 'alert',
      title: opts.title || 'Notice',
      message: opts.message || '',
      confirmLabel: opts.confirmLabel || 'OK',
      cancelLabel: '',
      danger: false,
      resolve,
    }
  })
}

/**
 * @param {boolean} result
 */
function settle(result) {
  const current = active.value
  if (!current) return
  active.value = null
  current.resolve(result)
}

export function useAppConfirm() {
  return {
    active,
    confirm,
    alert,
    settle,
  }
}
