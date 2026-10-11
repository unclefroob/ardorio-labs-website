import { describe, expect, it } from 'vitest'
import type { InvoiceDto } from '../api/contract'
import {
  actionsFor, activityItems, addDays, blankForm, buildInput, buildMarkPaid, cardChip, cardLinkMissing, daysBetween, defaultPaidForm, dueCell,
  filterInvoices, formFromInvoice, fmtDay, inTab, isDay, issuedText, milestoneStatus, missingBilling, statusChip, tabCounts, tileFacts,
  validateBilling, validateForm, validateSettings, withTerms, emptyLine, type InvoiceForm,
} from './invoices'

const TODAY = '2026-10-11'

function inv(over: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    id: 'i1', invoiceNumber: 'INV-0034', clientSlug: 'tidewater', clientName: 'Tidewater Foods', companyId: 'co1', dealId: 'dl1', milestoneId: null,
    lineItems: [{ description: 'Milestone 2', qty: 1, unitPriceCents: 1800000, amountCents: 1800000 }], gstRate: 0.1, notes: '',
    issueDate: '2026-10-03', paymentTermsDays: 45, dueDate: '2026-11-17', status: 'sent', overdue: false, payment: null,
    offerCardPayment: false, paymentLinkUrl: '', paymentLinkIsAutomatic: false, publicToken: 't', hostedUrl: 'https://ardorio.co/invoice/t',
    sentAt: '2026-10-03T01:00:00.000Z', issuedCount: 1, subtotalCents: 1800000, gstCents: 180000, totalCents: 1980000, createdAt: '2026-10-01T01:00:00.000Z', voided: null, refundDue: null, ...over,
  }
}
const paid = (over: Partial<InvoiceDto> = {}) => inv({ status: 'paid', payment: { method: 'bank-transfer', paidAt: '2026-10-06', amountCents: 1056000, reference: 'R' }, ...over })

describe('dates', () => {
  it('validates real calendar days only', () => {
    expect(isDay('2026-02-28')).toBe(true)
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2026-2-3')).toBe(false)
    expect(isDay('')).toBe(false)
  })
  it('formats with the year, always', () => {
    expect(fmtDay('2026-10-03')).toBe('3 Oct 2026')
    expect(fmtDay('2025-01-09T10:00:00Z')).toBe('9 Jan 2025')
    expect(fmtDay(null)).toBe('—')
  })
  it('adds days across month ends and counts them back', () => {
    expect(addDays('2026-10-03', 45)).toBe('2026-11-17')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-10-02', '2026-10-11')).toBe(9)
  })
})

describe('status and overdue display', () => {
  it('maps status to a chip and lets overdue outrank sent', () => {
    expect(statusChip(inv({ status: 'draft' }))).toEqual({ label: 'Draft', tone: '' })
    expect(statusChip(inv())).toEqual({ label: 'Sent', tone: 'info' })
    expect(statusChip(inv({ overdue: true }))).toEqual({ label: 'Overdue', tone: 'bad' })
    expect(statusChip(paid())).toEqual({ label: 'Paid', tone: 'ok' })
  })
  it('a paid invoice is never shown as overdue, whatever the flag says', () => {
    expect(statusChip(paid({ overdue: true })).label).toBe('Paid')
  })
  it('due cell says how late an overdue invoice is, in the singular and plural', () => {
    expect(dueCell(inv({ overdue: true, dueDate: '2026-10-02' }), TODAY)).toEqual({ text: '2 Oct 2026', sub: '9 days overdue', late: true })
    expect(dueCell(inv({ overdue: true, dueDate: '2026-10-10' }), TODAY).sub).toBe('1 day overdue')
  })
  it('due cell is plain when not late, and terms-only for a draft', () => {
    expect(dueCell(inv(), TODAY)).toEqual({ text: '17 Nov 2026', sub: '', late: false })
    expect(dueCell(inv({ status: 'draft' }), TODAY)).toEqual({ text: '45-day terms', sub: '', late: false })
    expect(dueCell(paid({ overdue: true }), TODAY).late).toBe(false)
  })
  it('a draft has not been issued', () => {
    expect(issuedText(inv({ status: 'draft' }))).toBe('Not issued')
    expect(issuedText(inv())).toBe('3 Oct 2026')
  })
})

describe('list tabs and filtering', () => {
  const list = [
    inv({ id: 'a', invoiceNumber: 'INV-0035', status: 'draft', clientName: 'Tidewater Foods', createdAt: '2026-10-13T00:00:00Z' }),
    inv({ id: 'b', invoiceNumber: 'INV-0034' }),
    inv({ id: 'c', invoiceNumber: 'INV-0033', overdue: true, clientName: 'Banksia Advisory', companyId: 'co2', dealId: 'dl2', createdAt: '2026-08-18T00:00:00Z' }),
    paid({ id: 'd', invoiceNumber: 'INV-0032', clientName: 'Quarry Street Retail', companyId: 'co3', createdAt: '2026-09-12T00:00:00Z' }),
    paid({ id: 'e', invoiceNumber: 'INV-0031', clientName: 'Larch & Co', companyId: null, dealId: null, createdAt: '2026-09-01T00:00:00Z' }),
    paid({ id: 'f', invoiceNumber: 'INV-0030', clientName: 'Banksia Advisory', companyId: 'co2', dealId: 'dl2', createdAt: '2026-07-18T00:00:00Z' }),
  ]
  const dealName = (id: string | null): string => ({ dl1: 'Platform build, phase 2', dl2: 'Advisory retainer' } as Record<string, string>)[id ?? ''] ?? ''

  it('counts match the design: 6 all, 1 draft, 2 sent, 1 overdue, 3 paid', () => {
    expect(tabCounts(list)).toEqual({ all: 6, draft: 1, sent: 2, overdue: 1, paid: 3 })
  })
  it('the sent tab includes the overdue invoice; the overdue tab is only sent ones that are late', () => {
    expect(list.filter(i => inTab(i, 'sent')).map(i => i.id)).toEqual(['b', 'c'])
    expect(list.filter(i => inTab(i, 'overdue')).map(i => i.id)).toEqual(['c'])
  })
  it('newest first', () => {
    expect(filterInvoices(list, { tab: 'all', query: '', companyId: '' }).map(i => i.id)).toEqual(['a', 'b', 'd', 'e', 'c', 'f'])
  })
  it('narrows by tab, customer and a search over number, customer and deal', () => {
    const f = (o: Partial<{ tab: 'all' | 'draft' | 'sent' | 'overdue' | 'paid'; query: string; companyId: string }>) =>
      filterInvoices(list, { tab: 'all', query: '', companyId: '', ...o }, dealName).map(i => i.id)
    expect(f({ tab: 'paid' })).toEqual(['d', 'e', 'f'])
    expect(f({ companyId: 'co2' })).toEqual(['c', 'f'])
    expect(f({ query: 'inv-0035' })).toEqual(['a'])
    expect(f({ query: 'larch' })).toEqual(['e'])
    expect(f({ query: 'retainer' })).toEqual(['c', 'f'])
    expect(f({ tab: 'paid', companyId: 'co2' })).toEqual(['f'])
    expect(f({ query: 'nothing like this' })).toEqual([])
  })
})

describe('tiles', () => {
  it('uses the server ex-GST figures and adds inc-GST, counts and the worst overdue from the list', () => {
    const list = [
      inv({ id: 'b', totalCents: 1980000 }),
      inv({ id: 'c', overdue: true, clientName: 'Banksia Advisory', dueDate: '2026-10-02', totalCents: 495000 }),
      paid({ id: 'd', payment: { method: 'card', paidAt: '2026-10-06', amountCents: 1056000, reference: '' } }),
      paid({ id: 'e', payment: { method: 'payid', paidAt: '2026-09-30', amountCents: 999, reference: '' } }),
      inv({ id: 'a', status: 'draft' }),
    ]
    const t = tileFacts(list, { outstandingCents: 2250000, overdueCents: 450000, paidThisMonthCents: 960000, draftCount: 1, draftCents: 1800000 }, TODAY)
    expect(t.outstanding).toEqual({ exCents: 2250000, incCents: 2475000, count: 2 })
    expect(t.overdue).toEqual({ exCents: 450000, count: 1, worst: { name: 'Banksia Advisory', days: 9 } })
    expect(t.paidThisMonth).toEqual({ exCents: 960000, incCents: 1056000, count: 1 })
    expect(t.drafts).toEqual({ exCents: 1800000, count: 1 })
  })
  it('has no worst overdue when nothing is late', () => {
    expect(tileFacts([inv()], { outstandingCents: 1, overdueCents: 0, paidThisMonthCents: 0, draftCount: 0, draftCents: 0 }, TODAY).overdue.worst).toBeNull()
  })
})

describe('milestone status', () => {
  const invs = [{ milestoneId: 'm1', status: 'paid' as const }, { milestoneId: 'm2', status: 'sent' as const }, { milestoneId: 'm3', status: 'draft' as const }, { milestoneId: null, status: 'paid' as const }]
  it('is Planned until an invoice carries it, then follows the invoice', () => {
    expect(milestoneStatus('m0', invs)).toBe('Planned')
    expect(milestoneStatus('m3', invs)).toBe('Draft invoice')
    expect(milestoneStatus('m2', invs)).toBe('Invoiced')
    expect(milestoneStatus('m1', invs)).toBe('Paid')
  })
  it('takes the furthest of several invoices', () => {
    expect(milestoneStatus('m1', [...invs, { milestoneId: 'm1', status: 'draft' as const }])).toBe('Paid')
  })
})

describe('editor form', () => {
  const ok = (over: Partial<InvoiceForm> = {}): InvoiceForm => ({
    ...blankForm('2026-10-13'), companyId: 'co1', clientSlug: 'tidewater',
    lines: [{ description: 'Milestone 3', detail: 'SOW 4.3', qty: '1', unitPrice: '14,400.00' }, { description: 'Consulting', detail: '', qty: '7.5', unitPrice: '480.00' }], ...over,
  })

  it('starts at 45 day terms with the due date worked out', () => {
    const f = blankForm('2026-10-13')
    expect(f).toMatchObject({ terms: '45', dueDate: '2026-11-27', gstPct: '10', offerCard: false })
  })
  it('terms drive the due date until the due date is typed over', () => {
    let f = withTerms(blankForm('2026-10-13'), { terms: '30' })
    expect(f.dueDate).toBe('2026-11-12')
    f = withTerms({ ...f, dueEdited: true }, { terms: '7' })
    expect(f.dueDate).toBe('2026-11-12')
    expect(withTerms(blankForm('2026-10-13'), { issueDate: '2026-11-01' }).dueDate).toBe('2026-12-16')
  })
  it('accepts a complete form', () => {
    expect(validateForm(ok())).toMatchObject({ ok: true })
  })
  it('asks for a customer with billing details', () => {
    const r = validateForm(ok({ clientSlug: '' }))
    expect(r.ok).toBe(false)
    expect(r.errors.customer).toMatch(/billing details/)
  })
  it('flags the line that is wrong, not the whole form', () => {
    const r = validateForm(ok({ lines: [{ description: 'ok', detail: '', qty: '1', unitPrice: '5' }, { description: '', detail: '', qty: '1', unitPrice: '5' }, { description: 'x', detail: '', qty: '0', unitPrice: '5' }, { description: 'y', detail: '', qty: '1', unitPrice: '5.555' }] }))
    expect(Object.keys(r.errors.line).map(Number)).toEqual([1, 2, 3])
    expect(r.errors.line[2]).toMatch(/Quantity/)
    expect(r.errors.line[3]).toMatch(/Unit price/)
  })
  it('rejects a bad date, terms, GST, due before issue, and a non-https payment link', () => {
    expect(validateForm(ok({ issueDate: '2026-02-30' })).errors.issueDate).toBeTruthy()
    expect(validateForm(ok({ terms: '-1' })).errors.terms).toBeTruthy()
    expect(validateForm(ok({ terms: '3.5' })).errors.terms).toBeTruthy()
    expect(validateForm(ok({ terms: '' })).errors.terms).toBeTruthy()
    expect(validateForm(ok({ gstPct: '110' })).errors.gst).toBeTruthy()
    expect(validateForm(ok({ dueDate: '2026-10-01' })).errors.dueDate).toMatch(/before/)
    expect(validateForm(ok({ paymentLink: 'javascript:alert(1)' })).errors.link).toBeTruthy()
    expect(validateForm(ok({ paymentLink: 'https://buy.stripe.com/abc' })).errors.link).toBeUndefined()
    expect(validateForm(ok({ lines: [] })).errors.lines).toBeTruthy()
  })
  it('builds the API input in integer cents with fractional quantities', () => {
    const i = buildInput(ok({ notes: ' thanks ', offerCard: true, dealId: 'dl1', milestoneId: 'm3' }))
    expect(i.lineItems).toEqual([
      { description: 'Milestone 3', detail: 'SOW 4.3', qty: 1, unitPriceCents: 1440000 },
      { description: 'Consulting', qty: 7.5, unitPriceCents: 48000 },
    ])
    expect(i).toMatchObject({ clientSlug: 'tidewater', companyId: 'co1', dealId: 'dl1', milestoneId: 'm3', gstRate: 0.1, notes: 'thanks', issueDate: '2026-10-13', paymentTermsDays: 45, dueDate: '2026-11-27', offerCardPayment: true, paymentLinkUrl: '' })
  })
  it('sends zero GST for a zero-rated invoice and null links for no deal', () => {
    const i = buildInput(ok({ gstPct: '0' }))
    expect(i.gstRate).toBe(0)
    expect(i.dealId).toBeNull()
    expect(i.milestoneId).toBeNull()
  })
  it('loads a stored invoice back into the form, keeping a hand-set due date', () => {
    const f = formFromInvoice(inv({ dueDate: '2026-12-01', lineItems: [{ description: 'A', detail: 'd', qty: 7.5, unitPriceCents: 48000, amountCents: 360000 }] }))
    expect(f.dueEdited).toBe(true)
    expect(f.lines).toEqual([{ description: 'A', detail: 'd', qty: '7.5', unitPrice: '480.00' }])
    expect(f.gstPct).toBe('10')
    expect(formFromInvoice(inv()).dueEdited).toBe(false)
    expect(formFromInvoice(inv({ lineItems: [] })).lines).toEqual([emptyLine()])
  })
})

describe('mark paid', () => {
  it('defaults to bank transfer, today, and the invoice total inc GST', () => {
    expect(defaultPaidForm(inv(), TODAY)).toEqual({ method: 'bank-transfer', paidAt: TODAY, amount: '19800.00', reference: '' })
  })
  it('builds the request in cents and drops an empty reference', () => {
    const r = buildMarkPaid({ method: 'payid', paidAt: '2026-10-11', amount: '19,800.00', reference: '  ' }, TODAY)
    expect(r).toEqual({ ok: true, input: { method: 'payid', paidAt: '2026-10-11', amountCents: 1980000 } })
    const r2 = buildMarkPaid({ method: 'card', paidAt: '2026-10-10', amount: '100', reference: ' abc ' }, TODAY)
    expect(r2).toMatchObject({ ok: true, input: { reference: 'abc', amountCents: 10000 } })
  })
  it('refuses a future date, a bad date and a missing or zero amount', () => {
    expect(buildMarkPaid({ method: 'other', paidAt: '2026-10-12', amount: '5', reference: '' }, TODAY)).toMatchObject({ ok: false, errors: { paidAt: expect.any(String) } })
    expect(buildMarkPaid({ method: 'other', paidAt: 'x', amount: '5', reference: '' }, TODAY)).toMatchObject({ ok: false })
    expect(buildMarkPaid({ method: 'other', paidAt: TODAY, amount: '', reference: '' }, TODAY)).toMatchObject({ ok: false, errors: { amount: expect.any(String) } })
    expect(buildMarkPaid({ method: 'other', paidAt: TODAY, amount: '0', reference: '' }, TODAY)).toMatchObject({ ok: false })
  })
})

describe('what each status allows', () => {
  it('draft: edit, issue, delete, PDF; no link yet and no mark paid', () => {
    expect(actionsFor(inv({ status: 'draft' }))).toEqual({ edit: true, issue: true, reissue: false, markPaid: false, delete: true, copyLink: false, pdf: true, readOnly: false, cancel: false, cancelBlockedPaid: false, duplicate: false, voided: false })
  })
  it('sent: edit and reissue, mark paid, copy link; cannot be deleted', () => {
    expect(actionsFor(inv())).toEqual({ edit: true, issue: false, reissue: true, markPaid: true, delete: false, copyLink: true, pdf: true, readOnly: false, cancel: true, cancelBlockedPaid: false, duplicate: true, voided: false })
  })
  it('paid: read-only, PDF and link only', () => {
    expect(actionsFor(paid())).toEqual({ edit: false, issue: false, reissue: false, markPaid: false, delete: false, copyLink: true, pdf: true, readOnly: true, cancel: false, cancelBlockedPaid: true, duplicate: true, voided: false })
  })
})

describe('card link status', () => {
  it('shows what will happen for a draft and what did happen after issue', () => {
    expect(cardChip(inv({ status: 'draft', offerCardPayment: true }))).toEqual({ label: 'Created on issue', tone: '' })
    expect(cardChip(inv({ offerCardPayment: true, paymentLinkUrl: 'https://buy.stripe.com/x', paymentLinkIsAutomatic: true }))).toEqual({ label: 'Link active', tone: 'ok' })
    expect(cardChip(inv({ offerCardPayment: true }))).toEqual({ label: 'Link failed', tone: 'warn' })
    expect(cardChip(inv())).toEqual({ label: 'Not offered', tone: '' })
  })
  it('only a sent invoice that asked for a card link and has none counts as the failure case', () => {
    expect(cardLinkMissing(inv({ offerCardPayment: true }))).toBe(true)
    expect(cardLinkMissing(inv({ offerCardPayment: true, paymentLinkUrl: 'https://x.test' }))).toBe(false)
    expect(cardLinkMissing(inv({ status: 'draft', offerCardPayment: true }))).toBe(false)
    expect(cardLinkMissing(inv())).toBe(false)
  })
})

describe('activity', () => {
  it('walks created, issued, paid', () => {
    const a = activityItems(paid({ issuedCount: 2 }))
    expect(a.map(x => x.done)).toEqual([true, true, true])
    expect(a[1].label).toMatch(/reissued 1 time/)
    expect(activityItems(inv({ status: 'draft', sentAt: null })).map(x => x.done)).toEqual([true, false, false])
    expect(activityItems(null).every(x => !x.done)).toBe(true)
  })
})

describe('billing details and settings validation', () => {
  it('billing: name required, email and ABN checked only when given', () => {
    expect(validateBilling({ clientName: '', contactName: '', email: '', abn: '', address: '' })).toEqual({ clientName: expect.any(String) })
    expect(validateBilling({ clientName: 'A', contactName: '', email: 'nope', abn: '12 345', address: '' })).toMatchObject({ email: expect.any(String), abn: expect.any(String) })
    expect(validateBilling({ clientName: 'A', contactName: '', email: 'a@b.co', abn: '12 345 678 901', address: '' })).toEqual({})
  })
  it('names what the customer is missing', () => {
    expect(missingBilling(undefined)).toEqual([])
    expect(missingBilling({ billing: {} })).toEqual(['an email', 'an ABN', 'an address'])
    expect(missingBilling({ billing: { email: 'a@b.co', abn: '1', address: 'x' } })).toEqual([])
  })
  it('settings: same rules as the server', () => {
    const base = { name: 'Ardorio', abn: '98 765 432 109', email: 'a@b.co', bank: { bsb: '000-000' } }
    expect(validateSettings(base)).toEqual({})
    expect(validateSettings({ ...base, name: ' ' }).name).toBeTruthy()
    expect(validateSettings({ ...base, abn: '123' }).abn).toMatch(/11/)
    expect(validateSettings({ ...base, abn: 'abc' }).abn).toMatch(/digits/)
    expect(validateSettings({ ...base, email: 'x' }).email).toBeTruthy()
    expect(validateSettings({ ...base, bank: { bsb: '12-34' } }).bsb).toMatch(/6/)
  })
})

// ── cancelling (void) ────────────────────────────────────────────────────────────────────────────
import { buildVoid, cancelConsequences, linkOutcome, needsRefund, PAID_CANCEL_HINT, voidSummary } from './invoices'

const VOIDED = { voidedAt: '2026-10-12T04:41:00.000Z', voidedBy: 'u-me', reason: 'mistake' as const, note: 'Wrong milestone', linkDeactivated: true }
const voided = (over: Partial<InvoiceDto> = {}) => inv({ status: 'void', voided: VOIDED, ...over })

describe('cancelled invoices: status and tabs', () => {
  it('shows a Cancelled chip with an icon, and a void invoice is never overdue', () => {
    expect(statusChip(voided())).toEqual({ label: 'Cancelled', tone: '', icon: 'x' })
    expect(statusChip(voided({ overdue: true })).label).toBe('Cancelled')
  })
  it('stays in All only: never Overdue, Sent, Drafts or Paid', () => {
    const list = [inv({ id: 'a' }), inv({ id: 'b', overdue: true }), voided({ id: 'c', overdue: true }), paid({ id: 'd' }), inv({ id: 'e', status: 'draft' })]
    expect(tabCounts(list)).toEqual({ all: 5, draft: 1, sent: 2, overdue: 1, paid: 1 })
    expect(inTab(voided({ overdue: true }), 'overdue')).toBe(false)
    expect(inTab(voided(), 'all')).toBe(true)
    expect(filterInvoices(list, { tab: 'all', query: '', companyId: '' }).map(i => i.id)).toContain('c')
    expect(filterInvoices(list, { tab: 'overdue', query: '', companyId: '' }).map(i => i.id)).toEqual(['b'])
  })
  it('the due cell of a void invoice has no overdue note', () => {
    expect(dueCell(voided({ overdue: true }), TODAY)).toEqual({ text: '17 Nov 2026', sub: '', late: false })
  })
})

describe('cancelled invoices: milestones', () => {
  it('a void invoice counts as nothing, so the milestone goes back to Planned', () => {
    expect(milestoneStatus('m1', [voided({ milestoneId: 'm1' })])).toBe('Planned')
    expect(milestoneStatus('m1', [voided({ id: 'a', milestoneId: 'm1' }), inv({ id: 'b', milestoneId: 'm1', status: 'draft' })])).toBe('Draft invoice')
  })
})

describe('cancelled invoices: what a person may do', () => {
  it('Cancel is for sent (and so overdue) invoices only', () => {
    expect(actionsFor(inv()).cancel).toBe(true)
    expect(actionsFor(inv({ overdue: true })).cancel).toBe(true)
    expect(actionsFor(inv({ status: 'draft' })).cancel).toBe(false)
    expect(actionsFor(paid()).cancel).toBe(false)
    expect(actionsFor(voided()).cancel).toBe(false)
  })
  it('a paid invoice shows Cancel as blocked; a draft does not', () => {
    expect(actionsFor(paid()).cancelBlockedPaid).toBe(true)
    expect(actionsFor(inv({ status: 'draft' })).cancelBlockedPaid).toBe(false)
    expect(PAID_CANCEL_HINT).toBe('Paid invoices cannot be cancelled. Refund or issue a credit instead.')
  })
  it('a void invoice is read-only: no edit, reissue, issue, mark paid or delete, and no link to copy', () => {
    expect(actionsFor(voided())).toMatchObject({ edit: false, reissue: false, issue: false, markPaid: false, delete: false, copyLink: false, readOnly: true, voided: true, duplicate: true })
  })
})

describe('cancel form', () => {
  it('needs a reason', () => {
    expect(buildVoid({ reason: '', note: '' })).toEqual({ ok: false, hint: 'Choose a reason to continue.' })
  })
  it('the note is optional, except for Other', () => {
    expect(buildVoid({ reason: 'mistake', note: '' })).toEqual({ ok: true, input: { reason: 'mistake' } })
    expect(buildVoid({ reason: 'other', note: '   ' }).ok).toBe(false)
    expect(buildVoid({ reason: 'other', note: ' Duplicate of INV-0030 ' })).toEqual({ ok: true, input: { reason: 'other', note: 'Duplicate of INV-0030' } })
  })
  it('the note is at most 200 characters', () => {
    expect(buildVoid({ reason: 'replaced', note: 'x'.repeat(200) }).ok).toBe(true)
    expect(buildVoid({ reason: 'replaced', note: 'x'.repeat(201) }).ok).toBe(false)
  })
  it('reads as a sentence', () => {
    expect(voidSummary(VOIDED, 'Ryan')).toBe('Cancelled on 12 Oct 2026 by Ryan: Raised by mistake (Wrong milestone)')
    expect(voidSummary({ ...VOIDED, note: '', reason: 'client-cancelled' }, 'Ryan')).toBe('Cancelled on 12 Oct 2026 by Ryan: Client cancelled')
  })
})

describe('cancel consequences', () => {
  const base = { paymentLinkUrl: '', paymentLinkIsAutomatic: false, subtotalCents: 1800000, totalCents: 1980000, overdue: false, milestoneId: null }
  it('an automatic card link stops working', () => {
    const t = cancelConsequences({ ...base, paymentLinkUrl: 'https://buy.stripe.com/x', paymentLinkIsAutomatic: true }, '').map(c => c.text)
    expect(t[0]).toContain('card payment link stops working')
  })
  it('a link pasted by hand cannot be switched off here', () => {
    const t = cancelConsequences({ ...base, paymentLinkUrl: 'https://pay.example/x' }, '').map(c => c.text)
    expect(t[0]).toContain('pasted in by hand')
    expect(t[0]).toContain('Switch it off in your payment provider')
  })
  it('no link, no link line; the page, watermark and totals lines are always there', () => {
    const t = cancelConsequences(base, '').map(c => c.text)
    expect(t).toHaveLength(2)
    expect(t[0]).toContain('This invoice has been cancelled')
    expect(t[0]).toContain('watermarked CANCELLED')
    expect(t[1]).toBe('$18,000.00 ex GST ($19,800.00 with GST) leaves Outstanding and Invoiced.')
  })
  it('a milestone goes back to Planned and the deal progress drops', () => {
    const t = cancelConsequences({ ...base, milestoneId: 'm2', overdue: true }, 'Core platform').map(c => c.text)
    expect(t[1]).toContain('leaves Outstanding, Overdue and Invoiced')
    expect(t[2]).toBe('Milestone “Core platform” goes back to Planned, and the billing progress on the deal drops.')
  })
})

describe('cancelled invoices: activity and refunds', () => {
  const names = (id: string): string => (id === 'u-me' ? 'Ryan' : id)
  it('lists the cancellation, who, why and whether the link was switched off', () => {
    const a = activityItems(voided(), names)
    expect(a.map(x => x.label)).toEqual(['Created', 'Issued', 'Cancelled'])
    expect(a[2]).toMatchObject({ when: '12 Oct 2026', note: 'Ryan', lines: ['Reason: Raised by mistake', 'Note: Wrong milestone', 'Card link switched off'] })
  })
  it('says when the link was not switched off, or there was none', () => {
    expect(linkOutcome(false)).toContain('must be switched off in Stripe')
    expect(linkOutcome(null)).toBe('No card link to switch off')
  })
  it('a payment after cancelling and its confirmation are part of the history', () => {
    const refund = { amountCents: 1980000, receivedAt: '2026-10-13T01:00:00.000Z', reference: 'pi_123', acknowledgedAt: null, acknowledgedBy: null }
    expect(activityItems(voided({ refundDue: refund }), names).map(x => x.label)).toEqual(['Created', 'Issued', 'Cancelled', 'Payment received after cancelling'])
    const done = activityItems(voided({ refundDue: { ...refund, acknowledgedAt: '2026-10-14T00:00:00.000Z', acknowledgedBy: 'u-me' } }), names)
    expect(done.at(-1)).toMatchObject({ label: 'Refund confirmed', note: 'Ryan' })
  })
  it('needsRefund is true only until it is acknowledged', () => {
    const refund = { amountCents: 100, receivedAt: '2026-10-13', reference: '', acknowledgedAt: null, acknowledgedBy: null }
    expect(needsRefund({ refundDue: null })).toBe(false)
    expect(needsRefund({ refundDue: refund })).toBe(true)
    expect(needsRefund({ refundDue: { ...refund, acknowledgedAt: '2026-10-14' } })).toBe(false)
  })
})
