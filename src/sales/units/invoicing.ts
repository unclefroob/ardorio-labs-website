import type { UnitModule } from './types'
import { Invoices } from '../pages/invoices/Invoices'
import { Invoice } from '../pages/invoices/Invoice'
import { MarkPaid } from '../modals/invoices/MarkPaid'
import { CancelInvoice } from '../modals/invoices/CancelInvoice'
import { MarkTest } from '../modals/invoices/MarkTest'
import { DeleteTestInvoice } from '../modals/invoices/DeleteTestInvoice'
import { BillingDetails } from '../modals/invoices/BillingDetails'
import { AddVariation } from '../modals/invoices/AddVariation'
import { RecordExternal } from '../modals/invoices/RecordExternal'
import { ConfirmCpi } from '../modals/invoices/ConfirmCpi'

export const invoicing: UnitModule = {
  pages: { invoices: Invoices, invoice: Invoice },
  modals: { markPaid: MarkPaid, cancelInvoice: CancelInvoice, markTest: MarkTest, deleteTestInvoice: DeleteTestInvoice, billingDetails: BillingDetails, addVariation: AddVariation, recordExternal: RecordExternal, confirmCpi: ConfirmCpi },
  drawers: {},
}
