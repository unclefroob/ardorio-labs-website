import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FieldConflict } from '../api/contract'
import { bootstrap, rec, user } from '../testing/fixtures'
import { loadSales } from '../testing/load'

vi.mock('../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../api/engine', () => ({ acquireLease: vi.fn(), releaseLease: vi.fn() }))
vi.mock('../engine/engine', () => ({ tick: vi.fn() }))

const CO = { name: 'Acme', tradingName: 'Acme', hq: 'Sydney', tags: [], notes: [] }

function field(path: string, mine: unknown, theirs: unknown, theirsDeleted = false): FieldConflict {
  return { path, mine, theirs, changedBy: 'u-other', changedAt: '2026-10-09T09:00:00.000Z', ...(theirsDeleted ? { theirsDeleted } : {}) }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function setup() {
  const m = await loadSales()
  const banners = await import('./Banners')
  m.bootstrap.hydrate(bootstrap({ companies: [rec('co1', CO, 4)] }, [user('u-other', 'Olivia')]))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const show = (el: React.ReactElement) => act(() => root.render(el))
  return { ...m, banners, show }
}

function buttons(): string[] {
  return [...host.querySelectorAll('button')].map(b => b.textContent ?? '')
}
function press(label: string): void {
  const b = [...host.querySelectorAll('button')].find(x => x.textContent?.startsWith(label))
  if (!b) throw new Error(`no button "${label}" among ${buttons().join(' | ')}`)
  act(() => b.click())
}

describe('field conflict card', () => {
  it('shows a readable label, both values, and per-field buttons announced as an alert', async () => {
    const m = await setup()
    m.store.S.companies[0].name = 'Mine Pty'
    m.conflicts.addPrompt({ kind: 'field', collection: 'companies', recId: 'co1', label: 'company "Acme"', rev: 6, fields: [field('hq', 'Perth', 'Brisbane')] })
    m.show(<m.banners.ConflictBar />)
    const alert = host.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    const text = alert?.textContent ?? ''
    expect(text).toContain('Olivia')
    expect(text).toContain('Yours: Perth')
    expect(text).toContain('Theirs: Brisbane')
    expect(text).not.toContain('hq')
    expect(buttons().filter(b => b.startsWith('Keep'))).toEqual(['Keep mine for Headquarters', 'Keep theirs for Headquarters'])
    expect(buttons().some(b => b.startsWith('Keep all'))).toBe(false)
  })

  it('offers Keep all mine / Keep all theirs only when several fields conflict', async () => {
    const m = await setup()
    m.conflicts.addPrompt({ kind: 'field', collection: 'companies', recId: 'co1', label: 'company', rev: 6, fields: [field('hq', 'Perth', 'Brisbane'), field('tradingName', 'A', 'B')] })
    m.show(<m.banners.ConflictBar />)
    expect(buttons().filter(b => b.startsWith('Keep all'))).toEqual(['Keep all mine', 'Keep all theirs'])
  })

  it('resolves one field at a time and announces the result politely', async () => {
    const m = await setup()
    m.conflicts.addPrompt({ kind: 'field', collection: 'companies', recId: 'co1', label: 'company', rev: 6, fields: [field('hq', 'Perth', 'Brisbane'), field('tradingName', 'A', 'B')] })
    m.show(<m.banners.ConflictBar />)
    press('Keep theirs for')
    expect(m.conflicts.getPrompts()).toHaveLength(1)
    expect((m.conflicts.getPrompts()[0] as { fields: FieldConflict[] }).fields.map(f => f.path)).toEqual(['tradingName'])
    const live = host.querySelector('[role="status"][aria-live="polite"]')
    expect(live?.textContent).toMatch(/^Kept value for .* from Olivia\.$/)
    expect(document.activeElement?.tagName).toBe('BUTTON')
  })

  it('Keep mine puts my value back and resends against the conflict rev', async () => {
    const m = await setup()
    m.store.S.companies[0].hq = 'Brisbane'
    m.conflicts.addPrompt({ kind: 'field', collection: 'companies', recId: 'co1', label: 'company', rev: 6, fields: [field('hq', 'Perth', 'Brisbane')] })
    m.show(<m.banners.ConflictBar />)
    press('Keep mine')
    expect(m.store.S.companies[0].hq).toBe('Perth')
    expect(m.store.metaMap('companies').get('co1')?.base).toBe(6)
    expect(m.conflicts.getPrompts()).toEqual([])
  })

  it('Keep all theirs closes the card without touching the record', async () => {
    const m = await setup()
    m.conflicts.addPrompt({ kind: 'field', collection: 'companies', recId: 'co1', label: 'company', rev: 6, fields: [field('hq', 'Perth', 'Brisbane'), field('tradingName', 'A', 'B')] })
    m.show(<m.banners.ConflictBar />)
    press('Keep all theirs')
    expect(m.conflicts.getPrompts()).toEqual([])
    expect(m.store.S.companies[0].hq).toBe('Sydney')
  })
})

describe('deleted and modified prompts', () => {
  it('names who deleted the record once and offers Restore', async () => {
    const m = await setup()
    m.conflicts.addPrompt({ kind: 'deleted', collection: 'companies', recId: 'gone', label: 'company "Gone"', rev: 7, by: 'Olivia', record: { name: 'Gone', tradingName: 'Gone', tags: [], notes: [] } })
    m.show(<m.banners.ConflictBar />)
    const alert = host.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Olivia deleted this company "Gone"')
    expect(alert?.textContent).not.toContain('a teammate')
    press('Restore')
    expect(m.store.S.companies.map(c => c.id)).toContain('gone')
    expect(m.store.metaMap('companies').get('gone')).toMatchObject({ rev: 7, base: 7 })
    expect(m.conflicts.getPrompts()).toEqual([])
  })

  it('Leave deleted only closes the prompt', async () => {
    const m = await setup()
    m.conflicts.addPrompt({ kind: 'deleted', collection: 'companies', recId: 'gone', label: 'company', rev: 7, by: 'Olivia', record: { name: 'Gone', tags: [], notes: [] } })
    m.show(<m.banners.ConflictBar />)
    press('Leave deleted')
    expect(m.store.S.companies.map(c => c.id)).toEqual(['co1'])
    expect(m.conflicts.getPrompts()).toEqual([])
  })

  it('modified-after-delete keeps the existing Delete anyway / Keep it choice', async () => {
    const m = await setup()
    m.conflicts.addPrompt({ kind: 'modified', collection: 'companies', recId: 'co1', label: 'company', rev: 7, by: 'Olivia' })
    m.show(<m.banners.ConflictBar />)
    expect(buttons()).toEqual(expect.arrayContaining(['Delete anyway', 'Keep it']))
    expect(host.textContent).toContain('Olivia changed this company')
  })
})

describe('session expiry banner', () => {
  it('says what happened once, offers sign-in, and hides the other sync banners', async () => {
    const m = await setup()
    m.sync.expireSession()
    m.show(<m.banners.SyncBanner />)
    const msg = 'Your session expired. Unsaved changes were discarded. Sign in again.'
    expect(host.textContent?.split(msg).length).toBe(2)
    expect(buttons()).toEqual(['Sign in'])
    expect(host.textContent).not.toContain("aren't being saved")
  })

  it('renders nothing while everything is fine', async () => {
    const m = await setup()
    m.show(<m.banners.SyncBanner />)
    expect(host.textContent).toBe('')
  })
})
