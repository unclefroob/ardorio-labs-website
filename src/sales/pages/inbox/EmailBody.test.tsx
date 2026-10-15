import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../../data/types'
import { button, click, settle } from '../../testing/dom'
import { loadSales } from '../../testing/load'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))
const mailStatusApi = vi.fn()
const messageHtmlApi = vi.fn()
vi.mock('../../api/mailboxes', () => ({ mailStatusApi: (...a: unknown[]) => mailStatusApi(...a), messageHtmlApi: (...a: unknown[]) => messageHtmlApi(...a) }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mailStatusApi.mockReset(); messageHtmlApi.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const msg = (o: Partial<Message> = {}): Message => ({
  id: 'ms1', threadId: 'th1', dir: 'in', from: 'jo@acme.test', to: 'me@example.com', subject: 'Hi', body: 'PLAIN TEXT VERSION', ts: '2026-10-09T09:00', status: 'received', gmailId: 'g1', ...o,
} as Message)

async function show(status: { configured: boolean }, m: Message, html: string | null | Error, images?: Record<string, string>) {
  mailStatusApi.mockResolvedValue(status)
  if (html instanceof Error) messageHtmlApi.mockRejectedValue(html)
  else messageHtmlApi.mockResolvedValue({ html, ...(images ? { images } : {}) })
  await loadSales()
  const { EmailBody, clearEmailBodies } = await import('./parts/EmailBody')
  clearEmailBodies()
  const { useMailState } = await import('../../mail/client')
  // The mail status is read once per session; touch it so the component sees an answer.
  const Probe = () => { useMailState(); return null }
  await act(async () => { root.render(<><Probe /><EmailBody m={m} /></>) })
  await settle(5)
}
const frame = (): HTMLIFrameElement | null => host.querySelector('iframe')
const text = (): string => host.textContent ?? ''

describe('an email shown as the sender wrote it', () => {
  it('shows a Gmail message from its HTML in a frame that can run no script and sends no referrer', async () => {
    await show({ configured: true }, msg(), '<p><b>Rich</b> <a href="https://ok.test">link</a></p>')
    expect(messageHtmlApi).toHaveBeenCalledWith('ms1', expect.anything())
    const f = frame()!
    expect(f).not.toBeNull()
    expect(f.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(f.getAttribute('sandbox')).not.toContain('allow-top-navigation')
    expect(f.getAttribute('sandbox')).toContain('allow-popups')
    expect(f.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(f.srcdoc).toContain("default-src 'none'")
    expect(f.srcdoc).toContain('<b>Rich</b>')
    expect(text()).not.toContain('PLAIN TEXT VERSION')
  })

  it('hostile HTML is sanitised before it reaches the frame', async () => {
    await show({ configured: true }, msg(), '<p>ok</p><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">x</a>')
    const s = frame()!.srcdoc
    expect(s).not.toMatch(/<script|onerror|javascript:/i)
    expect(s).toContain('<p>ok</p>')
  })

  it('hides remote images and says so, and Show images lets them through (https only)', async () => {
    await show({ configured: true }, msg(), '<p>Hi</p><img src="https://track.test/p.gif">')
    expect(frame()!.srcdoc).not.toContain('track.test')
    expect(frame()!.srcdoc).not.toMatch(/img-src[^;]*https:/)
    expect(text()).toContain('Images are hidden')
    await click(button(host, 'Show images'))
    expect(frame()!.srcdoc).toContain('https://track.test/p.gif')
    expect(frame()!.srcdoc).toMatch(/img-src data: https:/)
    expect(button(host, 'Show images')).toBeUndefined()
  })

  it('offers no Show images button when there is nothing remote to show', async () => {
    await show({ configured: true }, msg(), '<p>Plain html</p>')
    expect(button(host, 'Show images')).toBeUndefined()
  })

  it('shows the stored text when Gmail has no HTML for it, or the fetch fails', async () => {
    await show({ configured: true }, msg(), null)
    expect(frame()).toBeNull()
    expect(text()).toContain('PLAIN TEXT VERSION')
    act(() => root.unmount()); root = createRoot(host)
    await show({ configured: true }, msg({ id: 'ms2' }), new Error('502'))
    expect(frame()).toBeNull()
    expect(text()).toContain('PLAIN TEXT VERSION')
  })

  it('shows the text straight away, then the HTML when it arrives', async () => {
    mailStatusApi.mockResolvedValue({ configured: true })
    let release: (v: { html: string }) => void = () => undefined
    messageHtmlApi.mockReturnValue(new Promise(r => { release = r }))
    await loadSales()
    const { EmailBody, clearEmailBodies } = await import('./parts/EmailBody')
    clearEmailBodies()
    const { useMailState } = await import('../../mail/client')
    const Probe = () => { useMailState(); return null }
    await act(async () => { root.render(<><Probe /><EmailBody m={msg()} /></>) })
    await settle(3)
    expect(text()).toContain('PLAIN TEXT VERSION')
    await act(async () => { release({ html: '<p>arrived</p>' }) })
    await settle(2)
    expect(frame()!.srcdoc).toContain('arrived')
  })

  it('never asks the server for mail that did not come from Gmail, a draft, or when Gmail is not live', async () => {
    await show({ configured: true }, msg({ gmailId: undefined }), '<p>x</p>')
    expect(messageHtmlApi).not.toHaveBeenCalled()
    expect(text()).toContain('PLAIN TEXT VERSION')
    act(() => root.unmount()); root = createRoot(host)
    await show({ configured: true }, msg({ status: 'draft' }), '<p>x</p>')
    expect(messageHtmlApi).not.toHaveBeenCalled()
    act(() => root.unmount()); root = createRoot(host)
    await show({ configured: false }, msg(), '<p>x</p>')
    expect(messageHtmlApi).not.toHaveBeenCalled()
    expect(frame()).toBeNull()
  })
})

describe('embedded pictures and wrapped text', () => {
  it('puts the pictures the server sent into the mail, with remote images still hidden', async () => {
    await show({ configured: true }, msg(), '<p>Logo:</p><img src="cid:logo1"><img src="https://track.test/p.gif">', { logo1: 'data:image/png;base64,iVBORw0KGgo=' })
    const s = frame()!.srcdoc
    expect(s).toContain('data:image/png;base64,iVBORw0KGgo=')
    expect(s).not.toContain('track.test')
    expect(s).not.toContain('cid:')
  })

  const WRAPPED = 'I am trying to manually add the staff timesheets for this week; I\nam having an issue with the staff doing double shift in different\nareas.\n\nThank you,\nAlice'

  it('Gmail text shown without HTML has its wrapped lines joined into paragraphs', async () => {
    await show({ configured: true }, msg({ body: WRAPPED }), null)
    expect(frame()).toBeNull()
    expect(host.querySelector('.msg-b')?.innerHTML).toContain('this week; I am having an issue with the staff doing double shift in different areas.')
    expect(host.querySelector('.msg-b')?.innerHTML).toContain('Thank you,<br>Alice')
  })

  it('text that did not come from Gmail is shown exactly as written', async () => {
    await show({ configured: true }, msg({ gmailId: undefined, body: WRAPPED }), null)
    expect(host.querySelector('.msg-b')?.innerHTML).toContain('this week; I<br>am having an issue')
  })
})
