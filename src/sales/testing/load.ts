import { vi } from 'vitest'

/**
 * Fresh copies of the data layer. The sync, conflict and lease modules keep their state at module
 * level, so every test starts from a clean registry rather than undoing the last one by hand.
 */
export async function loadSales() {
  vi.resetModules()
  const store = await import('../data/store')
  const sync = await import('../data/sync')
  const plan = await import('../data/plan')
  const results = await import('../data/results')
  const conflicts = await import('../data/conflicts')
  const resolve = await import('../data/resolve')
  const bootstrap = await import('../data/bootstrap')
  const http = await import('../api/http')
  const records = await import('../api/records')
  const ui = await import('../ui/store')
  return { store, sync, plan, results, conflicts, resolve, bootstrap, http, records, ui }
}

export type Sales = Awaited<ReturnType<typeof loadSales>>
