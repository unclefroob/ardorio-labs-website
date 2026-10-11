import type { UnitModule } from './types'
import { Invoices } from '../pages/invoices/Invoices'
import { Invoice } from '../pages/invoices/Invoice'
import { MarkPaid } from '../modals/invoices/MarkPaid'
import { CancelInvoice } from '../modals/invoices/CancelInvoice'
import { BillingDetails } from '../modals/invoices/BillingDetails'

export const invoicing: UnitModule = {
  pages: { invoices: Invoices, invoice: Invoice },
  modals: { markPaid: MarkPaid, cancelInvoice: CancelInvoice, billingDetails: BillingDetails },
  drawers: {},
}
