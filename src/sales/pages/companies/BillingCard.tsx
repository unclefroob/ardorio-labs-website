import { useEffect, useRef } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError, listInvoices } from '../../api/invoices'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Company } from '../../data/types'
import { Banner, Btn, Card, Chip, Skel } from '../../kit'
import { companyBilling, latestInvoices } from '../../shared/billing'
import { fmtDay, missingBilling, statusChip } from '../../shared/invoices'
import { formatCents, formatCentsTile } from '../../shared/money'
import { UI } from '../../ui/store'
import { useBillingLink } from './useBillingLink'
import { invoiceRef } from '../../shared/externalInvoices'
import { ExternalChip } from '../invoices/parts'

/** Billing and billing details for a company in Ardorio, on the Overview tab. Admins of Ardorio only. */
export function CompanyBilling({ company, focusDetails = false }: { company: Company; focusDetails?: boolean }) {
  useStore()
  // Ardorio's billing, in a workspace that includes Ardorio (not under Rosterio's name).
  const show = Q.canBill() && !!Q.rel(company.id, 'ard') && Q.inScope('ard')
  const inv = useLoad(s => (show ? listInvoices({ companyId: company.id }, s).then(r => r.invoices) : Promise.resolve([] as InvoiceDto[])), `co:${company.id}:${show}`)
  const { clients, client, suggestions, dismiss, busy, fail, link, create } = useBillingLink(company, show)
  // Arrived from a "needs a billing client" notification: bring Billing details into view and put focus on it, once.
  const details = useRef<HTMLDivElement>(null)
  const focused = useRef(false)
  const ready = show && !!clients.data
  useEffect(() => {
    if (!focusDetails || !ready || focused.current || !details.current) return
    focused.current = true
    details.current.scrollIntoView?.({ block: 'start' })
    details.current.focus()
  }, [focusDetails, ready])
  if (!show) return null

  const list = inv.data ?? []
  const t = companyBilling(list)
  const lacks = missingBilling(client)
  const denied = [inv.error, clients.error].some(e => e && invoiceError(e, 'load').kind === 'denied')
  if (denied) return null

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
            <div className="faint sm">Ex GST. Includes issued invoices only, not drafts, and invoices or payments recorded externally.</div>
            <div>
              <div className="faint sm" style={{ marginBottom: 4 }}>Latest invoices</div>
              {list.length === 0 && <div className="faint sm">No invoices for this company yet.</div>}
              {latestInvoices(list, 5).map(i => {
                const c = statusChip(i)
                return (
                  <div key={i.id} className="rowx">
                    <span><a className="mono" href={`/sales/invoices/${i.id}`} onClick={ev => { ev.preventDefault(); UI.nav('invoice', { id: i.id }) }}>{invoiceRef(i)}</a>{' '}{i.source === 'external' && <><ExternalChip inv={i} />{' '}</>}
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

      <div ref={details} tabIndex={-1} role="region" aria-label="Billing details" id="billing-details">
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
                    <Btn size="sm" disabled={!!busy} onClick={() => dismiss(s.client.slug)}>Not it</Btn>
                  </span>
                </div>
              ))}
              <div><Btn size="sm" disabled={!!busy} onClick={() => void create()}>{busy === 'create' ? 'Creating…' : `Create billing client from "${company.name}"`}</Btn></div>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
