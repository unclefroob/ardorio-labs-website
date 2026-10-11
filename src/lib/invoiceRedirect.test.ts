import { describe, expect, it } from 'vitest'
import { salesInvoicePath } from './invoiceRedirect'

describe('old admin invoice addresses', () => {
  it('sends the list, new and by-id addresses to the SalesOS equivalents', () => {
    expect(salesInvoicePath('/admin/invoices')).toBe('/sales/invoices')
    expect(salesInvoicePath('/admin/invoices/')).toBe('/sales/invoices')
    expect(salesInvoicePath('/admin/invoices/new')).toBe('/sales/invoices/new')
    expect(salesInvoicePath('/admin/invoices/65f0c1a2b3')).toBe('/sales/invoices/65f0c1a2b3')
  })
  it('keeps the query string and hash', () => {
    expect(salesInvoicePath('/admin/invoices/abc', '?x=1', '#top')).toBe('/sales/invoices/abc?x=1#top')
  })
  it('anything deeper goes to the list rather than a guessed page', () => {
    expect(salesInvoicePath('/admin/invoices/a/b')).toBe('/sales/invoices')
  })
})
