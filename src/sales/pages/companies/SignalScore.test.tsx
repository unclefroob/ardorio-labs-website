import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
let m: Sales & { Act: typeof import('../../data/Act').Act; Q: typeof import('../../data/Q').Q }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function setup() {
  const l = await loadSales()
  const { Act } = await import('../../data/Act')
  const { Q } = await import('../../data/Q')
  m = { ...l, Act, Q }
  m.bootstrap.hydrate(rosterioWorld())
  setRole(m, 'sales')
}
const hiring = () => ({ kind: 'hiring' as const, headline: 'Hiring a Rostering Manager', sourceUrl: 'https://acme.test/careers', date: new Date().toISOString().slice(0, 10), hrOps: true })
const saveSignals = (items: ReturnType<typeof hiring>[]) =>
  m.Act.saveIntel({ companyId: 'co1', businessId: 'ros', kind: 'signals', items, sources: [], provider: 'xai', model: 'grok', disclaimer: '' })

describe('lead score and saved signals', () => {
  it('shows what the web signals added, and the total already includes it', async () => {
    await setup()
    const { ScorePanel } = await import('./ScorePanel')
    const before = m.Q.score('ct1', 'ros').total
    saveSignals([hiring()])
    const after = m.Q.score('ct1', 'ros')
    expect(after.total).toBe(before + 8)
    await act(async () => { root.render(<ScorePanel ct={m.Q.contact('ct1')!} b="ros" />) })
    const box = host.querySelector('[data-testid="score-signal-adjust"]')
    expect(box?.textContent).toContain('Signals +8')
    expect(box?.textContent).toContain('HR/ops hiring')
  })

  it('shows nothing extra when no signals are saved', async () => {
    await setup()
    const { ScorePanel } = await import('./ScorePanel')
    await act(async () => { root.render(<ScorePanel ct={m.Q.contact('ct1')!} b="ros" />) })
    expect(host.querySelector('[data-testid="score-signal-adjust"]')).toBeNull()
  })

  it('moves a saved research score only when the research is tied to a CRM company', async () => {
    await setup()
    saveSignals([hiring()])
    const { ResearchView } = await import('./parts/ResearchView')
    const r = { id: 'r1', companyId: 'co1', businessId: 'ros' as const, ts: new Date().toISOString(), companyName: 'Acme Pty Ltd', score: 50 }
    await act(async () => { root.render(<ResearchView r={r} />) })
    expect(host.textContent).toContain('58')
    expect(host.querySelector('[data-testid="research-signal-adjust"]')?.textContent).toContain('+8')
    await act(async () => { root.render(<ResearchView r={{ ...r, companyId: '' }} />) })
    expect(host.querySelector('[data-testid="research-signal-adjust"]')).toBeNull()
    expect(host.textContent).toContain('50')
  })
})
