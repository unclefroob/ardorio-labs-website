import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes } from '../../testing/fixtures'
import { button, click } from '../../testing/dom'
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

const closure = (over: Record<string, unknown> = {}) => ({ kind: 'closure' as const, headline: 'Acme to close its stores', sourceUrl: 'https://news.test/closing', date: new Date().toISOString().slice(0, 10), ...over })
const save = (items: unknown[], kind: 'signals' | 'tech' = 'signals') =>
  m.Act.saveIntel({ companyId: 'co1', businessId: 'ros', kind, items: items as never, sources: [], provider: 'xai', model: 'grok', disclaimer: '' })

describe('Q.scoreBreakdown', () => {
  it('returns the base unchanged with nothing saved', async () => {
    await setup()
    expect(m.Q.scoreBreakdown('co1', 'ros', 61)).toMatchObject({ base: 61, adjust: 0, total: 61, parts: [], pending: [], checkedAt: undefined, checkedDaysAgo: null })
  })

  it('adds the signals, names each reason with its source, and says when it was checked', async () => {
    await setup()
    save([hiring()])
    const bd = m.Q.scoreBreakdown('co1', 'ros', 50)
    expect(bd).toMatchObject({ base: 50, adjust: 8, total: 58, checkedDaysAgo: 0 })
    expect(bd.parts).toEqual([expect.objectContaining({ label: 'HR/ops hiring', points: 8, sourceUrl: 'https://acme.test/careers' })])
  })

  it('does not stretch a rise past the ceiling of 96', async () => {
    await setup()
    save([hiring()])
    expect(m.Q.scoreBreakdown('co1', 'ros', 92).total).toBe(96)
    expect(m.Q.scoreBreakdown('co1', 'ros', 92).adjust).toBe(4)
  })

  it('an unconfirmed closure moves nothing; confirming it takes 30 off; dismissing again puts it back', async () => {
    await setup()
    save([closure()])
    expect(m.Q.scoreBreakdown('co1', 'ros', 70)).toMatchObject({ total: 70, adjust: 0 })
    expect(m.Q.scoreBreakdown('co1', 'ros', 70).pending).toHaveLength(1)
    expect(m.Act.reviewClosure('co1', 'ros', closure(), 'confirmed')).toBe(true)
    expect(m.Q.scoreBreakdown('co1', 'ros', 70)).toMatchObject({ total: 40, adjust: -30, pending: [] })
    expect(m.Act.reviewClosure('co1', 'ros', closure(), 'dismissed')).toBe(true)
    expect(m.Q.scoreBreakdown('co1', 'ros', 70)).toMatchObject({ total: 70, adjust: 0, pending: [] })
  })

  it('an undated signal changes nothing however recently it was looked up', async () => {
    await setup()
    save([{ ...hiring(), date: undefined }])
    expect(m.Q.scoreBreakdown('co1', 'ros', 50)).toMatchObject({ total: 50, parts: [] })
  })

  it('the contact lead score agrees with the breakdown', async () => {
    await setup()
    const before = m.Q.score('ct1', 'ros')
    save([hiring()])
    const after = m.Q.score('ct1', 'ros')
    expect(after.breakdown).toMatchObject({ base: before.total, total: after.total })
  })
})

describe('Q.dealScore', () => {
  it('is the best lead score among the deal contacts, including saved signals', async () => {
    await setup()
    const d = m.Q.deal('dl1')!
    const before = m.Q.dealScore(d)
    expect(before).toBe(m.Q.score('ct1', 'ros').total)
    save([hiring()])
    expect(m.Q.dealScore(d)).toBe(m.Q.score('ct1', 'ros').total)
    expect(m.Q.dealScore(d)).toBeGreaterThan(before ?? 0)
  })

  it('falls back to the latest research score moved by signals when the deal has no contacts', async () => {
    await setup()
    const d = { ...m.Q.deal('dl1')!, contactIds: [] }
    expect(m.Q.dealScore(d)).toBeNull()
    m.Act.saveResearch({ id: 'r1', companyId: 'co1', companyName: 'Acme', businessId: 'ros', ts: new Date().toISOString(), score: 50 } as never)
    expect(m.Q.dealScore(d)).toBe(50)
    save([hiring()])
    expect(m.Q.dealScore(d)).toBe(58)
  })
})

describe('closure review on screen', () => {
  it('shows a Possible closure chip with the source, no score change, and confirming lowers the score', async () => {
    await setup()
    const { ScorePanel } = await import('./ScorePanel')
    const before = m.Q.score('ct1', 'ros').total
    save([closure()])
    expect(m.Q.score('ct1', 'ros').total).toBe(before)
    await act(async () => { root.render(<ScorePanel ct={m.Q.contact('ct1')!} b="ros" />) })
    const box = host.querySelector('[data-testid="score-signal-adjust"]')
    expect(box?.textContent).toContain('Possible closure, confirm or dismiss')
    expect(box?.querySelector('a')?.getAttribute('href')).toBe('https://news.test/closing')
    expect(box?.textContent).toContain('Signals checked today')
    await click(button(host, 'Confirm closure'))
    expect(m.Q.score('ct1', 'ros').total).toBe(Math.max(0, before - 30))
    await act(async () => { root.render(<ScorePanel ct={m.Q.contact('ct1')!} b="ros" />) })
    expect(host.querySelector('[data-testid="score-signal-adjust"]')?.textContent).not.toContain('Possible closure')
  })

  it('a viewer can see the chip but not answer it', async () => {
    await setup()
    setRole(m, 'viewer')
    const { ScorePanel } = await import('./ScorePanel')
    save([closure()])
    await act(async () => { root.render(<ScorePanel ct={m.Q.contact('ct1')!} b="ros" />) })
    expect(host.textContent).toContain('Possible closure, confirm or dismiss')
    expect(button(host, 'Confirm closure')).toBeUndefined()
  })

  it('the research score shows the same reasons, source and age for a matched company', async () => {
    await setup()
    save([hiring()])
    const { ResearchView } = await import('./parts/ResearchView')
    const r = { id: 'r1', companyId: 'co1', businessId: 'ros' as const, ts: new Date().toISOString(), companyName: 'Acme', score: 50 }
    await act(async () => { root.render(<ResearchView r={r} />) })
    const box = host.querySelector('[data-testid="research-signal-adjust"]')
    expect(box?.textContent).toContain('HR/ops hiring')
    expect(box?.textContent).toContain('Signals checked today')
    expect(box?.querySelector('a')?.getAttribute('href')).toBe('https://acme.test/careers')
  })
})
