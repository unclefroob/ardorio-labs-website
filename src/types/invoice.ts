/**
 * Wire types for the invoicing API. Money always arrives as integer cents
 * alongside a server-formatted string — the form edits cents, the UI displays
 * the formatted value, and neither side re-implements currency formatting.
 */

export type InvoiceStatus = 'draft' | 'sent' | 'paid'
export type PaymentMethod = 'bank-transfer' | 'payid' | 'card' | 'other'

export interface InvoiceLine {
  description: string
  /** Optional smaller grey line under the description on the invoice. */
  detail: string
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
  /** Whether a card link is generated for this invoice when it is issued. */
  offerCardPayment: boolean
  paymentLinkUrl: string
  /** True when we generated the link, rather than it being pasted in. */
  paymentLinkIsAutomatic: boolean
  publicToken: string
  hostedUrl: string
  sentAt: string | null
  issuedCount: number
  xeroInvoiceId: string
  xeroPushedAt: string | null
  xeroPushError: string
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
  lineItems: { description: string; detail: string; qty: number; unitPriceFormatted: string; amountFormatted: string }[]
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

/** Ardorio's own details, edited at /admin/settings and printed on invoices. */
export interface BusinessProfile {
  name: string
  abn: string
  address: string
  email: string
  gstRegistered: boolean
  offerCardPayments: boolean
  xeroSalesAccountCode: string
  xeroTaxTypeGst: string
  xeroTaxTypeGstFree: string
  xeroPushAsDraft: boolean
  bank: { accountName: string; bsb: string; accountNumber: string; payId: string }
  /** Derived from the server env, not stored. Read-only. */
  stripeConfigured?: boolean
}

/** Connection state for the one-way Xero push. */
export interface XeroStatus {
  configured: boolean
  connected: boolean
  tenantName: string
  connectedAt: string | null
  lastRefreshedAt: string | null
  lastError: string
  refreshTokenExpiresAt: string | null
}

export const PAYMENT_TERM_OPTIONS = [7, 14, 30, 45, 60] as const

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  'bank-transfer': 'Bank transfer',
  payid: 'PayID',
  card: 'Card',
  other: 'Other',
}
