import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse } from '../../api/contract'
import { appliedResult, changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const postBatch = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: (r: BatchRequest) => postBatch(r), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const mailStatusApi = vi.fn()
const sendMailApi = vi.fn()
vi.mock('../../api/mailboxes', () => ({
  mailStatusApi: (...a: unknown[]) => mailStatusApi(...a), sendMailApi: (...a: unknown[]) => sendMailApi(...a), messageHtmlApi: vi.fn(async () => ({ html: null })),
}))

let host: HTMLDivElement
let root: Root
let m: Sales
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const f of [postBatch, mailStatusApi, sendMailApi]) f.mockReset()
  postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({ serverNow: '2026-10-10T00:00:00.000Z', results: req.ops.map((op, i) => appliedResult(i, op.collection, op.id, 1, 'set' in op ? { ...op.set } : {})) }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

type Status = { configured: boolean } | Error
const inbound = (id: string, ts: string, body: string, from = 'Jo Park <jo.park@acme.test>') =>
  rec(id, { threadId: 'th1', dir: 'in', from, to: 'me@example.com', subject: 'Quote', body, ts, status: 'received', gmailId: 'g' + id })
const outbound = (id: string, ts: string, body: string) =>
  rec(id, { threadId: 'th1', dir: 'out', from: 'me@example.com', to: 'jo@acme.test', subject: 'Re: Quote', body, ts, status: 'sent', gmailId: 'g' + id, mailboxId: 'mb_live' })

async function open(o: { status: Status; canSend?: boolean; messages?: ReturnType<typeof rec>[]; target?: string } = { status: { configured: true } }) {
  if (o.status instanceof Error) mailStatusApi.mockRejectedValue(o.status)
  else mailStatusApi.mockResolvedValue(o.status)
  m = await loadSales()
  const w = rosterioWorld({ contactEmail: 'jo@acme.test' })
  w.collections.mailboxes = [rec('mb_live', { address: 'me@example.com', name: 'Me', type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: o.canSend ?? true })]
  w.collections.threads = [rec('th1', { businessId: 'ros', mailboxId: 'mb_live', subject: 'Quote', contactId: 'ct1', companyId: 'co1', dealId: null, visibility: 'private', ownerId: 'u-me', assigneeId: 'u-me', unread: false, archived: false, classification: null, needsReply: true, sharedWith: [], updatedAt: '2026-10-09T09:00', gmailThreadId: 'gt1' })]
  w.collections.messages = o.messages ?? [inbound('ms1', '2026-10-09T09:00', 'Can you send the quote?')]
  m.bootstrap.hydrate(w)
  setRole(m, 'sales')
  m.sync.setCursor('c0')
  const { ThreadView } = await import('./parts/ThreadView')
  await act(async () => { root.render(<ThreadView t={m.store.S.threads[0]} target={o.target} onClose={() => undefined} />) })
  await settle(5)
}
const text = (): string => host.textContent ?? ''
async function type(el: HTMLElement | null, v: string): Promise<void> {
  await act(async () => {
    if (!el) throw new Error('no field')
    if (el instanceof HTMLInputElement) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      el.innerHTML = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
}
const editor = (): HTMLElement | null => host.querySelector('[contenteditable="true"]')

describe('Reply in a conversation, with real Gmail', () => {
  it('sends through Gmail, into the same Gmail conversation, to whoever wrote last; writes no simulated message', async () => {
    sendMailApi.mockResolvedValue({ threadId: 'th1', messageId: 'ms_gm_x', gmailId: 'gx', recorded: true })
    await open()
    await click(button(host, 'Reply'))
    expect(text()).toContain('Sends through Gmail')
    expect(text()).not.toContain('Sending is simulated')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Reply to"]')!.value).toBe('jo.park@acme.test')
    await type(editor(), 'Here it is')
    const before = m.store.S.messages.length
    await click(button(host, 'Send'))
    await settle(4)
    expect(sendMailApi).toHaveBeenCalledTimes(1)
    expect(sendMailApi.mock.calls[0][0]).toMatchObject({ mailboxId: 'mb_live', to: 'jo.park@acme.test', subject: 'Re: Quote', threadId: 'th1', contactId: 'ct1' })
    expect(m.store.S.messages.length).toBe(before)
    expect(m.store.S.messages.some(x => x.simulated)).toBe(false)
    // nothing is cleared locally on its say-so: the server's record (or the next sync) does that
    expect(m.store.S.threads[0].needsReply).toBe(true)
    expect(host.querySelector('[contenteditable="true"]')).toBeNull()
  })

  it('shows the reply in the conversation straight away, "Sending…" then "Sent", instead of a gap until the sync', async () => {
    let done!: (v: unknown) => void
    sendMailApi.mockReturnValue(new Promise(r => { done = r }))
    await open()
    await click(button(host, 'Reply'))
    await type(editor(), 'On its way')
    await click(button(host, 'Send'))
    const card = (): HTMLElement | null => host.querySelector('.msg-pending')
    expect(card()?.textContent).toContain('Sending…')
    expect(card()?.textContent).toContain('On its way')
    expect(editor()).toBeNull()
    expect(button(host, 'Reply')).toBeUndefined() // no second reply while this one is going
    await act(async () => { done({ threadId: 'th1', messageId: 'ms_gm_x', gmailId: 'gx', recorded: true }) })
    await settle(2)
    expect(card()?.textContent ?? 'replaced by the synced message').not.toContain('Sending…')
  })

  it('a send that fails puts the reply back, as written, and says why', async () => {
    sendMailApi.mockImplementation(async () => { const { SalesHttpError } = await import('../../api/http'); throw new SalesHttpError(502, null, 'Gmail did not accept the message. Nothing was sent.') })
    await open()
    await click(button(host, 'Reply'))
    await type(editor(), 'Try this')
    await click(button(host, 'Send'))
    await settle(3)
    expect(host.querySelector('.msg-pending')).toBeNull()
    expect(editor()?.textContent).toContain('Try this')
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('Gmail did not accept the message. Nothing was sent.')
  })

  it('a refused send keeps the reply open and says why', async () => {
    // (made at call time, from the same module copy the component uses: loadSales gives each test fresh modules)
    sendMailApi.mockImplementation(async () => { const { SalesHttpError } = await import('../../api/http'); throw new SalesHttpError(409, null, 'This address is suppressed. Nothing was sent.') })
    await open()
    await click(button(host, 'Reply'))
    await type(editor(), 'Here it is')
    await click(button(host, 'Send'))
    await settle(4)
    expect(m.ui.UI.get().toasts.map(t => t.msg)).toContain('This address is suppressed. Nothing was sent.')
    expect(editor()).not.toBeNull()
  })

  it('with sending off for the mailbox, Send is disabled and it says where to switch it on', async () => {
    await open({ status: { configured: true }, canSend: false })
    await click(button(host, 'Reply'))
    expect(text()).toContain('Sending is off')
    expect(button(host, 'Send')?.disabled).toBe(true)
  })

  it('when the mail connection cannot be checked, nothing is sent and nothing simulated is written', async () => {
    await open({ status: new Error('offline') })
    await click(button(host, 'Reply'))
    expect(text()).toContain('Could not check Gmail')
    expect(button(host, 'Send')?.disabled).toBe(true)
    const before = m.store.S.messages.length
    await click(button(host, 'Send'))
    expect(sendMailApi).not.toHaveBeenCalled()
    expect(m.store.S.messages.length).toBe(before)
  })

  it('an unsent reply survives switching to another conversation and back', async () => {
    await open()
    await click(button(host, 'Reply'))
    await type(host.querySelector<HTMLInputElement>('input[aria-label="Reply to"]'), 'boss@acme.test')
    act(() => root.unmount())
    root = createRoot(host)
    const { ThreadView } = await import('./parts/ThreadView')
    await act(async () => { root.render(<ThreadView t={m.store.S.threads[0]} onClose={() => undefined} />) })
    await settle(2)
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Reply to"]')?.value).toBe('boss@acme.test')
  })
})

describe('a long conversation opens at the message you came for', () => {
  const chain = [
    inbound('ms1', '2026-10-01T09:00', 'First question about rosters'),
    outbound('ms2', '2026-10-02T09:00', 'First answer'),
    inbound('ms3', '2026-10-03T09:00', 'Second question about pay'),
    outbound('ms4', '2026-10-04T09:00', 'Second answer'),
    inbound('ms5', '2026-10-05T09:00', 'Newest: can we meet Tuesday?'),
  ]
  const open_ = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('div.msg')]
  const folded = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('button.msg-fold')]

  it('older messages fold to one line and the newest is open', async () => {
    await open({ status: { configured: false }, messages: chain })
    expect(folded()).toHaveLength(4)
    expect(open_()).toHaveLength(1)
    expect(open_()[0].textContent).toContain('Newest: can we meet Tuesday?')
    expect(folded()[0].textContent).toContain('First question about rosters')
  })

  it('a link to one message opens that one, marked, alongside the newest', async () => {
    await open({ status: { configured: false }, messages: chain, target: 'ms3' })
    const shown = open_()
    expect(shown.map(x => x.textContent?.includes('Second question about pay') || x.textContent?.includes('Newest'))).toEqual([true, true])
    expect(host.querySelector('.msg-target')?.textContent).toContain('Second question about pay')
  })

  it('clicking a folded message opens it', async () => {
    await open({ status: { configured: false }, messages: chain })
    await click(folded()[1])
    expect(open_().some(x => x.textContent?.includes('First answer'))).toBe(true)
  })
})
