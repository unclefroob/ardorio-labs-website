import { useState } from 'react'
import type { BillingClient, InvoiceDto } from '../../api/contract'
import { createBillingClient, invoiceError, linkBillingClient, listBillingClients, listInvoices } from '../../api/invoices'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Company } from '../../data/types'
import { Banner, Btn, Card, Chip, Skel } from '../../kit'
import { companyBilling, latestInvoices, linkSuggestions } from '../../shared/billing'
import { fmtDay, missingBilling, statusChip } from '../../shared/invoices'
import { formatCents, formatCentsTile } from '../../shared/money'
import { UI } from '../../ui/store'

/** Billing and billing details for a company in Ardorio, on the Overview tab. Admins of Ardorio only. */
export function CompanyBilling({ company }: { company: Company }) {
  useStore()
  const show = Q.canBill() && !!Q.rel(company.id, 'ard')
  const inv = useLoad(s => (show ? listInvoices({ companyId: company.id }, s).then(r => r.invoices) : Promise.resolve([] as InvoiceDto[])), `co:${company.id}:${show}`)
  const clients = useLoad(s => (show ? listBillingClients(s).then(r => r.clients) : Promise.resolve([] as BillingClient[])), `clients:${show}`)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [fail, setFail] = useState('')
  if (!show) return null

  const list = inv.data ?? []
  const t = companyBilling(list)
  const client = (clients.data ?? []).find(c => c.linkedCompanyId === company.id)
  const suggestions = client ? [] : linkSuggestions(company, clients.data ?? [], dismissed)
  const lacks = missingBilling(client)
  const denied = [inv.error, clients.error].some(e => e && invoiceError(e, 'load').kind === 'denied')
  if (denied) return null

  /** Every link is a click: nothing here runs on load. */
  const link = async (slug: string): Promise<void> => {
    setBusy(slug)
    setFail('')
    try {
      await linkBillingClient(slug, company.id)
      clients.reload()
    } catch (e) {
      setFail(invoiceError(e, 'save').message)
    } finally {
      setBusy('')
    }
  }
  const create = async (): Promise<void> => {
    setBusy('create')
    setFail('')
    try {
      const c = await createBillingClient({ clientName: company.name, billing: {} })
      await linkBillingClient(c.slug, company.id)
      clients.reload()
    } catch (e) {
      setFail(invoiceError(e, 'save').message)
      clients.reload()
    } finally {
      setBusy('')
    }
  }
  const tile = (label: string, cents: number) => (
    <div><div className="faint sm">{label}</div><div className="b money" style={{ fontSize: 18 }}>{formatCentsTile(cents)}</div></div>
  )

  return (
    <>
      <Card title="Billing" style={{ borderColor: 'var(--acc-line)' }} right={<Btn size="sm" kind="pri" onClick={() => UI.nav('invoice', { id: 'new', q: { companyId: company.id } })}>New invoice</Btn>}>
        {inv.loading && !inv.data ? <Skel rows={3} /> : (
          <div className="col" style={{ gap: 14 }}>
            {inv.error != null && <Banner tone="bad" action={<Btn size="sm" onClick={inv.reload}>Try again</Btn>}>{invoiceError(inv.error, 'load').message}</Banner>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {tile('Invoiced', t.invoicedCents)}
              {tile('Paid', t.paidCents)}
              {tile('Outstanding', t.outstandingCents)}
              {tile('Overdue', t.overdueCents)}
            </div>
            <div className="faint sm">Ex GST. Includes issued invoices only, not drafts.</div>
            <div>
              <div className="faint sm" style={{ marginBottom: 4 }}>Latest invoices</div>
              {list.length === 0 && <div className="faint sm">No invoices for this company yet.</div>}
              {latestInvoices(list, 5).map(i => {
                const c = statusChip(i)
                return (
                  <div key={i.id} className="rowx">
                    <span><a className="mono" href={`/sales/invoices/${i.id}`} onClick={ev => { ev.preventDefault(); UI.nav('invoice', { id: i.id }) }}>{i.invoiceNumber}</a>{' '}
                      <span className="faint sm">{i.status === 'paid' ? `paid ${fmtDay(i.payment?.paidAt)}` : i.status === 'sent' ? `due ${fmtDay(i.dueDate)}` : i.status === 'void' ? `cancelled ${fmtDay(i.voided?.voidedAt)}` : 'not issued'}</span></span>
                    <span><Chip tone={c.tone} icon={c.icon}>{c.label}</Chip> <span className={'money sm' + (i.status === 'void' ? ' strike' : '')}>{formatCents(i.totalCents)}</span></span>
                  </div>
                )
              })}
            </div>
            <div className="row"><a href="/sales/invoices" className="sm" onClick={ev => { ev.preventDefault(); UI.nav('invoices') }}>All invoices</a><span className="sp" /><a href="/sales/customers" className="sm" onClick={ev => { ev.preventDefault(); UI.nav('customers', { q: { product: 'ard' } }) }}>See on Customers ›</a></div>
          </div>
        )}
      </Card>

      <Card
        title="Billing details"
        right={client && <Btn size="sm" onClick={() => UI.open('billingDetails', { companyId: company.id, client, onSaved: () => clients.reload() })}>Edit</Btn>}
      >
        {clients.loading && !clients.data ? <Skel rows={2} /> : client ? (
          <div className="col" style={{ gap: 8 }}>
            <div className="row"><b>{client.clientName}</b><Chip tone={lacks.length ? 'warn' : 'ok'}>{lacks.length ? `Missing ${lacks.join(', ')}` : 'Complete'}</Chip></div>
            <div className="rowx"><span className="muted">Contact</span><span>{client.billing.contactName || '—'}</span></div>
            <div className="rowx"><span className="muted">Email</span><span className="mono sm">{client.billing.email || '—'}</span></div>
            <div className="rowx"><span className="muted">ABN</span><span className="mono">{client.billing.abn || '—'}</span></div>
            <div className="rowx"><span className="muted">Address</span><span style={{ textAlign: 'right', whiteSpace: 'pre-line' }}>{client.billing.address || '—'}</span></div>
            <div className="faint sm">Used on invoices. Only Ardorio admins can see this card.</div>
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {fail && <Banner tone="bad">{fail}</Banner>}
            {clients.error != null && <Banner tone="bad" action={<Btn size="sm" onClick={clients.reload}>Try again</Btn>}>{invoiceError(clients.error, 'load').message}</Banner>}
            <div className="sm muted">No billing client is linked to {company.name} yet. Invoices need one for the name, email, ABN and address.</div>
            {suggestions.map(s => (
              <div key={s.client.slug} className="rowx">
                <span><b>{s.client.clientName}</b><div className="faint sm">{s.reasons.join(' · ')}</div></span>
                <span className="row" style={{ gap: 6 }}>
                  <Btn size="sm" kind="pri" disabled={!!busy} onClick={() => void link(s.client.slug)}>Link</Btn>
                  <Btn size="sm" disabled={!!busy} onClick={() => setDismissed(new Set([...dismissed, s.client.slug]))}>Not it</Btn>
                </span>
              </div>
            ))}
            <div><Btn size="sm" disabled={!!busy} onClick={() => void create()}>{busy === 'create' ? 'Creating…' : `Create billing client from "${company.name}"`}</Btn></div>
          </div>
        )}
      </Card>
    </>
  )
}
