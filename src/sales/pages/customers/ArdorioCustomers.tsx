import { Fragment, useState, type CSSProperties, type ReactNode } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError, listInvoices } from '../../api/invoices'
import { useLoad } from '../../data/invoicing'
import { S, useStore } from '../../data/store'
import { Banner, Btn, Card, Chip, CoLink, DataTable, DlLink, Empty, Icon, Link, Skel, Tabs, type Col } from '../../kit'
import {
  ardorioByDeal, ENGAGEMENT_LABEL, sortArdorio, UNLINKED_LABEL,
  type ArdorioCompanyRow, type ArdorioDealRow, type ArdorioSortKey, type DeliveredNotInvoiced, type InvoiceMoney, type NoContractDeal, type UnscheduledValue,
} from '../../shared/billing'
import { fmtDay, withoutTest } from '../../shared/invoices'
import { EXTERNAL_CHIP, invoiceRef } from '../../shared/externalInvoices'
import { formatCents, formatCentsTile } from '../../shared/money'
import { notCommittedLabel, renewalDue, termLine, termStateText } from '../../shared/termMoney'
import { F } from '../../data/F'
import { UI } from '../../ui/store'
import { ExternalChip, StatusChip } from '../invoices/parts'

type View = 'deals' | 'delivered' | 'unscheduled' | 'nocontract' | 'unlinked'
const VIEWS: readonly View[] = ['deals', 'delivered', 'unscheduled', 'nocontract', 'unlinked']

const fmt = formatCents
const sortBtn: CSSProperties = { background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }
const dash = <span className="faint">—</span>
const dealName = (r: { deal: { title: string; name: string } }): string => r.deal.title || r.deal.name
const billingTab = (id: string): void => UI.nav('deal', { id, q: { tab: 'billing' } })

/** "Phase 2 integrations · 3 Nov 2026 · $6,000.00", or a dash. */
function NextDue({ r }: { r: ArdorioDealRow }) {
  const m = r.next
  const gap = r.unscheduledCents
  return (
    <span className="row wrap" style={{ gap: 6 }}>
      {m ? <span>{m.label} <span className="faint sm money">· {m.plannedDate ? fmtDay(m.plannedDate) : 'no date'} · {fmt(m.amountCents)}</span></span> : dash}
      {gap > 0 && <Chip tone="warn">{fmt(gap)} unscheduled</Chip>}
    </span>
  )
}

type Fig = 'invoiced' | 'collected' | 'outstanding'

/**
 * The money of a company kept apart from its project figures: retainer invoices and invoices not on a won deal, each
 * labelled, so the row's own figure stays the sum of its deals (board 7) and nothing issued goes unseen.
 */
function Apart({ r, k }: { r: Pick<ArdorioCompanyRow, 'retainer' | 'notOnDeal'>; k: Fig }) {
  const line = (m: InvoiceMoney, label: string): ReactNode => m[k] > 0 && (
    <div className="sm muted">+ {label} {fmt(m[k])}{k === 'outstanding' && m.overdue > 0 && <span className="over"> · {fmt(m.overdue)} overdue</span>}</div>
  )
  return <>{line(r.retainer, 'retainer')}{line(r.notOnDeal, 'not on a deal')}</>
}

/** "Retainer A$1,200 invoiced" and the like, for the line under the tiles; empty when the bucket is empty. */
function apartText(m: InvoiceMoney, label: string): string | null {
  if (m.invoiced === 0) return null
  return `${label} ${formatCentsTile(m.invoiced)} invoiced, ${formatCentsTile(m.collected)} collected, ${formatCentsTile(m.outstanding)} outstanding${m.overdue > 0 ? ` (${formatCentsTile(m.overdue)} overdue)` : ''}`
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

  const all = ardorioByDeal(S.deals, S.companies, S.billingPlans, list.data, F.today())
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
            {r.terms[0]?.term && (
              <Chip tone={renewalDue(r.terms[0].term.summary) ? 'warn' : ''} icon="clock" title={termLine(r.terms[0].term.summary)}>
                {r.terms.length === 1 ? 'Term agreement' : `${r.terms.length} term agreements`}, {r.terms.length === 1 ? '' : 'next '}{termStateText(r.terms[0].term.summary)}
              </Chip>
            )}
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
          {r.notCommittedCents > 0 && <div className="sm muted" data-not-committed>of which {fmt(r.notCommittedCents)} not yet committed</div>}
        </td>
        <td className="money" style={{ textAlign: 'right' }}>{fmt(r.earnedCents)}</td>
        <td className="money" style={{ textAlign: 'right' }}>
          {fmt(r.invoicedCents)}
          <Apart r={r} k="invoiced" />
        </td>
        <td className="money" style={{ textAlign: 'right' }}>
          {fmt(r.collectedCents)}
          <Apart r={r} k="collected" />
        </td>
        <td className="money" style={{ textAlign: 'right' }}>
          <span className={'b' + (r.overdueCents > 0 ? ' over' : '')}>{fmt(r.outstandingCents)}</span>
          {r.overdueCents > 0 && <> <Chip tone="bad">Overdue {fmt(r.overdueCents)}</Chip></>}
          <Apart r={r} k="outstanding" />
        </td>
        <td />
      </tr>
    )
  }

  const dealRows = (r: ArdorioDealRow): ReactNode => {
    const m = r.money
    const dni = r.deliveredNotInvoiced.reduce((a, x) => a + x.amountCents, 0)
    const term = r.term
    const due = term ? term.dueNotInvoiced.reduce((a, x) => a + x.amountCents, 0) : 0
    const complete = m.contracted !== null && m.contracted > 0 && m.collected >= m.contracted && m.outstanding === 0
    return (
      <Fragment key={r.deal.id}>
        <tr data-deal={r.deal.id}>
          <td style={{ paddingLeft: 46 }}>
            <span className="row wrap" style={{ gap: 6 }}>
              <Link to="deal" id={r.deal.id} q={{ tab: 'billing' }}>{dealName(r)}</Link>
              {dni > 0 && <Chip tone="acc">Delivered, not invoiced {fmt(dni)}</Chip>}
              {due > 0 && <Chip tone="acc" icon="alert">Instalment due, not invoiced {fmt(due)}</Chip>}
              {term && renewalDue(term.summary) && <Chip tone="warn" icon="clock">Renewal: {termStateText(term.summary)}</Chip>}
              {complete && <Chip tone="ok">Complete</Chip>}
            </span>
            <div className="sm muted">{r.engagement ? ENGAGEMENT_LABEL[r.engagement] : 'No contract yet'}</div>
            {term && <div className="sm muted" data-term>{termLine(term.summary)}</div>}
          </td>
          <td className="money" style={{ textAlign: 'right' }}>
            {m.contracted !== null ? (
              <>
                {fmt(m.contracted)}
                {term && term.notCommittedCents > 0 && term.breakAt && <div className="sm muted" data-not-committed>{notCommittedLabel(term.breakAt)}: {fmt(term.notCommittedCents)}</div>}
              </>
            ) : (
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
    { k: 'deal', l: 'Deal', sort: x => dealName(x), r: x => <><DlLink id={x.deal.id} />{x.engagement && <div className="sm muted">{ENGAGEMENT_LABEL[x.engagement]}</div>}</> },
    { k: 'con', l: 'Contracted', right: true, sort: x => x.contractedCents, r: x => <span className="money">{fmt(x.contractedCents)}</span> },
    { k: 'sch', l: 'In milestones', right: true, sort: x => x.scheduledCents, r: x => <span className="money">{fmt(x.scheduledCents)}</span> },
    { k: 'inv', l: 'Invoiced', right: true, sort: x => x.invoicedCents, r: x => <span className="money">{fmt(x.invoicedCents)}</span> },
    { k: 'gap', l: 'Unscheduled', right: true, desc: true, sort: x => x.gapCents, r: x => <span className="money b">{fmt(x.gapCents)}</span> },
    { k: 'go', l: '', nosort: true, r: x => <Btn size="xs" onClick={() => billingTab(x.deal.id)}>Open billing</Btn> },
  ]
  const ncRows = all.noContract.map(x => ({ ...x, id: x.deal.id }))
  const ncCols: Col<NoContractDeal & { id: string }>[] = [
    { k: 'co', l: 'Customer', sort: x => S.companies.find(c => c.id === x.companyId)?.name ?? '', r: x => <b><CoLink id={x.companyId} /></b> },
    { k: 'deal', l: 'Deal', sort: x => dealName(x), r: x => <DlLink id={x.deal.id} /> },
    { k: 'won', l: 'Won', sort: x => x.wonOn, r: x => (x.wonOn ? fmtDay(x.wonOn) : dash) },
    { k: 'est', l: 'Estimate', right: true, desc: true, sort: x => x.estimateCents, r: x => <span className="money"><Chip>Estimate</Chip> {fmt(x.estimateCents)}</span> },
    { k: 'inv', l: 'Invoiced', right: true, sort: x => x.invoicedCents, r: x => (x.invoicedCents > 0 ? <span className="money">{fmt(x.invoicedCents)}</span> : <Chip tone="warn">Not invoiced</Chip>) },
    { k: 'go', l: '', nosort: true, r: x => <Btn size="xs" kind="pri" onClick={() => billingTab(x.deal.id)}>Add contract</Btn> },
  ]
  const unCols: Col<InvoiceDto>[] = [
    { k: 'num', l: 'Invoice', sort: i => invoiceRef(i), r: i => <span className="row wrap" style={{ gap: 6 }}><span className="mono">{invoiceRef(i)}</span><ExternalChip inv={i} /></span> },
    {
      k: 'co', l: 'Customer', sort: i => i.clientName,
      r: i => {
        const why = all.unlinkedReason[i.id]
        const known = i.companyId && why !== 'unknown-company' && why !== 'archived-company'
        return known ? <CoLink id={i.companyId!} /> : <span>{i.clientName} {why && <Chip tone="warn">{UNLINKED_LABEL[why]}</Chip>}</span>
      },
    },
    {
      k: 'deal', l: 'Deal', nosort: true,
      r: i => (i.dealId
        ? <span className="row wrap" style={{ gap: 6 }}><DlLink id={i.dealId} />{all.unlinkedReason[i.id] === 'deal-not-won' && <Chip tone="warn">{UNLINKED_LABEL['deal-not-won']}</Chip>}</span>
        : <Chip tone="warn">No deal</Chip>),
    },
    { k: 'st', l: 'Status', sort: i => i.status, r: i => <StatusChip inv={i} /> },
    { k: 'iss', l: 'Issued', sort: i => i.issueDate, r: i => fmtDay(i.issueDate) },
    { k: 'amt', l: 'Amount (ex GST)', right: true, sort: i => i.subtotalCents, r: i => <span className="money">{fmt(i.subtotalCents)}</span> },
    { k: 'go', l: '', nosort: true, r: i => <Btn size="xs" onClick={() => UI.nav('invoice', { id: i.id })}>Open</Btn> },
  ]

  const dniTotal = all.deliveredNotInvoiced.reduce((a, x) => a + x.milestone.amountCents, 0)
  const gapTotal = all.unscheduled.reduce((a, x) => a + x.gapCents, 0)
  const neverBilled = all.noContract.filter(x => x.invoicedCents === 0).length
  const apart = [apartText(t.retainer, 'Retainer'), apartText(t.notOnDeal, 'Not on a won deal'), apartText(t.noCustomer, 'On no customer (no company, or archived or not found)')].filter((x): x is string => !!x)

  return (
    <>
      <div className="grid g5" style={{ marginBottom: 14 }}>
        <div className="kpi" style={{ cursor: 'default' }}>
          <span className="l">Contracted</span><span className="v num">{formatCentsTile(t.contractedCents)}</span>
          {t.notCommittedCents > 0 && <span className="s">of which {formatCentsTile(t.notCommittedCents)} not yet committed (break agreements)</span>}
        </div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Earned</span><span className="v num">{formatCentsTile(t.earnedCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Invoiced</span><span className="v num">{formatCentsTile(t.invoicedCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}><span className="l">Collected</span><span className="v num">{formatCentsTile(t.collectedCents)}</span></div>
        <div className="kpi" style={{ cursor: 'default' }}>
          <span className="l">Outstanding</span>
          <span className="row wrap"><span className="v num">{formatCentsTile(t.outstandingCents)}</span>{t.overdueCents > 0 && <Chip tone="bad">{formatCentsTile(t.overdueCents)} overdue · {t.overdueCustomers} customer{t.overdueCustomers === 1 ? '' : 's'}</Chip>}</span>
        </div>
      </div>
      {apart.length > 0 && (
        <div className="sm muted" data-apart style={{ margin: '-6px 0 14px' }}>
          Project money of won deals only. Kept apart: {apart.join('; ')}. Every issued invoice: {formatCentsTile(t.all.invoiced)} invoiced, {formatCentsTile(t.all.collected)} collected, {formatCentsTile(t.all.outstanding)} outstanding, as the revenue report counts them.
        </div>
      )}
      <Tabs
        value={view}
        onChange={k => setView(VIEWS.find(v => v === k) ?? 'deals')}
        tabs={[
          ['deals', 'All deals', dealCount],
          ['delivered', `Delivered, not invoiced${dniTotal > 0 ? ` · ${formatCentsTile(dniTotal)}` : ''}`, all.deliveredNotInvoiced.length],
          ['unscheduled', `Unscheduled contract value${gapTotal > 0 ? ` · ${formatCentsTile(gapTotal)}` : ''}`, all.unscheduled.length],
          ['nocontract', `No contract yet${neverBilled > 0 ? ` · ${neverBilled} not invoiced` : ''}`, all.noContract.length],
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
        <Card pad={false}><DataTable cols={gapCols} rows={gapRows} page={50} sortInit={['gap', -1]} empty={<Empty icon="check" title="Every contract is fully scheduled" body="Won deals whose milestones add up to less than the contract appear here, with the gap. Time and materials and support retainers count what is already invoiced too." />} /></Card>
      )}
      {view === 'nocontract' && (
        <Card pad={false}><DataTable cols={ncCols} rows={ncRows} page={50} empty={<Empty icon="check" title="Every won deal has a contract" body="Won deals with no contract yet appear here, not yet invoiced first, so each gets its contracted amount." />} /></Card>
      )}
      {view === 'unlinked' && (
        <Card pad={false}><DataTable cols={unCols} rows={all.unlinked} page={50} empty={<Empty icon="check" title="Every invoice is linked to a deal" body="Invoices in no deal's figures appear here: no deal or no company, an archived or unknown company, or a deal that is not won. They are counted apart from the project figures." />} /></Card>
      )}
      <div className="faint sm" style={{ marginTop: 10 }}>
        Contracted = baseline plus approved variations; for a term agreement with a break, the instalments from the next anniversary the client can still give notice for are not yet committed. Earned counts delivered milestones and term instalments with an issued invoice (a drafted instalment is not earned until it is issued). Invoiced, Collected and Outstanding are project invoices, as on the deal page, and a company&apos;s are the sum of its deals; retainer invoices and invoices not on a won deal are shown apart, labelled. Drafts, cancelled and test invoices are left out; invoices recorded externally count. Ex GST, as recorded in SalesOS; Xero is the books.
      </div>
      {t.noCustomer.invoiced > 0 && <Banner tone="warn">{formatCentsTile(t.noCustomer.invoiced)} of issued invoices is on no customer: no company, or an archived or unknown one. See Unlinked invoices.</Banner>}
    </>
  )
}
