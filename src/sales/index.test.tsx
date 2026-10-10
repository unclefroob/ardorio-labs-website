import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnrichDone } from './ai/client'

vi.mock('./data/bootstrap', () => ({ loadBootstrap: vi.fn(async () => {}) }))
vi.mock('./data/sync', () => ({ startSync: vi.fn(() => () => {}), flushAll: vi.fn(async () => {}) }))
vi.mock('./shell/Shell', () => ({ Shell: () => null }))

const done: EnrichDone = {
  status: 'none', suggestions: [], sources: [], withheld: 0, disclaimer: 'd', model: null,
  usage: { used: 1, limit: 300, resetsOn: '2026-11-01' },
}

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })

describe('SalesApp', () => {
  it('forgets cached enrichment results and allowances when it unmounts (sign-out)', async () => {
    const cache = await import('./ai/enrichCache')
    const { default: SalesApp } = await import('./index')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => { root.render(<SalesApp />) })
    cache.putEnrich('ct1', done)
    cache.setUsage('ros', done.usage)
    expect(cache.getEnrich('ct1')).toBeDefined()
    expect(cache.getUsage('ros')).toBeDefined()
    await act(async () => { root.unmount() })
    expect(cache.getEnrich('ct1')).toBeUndefined()
    expect(cache.getUsage('ros')).toBeUndefined()
    host.remove()
  })
})
