import { useState } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { getInvoice, invoiceError } from '../../api/invoices'
import { useLoad } from '../../data/invoicing'
import { useStore } from '../../data/store'
import { Btn, Card, Empty, Skel } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI, type Route } from '../../ui/store'
import { InvoiceEditor } from './InvoiceEditor'
import { InvoiceView } from './InvoiceView'
import { InvoicesDenied } from './states'

export function Invoice({ route }: { route: Route }) {
  useStore()
  const id = route.id
  if (!id || id === 'new') return <InvoiceEditor invoice={null} initial={{ companyId: str(route.q?.companyId), dealId: str(route.q?.dealId), milestoneId: str(route.q?.milestoneId), retainer: route.q?.retainer === true, retainerFor: str(route.q?.retainerFor) }} />
  return <Existing id={id} />
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function Existing({ id }: { id: string }) {
  const q = useLoad(s => getInvoice(id, s), id)
  const [changed, setChanged] = useState<InvoiceDto | null>(null)
  const [editing, setEditing] = useState(false)
  const inv = changed ?? q.data

  if (q.error) {
    const e = invoiceError(q.error, 'load')
    if (e.kind === 'denied') return <InvoicesDenied />
    return (
      <div className="page">
        <PageHead title="Invoice" />
        <Card pad={false}>
          <Empty icon="alert" title={e.kind === 'not-found' ? 'Invoice not found' : "Couldn't load this invoice"} body={e.message}
            action={<span className="row"><Btn onClick={() => UI.nav('invoices')}>All invoices</Btn>{e.kind !== 'not-found' && <Btn kind="pri" onClick={q.reload}>Try again</Btn>}</span>} />
        </Card>
      </div>
    )
  }
  if (!inv) return <div className="page"><Skel rows={6} /></div>

  if (inv.status === 'draft' || (inv.status === 'sent' && editing)) {
    return <InvoiceEditor invoice={inv} onChange={i => { setChanged(i); if (i.status === 'paid') setEditing(false) }} onCancel={inv.status === 'sent' ? () => setEditing(false) : undefined} />
  }
  return <InvoiceView invoice={inv} onChange={setChanged} onEdit={() => setEditing(true)} />
}
