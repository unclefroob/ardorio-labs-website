import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rec, salesWorld } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales } from '../../testing/load'
import { setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const mailStatusApi = vi.fn()
vi.mock('../../api/mailboxes', () => ({ mailStatusApi: (...a: unknown[]) => mailStatusApi(...a), connectMailboxApi: vi.fn(), disconnectMailboxApi: vi.fn(), syncMailboxApi: vi.fn(), createMailboxApi: vi.fn(), unmatchedApi: vi.fn().mockResolvedValue({ senders: [] }), dismissUnmatchedApi: vi.fn(), backfillApi: vi.fn(), messageHtmlApi: vi.fn().mockResolvedValue({ html: null }) }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mailStatusApi.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const ROS = rec('ros', { name: 'Rosterio', short: 'ROS', accent: '#123456', desc: '', currency: 'AUD', tz: 'Australia/Melbourne', pipelineId: '', industries: [], roles: [] })

async function inbox(status: { configured: boolean } | Error) {
  if (status instanceof Error) mailStatusApi.mockRejectedValue(status)
  else mailStatusApi.mockResolvedValue(status)
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ businesses: [ROS] }))
  setRole(m, 'admin')
  const { Inbox } = await import('./Inbox')
  await act(async () => { root.render(<Inbox route={{ page: 'inbox' }} />) })
  await settle(5)
}

describe('the pretend-reply controls', () => {
  it('are there for an admin while mail is simulated', async () => {
    await inbox({ configured: false })
    expect(button(host, 'Simulate reply')).toBeDefined()
    expect(host.textContent).toContain('mail here is simulated')
  })

  it('are gone once real Gmail is connected, and the page says the mail is real', async () => {
    await inbox({ configured: true })
    expect(button(host, 'Simulate reply')).toBeUndefined()
    expect(host.textContent).not.toContain('mail here is simulated')
    expect(host.textContent).toContain('read from Gmail')
  })

  it('stay hidden while the answer is still loading, so they never flash up on a live system', async () => {
    mailStatusApi.mockReturnValue(new Promise(() => undefined))
    const m = await loadSales()
    m.bootstrap.hydrate(salesWorld({ businesses: [ROS] }))
    setRole(m, 'admin')
    const { Inbox } = await import('./Inbox')
    await act(async () => { root.render(<Inbox route={{ page: 'inbox' }} />) })
    await settle(3)
    expect(button(host, 'Simulate reply')).toBeUndefined()
  })

  const enrolMenu = async (configured: boolean): Promise<string> => {
    mailStatusApi.mockResolvedValue({ configured })
    const m = await loadSales()
    m.bootstrap.hydrate(salesWorld({ businesses: [ROS] }))
    setRole(m, 'admin')
    const { EnrolTable } = await import('../companies/parts/EnrolTable')
    const en = m.store.S.enrolments[0]
    await act(async () => { root.render(<EnrolTable rows={[en]} showSeq />) })
    await settle(5)
    await click(host.querySelector('button[aria-label="Enrolment actions"]'))
    return document.body.textContent ?? ''
  }

  it('the sequence menu offers no pretend replies, opens or clicks on a live system, but still its real actions', async () => {
    const t = await enrolMenu(true)
    expect(t).toContain('Pause')
    expect(t).not.toContain('Simulate')
  })

  it('and offers them while mail is simulated', async () => {
    const t = await enrolMenu(false)
    expect(t).toContain('Pause')
    expect(t).toContain('Simulate reply')
  })
})
