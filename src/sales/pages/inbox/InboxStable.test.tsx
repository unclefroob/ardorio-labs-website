import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse } from '../../api/contract'
import { appliedResult, changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { routedInbox } from '../../testing/routed'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const postBatch = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: (r: BatchRequest) => postBatch(r), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const mailStatusApi = vi.fn()
const unmatchedApi = vi.fn()
const backfillApi = vi.fn()
const dismissUnmatchedApi = vi.fn()
const syncMailboxApi = vi.fn()
vi.mock('../../api/mailboxes', () => ({
  mailStatusApi: (...a: unknown[]) => mailStatusApi(...a), messageHtmlApi: vi.fn(async () => ({ html: null })),
  unmatchedApi: (...a: unknown[]) => unmatchedApi(...a), backfillApi: (...a: unknown[]) => backfillApi(...a), dismissUnmatchedApi: (...a: unknown[]) => dismissUnmatchedApi(...a),
  syncMailboxApi: (...a: unknown[]) => syncMailboxApi(...a), connectMailboxApi: vi.fn(), sendMailApi: vi.fn(),
}))

let host: HTMLDivElement
let root: Root
let m: Sales
let nav: string[]
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const f of [postBatch, mailStatusApi, unmatchedApi, backfillApi, dismissUnmatchedApi, syncMailboxApi]) f.mockReset()
  postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({ serverNow: '2026-10-10T00:00:00.000Z', results: req.ops.map((op, i) => appliedResult(i, op.collection, op.id, 1, 'set' in op ? { ...op.set } : {})) }))
  unmatchedApi.mockResolvedValue({ senders: [] })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const thread = (id: string, subject: string, o: Record<string, unknown> = {}) => rec(id, {
  businessId: 'ros', mailboxId: 'mb1', subject, contactId: 'ct1', companyId: 'co1', dealId: null, visibility: 'private', ownerId: 'u-me', assigneeId: 'u-me',
  unread: false, archived: false, classification: null, needsReply: false, sharedWith: [], updatedAt: '2026-10-09T09:00', ...o,
})
const message = (id: string, threadId: string, body: string, ts = '2026-10-09T09:00') =>
  rec(id, { threadId, dir: 'in', from: 'jo@acme.test', to: 'me@example.com', subject: 'Hi', body, ts, status: 'received' })

async function render(o: { live?: boolean; start?: { id?: string; q?: Record<string, unknown> }; mailbox?: Record<string, unknown> } = {}) {
  mailStatusApi.mockResolvedValue({ configured: !!o.live })
  m = await loadSales()
  const w = rosterioWorld({ contactEmail: 'jo@acme.test' })
  w.collections.mailboxes = [rec('mb1', { address: 'me@example.com', name: 'Me', type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: true, lastSync: '2026-10-09T08:58', ...o.mailbox })]
  w.collections.threads = [
    thread('th1', 'Alpha subject', { unread: true, updatedAt: '2026-10-09T11:00' }),
    thread('th2', 'Bravo subject', { unread: true, updatedAt: '2026-10-09T10:00' }),
    thread('th3', 'Charlie subject', { updatedAt: '2026-10-09T09:00' }),
  ]
  w.collections.messages = [message('ms1', 'th1', 'alpha body'), message('ms2', 'th2', 'bravo body'), message('ms3', 'th3', 'charlie body')]
  m.bootstrap.hydrate(w)
  setRole(m, 'sales')
  const r = await routedInbox(m, o.start)
  nav = r.nav
  await act(async () => { root.render(<r.Page />) })
  await settle(5)
}
const listed = (): string[] => [...host.querySelectorAll<HTMLElement>('.ib-m .th .subj')].map(b => b.textContent ?? '')
const rowOf = (s: string): HTMLElement => [...host.querySelectorAll<HTMLElement>('.ib-m .th button')].find(b => b.textContent?.includes(s))!
const folder = (label: string): HTMLElement => [...host.querySelectorAll<HTMLElement>('.ib-l button')].find(b => b.textContent?.startsWith(label))!
const reader = (): string => host.querySelector('.ib-r')?.textContent ?? ''

describe('the Unread folder keeps what you open', () => {
  it('opening an unread conversation reads it but leaves it in the list, open, until you change folder', async () => {
    await render()
    await click(folder('Unread'))
    expect(listed()).toEqual(['Alpha subject', 'Bravo subject'])
    await click(rowOf('Alpha subject'))
    expect(m.store.S.threads.find(t => t.id === 'th1')!.unread).toBe(false)
    expect(listed()).toEqual(['Alpha subject', 'Bravo subject'])
    expect(reader()).toContain('alpha body')
    // and opening the next one keeps the first one there too
    await click(rowOf('Bravo subject'))
    expect(listed()).toEqual(['Alpha subject', 'Bravo subject'])
    // a fresh look at the folder shows what is still unread
    await click(folder('All CRM conversations'))
    await click(folder('Unread'))
    expect(listed()).toEqual(['Bravo subject'])
  })

  it('"Doesn\'t need a reply" in the Needs reply folder leaves the conversation where it is, with an Undo', async () => {
    await render()
    m.store.S.threads.forEach(t => { t.needsReply = t.id === 'th3' })
    await click(folder('Needs reply'))
    await click(rowOf('Charlie subject'))
    await click(button(host.querySelector('.ib-r')!, "Doesn't need a reply"))
    expect(listed()).toEqual(['Charlie subject'])
    const t = m.ui.UI.get().toasts.at(-1)!
    expect(t.action?.label).toBe('Undo')
    act(() => t.action!.fn())
    expect(m.store.S.threads.find(x => x.id === 'th3')!.needsReply).toBe(true)
  })
})

describe('the open conversation is in the address', () => {
  it('a link with a conversation id opens it (company page, deal, toast, notification)', async () => {
    const { routeToPath, pathToRoute } = await import('../../routes')
    expect(routeToPath('inbox', { id: 'th2' })).toBe('/sales/inbox/th2')
    expect(pathToRoute('/sales/inbox/th2', '')).toMatchObject({ page: 'inbox', id: 'th2', known: true })
    await render({ start: { id: 'th2' } })
    expect(reader()).toContain('bravo body')
    expect(m.store.S.threads.find(t => t.id === 'th2')!.unread).toBe(false)
  })

  it('selecting a conversation replaces the address without reloading the page, so the folder and search stay put', async () => {
    await render()
    await click(folder('Unread'))
    await click(rowOf('Bravo subject'))
    expect(nav.at(-1)).toMatch(/^\/sales\/inbox\/th2\?q=/)
    expect(decodeURIComponent(nav.at(-1)!)).toContain('"folder":"unread"')
    expect(host.querySelector('.ib-l .ni.on')?.textContent).toContain('Unread')
  })

  it('archiving opens the next conversation down and offers Undo', async () => {
    await render({ start: { id: 'th1' } })
    const { Act } = await import('../../data/Act')
    expect(Act).toBeDefined()
    const menu = host.querySelector<HTMLElement>('.ib-r button[aria-label="Conversation actions"]')
    await click(menu)
    await click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(b => b.textContent?.includes('Archive')))
    expect(m.store.S.threads.find(t => t.id === 'th1')!.archived).toBe(true)
    expect(listed()).not.toContain('Alpha subject')
    expect(reader()).toContain('bravo body')
    expect(m.ui.UI.get().toasts.at(-1)?.action?.label).toBe('Undo')
  })
})

describe('mail health and people not in SalesOS, with real Gmail', () => {
  it('says so in the Inbox when a mailbox is disconnected or failing, with Reconnect for its owner', async () => {
    await render({ live: true, mailbox: { status: 'disconnected' } })
    expect(host.querySelector('.ib-m')?.textContent).toContain('is disconnected, so new mail is not arriving')
    expect(button(host, 'Reconnect Gmail')).toBeDefined()
    act(() => root.unmount()); root = createRoot(host)
    await render({ live: true, mailbox: { syncError: 'Could not read new mail from Gmail. SalesOS will try again in a few minutes.' } })
    expect(host.querySelector('.ib-m')?.textContent).toContain('Could not read new mail from Gmail')
  })

  it('shows when mail was last read, and Check now reads it', async () => {
    syncMailboxApi.mockResolvedValue({ ran: true, reason: null, stored: 2, fetched: 2 })
    await render({ live: true })
    expect(host.querySelector('.ib-m')?.textContent).toContain('Synced')
    await click(button(host, 'Check now'))
    await settle(3)
    expect(syncMailboxApi).toHaveBeenCalledWith('mb1')
    expect(m.ui.UI.get().toasts.at(-1)?.msg).toBe('2 new messages')
  })

  it('lists people who wrote in but are not contacts; Dismiss takes them off', async () => {
    unmatchedApi.mockResolvedValue({ senders: [{ address: 'sam@new.test', name: 'Sam Lee', subject: 'Intro', at: '2026-10-09T01:00:00.000Z', count: 2 }] })
    dismissUnmatchedApi.mockResolvedValue({ ok: true })
    await render({ live: true })
    await click(folder('Not in SalesOS yet'))
    expect(host.querySelector('.ib-m')?.textContent).toContain('Sam Lee')
    expect(host.querySelector('.ib-m')?.textContent).toContain('2 messages')
    await click(button(host, 'Dismiss'))
    await settle(2)
    expect(dismissUnmatchedApi).toHaveBeenCalledWith('mb1', 'sam@new.test')
    expect(host.querySelector('.ib-m')?.textContent).not.toContain('Sam Lee')
  })

  it('Add contact opens the new-contact form filled in, and once saved files their earlier mail', async () => {
    unmatchedApi.mockResolvedValue({ senders: [{ address: 'sam@new.test', name: 'Sam Lee', subject: 'Intro', at: '2026-10-09T01:00:00.000Z', count: 1 }] })
    backfillApi.mockResolvedValue({ stored: 3, unmatched: 0 })
    await render({ live: true })
    await click(folder('Not in SalesOS yet'))
    await click(button(host, 'Add contact'))
    const modal = m.ui.UI.get().modals.at(-1)!
    expect(modal.name).toBe('newContact')
    expect(modal.props).toMatchObject({ email: 'sam@new.test', name: 'Sam Lee', businessId: 'ros' })
    await act(async () => { (modal.props.onCreated as (c: unknown) => void)({ id: 'ct_new' }) })
    await settle(5)
    expect(backfillApi).toHaveBeenCalledWith('mb1', 'sam@new.test')
    expect(m.ui.UI.get().toasts.at(-1)?.msg).toBe('Contact added. 3 messages filed in the Inbox.')
  })

  it('without real Gmail there is no such list and no health line', async () => {
    await render({ live: false })
    expect(folder('Not in SalesOS yet')).toBeUndefined()
    expect(unmatchedApi).not.toHaveBeenCalled()
    expect(host.querySelector('.ib-m')?.textContent).not.toContain('Synced')
  })
})
