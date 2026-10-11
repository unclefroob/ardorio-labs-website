import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest } from '../../../api/contract'
import { changes } from '../../../testing/fixtures'
import { button, click, settle } from '../../../testing/dom'
import { loadSales, type Sales } from '../../../testing/load'
import { rosterioWorld, setRole } from '../../../testing/rosterioWorld'

vi.mock('../../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const postBatch = vi.fn()
vi.mock('../../../api/records', () => ({ postBatch: (r: BatchRequest) => postBatch(r), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiSignals = vi.fn()
const aiTechStack = vi.fn()
const aiCompanyContact = vi.fn()
const aiEnrichUsage = vi.fn()
vi.mock('../../../api/ai', async orig => ({
  ...(await orig<object>()),
  aiSignals: (...a: unknown[]) => aiSignals(...a),
  aiTechStack: (...a: unknown[]) => aiTechStack(...a),
  aiCompanyContact: (...a: unknown[]) => aiCompanyContact(...a),
  aiEnrichUsage: (...a: unknown[]) => aiEnrichUsage(...a),
}))

let host: HTMLDivElement
let root: Root
let m: Sales

const USAGE = { used: 3, limit: 300, resetsOn: '2026-11-01' }
const meta = { mode: 'llm', provider: 'xai', model: 'grok-4', generated: true, usage: USAGE }
const base = { sources: [{ title: 'Acme', url: 'https://acme.test/' }], withheld: 0, disclaimer: 'Found with live web search.' }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const f of [postBatch, aiSignals, aiTechStack, aiCompanyContact, aiEnrichUsage]) f.mockReset()
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage: USAGE })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function render(opts: { configured?: boolean; role?: 'sales' | 'viewer'; competitorRule?: boolean; used?: number } = {}) {
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage: { ...USAGE, used: opts.used ?? USAGE.used }, ...(opts.competitorRule !== undefined ? { competitorRule: opts.competitorRule } : {}) })
  m = await loadSales()
  const w = rosterioWorld()
  w.ai = { enabled: true, providers: { anthropic: true, xai: opts.configured ?? true } }
  m.bootstrap.hydrate(w)
  setRole(m, opts.role ?? 'sales')
  const { WebIntel } = await import('./WebIntel')
  const c = m.store.S.companies[0]
  await act(async () => { root.render(<WebIntel c={c} b="ros" />) })
  await settle(3)
}
const text = (): string => host.textContent ?? ''
const run = async (card: string): Promise<void> => {
  const c = [...host.querySelectorAll('.card')].find(x => x.textContent?.includes(card))
  await click(button(c as HTMLElement, /1 lookup/))
  await settle(5)
}
const links = (): string[] => [...host.querySelectorAll('a')].map(a => a.getAttribute('href') ?? '')

describe('company web intelligence cards', () => {
  it('says Grok is not configured and offers no lookup when the server has no xAI key', async () => {
    await render({ configured: false })
    expect(text()).toContain('Grok is not configured')
    for (const b of [...host.querySelectorAll('button')].filter(x => /1 lookup/.test(x.textContent ?? ''))) expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(aiSignals).not.toHaveBeenCalled()
  })

  it('shows the allowance and what a check costs', async () => {
    await render()
    expect(text()).toContain('297 of 300 lookups left')
    expect(text()).toContain('Check · 1 lookup')
  })

  it('a viewer cannot run a check', async () => {
    await render({ role: 'viewer' })
    for (const b of [...host.querySelectorAll('button')].filter(x => /1 lookup/.test(x.textContent ?? ''))) expect((b as HTMLButtonElement).disabled).toBe(true)
  })

  it('runs signals, saves one record, shows chips and links, then refresh replaces it', async () => {
    await render()
    aiSignals.mockResolvedValue({
      ...meta,
      result: {
        ...base,
        signals: [
          { kind: 'hiring', headline: 'Hiring a Rostering Manager', date: '2026-09-30', sourceUrl: 'https://acme.test/careers', hrOps: true },
          { kind: 'expansion', headline: 'Opens a new site', date: '2026-09-01', sourceUrl: 'javascript:alert(1)' },
        ],
      },
    })
    await run('Company signals')
    expect(aiSignals).toHaveBeenCalledWith({ businessId: 'ros', companyId: 'co1' }, expect.anything())
    expect(m.store.S.intel).toHaveLength(1)
    expect(text()).toContain('Hiring a Rostering Manager')
    expect(text()).toContain('HR/ops hiring')
    expect(text()).toContain('Checked today')
    expect(links()).toContain('https://acme.test/careers')
    expect(links().some(h => h.startsWith('javascript:'))).toBe(false)
    expect(text()).toContain('No usable source')
    expect(text()).toContain('Refresh · 1 lookup')

    aiSignals.mockResolvedValue({ ...meta, result: { ...base, signals: [{ kind: 'funding', headline: 'Raises $5m', sourceUrl: 'https://acme.test/n' }] } })
    await run('Company signals')
    expect(m.store.S.intel).toHaveLength(1)
    expect(m.store.S.intel[0].items).toHaveLength(1)
    expect(text()).toContain('Raises $5m')
    expect(text()).not.toContain('Hiring a Rostering Manager')
  })

  it('flags a competitor and adds tool names to the known technology only on click', async () => {
    await render()
    aiTechStack.mockResolvedValue({
      ...meta,
      result: {
        ...base,
        tools: [
          { name: 'Deputy', category: 'rostering', evidence: 'Careers page asks for Deputy experience', sourceUrl: 'https://acme.test/careers', competitor: true, sourceCheck: 'confirmed' },
          { name: 'Xero', category: 'payroll', evidence: 'Mentioned in a job ad', sourceUrl: 'https://acme.test/jobs', sourceCheck: 'unconfirmed' },
        ],
      },
    })
    await run('Technology & competitors')
    expect(text()).toContain('Uses a competitor: Deputy')
    expect(text()).toContain('Found on page')
    expect(text()).toContain("Couldn't confirm on the page")
    expect(m.store.S.companies[0].tech).toEqual([])
    await click(button(host, 'Add to known technology'))
    expect(m.store.S.companies[0].tech).toEqual(['Deputy', 'Xero'])
    expect(button(host, 'Add to known technology')?.disabled).toBe(true)
  })

  it('shows company contact details with copy and keeps them off the company record', async () => {
    await render()
    aiCompanyContact.mockResolvedValue({
      ...meta,
      result: { ...base, items: [{ field: 'phone', value: '03 9000 0000', sourceUrl: 'https://acme.test/contact', sourceCheck: 'confirmed' }, { field: 'address', value: '1 Collins St, Melbourne VIC', sourceUrl: 'https://acme.test/contact' }] },
    })
    const before = JSON.stringify(m.store.S.companies[0])
    await run('Company contact details')
    expect(text()).toContain('03 9000 0000')
    expect(text()).toContain('1 Collins St, Melbourne VIC')
    expect(host.querySelector('button[aria-label="Copy phone"]')).not.toBeNull()
    expect(m.store.S.intel[0].kind).toBe('contact')
    const after = JSON.parse(JSON.stringify(m.store.S.companies[0])) as Record<string, unknown>
    expect(after.phone).toBeUndefined()
    expect(Object.keys(JSON.parse(before) as object).sort()).toEqual(Object.keys(after).sort())
  })

  it('a provider error is reported and nothing is saved', async () => {
    await render()
    const { SalesHttpError } = await import('../../../api/http')
    aiSignals.mockRejectedValue(new SalesHttpError(502, { error: 'Grok is down', code: 'AI_PROVIDER_ERROR' }))
    await run('Company signals')
    expect(text()).toContain('The lookup service had a problem')
    expect(m.store.S.intel).toHaveLength(0)
  })

  it('stops at the cap with the reset date and saves nothing', async () => {
    await render()
    const { SalesHttpError } = await import('../../../api/http')
    aiSignals.mockRejectedValue(new SalesHttpError(429, { error: 'cap', code: 'AI_CAP_REACHED', details: { used: 300, limit: 300, resetsOn: '2026-11-01' } }))
    await run('Company signals')
    expect(text()).toContain('Monthly limit reached')
    expect(m.store.S.intel).toHaveLength(0)
    for (const b of [...host.querySelectorAll('button')].filter(x => /1 lookup/.test(x.textContent ?? ''))) expect((b as HTMLButtonElement).disabled).toBe(true)
  })

  it('an empty answer is saved as checked, so it is not mistaken for never checked', async () => {
    await render()
    aiSignals.mockResolvedValue({ ...meta, result: { ...base, signals: [], withheld: 2 } })
    await run('Company signals')
    expect(m.store.S.intel).toHaveLength(1)
    expect(text()).toContain('Nothing found; 2 value(s) were withheld')
  })

  describe('hardening', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sig = (over: Record<string, unknown> = {}) => ({ kind: 'closure', headline: 'Acme to close its stores', sourceUrl: 'https://news.test/closing', date: today, ...over })
    const saved = async (items: unknown[]): Promise<void> => {
      const { Act } = await import('../../../data/Act')
      Act.saveIntel({ companyId: 'co1', businessId: 'ros', kind: 'signals', items: items as never, sources: [], provider: 'xai', model: 'grok', disclaimer: '' })
      const { WebIntel } = await import('./WebIntel')
      await act(async () => { root.render(<WebIntel c={m.store.S.companies[0]} b="ros" />) })
      await settle(2)
    }

    it('shows the competitor +10 rule only when the server says the business has a competitor list', async () => {
      await render({ competitorRule: true })
      expect(text()).toContain("competitor list add 10 to the lead score")
      act(() => root.unmount())
      root = createRoot(host)
      await render({ competitorRule: false })
      expect(text()).not.toContain('competitor list add 10')
    })

    it('shows nothing about the rule until the server has answered', async () => {
      await render()
      expect(text()).not.toContain('competitor list add 10')
    })

    it('shows a reported closure as Possible closure with Confirm and Dismiss, and confirming marks it', async () => {
      await render()
      await saved([sig()])
      expect(text()).toContain('Possible closure, confirm or dismiss')
      await click(button(host, 'Confirm closure'))
      expect(text()).toContain('Closure confirmed')
      expect(text()).not.toContain('Possible closure, confirm or dismiss')
    })

    it('marks an undated signal as not counted', async () => {
      await render()
      await saved([sig({ kind: 'expansion', headline: 'Opens a site', date: undefined })])
      expect(text()).toContain('undated, not counted')
    })

    it('at the limit shows when research resumes and keeps the saved results visible', async () => {
      await render({ used: 300 })
      await saved([sig({ kind: 'expansion', headline: 'Opens a site' })])
      expect(text()).toContain('Research paused until 1 Nov 2026')
      expect(text()).toContain('Opens a site')
    })
  })
})
