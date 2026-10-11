import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceDto } from '../../api/contract'
import { changes, rec } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { CLIENT, dto, invoicingWorld, PLAN_DATA, setArdRole, SETTINGS } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const GET1 = 'GET /sales/invoices/i1'
const VOID1 = 'POST /sales/invoices/i1/void'
const DUP1 = 'POST /sales/invoices/i1/duplicate'
const ACK1 = 'POST /sales/invoices/i1/acknowledge-refund'
const base = {
  'GET /sales/invoices/settings': () => json(200, SETTINGS),
  'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }),
  'GET /sales/invoices?dealId=dl1': () => json(200, { invoices: [] }),
}

let host: HTMLDivElement
let root: Root
let m: Sales

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const text = (): string => host.textContent ?? ''
const dialog = (): HTMLElement | null => host.querySelector('[role="alertdialog"]')
const dlgBtn = (label: string | RegExp): HTMLButtonElement | undefined => button(dialog() ?? host, label)
const modals = (): string[] => m.ui.UI.get().modals.map(x => x.name)
const toasts = (): string[] => m.ui.UI.get().toasts.map(t => t.msg)
const more = (): HTMLButtonElement | undefined => button(host, 'More')
const items = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const item = (label: string): HTMLElement | undefined => items().find(i => i.textContent?.trim() === label)

const VOIDED = { voidedAt: '2026-10-12T04:41:00.000Z', voidedBy: 'u-me', reason: 'mistake' as const, note: 'Wrong milestone selected', linkDeactivated: true }
const sent = (over: Partial<InvoiceDto> = {}): InvoiceDto => dto({ id: 'i1', ...over })
const paid = (): InvoiceDto => dto({ id: 'i1', status: 'paid', payment: { method: 'bank-transfer', paidAt: '2026-10-06', amountCents: 1980000, reference: 'R1' } })
const voided = (over: Partial<InvoiceDto> = {}): InvoiceDto => dto({ id: 'i1', status: 'void', voided: VOIDED, ...over })

async function show(inv: InvoiceDto, routes: Parameters<typeof fakeApi>[0] = {}, world: Parameters<typeof invoicingWorld>[0] = {}) {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld(world))
  setArdRole(m, 'admin')
  const nav = vi.fn()
  m.ui.bindNavigate(nav)
  const api = fakeApi({ ...base, [GET1]: () => json(200, inv), ...routes })
  const { Invoice } = await import('./Invoice')
  const { Hosts } = await import('../../shell/Hosts')
  await act(async () => { root.render(<><Invoice route={{ page: 'invoice', id: 'i1' }} /><Hosts /></>) })
  await settle(10)
  return { api, nav }
}
const openMenu = async (): Promise<void> => click(more())
const openCancel = async (): Promise<void> => {
  await openMenu()
  await click(item('Cancel invoice…'))
  await settle(2)
}
const choose = async (reason: string): Promise<void> => type(dialog()?.querySelector('select') ?? null, reason)
const key = async (k: string, target: Element = document.activeElement ?? document.body): Promise<void> => {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
}
const voidCalls = (api: { calls: Array<{ method: string; path: string; body: unknown }> }) => api.calls.filter(c => c.method === 'POST' && c.path.endsWith('/void'))

describe('the More menu, by status', () => {
  it('a draft has no More menu and no Cancel (it keeps Delete)', async () => {
    await show(sent({ status: 'draft', issuedCount: 0, sentAt: null }))
    expect(more()).toBeUndefined()
    expect(text()).not.toContain('Cancel invoice')
    expect(button(host, 'Delete draft')).toBeDefined()
  })

  it('a sent invoice offers Cancel invoice with an icon, danger styling and a divider above it', async () => {
    await show(sent())
    expect(more()?.getAttribute('aria-label')).toBe('More actions for INV-0034')
    expect(more()?.querySelector('svg')).not.toBeNull()
    await openMenu()
    expect(items().map(i => i.textContent?.trim())).toEqual(['Copy public link', 'Duplicate as new draft', 'Cancel invoice…'])
    const c = item('Cancel invoice…')!
    expect(c.classList.contains('dngtxt')).toBe(true)
    expect(c.querySelector('svg')).not.toBeNull()
    expect(c.getAttribute('aria-disabled')).toBeNull()
    expect(c.previousElementSibling?.getAttribute('role')).toBe('separator')
  })

  it('an overdue invoice offers Cancel too', async () => {
    await show(sent({ overdue: true }))
    await openMenu()
    expect(item('Cancel invoice…')).toBeDefined()
  })

  it('More is set apart from Issue-side actions: Mark paid stays a separate button', async () => {
    await show(sent())
    expect(button(host, 'Mark paid')).toBeDefined()
    expect(button(host, 'Mark paid')?.closest('[role="menu"]')).toBeNull()
    expect(more()?.closest('[role="menu"]')).toBeNull()
  })

  it('a paid invoice shows Cancel disabled with the reason as visible text, not only a tooltip', async () => {
    await show(paid())
    await openMenu()
    const c = item('Cancel invoice')!
    expect(c.getAttribute('aria-disabled')).toBe('true')
    expect(c.getAttribute('title')).toBeNull()
    expect(text()).toContain('Paid invoices cannot be cancelled. Refund or issue a credit instead.')
    const hint = host.querySelector(`[id="${c.getAttribute('aria-describedby')}"]`)
    expect(hint?.textContent).toBe('Paid invoices cannot be cancelled. Refund or issue a credit instead.')
    await click(c)
    expect(modals()).toEqual([])
  })

  it('a cancelled invoice has no More menu', async () => {
    await show(voided())
    expect(more()).toBeUndefined()
  })
})

describe('the More menu, by keyboard', () => {
  it('arrow keys move between items, wrapping round', async () => {
    await show(sent())
    await openMenu()
    expect(document.activeElement).toBe(item('Copy public link'))
    await key('ArrowDown')
    expect(document.activeElement).toBe(item('Duplicate as new draft'))
    await key('ArrowDown')
    expect(document.activeElement).toBe(item('Cancel invoice…'))
    await key('ArrowDown')
    expect(document.activeElement).toBe(item('Copy public link'))
    await key('ArrowUp')
    expect(document.activeElement).toBe(item('Cancel invoice…'))
    await key('Home')
    expect(document.activeElement).toBe(item('Copy public link'))
    await key('End')
    expect(document.activeElement).toBe(item('Cancel invoice…'))
  })

  it('Escape closes the menu and focus returns to the trigger', async () => {
    await show(sent())
    await openMenu()
    expect(more()?.getAttribute('aria-expanded')).toBe('true')
    await key('Escape')
    expect(items()).toHaveLength(0)
    expect(more()?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(more())
  })

  it('ArrowDown on the trigger opens the menu', async () => {
    await show(sent())
    more()?.focus()
    await key('ArrowDown')
    expect(items().length).toBeGreaterThan(0)
  })
})

describe('the confirmation dialog', () => {
  it('is an alertdialog titled with the invoice number, and starts on Keep invoice', async () => {
    await show(sent())
    await openCancel()
    expect(modals()).toEqual(['cancelInvoice'])
    expect(dialog()?.getAttribute('aria-label')).toBe('Cancel invoice INV-0034?')
    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dlgBtn('Keep invoice'))
  })

  it('lists what will happen, built from the invoice', async () => {
    await show(sent({ milestoneId: 'm2', paymentLinkUrl: 'https://buy.stripe.com/x', paymentLinkIsAutomatic: true }), {}, { billingPlans: [rec('bp_dl1', PLAN_DATA)] })
    await openCancel()
    const t = dialog()?.textContent ?? ''
    expect(t).toContain('The card payment link stops working')
    expect(t).toContain('This invoice has been cancelled')
    expect(t).toContain('watermarked CANCELLED')
    expect(t).toContain('$18,000.00 ex GST ($19,800.00 with GST) leaves Outstanding and Invoiced')
    expect(t).toContain('Milestone “Core platform” goes back to Planned')
    expect(t).toContain('billing progress on the deal drops')
  })

  it('tells you a link pasted by hand cannot be switched off here', async () => {
    await show(sent({ paymentLinkUrl: 'https://pay.example/x', paymentLinkIsAutomatic: false }))
    await openCancel()
    expect(dialog()?.textContent).toContain('cannot be switched off here')
    expect(dialog()?.textContent).toContain('Switch it off in your payment provider')
  })

  it('Escape keeps the invoice and returns focus to the More button', async () => {
    const { api } = await show(sent())
    await openCancel()
    await key('Escape')
    expect(modals()).toEqual([])
    expect(voidCalls(api)).toHaveLength(0)
    expect(document.activeElement).toBe(more())
  })

  it('the X and Keep invoice keep the invoice', async () => {
    const { api } = await show(sent())
    await openCancel()
    await click(dialog()?.querySelector('[aria-label="Keep invoice and close this dialog"]'))
    expect(modals()).toEqual([])
    await openCancel()
    await click(dlgBtn('Keep invoice'))
    expect(modals()).toEqual([])
    expect(voidCalls(api)).toHaveLength(0)
  })

  it('Cancel invoice stays disabled until a reason is chosen', async () => {
    await show(sent())
    await openCancel()
    expect(dlgBtn('Cancel invoice')?.disabled).toBe(true)
    expect(dialog()?.textContent).toContain('Choose a reason to continue.')
    expect([...(dialog()?.querySelectorAll('option') ?? [])].map(o => o.textContent)).toEqual(['Choose a reason…', 'Raised by mistake', 'Client cancelled', 'Replaced by another invoice', 'Other'])
    await choose('mistake')
    expect(dlgBtn('Cancel invoice')?.disabled).toBe(false)
    expect(dialog()?.textContent).toContain('Nothing changes until you confirm.')
  })

  it('Other needs a note, and the note counts up to 200', async () => {
    await show(sent())
    await openCancel()
    await choose('other')
    expect(dlgBtn('Cancel invoice')?.disabled).toBe(true)
    expect(dialog()?.textContent).toContain('required')
    const note = dialog()?.querySelector('textarea') as HTMLTextAreaElement
    expect(note.maxLength).toBe(200)
    await type(note, 'Duplicate of INV-0030')
    expect(dialog()?.textContent).toContain('21 / 200')
    expect(dlgBtn('Cancel invoice')?.disabled).toBe(false)
  })

  it('sends the reason and note, and a second click while it is in flight does nothing', async () => {
    let finish: (r: Response) => void = () => undefined
    const pending = new Promise<Response>(r => { finish = r })
    const { api } = await show(sent(), { [VOID1]: () => pending })
    await openCancel()
    await choose('client-cancelled')
    await type(dialog()?.querySelector('textarea') ?? null, ' Client pulled out ')
    const go = dlgBtn('Cancel invoice')!
    await click(go)
    await click(go)
    await click(dlgBtn(/Cancelling/))
    expect(voidCalls(api)).toHaveLength(1)
    expect(voidCalls(api)[0].body).toEqual({ reason: 'client-cancelled', note: 'Client pulled out' })
    expect(dlgBtn(/Cancelling/)?.disabled).toBe(true)
    expect(dialog()?.getAttribute('aria-busy') ?? dialog()?.querySelector('[aria-busy="true"]')?.getAttribute('aria-busy')).toBe('true')
    // While busy neither Escape nor Keep invoice dismisses it.
    await key('Escape')
    await click(dlgBtn('Keep invoice'))
    expect(modals()).toEqual(['cancelInvoice'])
    await act(async () => { finish(json(200, voided())) })
    await settle(4)
    expect(modals()).toEqual([])
  })

  it('announces its result to assistive technology', async () => {
    await show(sent())
    await openCancel()
    const live = dialog()?.querySelector('[role="status"][aria-live="polite"]')
    expect(live?.textContent).toContain('Choose a reason')
  })
})

describe('when cancelling does not work', () => {
  const err = (status: number, code: string, message: string, details?: Record<string, unknown>) => () => json(status, { error: message, code, ...(details ? { details } : {}) })
  const submit = async (): Promise<void> => {
    await choose('mistake')
    await click(dlgBtn('Cancel invoice'))
    await settle(4)
  }

  it('INVOICE_PAID: says it was paid just now, nothing was cancelled, and Refresh loads the paid invoice', async () => {
    let calls = 0
    const { api } = await show(sent(), {
      [VOID1]: err(409, 'INVOICE_PAID', 'Invoice is paid'),
      [GET1]: () => json(200, ++calls === 1 ? sent() : paid()),
    })
    await openCancel()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('Nothing was cancelled')
    expect(dialog()?.textContent).toContain('It was paid just now, nothing was cancelled')
    expect(document.activeElement).toBe(dlgBtn('Refresh invoice'))
    await click(dlgBtn('Refresh invoice'))
    await settle(6)
    expect(modals()).toEqual([])
    expect(api.count(GET1)).toBe(2)
    expect(text()).toContain('This invoice is paid, so it is read-only')
  })

  it('LINK_DEACTIVATION_FAILED: Retry sends the same request again', async () => {
    const { api } = await show(sent(), { [VOID1]: err(502, 'LINK_DEACTIVATION_FAILED', 'Stripe down', { linkId: 'plink_123' }) })
    await openCancel()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('Couldn’t switch off the card link')
    expect(dialog()?.textContent).toContain('has not been cancelled')
    expect(document.activeElement).toBe(dlgBtn('Retry'))
    await click(dlgBtn('Retry'))
    await settle(4)
    expect(voidCalls(api).map(c => c.body)).toEqual([{ reason: 'mistake' }, { reason: 'mistake' }])
  })

  it('LINK_DEACTIVATION_FAILED: the checkbox reveals the link id, and Cancel anyway re-submits with linkStillLiveAcknowledged', async () => {
    let n = 0
    const { api } = await show(sent(), {
      [VOID1]: () => (++n === 1 ? json(502, { error: 'Stripe down', code: 'LINK_DEACTIVATION_FAILED', details: { linkId: 'plink_123' } }) : json(200, voided({ voided: { ...VOIDED, linkDeactivated: false } }))),
    })
    await openCancel()
    await submit()
    const box = dialog()?.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(dialog()?.textContent).toContain('Cancel anyway, I will switch the link off in Stripe')
    expect(dialog()?.textContent).not.toContain('plink_123')
    expect(dlgBtn('Cancel invoice anyway')).toBeUndefined()
    await click(box)
    expect(dialog()?.textContent).toContain('plink_123')
    await click(dlgBtn('Cancel invoice anyway'))
    await settle(6)
    expect(voidCalls(api).map(c => c.body)).toEqual([{ reason: 'mistake' }, { reason: 'mistake', linkStillLiveAcknowledged: true }])
    expect(modals()).toEqual([])
    expect(text()).toContain('Link still active: switch it off in Stripe')
    expect(text()).toContain('Card link was not switched off')
  })

  it('permission denied: says so, changes nothing, and Close dismisses', async () => {
    await show(sent(), { [VOID1]: err(403, 'ROLE_REQUIRED', 'Forbidden') })
    await openCancel()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('You can’t cancel invoices')
    expect(dialog()?.textContent).toContain('Ask an admin')
    await click(dlgBtn('Close'))
    expect(modals()).toEqual([])
  })

  it('any other failure says nothing changed and offers to try again', async () => {
    const { api } = await show(sent(), { [VOID1]: err(500, 'INTERNAL', 'Database down') })
    await openCancel()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('Cancel invoice INV-0034?')
    expect(text()).toContain('Database down')
    expect(dlgBtn('Cancel invoice')?.disabled).toBe(false)
    await click(dlgBtn('Cancel invoice'))
    await settle(4)
    expect(voidCalls(api)).toHaveLength(2)
  })

  it('a network failure reads as a connection problem', async () => {
    await show(sent(), { [VOID1]: () => { throw new TypeError('Failed to fetch') } })
    await openCancel()
    await submit()
    expect(text()).toContain('Could not reach the server')
  })
})

describe('after cancelling', () => {
  const win = () => ({ [VOID1]: () => json(200, voided()) })

  it('closes the dialog, toasts, and shows a persistent banner saying who, when and why', async () => {
    await show(sent(), win())
    await openCancel()
    await choose('mistake')
    await type(dialog()?.querySelector('textarea') ?? null, 'Wrong milestone selected')
    await click(dlgBtn('Cancel invoice'))
    await settle(6)
    expect(modals()).toEqual([])
    expect(toasts()).toContain('INV-0034 cancelled')
    expect(text()).toContain('Cancelled on 12 Oct 2026 by Me Myself: Raised by mistake (Wrong milestone selected)')
    expect(host.querySelector('[role="status"]')).not.toBeNull()
  })

  it('becomes read-only: no editor, Issue, Mark paid or Edit and reissue; PDF and Duplicate remain', async () => {
    await show(voided())
    expect(button(host, 'Mark paid')).toBeUndefined()
    expect(button(host, 'Edit and reissue')).toBeUndefined()
    expect(button(host, 'Issue')).toBeUndefined()
    expect(host.querySelector('input:not([readonly])')).toBeNull()
    expect(button(host, 'Download PDF')).toBeDefined()
    expect(button(host, 'Duplicate as new draft')).toBeDefined()
    expect(text()).toContain('Read-only')
  })

  it('shows the amount struck through in grey and a CANCELLED chip with an icon', async () => {
    await show(voided())
    const chip = [...host.querySelectorAll('.chip')].find(c => c.textContent === 'Cancelled')!
    expect(chip.querySelector('svg')).not.toBeNull()
    const total = [...host.querySelectorAll('.tot.big .money')].map(e => e.className)
    expect(total[0]).toContain('strike')
    expect(host.querySelector('tbody .money.strike')).not.toBeNull()
  })

  it('the activity list has the cancellation and whether the link was switched off', async () => {
    await show(voided())
    const rail = host.querySelector('.inv-rail')?.textContent ?? ''
    expect(rail).toContain('Cancelled')
    expect(rail).toContain('Reason: Raised by mistake')
    expect(rail).toContain('Note: Wrong milestone selected')
    expect(rail).toContain('Card link switched off')
  })

  it('Duplicate as new draft calls duplicate and opens the new draft', async () => {
    const { api, nav } = await show(voided(), { [DUP1]: () => json(201, dto({ id: 'i9', invoiceNumber: 'INV-0036', status: 'draft' })) })
    await click(button(host, 'Duplicate as new draft'))
    await settle(4)
    expect(api.count(DUP1)).toBe(1)
    expect((nav.mock.calls.at(-1) as [string])[0]).toBe('/sales/invoices/i9')
  })

  it('Duplicate cannot be fired twice', async () => {
    let finish: (r: Response) => void = () => undefined
    const { api } = await show(voided(), { [DUP1]: () => new Promise<Response>(r => { finish = r }) })
    const b = button(host, 'Duplicate as new draft')!
    await click(b)
    await click(b)
    expect(api.count(DUP1)).toBe(1)
    await act(async () => { finish(json(201, dto({ id: 'i9', status: 'draft' }))) })
  })

  it('a failed duplicate says why', async () => {
    await show(voided(), { [DUP1]: () => json(500, { error: 'Database down', code: 'INTERNAL' }) })
    await click(button(host, 'Duplicate as new draft'))
    await settle(4)
    expect(toasts()).toContain('Database down')
  })

  it('Duplicate as new draft is in the More menu of a paid invoice too', async () => {
    const { api } = await show(paid(), { [DUP1]: () => json(201, dto({ id: 'i9', status: 'draft' })) })
    await openMenu()
    await click(item('Duplicate as new draft'))
    await settle(4)
    expect(api.count(DUP1)).toBe(1)
  })
})

describe('a payment that arrives after cancelling', () => {
  const REFUND = { amountCents: 1980000, receivedAt: '2026-10-13T01:00:00.000Z', reference: 'pi_3Qx', acknowledgedAt: null, acknowledgedBy: null }

  it('raises a red-flag banner with the amount and an I have refunded this button', async () => {
    await show(voided({ refundDue: REFUND }))
    const b = host.querySelector('[role="alert"]')!
    expect(b.textContent).toContain('Payment received on a cancelled invoice: refund $19,800.00 in Stripe')
    expect(b.querySelector('svg')).not.toBeNull()
    expect(button(b, 'I have refunded this')).toBeDefined()
    expect(host.querySelector('.inv-rail')?.textContent).toContain('Payment received after cancelling')
  })

  it('acknowledging calls the API once and leaves a quiet note instead of the banner', async () => {
    const { api } = await show(voided({ refundDue: REFUND }), {
      [ACK1]: () => json(200, voided({ refundDue: { ...REFUND, acknowledgedAt: '2026-10-14T00:00:00.000Z', acknowledgedBy: 'u-me' } })),
    })
    const b = button(host, 'I have refunded this')!
    await click(b)
    await click(b)
    await settle(4)
    expect(api.count(ACK1)).toBe(1)
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(text()).toContain('Refund of $19,800.00 confirmed by Me Myself on 14 Oct 2026')
  })

  it('a failed acknowledgement keeps the banner and says why', async () => {
    await show(voided({ refundDue: REFUND }), { [ACK1]: () => json(409, { error: 'Nothing to acknowledge', code: 'CONFLICT' }) })
    await click(button(host, 'I have refunded this'))
    await settle(4)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(toasts()).toContain('Nothing to acknowledge')
  })
})
