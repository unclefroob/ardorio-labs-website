import type { InvoiceDto } from '../../api/contract'
import { invoiceError, invoicePdf, saveBlob } from '../../api/invoices'
import { UI } from '../../ui/store'

export async function downloadPdf(inv: Pick<InvoiceDto, 'id' | 'invoiceNumber'>): Promise<void> {
  try {
    saveBlob(await invoicePdf(inv.id), `${inv.invoiceNumber}.pdf`)
  } catch (e) {
    UI.toast(invoiceError(e, 'download').message, 'bad')
  }
}

export async function copyLink(inv: Pick<InvoiceDto, 'hostedUrl'>): Promise<void> {
  try {
    await navigator.clipboard.writeText(inv.hostedUrl)
    UI.toast('Invoice link copied')
  } catch {
    UI.toast('Could not copy. Select the link and copy it by hand.', 'bad')
  }
}
