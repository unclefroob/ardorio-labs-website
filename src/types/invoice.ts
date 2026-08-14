/**
 * Wire types for the invoicing API. Money always arrives as integer cents
 * alongside a server-formatted string — the form edits cents, the UI displays
 * the formatted value, and neither side re-implements currency formatting.
 */

export type InvoiceStatus = 'draft' | 'sent' | 'paid'
export type PaymentMethod = 'bank-transfer' | 'payid' | 'card' | 'other'

export interface InvoiceLine {
  description: string
  qty: number
  unitPriceCents: number
  amountCents: number
}

export interface InvoicePayment {
  method: PaymentMethod
  paidAt: string
  amountCents: number
  amountFormatted: string
  reference: string
}

export interface Invoice {
  id: string
  invoiceNumber: string
  clientSlug: string
  clientName: string
  lineItems: InvoiceLine[]
  gstRate: number
  notes: string
  issueDate: string
  paymentTermsDays: number
  dueDate: string
  status: InvoiceStatus
  overdue: boolean
  payment: InvoicePayment | null
  paymentLinkUrl: string
  publicToken: string
  hostedUrl: string
  sentAt: string | null
  subtotalCents: number
  gstCents: number
  totalCents: number
  subtotalFormatted: string
  gstFormatted: string
  totalFormatted: string
}

/** The shape served to the unauthenticated hosted page. Deliberately narrower. */
export interface PublicInvoice {
  invoiceNumber: string
  clientName: string
  billTo: { contactName: string; abn: string; address: string }
  lineItems: { description: string; qty: number; unitPriceFormatted: string; amountFormatted: string }[]
  issueDate: string
  issueDateFormatted: string
  dueDate: string
  dueDateFormatted: string
  status: InvoiceStatus
  overdue: boolean
  notes: string
  paymentLinkUrl: string
  subtotalFormatted: string
  gstFormatted: string
  totalFormatted: string
  gstCents: number
  gstRatePercent: number
  business: {
    name: string
    abn: string
    email: string
    bank: { accountName: string; bsb: string; accountNumber: string; payId: string }
  }
}

export const PAYMENT_TERM_OPTIONS = [7, 14, 30, 45, 60] as const

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  'bank-transfer': 'Bank transfer',
  payid: 'PayID',
  card: 'Card',
  other: 'Other',
}
