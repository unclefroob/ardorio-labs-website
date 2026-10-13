import { useState } from 'react'
import { invoiceError, invoiceSummary, listInvoices } from '../../api/invoices'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Deal } from '../../data/types'
import { Banner, Btn, Card, Chip, CoLink, DataTable, DlLink, Empty, Skel, Tabs, type Col } from '../../kit'
import { ardorioCustomers, ardorioTiles, wonNotInvoiced, type ArdorioCustomer } from '../../shared/billing'
import { METHOD_LABELS, fmtDay, withoutTest } from '../../shared/invoices'
import { EXTERNAL_CHIP, invoiceRef } from '../../shared/externalInvoices'
import { formatCents, formatCentsTile } from '../../shared/money'
import { UI } from '../../ui/store'

/** The Ardorio view of Customers: revenue from invoices, ex GST. Admins of Ardorio only; others see the won-deal view. */
export function ArdorioCustomers() {
  useStore()
  const sum = useLoad(s => invoiceSummary(s), 'ard-summary')
  const list = useLoad(s => listInvoices({}, s).then(r => r.invoices), 'ard-invoices')
  const [tab, setTab] = useState<'customers' | 'unbilled'>('customers')

  const err = sum.error ?? list.error
  if (err) {
    const e = invoiceError(err, 'load')
    return (
      <Card pad={false}>
        <Empty icon={e.kind === 'denied' ? 'lock' : 'alert'} title={e.kind === 'denied' ? 'Invoices are for Ardorio admins' : "Couldn't load Ardorio revenue"} body={e.message}
          action={e.kind === 'denied' ? undefined : <Btn onClick={() => { sum.reload(); list.reload() }}>Try again</Btn>} />
      </Card>
    )
  }
  if (!sum.data || !list.data) return <Skel rows={5} />

  const tiles = ardorioTiles(sum.data.byCompany)
  const deals = S.deals.filter(d => d.archived !== true)
  const rows = ardorioCustomers(sum.data.byCompany, deals, S.companies, S.billingPlans)
  const unbilled = wonNotInvoiced(deals, S.companies, list.data)
  // Invoices and payments recorded outside SalesOS count in the figures like any other; each customer row names them.
  const external = new Map<string, string[]>()
  for (const i of withoutTest(list.data)) {
    if (i.source !== 'external' || i.status === 'void' || !i.companyId) continue
    external.set(i.companyId, [...(external.get(i.companyId) ?? []), invoiceRef(i)])
  }

  const cols: Col<ArdorioCustomer>[] = [
    {
      k: 'name', l: 'Customer', sort: r => r.name.toLowerCase(),
      r: r => {
        const refs = external.get(r.companyId) ?? []
        return (
          <span>
            <b><CoLink id={r.companyId} /></b>{r.overdueCents > 0 && <> <Chip tone="bad">Overdue</Chip></>}
            {refs.length > 0 && (
              <span className="row wrap" style={{ gap: 6, marginTop: 2 }}>
                <Chip tone="info" icon="ext">{EXTERNAL_CHIP}</Chip>
                <span className="faint sm mono">{refs.slice(0, 2).join(', ')}{refs.length > 2 ? ` and ${refs.length - 2} more` : ''}</span>
              </span>
            )}
          </span>
        )
      },
    },
    {
      k: 'won', l: 'Won deals', right: true, sort: r => r.wonDeals,
      r: r => (r.wonDeals ? <span className="money">{r.wonDeals} <span className="faint sm">· {r.retainer ? 'retainer' : formatCentsTile(Math.round(r.wonValue * 100))}</span></span> : <span className="faint">No deal</span>),
    },
    { k: 'inv', l: 'Invoiced', right: true, sort: r => r.invoicedCents, r: r => <span className="money">{formatCents(r.invoicedCents)}</span> },
    { k: 'paid', l: 'Paid', right: true, sort: r => r.paidCents, r: r => <span className="money">{formatCents(r.paidCents)}</span> },
    { k: 'out', l: 'Outstanding', right: true, sort: r => r.outstandingCents, desc: true, r: r => <span className={'money b' + (r.overdueCents > 0 ? ' over' : '')}>{formatCents(r.outstandingCents)}</span> },
    { k: 'last', l: 'Last payment', sort: r => r.lastPaymentAt ?? '', r: r => (r.lastPaymentAt ? fmtDay(r.lastPaymentAt) : <span className="faint">—</span>) },
    { k: 'method', l: 'Method', sort: r => r.lastPaymentMethod ?? '', r: r => (r.lastPaymentMethod ? <Chip>{METHOD_LABELS[r.lastPaymentMethod]}</Chip> : <span className="faint">—</span>) },
  ]
  const uCols: Col<Deal>[] = [
    { k: 'co', l: 'Customer', sort: d => Q.company(d.companyId)?.name ?? '', r: d => <b><CoLink id={d.companyId} /></b> },
    { k: 'deal', l: 'Won deal', sort: d => d.title || d.name, r: d => <DlLink id={d.id} /> },
    { k: 'val', l: 'Value (ex GST)', right: true, sort: d => d.value, r: d => <span className="money">{formatCentsTile(Math.round(d.value * 100))}</span> },
    { k: 'won', l: 'Won on', sort: d => d.closedAt ?? d.stageChangedAt, desc: true, r: d => F.date(d.closedAt ?? d.stageChangedAt) },
    { k: 'go', l: '', nosort: true, r: d => <Btn size="xs" onClick={() => UI.nav('deal', { id: d.id, q: { tab: 'billing' } })}>Open billing</Btn> },
  ]

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Invoiced</span><span className="v num">{formatCentsTile(tiles.invoicedCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Paid</span><span className="v num">{formatCentsTile(tiles.paidCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Outstanding</span><span className="v num">{formatCentsTile(tiles.outstandingCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}>
          <span className="l">Overdue</span>
          <span className="row"><span className="v num over">{formatCentsTile(tiles.overdueCents)}</span>{tiles.overdueCustomers > 0 && <Chip tone="bad">{tiles.overdueCustomers} customer{tiles.overdueCustomers === 1 ? '' : 's'}</Chip>}</span>
        </div>
      </div>
      <Tabs value={tab} onChange={k => setTab(k === 'unbilled' ? 'unbilled' : 'customers')} tabs={[['customers', 'Customers', rows.length], ['unbilled', 'Won, not yet invoiced', unbilled.length]]} />
      {tab === 'customers' ? (
        <Card pad={false}><DataTable cols={cols} rows={rows} rowKey="companyId" page={50} empty={<Empty icon="dollar" title="No Ardorio customers yet" body="A customer is a company with an issued invoice or a won deal." action={<Btn size="sm" onClick={() => UI.nav('deals')}>Go to Deals</Btn>} />} /></Card>
      ) : (
        <Card pad={false}><DataTable cols={uCols} rows={unbilled} page={50} empty={<Empty icon="check" title="Every won deal has an invoice" body="Won Ardorio deals with no invoice at all appear here." />} /></Card>
      )}
      <div className="faint sm" style={{ marginTop: 10 }}>Customers are CRM companies with at least one issued invoice or a won deal. Invoice figures cover issued invoices only, not drafts, ex GST, including invoices and payments recorded externally.</div>
      {list.error != null && <Banner tone="bad">{invoiceError(list.error, 'load').message}</Banner>}
    </>
  )
}
