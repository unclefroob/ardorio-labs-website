import { describe, expect, it } from 'vitest'
import type { InvoiceDto } from '../api/contract'
import { dto } from '../testing/invoicingWorld'
import { isRetainerInvoice, moneyForDeal } from './billing'
import {
  aud, blankExternal, buildExternal, checkExternal, confirmText, externalLabel, formFromExternal, invoiceRef, monthOf, PAID_IN_FULL_ERROR, paidBeforeIssued, PART_PAYMENT_HINT, patchExternal, previewLine,
  recordedLine, REFERENCE_REQUIRED, tenPercent, type ExternalForm,
} from './externalInvoices'
import { actionsFor, activityItems, cancelConsequences, filterInvoices } from './invoices'

const TODAY = '2026-10-14'
const EXT = { source: 'xero' as const, reference: 'INV-0457', recordedBy: 'Ryan', recordedAt: '2026-10-13T02:00:00.000Z' }
const ext = (over: Partial<InvoiceDto> = {}): InvoiceDto => dto({
  id: 'x1', invoiceNumber: 'EXT:xero:INV-0457:ab12cd34', source: 'external', external: EXT, milestoneId: 'm1', issueDate: '2026-03-10', dueDate: '2026-04-24',
  subtotalCents: 8_000_000, gstCents: 800_000, totalCents: 8_800_000, status: 'paid',
  payment: { method: 'bank-transfer', paidAt: '2026-04-09', amountCents: 8_800_000, reference: 'INV-0457' }, ...over,
})

/** The board 9 form: Xero INV-0457, A$80,000 ex GST issued 10 Mar 2026, paid in full 9 Apr 2026. */
const filled = (over: Partial<ExternalForm> = {}): ExternalForm => {
  let f = blankExternal(TODAY, { dealId: 'dl1' })
  f = patchExternal(f, { reference: 'INV-0457', issueDate: '2026-03-10', amount: '80,000', paid: true, paidOn: '2026-04-09' })
  return { ...f, ...over }
}

describe('External invoices: names', () => {
  it('names an external record by its reference, never the hidden number', () => {
    expect(externalLabel({ source: 'xero', reference: 'INV-0457' })).toBe('Xero INV-0457')
    expect(externalLabel({ source: 'xero', reference: 'Xero INV-0457' })).toBe('Xero INV-0457')
    expect(externalLabel({ source: 'other-system', reference: 'MYOB 2231' })).toBe('MYOB 2231')
    expect(externalLabel({ source: 'bank-transfer-no-invoice', reference: 'CBA 9921' })).toBe('CBA 9921')
    expect(invoiceRef(ext())).toBe('Xero INV-0457')
    expect(invoiceRef(dto())).toBe('INV-0034')
  })

  it('confirms deleting a test record with the reference as stored', () => {
    expect(confirmText(ext())).toBe('INV-0457')
    expect(confirmText(dto())).toBe('INV-0034')
  })

  it('writes months and money the way the boards do', () => {
    expect(monthOf('2026-03-10')).toBe('March 2026')
    expect(monthOf('')).toBe('')
    expect(aud(8_000_000)).toBe('A$80,000')
    expect(tenPercent(8_000_000)).toBe(800_000)
    expect(tenPercent(15)).toBe(2) // 1.5 cents rounds half up
  })
})

describe('External invoices: the form', () => {
  it('suggests GST at 10% until it is typed over', () => {
    const f = filled()
    expect(f.gst).toBe('8000.00')
    const zeroRated = patchExternal(f, { gst: '0' })
    expect(zeroRated.gstEdited).toBe(true)
    // Once typed over, GST no longer follows the amount.
    expect(patchExternal(zeroRated, { amount: '100' }).gst).toBe('0')
  })

  it('a paid record is paid in full: the amount paid sent is always subtotal + GST', () => {
    const f = filled()
    expect('paidAmount' in f).toBe(false)
    const full = checkExternal(f, TODAY)
    if (!full.ok) throw new Error('expected ok')
    expect(full.paidAmountCents).toBe(8_800_000)
    expect(buildExternal(f, 'co1', full).paidAmountCents).toBe(full.subtotalCents + full.gstCents)
    // Zero-rated, and after the amount changes, it follows the new total.
    const zero = patchExternal(patchExternal(f, { gst: '0' }), { amount: '1234.56' })
    const z = checkExternal(zero, TODAY)
    if (!z.ok) throw new Error('expected ok')
    expect(buildExternal(zero, 'co1', z).paidAmountCents).toBe(123_456)
    expect(PART_PAYMENT_HINT).toBe('Paid only part? Record the part paid as its own record, and the rest as an unpaid record.')
    expect(PAID_IN_FULL_ERROR).toContain(PART_PAYMENT_HINT)
  })

  it('accepts board 9 and builds the API body, ex GST cents, with the payment', () => {
    const c = checkExternal(filled(), TODAY)
    expect(c.ok).toBe(true)
    if (!c.ok) return
    expect(buildExternal(filled({ milestoneId: 'm1', notes: '  Deposit  ' }), 'co1', c)).toEqual({
      companyId: 'co1', dealId: 'dl1', milestoneId: 'm1', externalSource: 'xero', externalReference: 'INV-0457', issueDate: '2026-03-10',
      subtotalCents: 8_000_000, gstCents: 800_000, paidOn: '2026-04-09', paymentMethod: 'bank-transfer', paidAmountCents: 8_800_000, notes: 'Deposit',
    })
  })

  it('sends no payment when it has not been paid', () => {
    const f = filled({ paid: false })
    const c = checkExternal(f, TODAY)
    if (!c.ok) throw new Error('expected ok')
    const body = buildExternal(f, 'co1', c)
    expect([body.paidOn, body.paymentMethod, body.paidAmountCents, body.milestoneId]).toEqual([null, null, null, null])
  })

  it('mirrors the API: reference required, dates not in the future, paid not before issued, GST up to the amount', () => {
    const r = checkExternal(filled({ reference: '  ', issueDate: '2026-11-20', gst: '90000' }), TODAY)
    expect(r.ok).toBe(false)
    expect(r.errors.reference).toBe(REFERENCE_REQUIRED)
    expect(r.errors.issueDate).toBe('The issue date can’t be in the future. Use today or an earlier date.')
    expect(r.errors.gst).toBe('GST can’t be more than the amount ex GST')

    const before = checkExternal(filled({ paidOn: '2026-03-02' }), TODAY)
    expect(before.errors.paidOn).toBe(paidBeforeIssued('2026-03-02', '2026-03-10'))
    expect(before.errors.paidOn).toContain('The paid date (2 Mar 2026) is before the issue date (10 Mar 2026)')
    expect(checkExternal(filled({ paidOn: '2026-10-15' }), TODAY).errors.paidOn).toBe('The paid date can’t be in the future. Use today or an earlier date.')
    // Paid on the issue date, or today, is fine.
    expect(checkExternal(filled({ paidOn: '2026-03-10' }), TODAY).ok).toBe(true)
    expect(checkExternal(filled({ issueDate: TODAY, paidOn: TODAY }), TODAY).ok).toBe(true)
  })

  it('refuses a missing deal, amount or reference that is too long, and the API limits', () => {
    const r = checkExternal(filled({ dealId: '', amount: '0', reference: 'x'.repeat(61) }), TODAY)
    // GST was suggested from the old amount, so it is now more than the amount too.
    expect(Object.keys(r.errors).sort()).toEqual(['amount', 'dealId', 'gst', 'reference'])
    expect(checkExternal(filled({ amount: '1000000.01' }), TODAY).errors.amount).toContain('at most')
    expect(checkExternal(filled({ notes: 'a'.repeat(501) }), TODAY).errors.notes).toBe('Keep the notes to 500 characters')
  })

  it('reads an existing record back into the form', () => {
    const f = formFromExternal(ext(), TODAY)
    expect(f).toMatchObject({ dealId: 'dl1', milestoneId: 'm1', source: 'xero', reference: 'INV-0457', issueDate: '2026-03-10', amount: '80000.00', gst: '8000.00', gstEdited: false, paid: true, paidOn: '2026-04-09' })
    expect(formFromExternal(ext({ status: 'sent', payment: null, gstCents: 0, totalCents: 8_000_000 }), TODAY)).toMatchObject({ paid: false, paidOn: TODAY, gst: '0.00', gstEdited: true })
  })
})

describe('External invoices: the live preview', () => {
  it('says where the money counts, by month', () => {
    expect(previewLine(filled(), TODAY)).toBe('Adds A$80,000 to Invoiced in March 2026 and to Collected in April 2026.')
    expect(previewLine(filled({ paid: false }), TODAY)).toBe('Adds A$80,000 to Invoiced in March 2026. It counts as outstanding until it is paid.')
    expect(previewLine(filled({ amount: '' }), TODAY)).toBeNull()
    expect(previewLine(filled({ issueDate: '2026-11-01' }), TODAY)).toBeNull()
    expect(recordedLine(ext())).toBe('Xero INV-0457 recorded. A$80,000 added to Invoiced (March 2026) and Collected (April 2026).')
  })
})

describe('External invoices everywhere', () => {
  it('count as project money on the deal: Invoiced on issue, Collected when paid, never as retainer', () => {
    const plan = { contract: { baselineCents: 12_000_000, engagementType: 'fixed-price' as const, contractedOn: '2026-03-03', estimateAtWonCents: 12_000_000, contractedBy: 'Ryan' }, variations: [], milestones: [], retainer: { amountCents: 100_000, interval: 'monthly' as const } }
    const loose = ext({ milestoneId: null })
    // A hand-made invoice with no milestone on a deal with a retainer reads as retainer; an external record never does.
    expect(isRetainerInvoice(dto({ milestoneId: null }), plan)).toBe(true)
    expect(isRetainerInvoice(loose, plan)).toBe(false)
    const m = moneyForDeal({ id: 'dl1', value: 120_000 }, plan, [loose, ext({ id: 'x2', status: 'sent', payment: null, subtotalCents: 1_000_000 })])
    expect([m.invoiced, m.collected, m.outstanding, m.retainerInvoiced]).toEqual([9_000_000, 8_000_000, 1_000_000, 0])
    // Cancelled or test records count for nothing.
    expect(moneyForDeal({ id: 'dl1', value: 120_000 }, plan, [ext({ status: 'void' }), ext({ id: 'x3', test: { markedAt: '', markedBy: '', reason: 't' } })]).invoiced).toBe(0)
  })

  it('offer Edit, Cancel and Mark as test only: no PDF, link, issue, reissue, mark paid or duplicate', () => {
    expect(actionsFor(ext())).toMatchObject({ edit: true, cancel: true, cancelBlockedPaid: false, pdf: false, copyLink: false, issue: false, reissue: false, markPaid: false, duplicate: false, readOnly: true })
    expect(actionsFor(ext({ status: 'sent', payment: null }))).toMatchObject({ edit: true, cancel: true, markPaid: false, reissue: false })
    expect(actionsFor(ext({ status: 'void' }))).toMatchObject({ edit: false, cancel: false, voided: true })
    // Invoices made in SalesOS are unchanged.
    expect(actionsFor(dto({ status: 'paid' }))).toMatchObject({ edit: false, cancel: false, cancelBlockedPaid: true, pdf: true, duplicate: true })
  })

  it('show who recorded it in the activity, and are found by reference, not the hidden number', () => {
    expect(activityItems(ext()).map(i => [i.label, i.when, i.note])).toEqual([
      ['Recorded externally', '13 Oct 2026', 'Ryan'], ['Issued', '10 Mar 2026', 'outside SalesOS'], ['Paid', '9 Apr 2026', 'Bank transfer'],
    ])
    const list = [ext(), dto({ id: 'i2' })]
    const f = { tab: 'all' as const, companyId: '' }
    expect(filterInvoices(list, { ...f, query: '0457' }).map(i => i.id)).toEqual(['x1'])
    expect(filterInvoices(list, { ...f, query: 'EXT:' })).toEqual([])
  })

  it('cancelling says what leaves the figures, with no client page or card link', () => {
    const c = cancelConsequences(ext(), 'Phase 1').map(x => x.text)
    expect(c[0]).toBe('$80,000.00 ex GST ($88,000.00 with GST) leaves Invoiced and Collected.')
    expect(c.join(' ')).not.toContain('card')
    expect(c.join(' ')).not.toContain('client’s invoice page')
    expect(c).toContain('The reference is freed, so it can be recorded again. Nothing changes in the other system.')
  })
})
