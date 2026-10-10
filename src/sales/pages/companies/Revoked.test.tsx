import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const getChanges = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: (c: string) => getChanges(c), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let m: Sales
let stop: () => void

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  getChanges.mockResolvedValue(changes([]))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  stop?.()
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function setup() {
  m = await loadSales()
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, 'sales')
  fakeApi({})
  stop = m.sync.startSync()
}
const text = (): string => host.textContent ?? ''
/** What the server sends when the caller loses access: no data, and the record's rev has not moved. */
const hiddenEntry = (collection: 'companies' | 'deals' | 'contacts', id: string) => ({
  collection, id, rev: 1, deleted: false, hidden: true as const, data: null, demo: false, updatedAt: '2026-10-10T00:00:00.000Z', updatedBy: 'u-other',
})

describe('a record the member loses access to while looking at it', () => {
  it('turns the open company page into a plain "no access" message', async () => {
    await setup()
    const { Company } = await import('./Company')
    await act(async () => { root.render(<Company route={{ page: 'company', id: 'co1' }} />) })
    await settle(3)
    expect(text()).toContain('Acme')
    getChanges.mockResolvedValueOnce(changes([hiddenEntry('companies', 'co1')]))
    await act(async () => { await m.sync.pollOnce() })
    await settle(3)
    expect(text()).toContain('You no longer have access to this record')
    expect(text()).not.toContain('Company not found')
    expect(text()).toContain('Back to companies')
  })

  it('still says "not found" for a link to a company that never existed', async () => {
    await setup()
    const { Company } = await import('./Company')
    await act(async () => { root.render(<Company route={{ page: 'company', id: 'nope' }} />) })
    await settle(3)
    expect(text()).toContain('Company not found')
    expect(text()).not.toContain('no longer have access')
  })

  it('does the same on the deal page', async () => {
    await setup()
    const { Deal } = await import('../deals/Deal')
    await act(async () => { root.render(<Deal route={{ page: 'deal', id: 'dl1' }} />) })
    await settle(3)
    getChanges.mockResolvedValueOnce(changes([hiddenEntry('deals', 'dl1')]))
    await act(async () => { await m.sync.pollOnce() })
    await settle(3)
    expect(text()).toContain('You no longer have access to this record')
  })

  it('does the same on the contact page', async () => {
    await setup()
    const { Contact } = await import('./Contact')
    await act(async () => { root.render(<Contact route={{ page: 'contact', id: 'ct1' }} />) })
    await settle(3)
    getChanges.mockResolvedValueOnce(changes([hiddenEntry('contacts', 'ct1')]))
    await act(async () => { await m.sync.pollOnce() })
    await settle(3)
    expect(text()).toContain('You no longer have access to this record')
  })
})
