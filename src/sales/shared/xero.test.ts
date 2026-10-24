import { describe, expect, it } from 'vitest'
import type { InvoiceDto, XeroSettings, XeroStatus } from '../api/contract'
import { chipFor, invoiceXero, nextStep, readXeroReturn, settingsPatch, xeroReturnMessage } from './xero'

const SETTINGS: XeroSettings = { salesAccountCode: '200', paymentAccountCode: '090', gstTaxType: 'OUTPUT', noGstTaxType: 'EXEMPTOUTPUT', autoSync: true, syncFrom: '2026-09-01' }
const status = (over: Partial<XeroStatus> = {}, settings: Partial<XeroSettings> = {}): XeroStatus => ({
  configured: true, connected: true, tenantName: 'Ardorio Pty Ltd', connectedAt: '2026-09-01T00:00:00.000Z', problem: null,
  settings: { ...SETTINGS, ...settings }, counts: { waiting: 0, failed: 0 }, ...over,
})
const inv = (over: Partial<InvoiceDto> = {}, xero: InvoiceDto['xero'] = null): InvoiceDto => ({
  id: 'i1', invoiceNumber: 'INV-0001', clientSlug: 'acme', clientName: 'Acme', companyId: null, dealId: null, milestoneId: null, lineItems: [], gstRate: 0.1, notes: '',
  issueDate: '2026-09-10', paymentTermsDays: 14, dueDate: '2026-09-24', status: 'sent', overdue: false, payment: null, offerCardPayment: false, paymentLinkUrl: '',
  paymentLinkIsAutomatic: false, publicToken: 't', hostedUrl: '', sentAt: '2026-09-10T01:00:00.000Z', issuedCount: 1, subtotalCents: 100, gstCents: 10, totalCents: 110,
  createdAt: '', voided: null, refundDue: null, test: null, source: 'manual', external: null, xero, ...over,
})

describe('the return from Xero', () => {
  it('reads connected and error, and ignores everything else', () => {
    expect(readXeroReturn('?xero=connected')).toEqual({ ok: true, reason: undefined })
    expect(readXeroReturn('?q=%7B%7D&xero=error&reason=choose-one')).toEqual({ ok: false, reason: 'choose-one' })
    expect(readXeroReturn('?xero=error&reason=denied&xeroError=invalid_scope&xeroDetail=Invalid%20scope')).toEqual({ ok: false, reason: 'denied', error: 'invalid_scope', detail: 'Invalid scope' })
    expect(readXeroReturn('?xero=weird')).toBeNull()
    expect(readXeroReturn('')).toBeNull()
  })
  it('says what happened in words, with a fallback for a reason it does not know', () => {
    expect(xeroReturnMessage({ ok: true })).toMatch(/Choose a sales account/)
    expect(xeroReturnMessage({ ok: false, reason: 'choose-one' })).toMatch(/Select only one/)
    expect(xeroReturnMessage({ ok: false, reason: 'denied' })).toMatch(/cancelled/)
    expect(xeroReturnMessage({ ok: false, reason: 'denied', error: 'access_denied' })).toMatch(/cancelled/)
    expect(xeroReturnMessage({ ok: false, reason: 'denied', error: 'invalid_scope', detail: 'Invalid scope' })).toBe('Xero refused the connection: invalid_scope. Invalid scope.')
    expect(xeroReturnMessage({ ok: false, reason: 'denied', error: 'unauthorized_client' })).toBe('Xero refused the connection: unauthorized_client.')
    expect(xeroReturnMessage({ ok: false, reason: 'denied', error: 'access_denied', detail: 'Requested wrong apps scopes', scopes: 'a b' })).toBe('Xero refused the connection: access_denied. Requested wrong apps scopes. Scopes sent: a b.')
    expect(xeroReturnMessage({ ok: false, reason: 'surprise' })).toMatch(/couldn't be connected/)
    expect(xeroReturnMessage({ ok: false })).toMatch(/couldn't be connected/)
  })
})

describe('next step and the header chip', () => {
  it('asks for the sales account first, then the bank account, then nothing', () => {
    expect(nextStep(status({}, { salesAccountCode: '' }))).toMatch(/sales account.*Nothing is sent/)
    expect(nextStep(status({}, { paymentAccountCode: '' }))).toMatch(/bank account/)
    expect(nextStep(status())).toBeNull()
    expect(nextStep(status({ problem: 'Xero access was revoked or expired. Reconnect Xero.' }))).toMatch(/Reconnect/)
    expect(nextStep(status({ connected: false, settings: null }))).toBeNull()
    expect(nextStep(status({ configured: false }))).toBeNull()
  })

  it.each([
    [null, '', 'Xero'],
    [status({ configured: false, reason: 'XERO_CLIENT_ID missing' }), '', 'Xero: not set up'],
    [status({ connected: false, settings: null }), '', 'Xero: not connected'],
    [status({ problem: 'revoked' }), 'bad', 'Xero: reconnect'],
    [status({ counts: { waiting: 0, failed: 3 } }), 'bad', 'Xero: 3 to fix'],
    [status({}, { salesAccountCode: '' }), 'warn', 'Xero: finish setup'],
    [status({}, { autoSync: false }), 'warn', 'Xero: manual'],
    [status({ counts: { waiting: 2, failed: 0 } }), 'ok', 'Xero: connected'],
  ])('chip for %j', (s, tone, label) => {
    expect(chipFor(s)).toMatchObject({ tone, label })
  })

  it('the connected chip names the organisation and what is waiting', () => {
    expect(chipFor(status({ counts: { waiting: 2, failed: 0 } })).title).toBe('Sending to Ardorio Pty Ltd. 2 waiting.')
  })
})

describe('an invoice against Xero', () => {
  it('shows nothing for a draft, a test invoice or an external record (the server sends null)', () => {
    expect(invoiceXero(inv(), status()).show).toBe(false)
  })

  it('synced: In Xero, with the payment, cancel and plain wording; a link when there is one', () => {
    const x = { state: 'synced' as const, message: '', syncedAt: '2026-09-11T02:00:00.000Z', url: 'https://go.xero.com/x' }
    expect(invoiceXero(inv({}, x), status())).toMatchObject({ show: true, tone: 'ok', label: 'In Xero', action: null, url: 'https://go.xero.com/x', detail: 'Updated 2026-09-11' })
    expect(invoiceXero(inv({ status: 'paid' }, x), status()).label).toBe('In Xero, payment recorded')
    expect(invoiceXero(inv({ status: 'void' }, x), status()).label).toBe('Cancelled in Xero')
  })

  it('error: the reason, in the invoice’s own words, with Retry', () => {
    const v = invoiceXero(inv({}, { state: 'error', message: "Xero: Account code '999' is not a valid code", syncedAt: null, url: null }), status())
    expect(v).toMatchObject({ tone: 'bad', label: 'Not in Xero', detail: "Xero: Account code '999' is not a valid code", action: 'retry' })
    expect(invoiceXero(inv({}, { state: 'error', message: '', syncedAt: null, url: null }), null).detail).toMatch(/rejected/)
  })

  it('pending: says it will catch up, and offers Send', () => {
    expect(invoiceXero(inv({}, { state: 'pending', message: '', syncedAt: null, url: 'u' }), status())).toMatchObject({ tone: 'warn', label: 'Waiting to update Xero', action: 'send', url: 'u' })
  })

  describe('never sent, by what the connection says', () => {
    const ns = { state: 'not_sent' as const, message: '', syncedAt: null, url: null }
    it('says nothing when the connection could not be read or the server has no Xero', () => {
      expect(invoiceXero(inv({}, ns), null).show).toBe(false)
      expect(invoiceXero(inv({}, ns), status({ configured: false })).show).toBe(false)
    })
    it('not connected: says so, with no button', () => {
      expect(invoiceXero(inv({}, ns), status({ connected: false, settings: null }))).toMatchObject({ show: true, detail: 'Xero is not connected.', action: null })
    })
    it('issued before the start date: explains, and lets a person send it anyway', () => {
      const v = invoiceXero(inv({ sentAt: '2026-08-15T00:00:00.000Z', issueDate: '2026-08-15' }, ns), status())
      expect(v).toMatchObject({ action: 'send' })
      expect(v.detail).toContain('Issued before the start date (2026-09-01)')
    })
    it('no sales account yet: points at settings, no button', () => {
      expect(invoiceXero(inv({}, ns), status({}, { salesAccountCode: '' }))).toMatchObject({ tone: 'warn', action: null, detail: expect.stringContaining('Settings > Invoicing') })
    })
    it('automatic sending off: offers Send', () => {
      expect(invoiceXero(inv({}, ns), status({}, { autoSync: false }))).toMatchObject({ label: 'Not in Xero', action: 'send', detail: 'Automatic sending is off.' })
    })
    it('otherwise it is on its way', () => {
      expect(invoiceXero(inv({}, ns), status())).toMatchObject({ label: 'Sending to Xero', action: 'send' })
    })
    it('a cancelled invoice that never went says nothing', () => {
      expect(invoiceXero(inv({ status: 'void' }, ns), status()).show).toBe(false)
    })
  })
})

describe('settingsPatch', () => {
  it('holds only what changed', () => {
    expect(settingsPatch(SETTINGS, { ...SETTINGS, salesAccountCode: '210', autoSync: false })).toEqual({ salesAccountCode: '210', autoSync: false })
    expect(settingsPatch(SETTINGS, SETTINGS)).toEqual({})
  })
})
