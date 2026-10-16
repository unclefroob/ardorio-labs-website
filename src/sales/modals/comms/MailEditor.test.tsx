import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRequest, BatchResponse } from '../../api/contract'
import { appliedResult, changes, rec } from '../../testing/fixtures'
import { button, click, settle } from '../../testing/dom'
import { loadSales, type Sales } from '../../testing/load'
import { rosterioWorld, setRole } from '../../testing/rosterioWorld'

// What an email carries besides its words, in Compose and in the inline Reply: Bcc, files, the signature, Reply all, Forward, links.

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
const postBatch = vi.fn()
vi.mock('../../api/records', () => ({ postBatch: (r: BatchRequest) => postBatch(r), getChanges: vi.fn(async () => changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
vi.mock('../../api/ai', async orig => ({ ...(await orig<object>()), aiEnrichUsage: vi.fn(async () => ({ enabled: false, usage: { used: 0, limit: 0, resetsOn: '2099-11-01' } })) }))
const mailStatusApi = vi.fn()
const sendMailApi = vi.fn()
vi.mock('../../api/mailboxes', () => ({
  mailStatusApi: (...a: unknown[]) => mailStatusApi(...a), sendMailApi: (...a: unknown[]) => sendMailApi(...a), messageHtmlApi: vi.fn(async () => ({ html: null })),
  connectMailboxApi: vi.fn(), disconnectMailboxApi: vi.fn(), syncMailboxApi: vi.fn(), createMailboxApi: vi.fn(), setSendingApi: vi.fn(),
}))

let host: HTMLDivElement
let root: Root
let m: Sales
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const f of [postBatch, mailStatusApi, sendMailApi]) f.mockReset()
  postBatch.mockImplementation(async (req: BatchRequest): Promise<BatchResponse> => ({ serverNow: '2026-10-10T00:00:00.000Z', results: req.ops.map((op, i) => appliedResult(i, op.collection, op.id, 1, 'set' in op ? { ...op.set } : {})) }))
  sendMailApi.mockResolvedValue({ threadId: 'th1', messageId: 'ms_x', gmailId: 'gx', recorded: true })
  mailStatusApi.mockResolvedValue({ configured: true })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const SIG = '<b>Me Person</b><br>Rosterio <a href="https://rosterio.app" onclick="x()">rosterio.app</a><img src="http://track.test/p.gif">'

async function world(o: { signature?: string; messages?: ReturnType<typeof rec>[] } = {}) {
  m = await loadSales()
  const w = rosterioWorld({ contactEmail: 'jo@acme.test' })
  w.collections.mailboxes = [rec('mb_live', { address: 'me@example.com', name: 'Me', type: 'personal', businessIds: ['ros'], ownerId: 'u-me', authorised: ['u-me'], status: 'connected', canSend: true, signature: o.signature ?? '' })]
  w.collections.threads = [rec('th1', { businessId: 'ros', mailboxId: 'mb_live', subject: 'Quote', contactId: 'ct1', companyId: 'co1', dealId: null, visibility: 'private', ownerId: 'u-me', assigneeId: 'u-me', unread: false, archived: false, classification: null, needsReply: true, sharedWith: [], updatedAt: '2026-10-09T09:00', gmailThreadId: 'gt1' })]
  w.collections.messages = o.messages ?? [rec('ms1', { threadId: 'th1', dir: 'in', from: 'Jo Park <jo@acme.test>', to: 'me@example.com', cc: 'sam@acme.test, me@example.com', subject: 'Quote', body: 'Can you send the quote?', ts: '2026-10-09T09:00', status: 'received', gmailId: 'g1', attachments: [{ name: 'brief.pdf', mime: 'application/pdf', size: 2048 }] })]
  m.bootstrap.hydrate(w)
  setRole(m, 'sales')
  m.sync.setCursor('c0')
}
async function compose(props: Record<string, unknown> = {}) {
  await world({ signature: SIG })
  const { Compose } = await import('./Compose')
  await act(async () => { root.render(<Compose contactId="ct1" businessId="ros" subject="Hello" body="Hi Jo" {...props} />) })
  await settle(5)
}
async function thread(o: Parameters<typeof world>[0] = {}) {
  await world(o)
  const { ThreadView } = await import('../../pages/inbox/parts/ThreadView')
  await act(async () => { root.render(<ThreadView t={m.store.S.threads[0]} onClose={() => undefined} />) })
  await settle(5)
}
const text = (): string => document.body.textContent ?? ''
async function typeIn(el: HTMLInputElement | null, v: string): Promise<void> {
  await act(async () => {
    if (!el) throw new Error('no field')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function attach(...files: File[]): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('no file input')
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  await settle(6)
}
const labelled = (l: string): HTMLInputElement | null => {
  const lab = [...document.querySelectorAll('label')].find(x => x.textContent?.trim() === l)
  return (lab?.parentElement?.querySelector('input') ?? null) as HTMLInputElement | null
}

describe('Compose', () => {
  it('sends Bcc, attached files and the signature; the signature shows as it will look, without anything unsafe', async () => {
    await compose()
    const sig = document.querySelector('[aria-label="Signature"]')!
    expect(sig.innerHTML).toContain('<b>Me Person</b>')
    expect(sig.innerHTML).toContain('href="https://rosterio.app"')
    expect(sig.innerHTML).not.toContain('onclick')
    expect(sig.innerHTML).not.toContain('track.test') // a plain-http image is dropped
    await typeIn(labelled('Bcc'), 'boss@example.com')
    await attach(new File(['%PDF quote'], 'Quote.pdf', { type: 'application/pdf' }))
    expect(text()).toContain('Quote.pdf')
    await click(button(document.body, 'Send'))
    await settle(4)
    const body = sendMailApi.mock.calls[0][0]
    expect(body).toMatchObject({ bcc: 'boss@example.com', signature: true })
    expect(body.attachments).toEqual([{ name: 'Quote.pdf', mime: 'application/pdf', data: btoa('%PDF quote') }])
  })

  it('the signature can be left off one email', async () => {
    await compose()
    const box = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(x => x.parentElement?.textContent?.includes('Add my signature'))!
    await act(async () => { box.click() })
    expect(document.querySelector('[aria-label="Signature"]')).toBeNull()
    await click(button(document.body, 'Send'))
    await settle(4)
    expect(sendMailApi.mock.calls[0][0].signature).toBe(false)
  })

  it('a file Gmail would refuse is not attached, and it says why', async () => {
    await compose()
    await attach(new File(['MZ'], 'setup.exe'))
    expect(text()).not.toContain('setup.exe ·')
    expect(m.ui.UI.get().toasts.map(t => t.msg).join(' ')).toMatch(/Gmail does not allow setup\.exe/)
  })
})

describe('Reply in a conversation', () => {
  it('quotes the message it answers, carries Cc, Bcc and files, and the signature', async () => {
    await thread({ signature: SIG })
    await click(button(host, 'Reply'))
    expect(host.querySelector('[aria-label="Signature"]')).not.toBeNull()
    await click(button(host, 'Cc/Bcc'))
    await typeIn(host.querySelector('input[aria-label="Cc"]'), 'sam@acme.test')
    await typeIn(host.querySelector('input[aria-label="Bcc"]'), 'boss@example.com')
    await act(async () => { const el = host.querySelector<HTMLElement>('[contenteditable="true"]')!; el.innerHTML = 'Here it is'; el.dispatchEvent(new Event('input', { bubbles: true })) })
    await attach(new File(['x'], 'Quote.pdf', { type: 'application/pdf' }))
    await click(button(host, 'Send'))
    await settle(4)
    expect(sendMailApi.mock.calls[0][0]).toMatchObject({ to: 'jo@acme.test', cc: 'sam@acme.test', bcc: 'boss@example.com', threadId: 'th1', quote: true, signature: true })
    expect(sendMailApi.mock.calls[0][0].attachments).toHaveLength(1)
  })

  it('Reply all copies everyone else on the last message, never our own address', async () => {
    await thread()
    await click(button(host, 'Reply all'))
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Reply to"]')!.value).toBe('jo@acme.test')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Cc"]')!.value).toBe('sam@acme.test')
  })

  it('there is no Reply all when nobody else was on it', async () => {
    await thread({ messages: [rec('ms1', { threadId: 'th1', dir: 'in', from: 'jo@acme.test', to: 'me@example.com', subject: 'Quote', body: 'Hi', ts: '2026-10-09T09:00', status: 'received', gmailId: 'g1' })] })
    expect(button(host, 'Reply all')).toBeUndefined()
  })

  it('Forward opens a new email with the original, as Gmail writes it, and says its files are not included', async () => {
    await thread()
    await click(button(host, 'Forward'))
    const modal = m.ui.UI.get().modals.at(-1)!
    expect(modal.name).toBe('compose')
    expect(modal.props).toMatchObject({ businessId: 'ros', mailboxId: 'mb_live', subject: 'Fwd: Quote' })
    expect(modal.props.threadId).toBeUndefined()
    const body = String(modal.props.body)
    expect(body).toContain('---------- Forwarded message ---------')
    expect(body).toContain('From: Jo Park &lt;jo@acme.test&gt;')
    expect(body).toContain('Can you send the quote?')
    expect(body).toContain('1 attachment not included')
  })
})

describe('links in mail', () => {
  it('are kept and open in a new tab when they go to the web, mail or a phone; anything else is not a link', async () => {
    const { F } = await import('../../data/F')
    expect(F.body('See <a href="https://x.test/a?b=1&amp;c=2">this</a>')).toBe('See <a href="https://x.test/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">this</a>')
    expect(F.body('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(F.body('<a href="mailto:a@b.test" onclick="x()">mail</a>')).toBe('<a href="mailto:a@b.test" target="_blank" rel="noopener noreferrer">mail</a>')
    expect(F.body('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })
})
