import { Fragment, useState, type CSSProperties, type ReactNode } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError, listInvoices } from '../../api/invoices'
import { useLoad } from '../../data/invoicing'
import { S, useStore } from '../../data/store'
import { Banner, Btn, Card, Chip, CoLink, DataTable, DlLink, Empty, Icon, Link, Skel, Tabs, type Col } from '../../kit'
import {
  ardorioByDeal, ENGAGEMENT_LABEL, sortArdorio,
  type ArdorioCompanyRow, type ArdorioDealRow, type ArdorioSortKey, type DeliveredNotInvoiced, type UnscheduledValue,
} from '../../shared/billing'
import { fmtDay, withoutTest } from '../../shared/invoices'
import { EXTERNAL_CHIP, invoiceRef } from '../../shared/externalInvoices'
import { formatCents, formatCentsTile } from '../../shared/money'
import { UI } from '../../ui/store'
import { ExternalChip, StatusChip } from '../invoices/parts'

type View = 'deals' | 'delivered' | 'unscheduled' | 'unlinked'
const VIEWS: readonly View[] = ['deals', 'delivered', 'unscheduled', 'unlinked']

const fmt = formatCents
const sortBtn: CSSProperties = { background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }
const dash = <span className="faint">—</span>
const dealName = (r: { deal: { title: string; name: string } }): string => r.deal.title || r.deal.name
const billingTab = (id: string): void => UI.nav('deal', { id, q: { tab: 'billing' } })

/** "Phase 2 integrations · 3 Nov 2026 · $6,000.00", or a dash. */
function NextDue({ r }: { r: ArdorioDealRow }) {
  const m = r.next
  const gap = r.money.unscheduled
  return (
    <span className="row wrap" style={{ gap: 6 }}>
      {m ? <span>{m.label} <span className="faint sm money">· {m.plannedDate ? fmtDay(m.plannedDate) : 'no date'} · {fmt(m.amountCents)}</span></span> : dash}
      {gap !== null && gap > 0 && <Chip tone="warn">{fmt(gap)} unscheduled</Chip>}
    </span>
  )
}

/** The Ardorio view of Customers: money per company and per deal, ex GST. Admins of Ardorio only; others see the won-deal view. */
export function ArdorioCustomers() {
  useStore()
  const list = useLoad(s => listInvoices({}, s).then(r => r.invoices), 'ard-invoices')
  const [view, setView] = useState<View>('deals')
  const [sort, setSort] = useState<[ArdorioSortKey, 1 | -1]>(['outstanding', -1])
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())

  if (list.error) {
    const e = invoiceError(list.error, 'load')
    return (
      <Card pad={false}>
        <Empty icon={e.kind === 'denied' ? 'lock' : 'alert'} title={e.kind === 'denied' ? 'Invoices are for Ardorio admins' : "Couldn't load Ardorio revenue"} body={e.message}
          action={e.kind === 'denied' ? undefined : <Btn onClick={() => list.reload()}>Try again</Btn>} />
      </Card>
    )
  }
  if (!list.data) return <Skel rows={5} />

  const all = ardorioByDeal(S.deals, S.companies, S.billingPlans, list.data)
  const rows = sortArdorio(all.companies, sort[0], sort[1])
  const t = all.tiles
  const dealCount = all.companies.reduce((a, r) => a + r.deals.length, 0)
  // Invoices and payments recorded outside SalesOS count in the figures like any other; each customer row names them.
  const external = new Map<string, string[]>()
  for (const i of withoutTest(list.data)) {
    if (i.source !== 'external' || i.status === 'void' || !i.companyId) continue
    external.set(i.companyId, [...(external.get(i.companyId) ?? []), invoiceRef(i)])
  }

  const toggle = (id: string): void => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const head = (k: ArdorioSortKey, label: string, right = true): ReactNode => {
    const on = sort[0] === k
    return (
      <th scope="col" className="s" style={{ textAlign: right ? 'right' : undefined }} aria-sort={on ? (sort[1] > 0 ? 'ascending' : 'descending') : undefined}>
        <button type="button" style={sortBtn} onClick={() => setSort(on ? [k, (-sort[1]) as 1 | -1] : [k, k === 'name' ? 1 : -1])}>
          {label}
          {on && <Icon n={sort[1] > 0 ? 'up' : 'down'} s={11} style={{ marginLeft: 3 }} />}
        </button>
      </th>
    )
  }

  const companyRow = (r: ArdorioCompanyRow): ReactNode => {
    const isOpen = open.has(r.companyId)
    const n = r.deals.length
    const refs = external.get(r.companyId) ?? []
    return (
      <tr key={r.companyId} data-company={r.companyId} style={{ background: 'var(--surf2)' }}>
        <td>
          <span className="row" style={{ gap: 6 }}>
            {n > 0
              ? <Btn kind="ghost" size="sm" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${r.name}`} onClick={() => toggle(r.companyId)} icon={isOpen ? 'down' : 'right'} />
              : <span style={{ width: 28, display: 'inline-block' }} aria-hidden="true" />}
            <b><CoLink id={r.companyId} /></b>
            <span className="sm muted">{n === 0 ? 'No won deal' : `${n} deal${n === 1 ? '' : 's'}`}</span>
          </span>
          {refs.length > 0 && (
            <span className="row wrap" style={{ gap: 6, marginTop: 2, paddingLeft: 34 }}>
              <Chip tone="info" icon="ext">{EXTERNAL_CHIP}</Chip>
              <span className="faint sm mono">{refs.slice(0, 2).join(', ')}{refs.length > 2 ? ` and ${refs.length - 2} more` : ''}</span>
            </span>
          )}
        </td>
        <td className="money b" style={{ textAlign: 'right' }}>
          {fmt(r.contractedCents)}
          {r.estimateOnlyCents > 0 && <div className="sm muted">+ {fmt(r.estimateOnlyCents)} estimate</div>}
        </td>
        <td className="money" style={{ textAlign: 'right' }}>{fmt(r.earnedCents)}</td>
        <td className="money" style={{ textAlign: 'right' }}>
          {fmt(r.invoicedCents)}
          {r.retainerInvoicedCents > 0 && <div className="sm muted">incl. retainer {fmt(r.retainerInvoicedCents)}</div>}
        </td>
        <td className="money" style={{ textAlign: 'right' }}>{fmt(r.collectedCents)}</td>
        <td className="money" style={{ textAlign: 'right' }}>
          <span className={'b' + (r.overdueCents > 0 ? ' over' : '')}>{fmt(r.outstandingCents)}</span>
          {r.overdueCents > 0 && <> <Chip tone="bad">Overdue {fmt(r.overdueCents)}</Chip></>}
        </td>
        <td />
      </tr>
    )
  }

  const dealRows = (r: ArdorioDealRow): ReactNode => {
    const m = r.money
    const dni = r.deliveredNotInvoiced.reduce((a, x) => a + x.amountCents, 0)
    const complete = m.contracted !== null && m.contracted > 0 && m.collected >= m.contracted && m.outstanding === 0
    return (
      <Fragment key={r.deal.id}>
        <tr data-deal={r.deal.id}>
          <td style={{ paddingLeft: 46 }}>
            <span className="row wrap" style={{ gap: 6 }}>
              <Link to="deal" id={r.deal.id} q={{ tab: 'billing' }}>{dealName(r)}</Link>
              {dni > 0 && <Chip tone="acc">Delivered, not invoiced {fmt(dni)}</Chip>}
              {complete && <Chip tone="ok">Complete</Chip>}
            </span>
            <div className="sm muted">{r.engagement ? ENGAGEMENT_LABEL[r.engagement] : 'No contract yet'}</div>
          </td>
          <td className="money" style={{ textAlign: 'right' }}>
            {m.contracted !== null ? fmt(m.contracted) : (
              <>
                <span><Chip>Estimate</Chip> {fmt(m.estimate)}</span>
                <div className="sm"><Link to="deal" id={r.deal.id} q={{ tab: 'billing' }}>Add contract</Link></div>
              </>
            )}
          </td>
          <td className="money" style={{ textAlign: 'right' }}>{fmt(m.earned)}</td>
          <td className="money" style={{ textAlign: 'right' }}>{fmt(m.invoiced)}</td>
          <td className="money" style={{ textAlign: 'right' }}>{fmt(m.collected)}</td>
          <td className="money" style={{ textAlign: 'right' }}>
            <span className={r.overdueCents > 0 ? 'over' : ''}>{fmt(m.outstanding)}</span>
            {r.overdueCents > 0 && <> <Chip tone="bad">Overdue</Chip></>}
          </td>
          <td><NextDue r={r} /></td>
        </tr>
        {r.retainer && (
          <tr data-retainer={r.deal.id}>
            <td style={{ paddingLeft: 62 }}><span className="sm">Retainer</span> <span className="sm muted">support, not project progress</span></td>
            <td style={{ textAlign: 'right' }}>{dash}</td>
            <td style={{ textAlign: 'right' }}>{dash}</td>
            <td className="money sm" style={{ textAlign: 'right' }}>{fmt(r.retainer.invoiced)}</td>
            <td className="money sm" style={{ textAlign: 'right' }}>{fmt(r.retainer.collected)}</td>
            <td className="money sm" style={{ textAlign: 'right' }}>{fmt(r.retainer.outstanding)}</td>
            <td />
          </tr>
        )}
      </Fragment>
    )
  }

  const dniRows = all.deliveredNotInvoiced.map(x => ({ ...x, id: `${x.deal.id}:${x.milestone.id}` }))
  const dniCols: Col<DeliveredNotInvoiced & { id: string }>[] = [
    { k: 'co', l: 'Customer', sort: x => S.companies.find(c => c.id === x.companyId)?.name ?? '', r: x => <b><CoLink id={x.companyId} /></b> },
    { k: 'deal', l: 'Deal', sort: x => dealName(x), r: x => <DlLink id={x.deal.id} /> },
    { k: 'ms', l: 'Milestone', sort: x => x.milestone.label, r: x => x.milestone.label },
    { k: 'amt', l: 'Amount (ex GST)', right: true, sort: x => x.milestone.amountCents, r: x => <span className="money">{fmt(x.milestone.amountCents)}</span> },
    { k: 'on', l: 'Delivered', sort: x => x.milestone.deliveredOn ?? '', r: x => (x.milestone.deliveredOn ? fmtDay(x.milestone.deliveredOn) : dash) },
    {
      k: 'go', l: '', nosort: true,
      r: x => <Btn size="xs" kind="pri" onClick={() => UI.nav('invoice', { id: 'new', q: { companyId: x.companyId, dealId: x.deal.id, milestoneId: x.milestone.id } })}>Draft invoice</Btn>,
    },
  ]
  const gapRows = all.unscheduled.map(x => ({ ...x, id: x.deal.id }))
  const gapCols: Col<UnscheduledValue & { id: string }>[] = [
    { k: 'co', l: 'Customer', sort: x => S.companies.find(c => c.id === x.companyId)?.name ?? '', r: x => <b><CoLink id={x.companyId} /></b> },
    { k: 'deal', l: 'Deal', sort: x => dealName(x), r: x => <DlLink id={x.deal.id} /> },
    { k: 'con', l: 'Contracted', right: true, sort: x => x.contractedCents, r: x => <span className="money">{fmt(x.contractedCents)}</span> },
    { k: 'sch', l: 'In milestones', right: true, sort: x => x.scheduledCents, r: x => <span className="money">{fmt(x.scheduledCents)}</span> },
    { k: 'gap', l: 'Unscheduled', right: true, desc: true, sort: x => x.gapCents, r: x => <span className="money b">{fmt(x.gapCents)}</span> },
    { k: 'go', l: '', nosort: true, r: x => <Btn size="xs" onClick={() => billingTab(x.deal.id)}>Open billing</Btn> },
  ]
  const unCols: Col<InvoiceDto>[] = [
    { k: 'num', l: 'Invoice', sort: i => invoiceRef(i), r: i => <span className="row wrap" style={{ gap: 6 }}><span className="mono">{invoiceRef(i)}</span><ExternalChip inv={i} /></span> },
    { k: 'co', l: 'Customer', sort: i => i.clientName, r: i => (i.companyId ? <CoLink id={i.companyId} /> : <span>{i.clientName} <Chip tone="warn">No company</Chip></span>) },
    { k: 'deal', l: 'Deal', nosort: true, r: i => (i.dealId ? <DlLink id={i.dealId} /> : <Chip tone="warn">No deal</Chip>) },
    { k: 'st', l: 'Status', sort: i => i.status, r: i => <StatusChip inv={i} /> },
    { k: 'iss', l: 'Issued', sort: i => i.issueDate, r: i => fmtDay(i.issueDate) },
    { k: 'amt', l: 'Amount (ex GST)', right: true, sort: i => i.subtotalCents, r: i => <span className="money">{fmt(i.subtotalCents)}</span> },
    { k: 'go', l: '', nosort: true, r: i => <Btn size="xs" onClick={() => UI.nav('invoice', { id: i.id })}>Open</Btn> },
  ]

  const dniTotal = all.deliveredNotInvoiced.reduce((a, x) => a + x.milestone.amountCents, 0)
  const gapTotal = all.unscheduled.reduce((a, x) => a + x.gapCents, 0)

  return (
    <>
      <div className="grid g5" style={{ marginBottom: 14 }}>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Contracted</span><span className="v num">{formatCentsTile(t.contractedCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Earned</span><span className="v num">{formatCentsTile(t.earnedCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Invoiced</span><span className="v num">{formatCentsTile(t.invoicedCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Collected</span><span className="v num">{formatCentsTile(t.collectedCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}>
          <span className="l">Outstanding</span>
          <span className="row wrap"><span className="v num">{formatCentsTile(t.outstandingCents)}</span>{t.overdueCents > 0 && <Chip tone="bad">{formatCentsTile(t.overdueCents)} overdue · {t.overdueCustomers} customer{t.overdueCustomers === 1 ? '' : 's'}</Chip>}</span>
        </div>
      </div>
      <Tabs
        value={view}
        onChange={k => setView(VIEWS.find(v => v === k) ?? 'deals')}
        tabs={[
          ['deals', 'All deals', dealCount],
          ['delivered', `Delivered, not invoiced${dniTotal > 0 ? ` · ${formatCentsTile(dniTotal)}` : ''}`, all.deliveredNotInvoiced.length],
          ['unscheduled', `Unscheduled contract value${gapTotal > 0 ? ` · ${formatCentsTile(gapTotal)}` : ''}`, all.unscheduled.length],
          ['unlinked', 'Unlinked invoices', all.unlinked.length],
        ]}
      />
      {view === 'deals' && (
        rows.length === 0 ? (
          <Card pad={false}><Empty icon="dollar" title="No Ardorio customers yet" body="A customer is a company with an issued invoice or a won deal." action={<Btn size="sm" onClick={() => UI.nav('deals')}>Go to Deals</Btn>} /></Card>
        ) : (
          <Card pad={false}>
            <div className="tw">
              <table className="tbl" aria-label="Ardorio customers by deal">
                <thead>
                  <tr>
                    {head('name', 'Company / deal', false)}
                    {head('contracted', 'Contracted')}
                    {head('earned', 'Earned')}
                    {head('invoiced', 'Invoiced')}
                    {head('collected', 'Collected')}
                    {head('outstanding', 'Outstanding')}
                    <th scope="col">Next milestone due</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <Fragment key={r.companyId}>
                      {companyRow(r)}
                      {open.has(r.companyId) && r.deals.map(dealRows)}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}
      {view === 'delivered' && (
        <Card pad={false}><DataTable cols={dniCols} rows={dniRows} page={50} empty={<Empty icon="check" title="Every delivered milestone has an invoice" body="Delivered milestones with no invoice yet appear here, so earned money is billed." />} /></Card>
      )}
      {view === 'unscheduled' && (
        <Card pad={false}><DataTable cols={gapCols} rows={gapRows} page={50} sortInit={['gap', -1]} empty={<Empty icon="check" title="Every contract is fully scheduled" body="Won deals whose milestones add up to less than the contract appear here, with the gap." />} /></Card>
      )}
      {view === 'unlinked' && (
        <Card pad={false}><DataTable cols={unCols} rows={all.unlinked} page={50} empty={<Empty icon="check" title="Every invoice is linked to a deal" body="Invoices with no deal or no company appear here. They count for the company but not for any deal." />} /></Card>
      )}
      <div className="faint sm" style={{ marginTop: 10 }}>
        Contracted = baseline plus approved variations. Earned counts delivered milestones. A deal&apos;s Invoiced, Collected and Outstanding are its project invoices, as on the deal page; a company&apos;s include retainer invoices and invoices not linked to a deal. Drafts, cancelled and test invoices are left out; invoices recorded externally count. Ex GST, as recorded in SalesOS; Xero is the books.
      </div>
      {all.unlinked.some(i => !i.companyId) && <Banner tone="warn">Some invoices have no company, so they are not in any customer&apos;s figures. See Unlinked invoices.</Banner>}
    </>
  )
}
