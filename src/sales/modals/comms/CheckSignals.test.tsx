import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiSignals = vi.fn()
const aiEnrichUsage = vi.fn()
vi.mock('../../api/ai', async orig => ({
  ...(await orig<object>()),
  aiSignals: (...a: unknown[]) => aiSignals(...a),
  aiEnrichUsage: (...a: unknown[]) => aiEnrichUsage(...a),
}))

let host: HTMLDivElement
let root: Root
let m: Sales & { Act: typeof import('../../data/Act').Act }

const meta = (used: number) => ({ mode: 'llm', provider: 'xai', model: 'grok-4', generated: true, usage: { used, limit: 300, resetsOn: '2026-11-01' } })
const answer = (headline: string, used = 4) => ({ ...meta(used), result: { signals: [{ kind: 'funding', headline, sourceUrl: 'https://x.test/n' }], sources: [], withheld: 0, disclaimer: 'd' } })

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  aiSignals.mockReset()
  aiEnrichUsage.mockReset()
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage: { used: 3, limit: 300, resetsOn: '2026-11-01' } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function open(opts: { configured?: boolean; role?: 'sales' | 'viewer'; left?: number } = {}) {
  const l = await loadSales()
  const { Act } = await import('../../data/Act')
  m = { ...l, Act }
  if (opts.left !== undefined) aiEnrichUsage.mockResolvedValue({ enabled: true, usage: { used: 300 - opts.left, limit: 300, resetsOn: '2026-11-01' } })
  const w = rosterioWorld()
  w.ai = { enabled: true, providers: { anthropic: true, xai: opts.configured ?? true } }
  const dl = w.collections.deals[0]
  for (const [n, name] of [['co2', 'Bravo Pty Ltd'], ['co3', 'Cobalt Pty Ltd']]) {
    w.collections.companies.push(rec(n, { name, tradingName: '', tags: [], tech: [], notes: [], industry: '', subindustry: '', hq: '', state: '' }))
    w.collections.deals.push(rec('d' + n, { ...(dl as unknown as { data?: object }).data, ...dl, companyId: n, name: name + ' deal' } as never))
  }
  m.bootstrap.hydrate(w)
  setRole(m, opts.role ?? 'sales')
  const { CheckSignals } = await import('./CheckSignals')
  await act(async () => { root.render(<CheckSignals businessId="ros" />) })
  await settle(3)
}
const text = (): string => document.body.textContent ?? ''
const boxes = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
const runBtn = (): HTMLButtonElement | undefined => button(document.body, /^Check \d* ?compan/)

describe('Check signals on open deals', () => {
  it('lists each company once, ticks the never-checked ones, and states the cost before anything runs', async () => {
    await open()
    expect(boxes()).toHaveLength(3)
    expect(boxes().every(b => b.checked)).toBe(true)
    expect(text()).toContain('Never checked')
    expect(text()).toContain('This will use 3 of 297 remaining lookups')
    expect(aiSignals).not.toHaveBeenCalled()
  })

  it('does not tick a company checked within 30 days, and ticks one checked longer ago', async () => {
    await open()
    const rec1 = (kind: 'signals', ts: string, companyId: string) => {
      m.Act.saveIntel({ companyId, businessId: 'ros', kind, items: [], sources: [], provider: 'xai', model: 'g', disclaimer: '' })
      m.store.S.intel.find(i => i.companyId === companyId)!.ts = ts
    }
    rec1('signals', new Date(Date.now() - 5 * 86400000).toISOString(), 'co1')
    rec1('signals', new Date(Date.now() - 60 * 86400000).toISOString(), 'co2')
    await act(async () => { root.unmount() })
    root = createRoot(host)
    const { CheckSignals } = await import('./CheckSignals')
    await act(async () => { root.render(<CheckSignals businessId="ros" />) })
    await settle(3)
    const byName = Object.fromEntries(boxes().map(b => [b.getAttribute('aria-label'), b.checked]))
    expect(byName).toEqual({ 'Check Acme Pty Ltd': false, 'Check Bravo Pty Ltd': true, 'Check Cobalt Pty Ltd': true })
  })

  it('runs only after Check is pressed, one company at a time, saving each', async () => {
    await open()
    aiSignals.mockImplementation(async (req: { companyId: string }) => answer('News for ' + req.companyId))
    await click(runBtn())
    await settle(8)
    expect(aiSignals).toHaveBeenCalledTimes(3)
    expect(aiSignals.mock.calls.map(c => (c[0] as { companyId: string }).companyId)).toEqual(['co1', 'co2', 'co3'])
    expect(m.store.S.intel.map(i => i.id).sort()).toEqual(['in_co1_ros_signals', 'in_co2_ros_signals', 'in_co3_ros_signals'])
    expect(text()).toContain('3 companies checked and saved')
  })

  it('only checks the ticked companies', async () => {
    await open()
    aiSignals.mockImplementation(async () => answer('News'))
    await click(boxes()[0])
    await click(runBtn())
    await settle(8)
    expect(aiSignals).toHaveBeenCalledTimes(2)
    expect(m.store.S.intel.map(i => i.companyId).sort()).toEqual(['co2', 'co3'])
  })

  it('stops when the monthly limit is reached and says what finished', async () => {
    await open()
    const { SalesHttpError } = await import('../../api/http')
    aiSignals
      .mockResolvedValueOnce(answer('First'))
      .mockRejectedValueOnce(new SalesHttpError(429, { error: 'cap', code: 'AI_CAP_REACHED', details: { used: 300, limit: 300, resetsOn: '2026-11-01' } }))
    await click(runBtn())
    await settle(8)
    expect(aiSignals).toHaveBeenCalledTimes(2)
    expect(m.store.S.intel).toHaveLength(1)
    expect(text()).toContain('Monthly limit reached')
    expect(text()).toContain('1 company checked and saved')
    expect(text()).toContain('2 not checked')
  })

  it('stops on a provider error', async () => {
    await open()
    const { SalesHttpError } = await import('../../api/http')
    aiSignals.mockRejectedValue(new SalesHttpError(502, { error: 'down', code: 'AI_PROVIDER_ERROR' }))
    await click(runBtn())
    await settle(8)
    expect(aiSignals).toHaveBeenCalledTimes(1)
    expect(text()).toContain('The lookup service had a problem')
    expect(m.store.S.intel).toHaveLength(0)
  })

  it('will not run more companies than lookups left', async () => {
    await open({ left: 2 })
    expect(text()).toContain('only 2 lookups are left')
    expect(runBtn()?.disabled).toBe(true)
    await click(boxes()[0])
    expect(runBtn()?.disabled).toBe(false)
  })

  it('says Grok is not configured and offers no run', async () => {
    await open({ configured: false })
    expect(text()).toContain('Grok is not configured')
    expect(runBtn()).toBeUndefined()
  })

  it('a viewer gets the read-only message', async () => {
    await open({ role: 'viewer' })
    expect(text()).toContain('Read-only access')
  })
})
