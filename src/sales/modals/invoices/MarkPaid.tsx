import { useState } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError, markInvoicePaid } from '../../api/invoices'
import { F } from '../../data/F'
import { Banner, Btn, Fld, Inp, Modal, Seg } from '../../kit'
import { buildMarkPaid, defaultPaidForm, METHOD_LABELS, METHOD_ORDER } from '../../shared/invoices'
import { formatCents } from '../../shared/money'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'
import { milestoneLabel } from '../../pages/invoices/parts'
import type { InvoicePaymentMethod } from '../../api/contract'

export function MarkPaid({ invoice, onDone }: { invoice: InvoiceDto; onDone?: (inv: InvoiceDto) => void }) {
  const today = F.today()
  const [f, set] = useF(() => defaultPaidForm(invoice, today))
  const [errors, setErrors] = useState<Partial<Record<'paidAt' | 'amount', string>>>({})
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')
  const ms = milestoneLabel(invoice)

  const submit = async (): Promise<void> => {
    const r = buildMarkPaid(f, today)
    if (!r.ok) {
      setErrors(r.errors)
      return
    }
    setErrors({})
    setBusy(true)
    setFail('')
    try {
      const paid = await markInvoicePaid(invoice.id, r.input)
      UI.close()
      UI.toast(`${invoice.invoiceNumber} recorded as paid`)
      onDone?.(paid)
    } catch (e) {
      setFail(invoiceError(e, 'pay').message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Mark ${invoice.invoiceNumber} as paid`}
      width={520}
      footer={<><Btn onClick={UI.close} disabled={busy}>Cancel</Btn><Btn kind="pri" onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Mark paid'}</Btn></>}
    >
      <div className="col" style={{ gap: 14 }}>
        {fail && <Banner tone="bad">{fail}</Banner>}
        <div>
          <div className="lbl" style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>How was it paid?</div>
          <Seg value={f.method} onChange={v => set('method', v as InvoicePaymentMethod)} opts={METHOD_ORDER.map(m => [m, METHOD_LABELS[m]] as const)} />
        </div>
        <div className="grid g2">
          <Fld label="Date paid" err={errors.paidAt}><Inp type="date" value={f.paidAt} max={today} onChange={v => set('paidAt', v)} /></Fld>
          <Fld label="Amount received (inc GST)" err={errors.amount}><Inp className="rt num" inputMode="decimal" value={f.amount} onChange={v => set('amount', v)} /></Fld>
        </div>
        <Fld label="Reference (optional)"><Inp value={f.reference} placeholder="Bank reference or PayID transaction" onChange={v => set('reference', v)} /></Fld>
        <div className="sm muted">
          The amount defaults to the invoice total ({formatCents(invoice.totalCents)}). Change it if the client paid a different amount. Marking paid makes the invoice read-only{ms ? ` and sets ${ms} to Paid` : ''}.
        </div>
      </div>
    </Modal>
  )
}
