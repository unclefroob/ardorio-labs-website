import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnrichLogEntry, EnrichLogResponse } from '../../api/contract'
import { bootstrap, rec } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiEnrichLog = vi.fn<(b: string, opts?: { contactId?: string; limit?: number }, signal?: AbortSignal) => Promise<EnrichLogResponse>>()
const aiEnrichUsage = vi.fn()
vi.mock('../../api/ai', () => ({
  aiClassify: vi.fn(), aiCopilot: vi.fn(), aiDraft: vi.fn(), aiMeetingRecap: vi.fn(), aiReplySuggest: vi.fn(), aiResearch: vi.fn(), aiFindPeople: vi.fn(),
  aiEnrichContact: vi.fn(), aiCheckEmail: vi.fn(),
  aiEnrichUsage: (b: string, signal?: AbortSignal) => aiEnrichUsage(b, signal),
  aiEnrichLog: (b: string, opts?: { contactId?: string; limit?: number }, signal?: AbortSignal) => aiEnrichLog(b, opts, signal),
}))

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: '', industries: [], roles: [] })
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  aiEnrichLog.mockReset()
  aiEnrichUsage.mockReset()
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage: { used: 1, limit: 300, resetsOn: '2026-11-01' } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const entry = (o: Partial<EnrichLogEntry> = {}): EnrichLogEntry => ({
  id: 'l1', at: new Date(Date.now() - 2 * 3_600_000).toISOString(), userId: 'u2', userName: 'Priya Shah', tool: 'enrich', contactId: 'ct1', outcome: 'ok',
  counts: { published: 2, inferred: 1, withheld: 0, unconfirmed: 1, found: 0 }, ...o,
})

async function mount(el: (m: Awaited<ReturnType<typeof loadSales>>) => Promise<React.ReactElement>) {
  const m = await loadSales()
  m.bootstrap.hydrate({ ...bootstrap({ businesses: [ROS] }), ai: { enabled: true, providers: { anthropic: true, xai: true } } })
  const node = await el(m)
  await act(async () => { root.render(node) })
  return m
}

describe('EnrichActivity', () => {
  it('lists when, who, tool, outcome and counts from the server, and asks for 20', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [
      entry(),
      entry({ id: 'l2', tool: 'find', contactId: undefined, userName: 'Sam Lee', outcome: 'provider_error', counts: { published: 0, inferred: 0, withheld: 1, unconfirmed: 0, found: 4 } }),
      entry({ id: 'l3', outcome: 'cap', counts: { published: 0, inferred: 0, withheld: 0, unconfirmed: 0, found: 0 } }),
    ] })
    await mount(async () => { const { EnrichActivity } = await import('./EnrichActivity'); return <EnrichActivity b="ros" /> })
    expect(aiEnrichLog).toHaveBeenCalledWith('ros', { contactId: undefined, limit: 20 }, expect.anything())
    const t = host.textContent ?? ''
    expect(t).toContain('Priya Shah')
    expect(t).toContain('Enrich contact')
    expect(t).toContain('2 published, 1 inferred, 1 unconfirmed')
    expect(t).toContain('Sam Lee')
    expect(t).toContain('Find people')
    expect(t).toContain('Provider error')
    expect(t).toContain('4 found, 1 withheld')
    expect(t).toContain('Limit reached')
    expect(t).toContain('No values')
  })

  it('shows a real empty state', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [] })
    await mount(async () => { const { EnrichActivity } = await import('./EnrichActivity'); return <EnrichActivity b="ros" /> })
    expect(host.textContent).toContain('No enrichment calls yet')
  })

  it('shows loading, then an error with a working retry', async () => {
    let fail!: (e: Error) => void
    aiEnrichLog.mockReturnValueOnce(new Promise((_, rej) => { fail = rej }))
    await mount(async () => { const { EnrichActivity } = await import('./EnrichActivity'); return <EnrichActivity b="ros" /> })
    expect(host.textContent).toContain('Loading')
    await act(async () => { fail(new Error('boom')) })
    expect(host.textContent).toContain('Activity unavailable')
    expect(host.textContent).not.toContain('No enrichment calls yet')
    aiEnrichLog.mockResolvedValueOnce({ entries: [entry()] })
    const retry = [...host.querySelectorAll('button')].find(b => b.textContent === 'Retry')
    await act(async () => { retry?.click() })
    expect(host.textContent).toContain('Priya Shah')
  })
})

describe('Integrations: Contact enrichment card', () => {
  const open = (admin: boolean) => mount(async m => {
    m.store.S.users.forEach(u => { u.super = admin })
    m.store.reindex()
    const { Integrations } = await import('./Integrations')
    return <Integrations />
  })

  it('shows the activity list to an admin', async () => {
    aiEnrichLog.mockResolvedValue({ entries: [entry()] })
    await open(true)
    expect(host.textContent).toContain('Enrichment activity')
    expect(host.textContent).toContain('Priya Shah')
  })

  it('does not show it, or call the log, for a member who is not an admin', async () => {
    await open(false)
    expect(host.textContent).toContain('Contact enrichment (Grok)')
    expect(host.textContent).not.toContain('Enrichment activity')
    expect(aiEnrichLog).not.toHaveBeenCalled()
  })
})
