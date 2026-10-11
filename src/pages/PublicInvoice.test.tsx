import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicInvoice as PublicInvoiceData } from '../types/invoice'

vi.mock('../lib/apiClient', () => ({ API_BASE: 'https://api.test' }))

const INVOICE: PublicInvoiceData = {
  invoiceNumber: 'INV-0042', clientName: 'Harbour Retail Group', billTo: { contactName: 'Priya', abn: '', address: '' },
  lineItems: [{ description: 'Milestone 2: web build', detail: '', qty: 1, unitPriceFormatted: '$4,000.00', amountFormatted: '$4,000.00' }],
  issueDate: '2026-09-30', issueDateFormatted: '30 Sep 2026', dueDate: '2026-11-14', dueDateFormatted: '14 Nov 2026', status: 'sent', overdue: false, notes: '',
  paymentLinkUrl: 'https://buy.stripe.com/abc', subtotalFormatted: '$4,000.00', gstFormatted: '$400.00', totalFormatted: '$4,400.00', gstCents: 40000, gstRatePercent: 10,
  business: { name: 'Ardorio Labs', abn: '', email: 'accounts@ardorio.co', bank: { accountName: 'Ardorio Labs', bsb: '000-000', accountNumber: '12345678', payId: 'pay@ardorio.co' } },
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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

async function show(inv: PublicInvoiceData) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(inv), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  const { default: PublicInvoice } = await import('./PublicInvoice')
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/invoice/tok']}><Routes><Route path="/invoice/:token" element={<PublicInvoice />} /></Routes></MemoryRouter>)
  })
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() })
}
const text = (): string => host.textContent ?? ''

describe('the public invoice page', () => {
  it('a live invoice still shows how to pay and the card link', async () => {
    await show(INVOICE)
    expect(text()).toContain('How to pay')
    expect(host.querySelector('a[href="https://buy.stripe.com/abc"]')).not.toBeNull()
  })

  it('a cancelled invoice says so, with the number, and offers no way to pay', async () => {
    await show({ ...INVOICE, status: 'void' })
    expect(text()).toContain('This invoice has been cancelled')
    expect(text()).toContain('INV-0042')
    expect(text()).toContain('Cancelled')
    expect(host.querySelector('[role="status"]')?.textContent).toContain('No payment is needed')
    expect(text()).not.toContain('How to pay')
    expect(text()).not.toContain('Pay by card')
    expect(text()).not.toContain('Bank transfer is the fastest')
    expect(text()).not.toContain('12345678')
    expect(text()).not.toContain('Due 14 Nov 2026')
    expect(host.querySelector('a[href^="https://buy.stripe.com"]')).toBeNull()
  })

  it('shows the cancelled amount struck through, and keeps the PDF download', async () => {
    await show({ ...INVOICE, status: 'void' })
    expect([...host.querySelectorAll('.line-through')].map(e => e.textContent)).toContain('$4,400.00')
    const pdf = host.querySelector<HTMLAnchorElement>('a[href="https://api.test/invoices/public/tok/pdf"]')
    expect(pdf?.textContent).toContain('Download PDF')
  })

  it('the Cancelled badge has an icon as well as words', async () => {
    await show({ ...INVOICE, status: 'void' })
    const badge = [...host.querySelectorAll('span')].find(s => s.textContent?.trim() === 'Cancelled')!
    expect(badge.querySelector('svg')).not.toBeNull()
  })
})
