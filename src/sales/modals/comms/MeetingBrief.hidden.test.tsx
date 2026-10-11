import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changes, rec } from '../../testing/fixtures'
import { button, settle } from '../../testing/dom'
import { loadSales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../api/ai', async orig => ({ ...(await orig<object>()), aiEnrichUsage: vi.fn(async () => ({ enabled: true, usage: { used: 3, limit: 300, resetsOn: '2026-11-01' } })) }))

let host: HTMLDivElement
let root: Root

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

describe('meeting briefing with the web brief held back (the default for this release)', () => {
  it('shows the CRM briefing and no web brief button', async () => {
    const m = await loadSales()
    const w = rosterioWorld()
    w.ai = { enabled: true, providers: { anthropic: true, xai: true } }
    w.collections.meetings.push(rec('mt1', { title: 'Discovery call', businessId: 'ros', companyId: 'co1', dealId: 'dl1', ownerId: 'u-me', participants: ['ct1'], start: '2026-10-12T10:00:00', duration: 30, type: 'Discovery', status: 'upcoming', sections: {}, summary: '', nextSteps: '', createdBy: 'u-me' }))
    m.bootstrap.hydrate(w)
    setRole(m, 'sales')
    const { MeetingBrief } = await import('./MeetingBrief')
    await act(async () => { root.render(<MeetingBrief id="mt1" />) })
    await settle(3)
    expect(document.body.textContent).toContain('Suggested agenda')
    expect(button(document.body, /Prepare web brief/)).toBeUndefined()
    expect(document.body.textContent).not.toContain('lookups left')
  })
})
