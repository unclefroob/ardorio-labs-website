import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../shared/features', () => ({ INTEL_LEADS_UI: false, INTEL_PREP_UI: true }))
vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const aiMeetingPrep = vi.fn()
const aiEnrichUsage = vi.fn()
vi.mock('../../api/ai', async orig => ({
  ...(await orig<object>()),
  aiMeetingPrep: (...a: unknown[]) => aiMeetingPrep(...a),
  aiEnrichUsage: (...a: unknown[]) => aiEnrichUsage(...a),
}))

let host: HTMLDivElement
let root: Root
let m: Sales

const usage = { used: 3, limit: 300, resetsOn: '2026-11-01' }
const prep = {
  mode: 'llm', provider: 'xai', model: 'grok-4', generated: true, usage,
  result: {
    prep: {
      summary: 'Acme is growing its store network.',
      talkingPoints: ['Ask about the new Geelong site'], questions: ['How do you roster casuals today?'], watchOuts: ['Recent award underpayment story'],
      news: [{ headline: 'Acme opens Geelong', sourceUrl: 'https://news.test/geelong' }, { headline: 'Bad link', sourceUrl: 'javascript:alert(1)' }],
    },
    sources: [{ title: 'News', url: 'https://news.test/' }], withheld: 0, disclaimer: 'Found with live web search.',
  },
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  aiMeetingPrep.mockReset()
  aiEnrichUsage.mockReset()
  aiEnrichUsage.mockResolvedValue({ enabled: true, usage })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function render(opts: { configured?: boolean; role?: 'sales' | 'viewer' } = {}) {
  m = await loadSales()
  const w = rosterioWorld()
  w.ai = { enabled: true, providers: { anthropic: true, xai: opts.configured ?? true } }
  w.collections.meetings.push(rec('mt1', { title: 'Discovery call', businessId: 'ros', companyId: 'co1', dealId: 'dl1', ownerId: 'u-me', participants: ['ct1'], start: '2026-10-12T10:00:00', duration: 30, type: 'Discovery', status: 'upcoming', sections: {}, summary: '', nextSteps: '', createdBy: 'u-me' }))
  m.bootstrap.hydrate(w)
  setRole(m, opts.role ?? 'sales')
  const { MeetingBrief } = await import('./MeetingBrief')
  await act(async () => { root.render(<MeetingBrief id="mt1" />) })
  await settle(3)
}
const text = (): string => document.body.textContent ?? ''

describe('meeting briefing: web brief', () => {
  it('still shows the CRM briefing, and runs nothing until asked', async () => {
    await render()
    expect(text()).toContain('Briefing: Discovery call')
    expect(text()).toContain('Suggested agenda')
    expect(button(document.body, /Prepare web brief · 1 lookup/)).toBeDefined()
    expect(text()).toContain('297 of 300 lookups left')
    expect(aiMeetingPrep).not.toHaveBeenCalled()
  })

  it('prepares a brief for the meeting and shows sourced items, with safe links only', async () => {
    await render()
    aiMeetingPrep.mockResolvedValue(prep)
    await click(button(document.body, /Prepare web brief/))
    await settle(6)
    expect(aiMeetingPrep).toHaveBeenCalledWith({ businessId: 'ros', meetingId: 'mt1' }, expect.anything())
    expect(text()).toContain('Acme is growing its store network.')
    expect(text()).toContain('Ask about the new Geelong site')
    expect(text()).toContain('Recent award underpayment story')
    const hrefs = [...document.querySelectorAll('a')].map(a => a.getAttribute('href') ?? '')
    expect(hrefs).toContain('https://news.test/geelong')
    expect(hrefs.some(h => h.startsWith('javascript:'))).toBe(false)
    expect(text()).toContain('This brief is not saved')
  })

  it('copies the brief', async () => {
    await render()
    aiMeetingPrep.mockResolvedValue(prep)
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await click(button(document.body, /Prepare web brief/))
    await settle(6)
    await click(button(document.body, 'Copy'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Ask about the new Geelong site'))
  })

  it('reports a provider error and leaves the CRM briefing alone', async () => {
    await render()
    aiMeetingPrep.mockRejectedValue(new m.http.SalesHttpError(502, { error: 'down', code: 'AI_PROVIDER_ERROR' }))
    await click(button(document.body, /Prepare web brief/))
    await settle(6)
    expect(text()).toContain('The lookup service had a problem')
    expect(text()).toContain('Suggested agenda')
  })

  it('says Grok is not configured and offers no lookup', async () => {
    await render({ configured: false })
    expect(text()).toContain('Grok is not configured')
    expect(button(document.body, /Prepare web brief/)).toBeUndefined()
    expect(text()).toContain('Suggested agenda')
  })

  it('a viewer cannot spend a lookup', async () => {
    await render({ role: 'viewer' })
    expect(button(document.body, /Prepare web brief/)?.disabled).toBe(true)
    expect(text()).toContain('You need edit access')
  })
})
