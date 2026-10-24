import { useState } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError } from '../../api/invoices'
import { externalStripeLink, findExternalInStripe } from '../../api/xero'
import { useLoad } from '../../data/invoicing'
import { Banner, Btn, Card, Skel } from '../../kit'
import { RosterioXeroPanel } from './RosterioXeroPanel'

/** On an external record: find its Stripe invoice by reference, then send it to Xero like any Rosterio Stripe invoice. Admins of ard only. */
export function ExternalXeroPanel({ invoice: inv, canAct }: { invoice: InvoiceDto; canAct: boolean }) {
  const q = useLoad(s => (canAct ? externalStripeLink(inv.id, s) : Promise.resolve({ linked: null })), `ext-stripe-${inv.id}`)
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState('')
  if (!canAct) return null
  if (q.loading && !q.data) return <Skel rows={2} label="Loading Xero" />
  const linked = q.data?.linked ?? null
  if (linked) return <RosterioXeroPanel invoice={linked} canAct onChange={q.reload} />
  const find = async (): Promise<void> => {
    setBusy(true); setWhy('')
    try {
      await findExternalInStripe(inv.id)
      q.reload()
    } catch (e) {
      setWhy(invoiceError(e, 'load').message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Xero" icon="plug">
      <div className="col" style={{ gap: 10 }}>
        <div className="sm muted">Find this invoice in Stripe to send it to Xero.</div>
        {q.error != null && <Banner tone="warn">{invoiceError(q.error, 'load').message}</Banner>}
        {why && <Banner tone="warn">{why}</Banner>}
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn size="sm" onClick={() => void find()} loading={busy}>Find in Stripe</Btn>
        </div>
      </div>
    </Card>
  )
}
