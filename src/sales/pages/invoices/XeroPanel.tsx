import { useState } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError } from '../../api/invoices'
import { sendInvoiceToXero, xeroStatus } from '../../api/xero'
import { useLoad } from '../../data/invoicing'
import { Btn, Card, Chip } from '../../kit'
import { invoiceXero } from '../../shared/xero'
import { UI } from '../../ui/store'

/** On an invoice: whether Xero has it, why not, and the button to send it or try again. Silent for drafts, tests and external records. */
export function XeroPanel({ invoice: inv, onChange }: { invoice: InvoiceDto; onChange: (i: InvoiceDto) => void }) {
  // If the connection cannot be read, the page promises nothing beyond what the invoice itself says.
  const q = useLoad(s => xeroStatus(s), 'xero-invoice')
  const v = invoiceXero(inv, q.data)
  const [busy, setBusy] = useState(false)
  if (!v.show) return null
  const go = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await sendInvoiceToXero(inv.id)
      onChange(next)
      const st = next.xero?.state
      UI.toast(st === 'synced' ? 'Sent to Xero' : st === 'error' ? 'Xero rejected the invoice' : 'Sent to Xero', st === 'error' ? 'bad' : undefined)
    } catch (e) {
      UI.toast(invoiceError(e, 'save').message, 'bad')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Xero" icon="plug" right={<Chip tone={v.tone}>{v.label}</Chip>}>
      <div className="col" style={{ gap: 10 }}>
        {v.detail && <div className={'sm ' + (v.tone === 'bad' ? '' : 'muted')} role={v.tone === 'bad' ? 'alert' : undefined}>{v.detail}</div>}
        <div className="row wrap" style={{ gap: 8 }}>
          {v.action && <Btn size="sm" kind={v.action === 'retry' ? 'pri' : undefined} onClick={() => void go()} loading={busy}>{v.action === 'retry' ? 'Retry' : 'Send to Xero'}</Btn>}
          {v.url && <a className="btn sm" href={v.url} target="_blank" rel="noopener noreferrer">Open in Xero</a>}
        </div>
      </div>
    </Card>
  )
}
