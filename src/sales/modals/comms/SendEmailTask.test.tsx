import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailTask, rec, salesWorld, suppression } from '../../testing/fixtures'
import { loadSales } from '../../testing/load'

vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: vi.fn(), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

let host: HTMLDivElement
let root: Root
const writeText = vi.fn(() => Promise.resolve())

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
  writeText.mockClear()
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function setup(over: Parameters<typeof salesWorld>[0] = {}, props: { taskId: string } = { taskId: 'tk_en1_0' }) {
  const m = await loadSales()
  m.bootstrap.hydrate(salesWorld({ tasks: [rec('tk_en1_0', emailTask())], ...over }))
  const { Act } = await import('../../data/Act')
  const { SendEmailTask } = await import('./SendEmailTask')
  const { UI } = await import('../../ui/store')
  act(() => root.render(<SendEmailTask {...props} />))
  return { ...m, Act, UI }
}

const btn = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').startsWith(label))
function press(label: string): void {
  const b = btn(label)
  if (!b) throw new Error(`no button "${label}" among ${[...host.querySelectorAll('button')].map(x => x.getAttribute('aria-label') ?? x.textContent).join(' | ')}`)
  act(() => b.click())
}

describe('SendEmailTask modal', () => {
  it('shows the draft read-only with who it is from and to', async () => {
    await setup()
    const text = host.textContent ?? ''
    expect(text).toContain('me@example.com')
    expect(text).toContain('sam@example.com')
    expect(text).toContain('Quick question about Acme')
    expect(text).toContain('Got a minute?')
    expect(host.querySelector('textarea, input')).toBeNull()
  })

  it('says plainly that SalesOS does not send the email', async () => {
    await setup()
    expect(host.textContent).toMatch(/does not send/i)
  })

  it.each([
    ['Copy to', 'sam@example.com'],
    ['Copy subject', 'Quick question about Acme'],
    ['Copy body', 'Hi Sam,\nGot a minute?'],
  ])('%s copies exactly that field', async (label, expected) => {
    await setup()
    press(label)
    expect(writeText).toHaveBeenCalledWith(expected)
  })

  it('Copy all copies subject then body, ready to paste', async () => {
    await setup()
    press('Copy all')
    expect(writeText).toHaveBeenCalledWith('To: sam@example.com\nSubject: Quick question about Acme\n\nHi Sam,\nGot a minute?')
  })

  it('offers a Cc copy only when there is a Cc', async () => {
    await setup()
    expect(btn('Copy cc')).toBeUndefined()
    act(() => root.unmount())
    root = createRoot(host)
    await setup({ tasks: [rec('tk_en1_0', emailTask({ draft: { from: 'me@example.com', to: 'sam@example.com', cc: 'boss@example.com', subject: 'S', body: 'B' } }))] })
    press('Copy cc')
    expect(writeText).toHaveBeenCalledWith('boss@example.com')
  })

  it('Mark as sent calls the action, closes, and does not touch the enrolment', async () => {
    const m = await setup()
    m.UI.open('sendEmailTask', { taskId: 'tk_en1_0' })
    press('Mark as sent')
    expect(m.store.S.tasks[0]).toMatchObject({ status: 'Completed', outcome: 'Sent (manual)' })
    expect(m.store.S.messages.some(x => x.id === 'ms_tk_en1_0')).toBe(true)
    expect(m.store.S.enrolments[0].status).toBe('awaiting_task')
    expect(m.UI.get().modals).toHaveLength(0)
    expect(m.UI.get().toasts.at(-1)?.msg).toMatch(/marked as sent/i)
  })

  it('is disabled and explains why when the contact is suppressed', async () => {
    const m = await setup({ suppressions: [rec('sp1', suppression({ contactId: 'ct1' }))] })
    expect(btn('Mark as sent')?.disabled).toBe(true)
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/suppressed/i)
    press('Mark as sent')
    expect(m.store.S.messages).toHaveLength(0)
  })

  it('becomes blocked live when a suppression lands while the modal is open', async () => {
    const m = await setup()
    expect(btn('Mark as sent')?.disabled).toBe(false)
    act(() => {
      m.store.S.suppressions.push({ id: 'sp9', contactId: 'ct1', scope: 'global', businessId: null, reason: 'Unsubscribe', source: 't', date: '2026-10-09T09:00', by: 'u-me' })
      m.store.publish()
    })
    expect(btn('Mark as sent')?.disabled).toBe(true)
  })

  it('Skip needs a confirmation, then cancels the task', async () => {
    const m = await setup()
    press('Skip this email')
    expect(m.store.S.tasks[0].status).toBe('Not Started')
    const c = m.UI.get().modals.at(-1)
    expect(c?.name).toBe('confirm')
    act(() => (c?.props.onConfirm as () => void)())
    expect(m.store.S.tasks[0]).toMatchObject({ status: 'Cancelled', outcome: 'Skipped' })
  })

  it('Stop emailing needs a confirmation, then removes the enrolment', async () => {
    const m = await setup()
    press('Stop emailing')
    expect(m.store.S.enrolments[0].status).toBe('awaiting_task')
    const c = m.UI.get().modals.at(-1)
    expect(c?.props).toMatchObject({ danger: true })
    act(() => (c?.props.onConfirm as () => void)())
    expect(m.store.S.enrolments[0].status).toBe('removed')
    expect(m.store.S.tasks[0].status).toBe('Cancelled')
  })

  it('an already-sent task shows its outcome and offers no actions', async () => {
    await setup({ tasks: [rec('tk_en1_0', emailTask({ status: 'Completed', outcome: 'Sent (manual)' }))] })
    expect(host.textContent).toMatch(/already/i)
    expect(btn('Mark as sent')).toBeUndefined()
    expect(btn('Skip this email')).toBeUndefined()
  })

  it('a missing task shows the not-found state', async () => {
    await setup({}, { taskId: 'nope' })
    expect(host.textContent).toMatch(/not found/i)
  })

  it('falls back to a toast when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined })
    const m = await setup()
    press('Copy subject')
    expect(m.UI.get().toasts.at(-1)?.tone).toBe('warn')
  })
})
