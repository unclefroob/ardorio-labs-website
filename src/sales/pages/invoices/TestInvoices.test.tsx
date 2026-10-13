import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceDto, InvoiceTestInfo } from '../../api/contract'
import { changes } from '../../testing/fixtures'
import { button, click, settle, type } from '../../testing/dom'
import { boardInvoices, CLIENT, dto, invoicingWorld, setArdRole, SETTINGS, SUMMARY } from '../../testing/invoicingWorld'
import { loadSales, type Sales } from '../../testing/load'
import { fakeApi, json } from '../../testing/rosterioWorld'

vi.mock('../../../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))
vi.mock('../../api/records', () => ({ postBatch: vi.fn(), getChanges: () => Promise.resolve(changes([])), getBootstrap: vi.fn() }))
vi.mock('../../api/members', () => ({ getMembers: vi.fn() }))
vi.mock('../../api/me', () => ({ getMe: vi.fn() }))
vi.mock('../../data/engineNudge', () => ({ nudgeEngine: vi.fn() }))

const GET1 = 'GET /sales/invoices/i1'
const MARK1 = 'POST /sales/invoices/i1/mark-test'
const UNMARK1 = 'POST /sales/invoices/i1/unmark-test'
const DEL1 = 'DELETE /sales/invoices/i1/permanent'
const LIST = 'GET /sales/invoices'
const LIST_TEST = 'GET /sales/invoices?includeTest=1'
const SUM = 'GET /sales/invoices/summary'
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
  sessionStorage.clear()
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
const dialog = (): HTMLElement | null => host.querySelector('[role="dialog"],[role="alertdialog"]')
const dlgBtn = (label: string | RegExp): HTMLButtonElement | undefined => button(dialog() ?? host, label)
const modals = (): string[] => m.ui.UI.get().modals.map(x => x.name)
const toasts = (): string[] => m.ui.UI.get().toasts.map(t => t.msg)
const more = (): HTMLButtonElement | undefined => button(host, 'More')
const items = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const item = (label: string): HTMLElement | undefined => items().find(i => i.textContent?.trim() === label)
const labels = (): (string | undefined)[] => items().map(i => i.textContent?.trim())
const key = async (k: string, target: Element = document.activeElement ?? document.body): Promise<void> => {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
}
const callsTo = (api: { calls: Array<{ method: string; path: string; body: unknown }> }, method: string, suffix: string) => api.calls.filter(c => c.method === method && c.path.endsWith(suffix))

const TEST: InvoiceTestInfo = { markedAt: '2026-10-12T04:41:00.000Z', markedBy: 'u-me', reason: 'Trying the invoice layout' }
const sent = (over: Partial<InvoiceDto> = {}): InvoiceDto => dto({ id: 'i1', ...over })
const draft = (): InvoiceDto => sent({ status: 'draft', issuedCount: 0, sentAt: null })
const paid = (): InvoiceDto => sent({ status: 'paid', payment: { method: 'bank-transfer', paidAt: '2026-10-06', amountCents: 1980000, reference: 'R1' } })
const void_ = (): InvoiceDto => sent({ status: 'void', voided: { voidedAt: '2026-10-12T04:41:00.000Z', voidedBy: 'u-me', reason: 'mistake', note: '', linkDeactivated: true } })
const asTest = (over: Partial<InvoiceDto> = {}): InvoiceDto => sent({ test: TEST, ...over })

async function show(inv: InvoiceDto, routes: Parameters<typeof fakeApi>[0] = {}, role: Parameters<typeof setArdRole>[1] = 'admin') {
  m = await loadSales()
  m.bootstrap.hydrate(invoicingWorld())
  setArdRole(m, role)
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
const openMark = async (): Promise<void> => {
  await openMenu()
  await click(item('Mark as test invoice…'))
  await settle(2)
}
const openDelete = async (): Promise<void> => {
  await openMenu()
  await click(item('Delete permanently…'))
  await settle(2)
}
const reasonBox = (): HTMLTextAreaElement => dialog()?.querySelector('textarea') as HTMLTextAreaElement
const numberBox = (): HTMLInputElement => dialog()?.querySelector('input') as HTMLInputElement
const err = (status: number, code: string, message: string, details?: Record<string, unknown>) => () => json(status, { error: message, code, ...(details ? { details } : {}) })

describe('the More menu, by status', () => {
  it.each([
    ['a draft', draft],
    ['a sent invoice', () => sent()],
    ['an overdue invoice', () => sent({ overdue: true })],
    ['a paid invoice', paid],
    ['a cancelled invoice', void_],
  ])('%s can be marked as a test invoice', async (_n, make) => {
    await show(make())
    await openMenu()
    expect(item('Mark as test invoice…')).toBeDefined()
    expect(item('Unmark as test')).toBeUndefined()
    expect(item('Delete permanently…')).toBeUndefined()
    expect(item('Mark as test invoice…')?.querySelector('svg')).not.toBeNull()
  })

  it('a sent invoice keeps its other items, with a divider above the test item', async () => {
    await show(sent())
    await openMenu()
    expect(labels()).toEqual(['Copy public link', 'Duplicate as new draft', 'Cancel invoice…', 'Mark as test invoice…'])
    expect(item('Mark as test invoice…')?.previousElementSibling?.getAttribute('role')).toBe('separator')
  })

  it('a test invoice offers Unmark as test instead of Mark', async () => {
    await show(asTest())
    await openMenu()
    expect(item('Unmark as test')).toBeDefined()
    expect(item('Mark as test invoice…')).toBeUndefined()
  })

  it('an admin who is not a super user never sees Delete permanently, even on a test invoice', async () => {
    await show(asTest(), {}, 'admin')
    await openMenu()
    expect(item('Delete permanently…')).toBeUndefined()
  })

  it('a super user sees Delete permanently on a test invoice, danger-styled, with an icon and a divider', async () => {
    await show(asTest(), {}, 'super')
    await openMenu()
    const d = item('Delete permanently…')!
    expect(d).toBeDefined()
    expect(d.classList.contains('dngtxt')).toBe(true)
    expect(d.querySelector('svg')).not.toBeNull()
    expect(d.previousElementSibling?.getAttribute('role')).toBe('separator')
    expect(labels().at(-1)).toBe('Delete permanently…')
  })

  it('a super user does not see Delete permanently on a real invoice', async () => {
    await show(sent(), {}, 'super')
    await openMenu()
    expect(item('Delete permanently…')).toBeUndefined()
    expect(item('Mark as test invoice…')).toBeDefined()
  })

  it('a test draft in the editor offers Unmark, and Delete only to a super user', async () => {
    await show(asTest({ status: 'draft', issuedCount: 0, sentAt: null }), {}, 'super')
    await openMenu()
    expect(labels()).toEqual(['Unmark as test', 'Delete permanently…'])
  })
})

describe('the Mark as test dialog', () => {
  it('is a dialog (not an alertdialog) that starts on Keep as real invoice', async () => {
    await show(sent())
    await openMark()
    expect(modals()).toEqual(['markTest'])
    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
    expect(dialog()?.getAttribute('role')).toBe('dialog')
    expect(dialog()?.getAttribute('aria-label')).toBe('Mark INV-0034 as a test invoice?')
    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dlgBtn('Keep as real invoice'))
  })

  it('explains the consequences in plain language', async () => {
    await show(sent())
    await openMark()
    const t = dialog()?.textContent ?? ''
    expect(t).toContain('It disappears from totals, revenue, lists and exports.')
    expect(t).toContain('It keeps its invoice number.')
    expect(t).toContain('You can unmark it later')
    expect(t).not.toContain('removes that payment from your revenue figures')
  })

  it('a paid invoice shows the extra revenue line', async () => {
    await show(paid())
    await openMark()
    expect(dialog()?.textContent).toContain('This invoice is marked paid. Marking it as test removes that payment from your revenue figures.')
  })

  it('Escape keeps the invoice and returns focus to the More button', async () => {
    const { api } = await show(sent())
    await openMark()
    await key('Escape')
    expect(modals()).toEqual([])
    expect(document.activeElement).toBe(more())
    expect(callsTo(api, 'POST', '/mark-test')).toHaveLength(0)
  })

  it('the X and Keep as real invoice both keep it', async () => {
    const { api } = await show(sent())
    await openMark()
    await click(dialog()?.querySelector('[aria-label="Keep as real invoice and close this dialog"]'))
    expect(modals()).toEqual([])
    await openMark()
    await click(dlgBtn('Keep as real invoice'))
    expect(modals()).toEqual([])
    expect(document.activeElement).toBe(more())
    expect(callsTo(api, 'POST', '/mark-test')).toHaveLength(0)
  })

  it('traps Tab inside the dialog', async () => {
    await show(sent())
    await openMark()
    const focusables = [...(dialog()?.querySelectorAll<HTMLElement>('button:not([disabled]),textarea') ?? [])]
    const last = focusables.at(-1)!
    last.focus()
    await key('Tab', last)
    expect(dialog()?.contains(document.activeElement)).toBe(true)
  })

  it('requires a reason: Mark as test is disabled until there is one', async () => {
    await show(sent())
    await openMark()
    expect(dlgBtn('Mark as test')?.disabled).toBe(true)
    expect(dialog()?.textContent).toContain('Add a reason to continue')
    await type(reasonBox(), '    ')
    expect(dlgBtn('Mark as test')?.disabled).toBe(true)
    await type(reasonBox(), 'Practice run')
    expect(dlgBtn('Mark as test')?.disabled).toBe(false)
    expect(dialog()?.textContent).toContain('Ready')
  })

  it('shows a live counter and limits the reason to 200 characters', async () => {
    await show(sent())
    await openMark()
    expect(reasonBox().maxLength).toBe(200)
    await type(reasonBox(), 'Practice run')
    expect(dialog()?.textContent).toContain('12 / 200')
    expect(dialog()?.querySelector('.cnt')?.getAttribute('aria-live')).toBe('polite')
  })

  it('rejects control characters (a line break) in the reason', async () => {
    await show(sent())
    await openMark()
    await type(reasonBox(), 'two\nlines')
    expect(dlgBtn('Mark as test')?.disabled).toBe(true)
    expect(dialog()?.textContent).toContain('plain text')
  })

  it('sends the trimmed reason once, even if clicked twice, and blocks dismissal while busy', async () => {
    let finish: (r: Response) => void = () => undefined
    const pending = new Promise<Response>(r => { finish = r })
    const { api } = await show(sent(), { [MARK1]: () => pending })
    await openMark()
    await type(reasonBox(), '  Practice run  ')
    const go = dlgBtn('Mark as test')!
    await click(go)
    await click(go)
    await click(dlgBtn(/Marking/))
    expect(callsTo(api, 'POST', '/mark-test')).toHaveLength(1)
    expect(callsTo(api, 'POST', '/mark-test')[0].body).toEqual({ reason: 'Practice run' })
    expect(dlgBtn(/Marking/)?.disabled).toBe(true)
    expect(dialog()?.querySelector('[aria-busy="true"]')).not.toBeNull()
    await key('Escape')
    await click(dlgBtn('Keep as real invoice'))
    expect(modals()).toEqual(['markTest'])
    await act(async () => { finish(json(200, asTest())) })
    await settle(4)
    expect(modals()).toEqual([])
  })

  it('on success: closes, toasts, shows the banner and the TEST chip', async () => {
    await show(sent(), { [MARK1]: () => json(200, asTest()) })
    await openMark()
    await type(reasonBox(), 'Trying the invoice layout')
    await click(dlgBtn('Mark as test'))
    await settle(4)
    expect(modals()).toEqual([])
    expect(toasts()).toContain('INV-0034 marked as test')
    expect(text()).toContain('Test invoice, excluded from totals and exports.')
    expect(host.querySelector('.chip')?.parentElement?.textContent).toContain('TEST')
  })

  it('announces its state to assistive technology', async () => {
    await show(sent())
    await openMark()
    expect(dialog()?.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain('Add a reason')
  })
})

describe('when marking does not work', () => {
  const submit = async (): Promise<void> => {
    await type(reasonBox(), 'Practice run')
    await click(dlgBtn('Mark as test'))
    await settle(4)
  }

  it('already marked (INVOICE_ALREADY_TEST): says so, and Refresh loads the invoice as it is now', async () => {
    let n = 0
    const { api } = await show(sent(), { [MARK1]: err(409, 'INVOICE_ALREADY_TEST', 'x'), [GET1]: () => json(200, ++n === 1 ? sent() : asTest()) })
    await openMark()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('INV-0034 is already a test invoice')
    expect(dialog()?.textContent).toContain('This invoice is already marked as a test.')
    expect(document.activeElement).toBe(dlgBtn('Refresh invoice'))
    await click(dlgBtn('Refresh invoice'))
    await settle(4)
    expect(modals()).toEqual([])
    expect(api.count(GET1)).toBe(2)
    expect(text()).toContain('Test invoice, excluded from totals and exports.')
  })

  it('permission denied: says so, changes nothing, and Close dismisses', async () => {
    await show(sent(), { [MARK1]: err(403, 'ROLE_REQUIRED', 'no') })
    await openMark()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('You can’t mark invoices as test')
    expect(dialog()?.textContent).toContain('Nothing has changed')
    expect(document.activeElement).toBe(dlgBtn('Close'))
    await click(dlgBtn('Close'))
    expect(modals()).toEqual([])
  })

  it('a generic error keeps the form, says nothing changed, and lets you try again', async () => {
    let n = 0
    const { api } = await show(sent(), { [MARK1]: () => (++n === 1 ? json(500, { error: 'Boom', code: 'INTERNAL' }) : json(200, asTest())) })
    await openMark()
    await submit()
    expect(modals()).toEqual(['markTest'])
    expect(dialog()?.textContent).toContain('INV-0034 was not marked.')
    expect(dialog()?.textContent).toContain('Nothing has changed. Try again')
    expect(reasonBox().value).toBe('Practice run')
    await click(dlgBtn('Mark as test'))
    await settle(4)
    expect(callsTo(api, 'POST', '/mark-test')).toHaveLength(2)
    expect(modals()).toEqual([])
  })

  it('a network failure reads as a connection problem', async () => {
    await show(sent(), { [MARK1]: () => Promise.reject(new TypeError('fetch failed')) })
    await openMark()
    await submit()
    expect(dialog()?.textContent).toContain('Could not reach the server')
  })
})

describe('the Delete permanently dialog', () => {
  it('is an alertdialog titled with the number, starting on Keep invoice', async () => {
    await show(asTest(), {}, 'super')
    await openDelete()
    expect(modals()).toEqual(['deleteTestInvoice'])
    expect(dialog()?.getAttribute('role')).toBe('alertdialog')
    expect(dialog()?.getAttribute('aria-label')).toBe('Delete INV-0034 permanently?')
    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dlgBtn('Keep invoice'))
  })

  it('lists the consequences', async () => {
    await show(asTest(), {}, 'super')
    await openDelete()
    const t = dialog()?.textContent ?? ''
    expect(t).toContain('This cannot be undone')
    expect(t).toContain('The invoice number will be missing from your invoice sequence.')
    expect(t).toContain('The payment link, if there is one, is switched off.')
    expect(t).toContain('A record of the deletion is kept.')
  })

  it('Escape, the X and Keep invoice all keep it, and focus returns to More', async () => {
    const { api } = await show(asTest(), {}, 'super')
    await openDelete()
    await key('Escape')
    expect(modals()).toEqual([])
    expect(document.activeElement).toBe(more())
    await openDelete()
    await click(dialog()?.querySelector('[aria-label="Keep invoice and close this dialog"]'))
    expect(modals()).toEqual([])
    await openDelete()
    await click(dlgBtn('Keep invoice'))
    expect(modals()).toEqual([])
    expect(callsTo(api, 'DELETE', '/permanent')).toHaveLength(0)
  })

  it('has a labelled confirmation field and a danger button that stays disabled until the number matches exactly', async () => {
    await show(asTest(), {}, 'super')
    await openDelete()
    const box = numberBox()
    expect(dialog()?.querySelector(`label[for="${box.id}"]`)?.textContent).toContain('Type INV-0034 to confirm')
    const go = dlgBtn('Delete permanently')!
    expect(go.disabled).toBe(true)
    expect(go.classList.contains('dng')).toBe(true)
    for (const wrong of ['INV-003', 'inv-0034', 'INV-0034 ', ' INV-0034', 'INV-0035', 'INV-00344']) {
      await type(box, wrong)
      expect(dlgBtn('Delete permanently')?.disabled).toBe(true)
    }
    await type(box, 'INV-0034')
    expect(dlgBtn('Delete permanently')?.disabled).toBe(false)
  })

  it('shows an inline mismatch hint, tied to the field, once something wrong is typed', async () => {
    await show(asTest(), {}, 'super')
    await openDelete()
    expect(dialog()?.textContent).not.toContain('That does not match')
    await type(numberBox(), 'INV-9')
    expect(dialog()?.textContent).toContain('That does not match. Type INV-0034 exactly as shown.')
    expect(numberBox().getAttribute('aria-invalid')).toBe('true')
    expect(dialog()?.querySelector(`[id="${numberBox().getAttribute('aria-describedby')}"]`)?.textContent).toContain('That does not match')
    await type(numberBox(), 'INV-0034')
    expect(dialog()?.textContent).not.toContain('That does not match')
  })

  it('allows pasting: the field has no paste block', async () => {
    await show(asTest(), {}, 'super')
    await openDelete()
    const ev = new Event('paste', { bubbles: true, cancelable: true })
    await act(async () => { numberBox().dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(false)
  })

  it('sends the typed number once, then toasts and goes to the list', async () => {
    let finish: (r: Response) => void = () => undefined
    const pending = new Promise<Response>(r => { finish = r })
    const { api, nav } = await show(asTest(), { [DEL1]: () => pending }, 'super')
    await openDelete()
    await type(numberBox(), 'INV-0034')
    const go = dlgBtn('Delete permanently')!
    await click(go)
    await click(go)
    await click(dlgBtn(/Deleting/))
    expect(callsTo(api, 'DELETE', '/permanent')).toHaveLength(1)
    expect(callsTo(api, 'DELETE', '/permanent')[0].body).toEqual({ confirmNumber: 'INV-0034' })
    await key('Escape')
    expect(modals()).toEqual(['deleteTestInvoice'])
    await act(async () => { finish(json(200, { deleted: true, invoiceNumber: 'INV-0034' })) })
    await settle(4)
    expect(modals()).toEqual([])
    expect(toasts()).toContain('INV-0034 deleted permanently')
    expect((nav.mock.calls.at(-1) as [string])[0]).toBe('/sales/invoices')
  })
})

describe('when deleting does not work', () => {
  const submit = async (): Promise<void> => {
    await type(numberBox(), 'INV-0034')
    await click(dlgBtn('Delete permanently'))
    await settle(4)
  }

  it('permission denied (403): says only super administrators can, and nothing was deleted', async () => {
    const { nav } = await show(asTest(), { [DEL1]: err(403, 'ROLE_REQUIRED', 'no') }, 'super')
    await openDelete()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('You can’t delete invoices')
    expect(dialog()?.textContent).toContain('limited to super administrators')
    expect(document.activeElement).toBe(dlgBtn('Close'))
    await click(dlgBtn('Close'))
    expect(modals()).toEqual([])
    expect(nav).not.toHaveBeenCalled()
  })

  it('not a test any more (INVOICE_NOT_TEST): says so, and Refresh shows the invoice', async () => {
    let n = 0
    const { api } = await show(asTest(), { [DEL1]: err(409, 'INVOICE_NOT_TEST', 'x'), [GET1]: () => json(200, ++n === 1 ? asTest() : sent()) }, 'super')
    await openDelete()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('INV-0034 is not a test invoice')
    expect(dialog()?.textContent).toContain('Nothing was deleted')
    await click(dlgBtn('Refresh invoice'))
    await settle(4)
    expect(api.count(GET1)).toBe(2)
    expect(text()).not.toContain('Test invoice, excluded')
  })

  it('confirmation mismatch from the server: keeps the dialog, says so, and nothing was deleted', async () => {
    await show(asTest(), { [DEL1]: err(400, 'CONFIRMATION_MISMATCH', 'x') }, 'super')
    await openDelete()
    await submit()
    expect(modals()).toEqual(['deleteTestInvoice'])
    expect(dialog()?.textContent).toContain('INV-0034 was not deleted.')
    expect(dialog()?.textContent).toContain('The invoice number you typed does not match this invoice.')
    expect(numberBox().value).toBe('INV-0034')
  })

  it('link could not be switched off: nothing deleted, and Retry sends the same request again', async () => {
    let n = 0
    const { api } = await show(asTest({ paymentLinkUrl: 'https://buy.stripe.com/x', paymentLinkIsAutomatic: true }), {
      [DEL1]: () => (++n === 1 ? json(502, { error: 'Stripe', code: 'LINK_DEACTIVATION_FAILED', details: { linkId: 'plink_123' } }) : json(200, { deleted: true, invoiceNumber: 'INV-0034' })),
    }, 'super')
    await openDelete()
    await submit()
    expect(dialog()?.getAttribute('aria-label')).toBe('Couldn’t switch off the payment link')
    expect(dialog()?.textContent).toContain('has not been deleted')
    expect(dialog()?.textContent).toContain('plink_123')
    expect(document.activeElement).toBe(dlgBtn('Retry'))
    await click(dlgBtn('Retry'))
    await settle(4)
    expect(callsTo(api, 'DELETE', '/permanent')).toHaveLength(2)
    expect(callsTo(api, 'DELETE', '/permanent')[1].body).toEqual({ confirmNumber: 'INV-0034' })
    expect(modals()).toEqual([])
  })

  it('a generic error says nothing changed and lets you try again', async () => {
    await show(asTest(), { [DEL1]: err(500, 'INTERNAL', 'Boom') }, 'super')
    await openDelete()
    await submit()
    expect(modals()).toEqual(['deleteTestInvoice'])
    expect(dialog()?.textContent).toContain('INV-0034 was not deleted.')
    expect(dialog()?.textContent).toContain('Nothing has changed')
    expect(dlgBtn('Delete permanently')?.disabled).toBe(false)
  })

  it('invoice not found (404): says it may already be deleted', async () => {
    await show(asTest(), { [DEL1]: err(404, 'NOT_FOUND', 'x') }, 'super')
    await openDelete()
    await submit()
    expect(dialog()?.textContent).toContain('It may already have been deleted.')
  })
})

describe('the test banner and Unmark', () => {
  it('names who marked it, when, and why, with an Unmark as test button', async () => {
    await show(asTest())
    const t = text()
    expect(t).toContain('Test invoice, excluded from totals and exports.')
    expect(t).toContain('Marked by Me Myself on')
    expect(t).toContain('12 Oct 2026')
    expect(t).toContain('Trying the invoice layout')
    expect(button(host, 'Unmark as test')).toBeDefined()
    expect(host.querySelector('.banner svg')).not.toBeNull()
  })

  it('a real invoice shows no banner', async () => {
    await show(sent())
    expect(text()).not.toContain('Test invoice, excluded')
  })

  it('Unmark as test calls the API once, toasts, and the banner goes away', async () => {
    let finish: (r: Response) => void = () => undefined
    const pending = new Promise<Response>(r => { finish = r })
    const { api } = await show(asTest(), { [UNMARK1]: () => pending })
    const b = button(host, 'Unmark as test')!
    await click(b)
    await click(b)
    await click(button(host, /Unmarking/))
    expect(callsTo(api, 'POST', '/unmark-test')).toHaveLength(1)
    await act(async () => { finish(json(200, sent())) })
    await settle(4)
    expect(toasts()).toContain('INV-0034 is a real invoice again')
    expect(text()).not.toContain('Test invoice, excluded')
    await openMenu()
    expect(item('Mark as test invoice…')).toBeDefined()
  })

  it('the More menu item unmarks too', async () => {
    const { api } = await show(asTest(), { [UNMARK1]: () => json(200, sent()) })
    await openMenu()
    await click(item('Unmark as test'))
    await settle(4)
    expect(api.count(UNMARK1)).toBe(1)
    expect(document.activeElement).toBe(more())
  })

  it('INVOICE_NOT_TEST on unmark: says so and reloads the invoice', async () => {
    let n = 0
    const { api } = await show(asTest(), { [UNMARK1]: err(409, 'INVOICE_NOT_TEST', 'x'), [GET1]: () => json(200, ++n === 1 ? asTest() : sent()) })
    await click(button(host, 'Unmark as test'))
    await settle(6)
    expect(toasts().join(' ')).toContain('not marked as a test')
    expect(api.count(GET1)).toBe(2)
    expect(text()).not.toContain('Test invoice, excluded')
  })

  it('a failed unmark keeps the banner and says why', async () => {
    await show(asTest(), { [UNMARK1]: err(403, 'ROLE_REQUIRED', 'no') })
    await click(button(host, 'Unmark as test'))
    await settle(4)
    expect(toasts().join(' ')).toContain('limited to admins of the Ardorio business')
    expect(text()).toContain('Test invoice, excluded from totals and exports.')
  })
})

describe('the invoice list and the Show test invoices checkbox', () => {
  const REAL = boardInvoices()
  const TESTS = [
    dto({ id: 't1', invoiceNumber: 'INV-0040', createdAt: '2026-10-08T00:00:00Z', test: TEST, subtotalCents: 7000000, gstCents: 700000, totalCents: 7700000 }),
    dto({ id: 't2', invoiceNumber: 'INV-0041', createdAt: '2026-10-08T01:00:00Z', status: 'paid', test: TEST, payment: { method: 'card', paidAt: '2026-10-06', amountCents: 550000, reference: '' }, subtotalCents: 500000, gstCents: 50000, totalCents: 550000 }),
  ]
  const routes = {
    [LIST]: () => json(200, { invoices: REAL }),
    [LIST_TEST]: () => json(200, { invoices: [...REAL, ...TESTS] }),
    [SUM]: () => json(200, SUMMARY),
  }
  async function showList(role: Parameters<typeof setArdRole>[1] = 'admin') {
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, role)
    const api = fakeApi(routes)
    const { Invoices } = await import('./Invoices')
    const { Hosts } = await import('../../shell/Hosts')
    await act(async () => { root.render(<><Invoices /><Hosts /></>) })
    await settle(8)
    return api
  }
  const box = (): HTMLInputElement => [...host.querySelectorAll('label.ck')].find(l => l.textContent?.includes('Show test invoices'))!.querySelector('input') as HTMLInputElement
  const rowText = (): string => [...host.querySelectorAll('tbody tr')].map(r => r.textContent).join('|')

  it('the checkbox is there for admins, off by default, and test invoices are absent and not requested', async () => {
    const api = await showList()
    expect(box().checked).toBe(false)
    expect(rowText()).not.toContain('INV-0040')
    expect(api.calls.some(c => c.path.includes('includeTest'))).toBe(false)
    expect(text()).not.toContain('TEST')
  })

  it('ticking it asks the server for includeTest=1 and shows test invoices muted with a TEST chip that has an icon and text', async () => {
    const api = await showList()
    await click(box())
    await settle(6)
    expect(api.count(LIST_TEST)).toBe(1)
    expect(rowText()).toContain('INV-0040')
    expect(rowText()).toContain('INV-0041')
    const row = [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes('INV-0040'))!
    expect(row.classList.contains('test-row')).toBe(true)
    const chip = [...row.querySelectorAll('.chip')].find(c => c.textContent?.trim() === 'TEST')!
    expect(chip).toBeDefined()
    expect(chip.querySelector('svg')).not.toBeNull()
    const realRow = [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes('INV-0034'))!
    expect(realRow.classList.contains('test-row')).toBe(false)
  })

  it('test invoices are never counted in the tiles or the tab counts', async () => {
    await showList()
    const before = [text().match(/Outstanding · \d+ invoices?/)?.[0], text().match(/All\s*\d+/)?.[0], text().match(/Paid this month[^A-Z]*/)?.[0]]
    await click(box())
    await settle(6)
    const after = [text().match(/Outstanding · \d+ invoices?/)?.[0], text().match(/All\s*\d+/)?.[0], text().match(/Paid this month[^A-Z]*/)?.[0]]
    expect(after).toEqual(before)
    expect(text()).toContain('$22,500')
    expect(text()).toContain('$24,750 inc GST')
  })

  it('unticking it takes them out again', async () => {
    await showList()
    await click(box())
    await settle(6)
    await click(box())
    await settle(6)
    expect(rowText()).not.toContain('INV-0040')
  })

  it('is remembered for the session only', async () => {
    await showList()
    await click(box())
    await settle(6)
    expect(sessionStorage.getItem('sos.invoices.showTest')).toBe('1')
    expect(localStorage.getItem('sos.invoices.showTest')).toBeNull()
    act(() => root.unmount())
    root = createRoot(host)
    await showList()
    expect(box().checked).toBe(true)
    expect(rowText()).toContain('INV-0040')
  })
})

describe('everything derived from invoices leaves test invoices out', () => {
  const NOW = '2026-10-09T00:00:00Z'
  it('the deal Billing card ignores a test invoice for milestone status and billed progress', async () => {
    const t = dto({ id: 'x1', invoiceNumber: 'INV-0050', milestoneId: 'm2', status: 'paid', subtotalCents: 1800000, createdAt: NOW, test: TEST, payment: { method: 'card', paidAt: '2026-10-06', amountCents: 1980000, reference: '' } })
    const { rec } = await import('../../testing/fixtures')
    const { ardDeal, PLAN_DATA } = await import('../../testing/invoicingWorld')
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld({ deals: [rec('dl1', ardDeal('dl1').data)], billingPlans: [rec('bp_dl1', PLAN_DATA)] }))
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices?dealId=dl1': () => json(200, { invoices: [t] }), 'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }), 'GET /sales/invoices/settings': () => json(200, SETTINGS) })
    const { BillingCard } = await import('../deals/BillingCard')
    const { Q } = await import('../../data/Q')
    await act(async () => { root.render(<BillingCard deal={Q.deal('dl1')!} />) })
    await settle(8)
    const row = [...host.querySelectorAll('tbody tr')].find(r => r.textContent?.includes('Core platform'))!
    expect(row.textContent).toContain('Planned')
    expect(row.textContent).not.toContain('INV-0050')
    expect(host.querySelector('[aria-label^="Paid $0.00"]')).not.toBeNull()
  })

  it('the company Billing card totals ignore a test invoice', async () => {
    const t = dto({ id: 'x2', invoiceNumber: 'INV-0051', status: 'sent', subtotalCents: 9900000, createdAt: NOW, test: TEST })
    const real = dto({ id: 'r2', invoiceNumber: 'INV-0052', status: 'sent', subtotalCents: 100000, createdAt: NOW })
    const { rec } = await import('../../testing/fixtures')
    m = await loadSales()
    m.bootstrap.hydrate(invoicingWorld())
    setArdRole(m, 'admin')
    fakeApi({ 'GET /sales/invoices?companyId=co1': () => json(200, { invoices: [t, real] }), 'GET /sales/invoices/clients': () => json(200, { clients: [CLIENT] }) })
    const { CompanyBilling } = await import('../companies/BillingCard')
    const { Q } = await import('../../data/Q')
    void rec
    await act(async () => { root.render(<CompanyBilling company={Q.company('co1')!} />) })
    await settle(8)
    expect(text()).toContain('$1,000')
    expect(text()).not.toContain('$99,000')
    expect(text()).not.toContain('INV-0051')
    expect(text()).toContain('INV-0052')
  })
})
