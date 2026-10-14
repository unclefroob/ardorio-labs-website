import { Fragment, useId, useMemo, useState, type ReactNode } from 'react'
import type { InvoiceDto } from '../../api/contract'
import { invoiceError, listInvoices } from '../../api/invoices'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Deal } from '../../data/types'
import { Banner, Bars, Btn, Card, Chip, Empty, Link, Seg, Skel } from '../../kit'
import {
  buildForecast, byFinancialYear, drillByDeal, FC_RANGES, FLAG_LABEL, forecastBars, lagLine, latestDay, parseLag, paymentLag, rangeMonths, SLIPS, summarise,
  type DealBacklog, type FcBucket, type FcEntry, type FcRange, type FcRole, type Forecast,
} from '../../shared/forecast'
import { fmtDay } from '../../shared/invoices'
import { formatCentsTile } from '../../shared/money'
import { PageHead } from '../../shared/PageHead'
import { monthName } from '../../shared/revenueReport'

const R: { textAlign: 'right' } = { textAlign: 'right' }
const fmt = formatCentsTile
const HATCH = 'ard-fc-hatch'
/** Never colour alone: the pipeline is hatched, named in the legend and in every bar's spoken label. */
const HATCH_CSS = 'repeating-linear-gradient(45deg, var(--fg3) 0 2px, transparent 2px 5px)'
const SERIES = ['Forecast invoiced', 'Forecast collected', 'Weighted pipeline'] as const
const COLORS = ['var(--b-inv)', 'var(--b-col)', `url(#${HATCH})`] as const
const ROLE_LABEL: Record<FcRole, string> = { invoiced: 'to invoice', collected: 'to collect', retainer: 'retainer to invoice', retainerCollected: 'retainer to collect', pipeline: 'weighted pipeline' }
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`
/** The keys of one table among the open rows of both. */
const sub = (open: ReadonlySet<string>, p: string): Set<string> => new Set([...open].filter(k => k.startsWith(p)).map(k => k.slice(p.length)))

/** The pipeline value shows its weighting: "$48,750 (50% of $97,500)". */
function itemAmount(e: FcEntry, role: FcRole): string {
  if (role === 'pipeline') return `${fmt(e.cents)} (${e.prob ?? 0}% of ${fmt(e.valueCents ?? 0)})`
  return fmt(e.cents)
}

function itemWhen(e: FcEntry, role: FcRole): string {
  const day = role === 'collected' || role === 'retainerCollected' ? e.collectDay : e.invoiceDay
  if (!day) return role === 'pipeline' ? 'no close date' : 'no planned date'
  return role === 'pipeline' ? `closes ${fmtDay(day)}` : `${role === 'collected' || role === 'retainerCollected' ? 'paid' : 'invoiced'} ${fmtDay(day)}`
}

function Tile({ label, value, sub, title }: { label: string; value: string; sub?: ReactNode; title?: string }) {
  return (
    <div className="kpi static" title={title}>
      <span className="l">{label}</span>
      <span className="v num">{value}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  )
}

/** The milestones, invoices, retainer periods and deals in one row, grouped by deal, each deal linking to its Billing tab. */
function Drill({ b, id }: { b: Pick<FcBucket, 'items'>; id: string }) {
  const deals = drillByDeal(b)
  if (!deals.length) return <div id={id} className="sm muted" style={{ padding: '6px 0 6px 34px' }}>Nothing forecast here.</div>
  return (
    <ul id={id} className="col" style={{ gap: 8, listStyle: 'none', margin: 0, padding: '6px 0 6px 34px' }}>
      {deals.map(d => (
        <li key={d.key}>
          <div className="row wrap" style={{ gap: 6 }}>
            <b>{d.dealId && S.deals.some(x => x.id === d.dealId) ? <Link to="deal" id={d.dealId} q={{ tab: 'billing' }}>{d.dealName}</Link> : d.dealName}</b>
            {d.companyId && <span className="sm muted">{S.companies.find(c => c.id === d.companyId)?.name ?? ''}</span>}
          </div>
          <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
            {d.items.map(({ e, role }) => (
              <li key={`${e.id}:${role}`} className="sm">
                <span>{e.kind === 'pipeline' ? 'Open deal' : e.label}</span>
                <span className="muted"> · {ROLE_LABEL[role]} · {itemWhen(e, role)} · </span>
                <span className="money">{itemAmount(e, role)}</span>
                {e.flags.filter(f => f !== 'not-on-deal' || role !== 'pipeline').map(f => <Chip key={f} tone={f === 'slipped' ? '' : f === 'draft' || f === 'delivered' ? 'acc' : 'warn'} style={{ marginLeft: 6 }}>{FLAG_LABEL[f]}</Chip>)}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/** Unscheduled contract value, deal by deal. */
function UnscheduledDrill({ deals, id }: { deals: readonly DealBacklog[]; id: string }) {
  const list = deals.filter(d => d.unscheduled > 0 || d.overScheduled > 0)
  if (!list.length) return <div id={id} className="sm muted" style={{ padding: '6px 0 6px 34px' }}>Every contract is in milestones.</div>
  return (
    <ul id={id} style={{ margin: 0, padding: '6px 0 6px 52px' }}>
      {list.map(d => (
        <li key={d.dealId} className="sm">
          <Link to="deal" id={d.dealId} q={{ tab: 'billing' }}>{d.dealName}</Link>
          <span className="muted"> · contracted {fmt(d.contracted)}, invoiced {fmt(d.invoiced)}, in milestones still to invoice {fmt(d.scheduled)} · </span>
          {d.unscheduled > 0 ? <span className="money">{fmt(d.unscheduled)} unscheduled</span> : <span className="money">{fmt(d.overScheduled)} over-scheduled</span>}
        </li>
      ))}
    </ul>
  )
}

interface Row { key: string; label: string; b: FcBucket; muted?: boolean }

/** One table of the forecast: a row per period, each one expanding to the deals and milestones in it. */
function ForecastTable({ caption, first, rows, total, unscheduled, f, open, toggle }: {
  caption: string; first: string; rows: readonly Row[]; total: FcBucket; unscheduled: number; f: Forecast; open: ReadonlySet<string>; toggle: (k: string) => void
}) {
  const base = useId()
  const cells = (b: FcBucket, bold = false): ReactNode => {
    const c = 'money' + (bold ? ' b' : '')
    return (
      <>
        <td style={R} className={c}>{fmt(b.invoiced)}</td>
        <td style={R} className={c}>{fmt(b.collected)}</td>
        <td style={R} className={c}>{fmt(b.retainer)}</td>
        <td style={R} className={c}>{fmt(b.retainerCollected)}</td>
        <td style={R} className={c + ' muted'}><i>{fmt(b.pipeline)}</i></td>
      </>
    )
  }
  const expander = (k: string, label: string): ReactNode => (
    <Btn kind="ghost" size="sm" aria-expanded={open.has(k)} aria-controls={`${base}-${k}`} aria-label={`${open.has(k) ? 'Collapse' : 'Expand'} ${label}`} onClick={() => toggle(k)} icon={open.has(k) ? 'down' : 'right'} />
  )
  const uKey = 'unscheduled'
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl" aria-label={caption}>
        <thead>
          <tr>
            <th scope="col">{first}</th>
            <th scope="col" style={R}>Forecast invoiced</th>
            <th scope="col" style={R}>Forecast collected</th>
            <th scope="col" style={R}>Retainer invoiced</th>
            <th scope="col" style={R}>Retainer collected</th>
            <th scope="col" style={R}>Weighted pipeline</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <Fragment key={r.key}>
              <tr data-row={r.key}>
                <th scope="row" style={{ fontWeight: 'inherit' }}>
                  <span className="row" style={{ gap: 6 }}>
                    {expander(r.key, r.label)}
                    <span className={r.muted ? 'muted' : undefined}>{r.label}</span>
                  </span>
                </th>
                {cells(r.b)}
              </tr>
              {open.has(r.key) && <tr><td colSpan={6} style={{ background: 'var(--surf2)' }}><Drill b={r.b} id={`${base}-${r.key}`} /></td></tr>}
            </Fragment>
          ))}
          <tr data-row={uKey}>
            <th scope="row" style={{ fontWeight: 'inherit' }}>
              <span className="row" style={{ gap: 6 }}>
                {expander(uKey, 'Unscheduled')}
                <span className="muted">Unscheduled (contract not in milestones)</span>
              </span>
            </th>
            <td style={R} className="money">{fmt(unscheduled)}</td>
            <td colSpan={4} className="sm muted">No month: add milestones on the deal’s Billing tab.</td>
          </tr>
          {open.has(uKey) && <tr><td colSpan={6} style={{ background: 'var(--surf2)' }}><UnscheduledDrill deals={f.deals} id={`${base}-${uKey}`} /></td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="b" style={{ textAlign: 'left' }}>Total in range</th>
            {cells(total, true)}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/**
 * Reports › Ardorio revenue › Forecast: when contracted Ardorio money is expected to be invoiced and collected, by month
 * and by financial year, with the support retainer and the weighted pipeline kept apart. Built in the style of board 5.
 * Admins of Ardorio (or super) only; the caller checks, and the invoice list refuses anyone else.
 */
export function ArdorioForecast({ tabs, viewSeg }: { tabs?: ReactNode; viewSeg?: ReactNode }) {
  useStore()
  const list = useLoad(s => listInvoices({}, s).then(r => r.invoices), 'ard-invoices')
  const [range, setRange] = useState<FcRange>('m12')
  const [slip, setSlip] = useState(0)
  const [lagText, setLagText] = useState<string | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const lagId = useId()
  const lagHint = useId()
  const recId = useId()
  const today = F.today()
  const toggle = (k: string): void => setOpen(s => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })

  const head = (
    <>
      <div className="crumb">Reports <span aria-hidden="true">›</span> Ardorio revenue</div>
      <PageHead title="Ardorio revenue" sub="Forecast from this month: when contracted money is expected to be invoiced and collected, ex GST. The weighted pipeline is shown apart and never added to contracted figures.">
        {viewSeg}
        <Seg label="Range" value={range} onChange={v => setRange(v as FcRange)} opts={FC_RANGES} />
      </PageHead>
      {tabs}
    </>
  )

  if (list.error) {
    const e = invoiceError(list.error, 'load')
    return (
      <>
        {head}
        <section aria-label="Ardorio forecast" data-ard-forecast>
          <Card pad={false}>
            <Empty icon={e.kind === 'denied' ? 'lock' : 'alert'} title={e.kind === 'denied' ? 'The Ardorio forecast is for Ardorio admins' : 'Couldn’t load the invoices the forecast needs'} body={e.message}
              action={e.kind === 'denied' ? undefined : <Btn onClick={() => list.reload()}>Try again</Btn>} />
          </Card>
        </section>
      </>
    )
  }
  if (!list.data) return <>{head}<section aria-label="Ardorio forecast" data-ard-forecast aria-busy="true"><Skel rows={5} /></section></>
  return <>{head}<ForecastBody invoices={list.data} today={today} range={range} slip={slip} setSlip={setSlip} lagText={lagText} setLagText={setLagText} open={open} toggle={toggle} ids={{ lagId, lagHint, recId }} /></>
}

const probOf = (d: Deal): number => Q.stage(d)?.prob ?? d.probability ?? 0

function ForecastBody({ invoices, today, range, slip, setSlip, lagText, setLagText, open, toggle, ids }: {
  invoices: readonly InvoiceDto[]; today: string; range: FcRange; slip: number; setSlip: (n: number) => void
  lagText: string | null; setLagText: (t: string | null) => void; open: ReadonlySet<string>; toggle: (k: string) => void
  ids: { lagId: string; lagHint: string; recId: string }
}) {
  const lag = useMemo(() => paymentLag(invoices, today), [invoices, today])
  const typed = lagText === null ? lag.days : parseLag(lagText)
  const lagDays = typed ?? lag.days
  const base = { today, deals: S.deals, companies: S.companies, plans: S.billingPlans, invoices, lagDays, slip, prob: probOf }
  // A retainer has no end: list its periods only as far as the view reaches, which the project and pipeline set.
  const months = rangeMonths(range, today, latestDay(buildForecast({ ...base, retainerUntil: today }).entries))
  const last = months[months.length - 1]
  const f = buildForecast({ ...base, retainerUntil: `${last}-31` })
  const s = summarise(f, months)
  const fy = byFinancialYear(s)
  const pipeAll = s.inRange.pipelineValue + s.later.pipelineValue + s.noDate.pipelineValue
  const pipeWeighted = s.inRange.pipeline + s.later.pipeline + s.noDate.pipeline
  const rangeLabel = FC_RANGES.find(r => r[0] === range)?.[1] ?? ''
  const span = `${monthName(months[0])} to ${monthName(last)}`
  const recon = `Backlog ${fmt(f.backlog)} = ${fmt(s.inRange.invoiced)} in range + ${fmt(s.later.invoiced)} later + ${fmt(s.noDate.invoiced)} no date + ${fmt(f.unscheduled)} unscheduled${f.overScheduled > 0 ? ` − ${fmt(f.overScheduled)} over-scheduled` : ''}.`
  const monthRows: Row[] = [
    ...months.map(m => ({ key: m, label: `${monthName(m)}${m === today.slice(0, 7) ? ' (this month)' : ''}`, b: s.byMonth.get(m)! })),
    { key: 'later', label: `Later (after ${monthName(last)})`, b: s.later, muted: true },
    { key: 'nodate', label: 'No date', b: s.noDate, muted: true },
  ]
  const fyRows: Row[] = [
    ...fy.map(r => ({ key: `fy${r.fy}`, label: r.label, b: r.bucket })),
    { key: 'later', label: `Later (after ${monthName(last)})`, b: s.later, muted: true },
    { key: 'nodate', label: 'No date', b: s.noDate, muted: true },
  ]
  const overdueInv = f.entries.filter(e => !e.issued && e.flags.includes('overdue-invoice')).reduce((a, e) => a + e.cents, 0)
  const noDateMilestones = s.noDate.items.filter(i => i.role === 'invoiced').length
  const dealsWithContract = f.deals.length

  return (
    <section aria-label="Ardorio forecast" data-ard-forecast>
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
        <defs>
          <pattern id={HATCH} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" style={{ fill: 'var(--surf2)' }} />
            <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: 'var(--fg3)' }} strokeWidth="3" />
          </pattern>
        </defs>
      </svg>

      <div className="row wrap" style={{ gap: 14, alignItems: 'flex-end', marginBottom: 12 }}>
        <div className="col" style={{ gap: 4 }}>
          <span className="sm muted" aria-hidden="true">Assume planned milestones slip by (months)</span>
          <Seg label="Assume planned milestones slip by, in months" value={String(slip)} onChange={v => setSlip(Number(v))} opts={SLIPS} />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label className="sm muted" htmlFor={ids.lagId}>Days to pay</label>
          <span className="row" style={{ gap: 6 }}>
            <input
              id={ids.lagId} className="inp num" type="number" inputMode="numeric" min={0} max={365} step={1} style={{ width: 90 }}
              value={lagText ?? String(lag.days)} onChange={e => setLagText(e.target.value)} aria-describedby={ids.lagHint} aria-invalid={typed === null || undefined}
            />
            {lagText !== null && <Btn size="sm" onClick={() => setLagText(null)}>Reset</Btn>}
          </span>
        </div>
        <div className="sm muted" id={ids.lagHint} style={{ flex: '1 1 320px' }} aria-live="polite">
          {typed === null ? `Enter whole days from 0 to 365. ${lagLine(lag)}.` : `${lagLine(lag, lagDays)}. For this view only; nothing is saved.`}
        </div>
      </div>

      <div className="grid g6" style={{ marginBottom: 6 }}>
        <Tile label="Contracted backlog" value={fmt(f.backlog)} sub={`Contracted minus invoiced · ${plural(dealsWithContract, 'deal')}`} />
        <Tile label="Forecast invoiced" value={fmt(s.inRange.invoiced)} sub={`${rangeLabel}${overdueInv > 0 ? ` · ${fmt(overdueInv)} overdue to invoice` : ''}`} />
        <Tile label="Forecast collected" value={fmt(s.inRange.collected)} sub={`${rangeLabel} · ${lagDays} days to pay`} />
        <Tile label="Weighted pipeline" value={fmt(s.inRange.pipeline)} sub={`${rangeLabel} · ${fmt(pipeWeighted)} of ${fmt(pipeAll)} unweighted in all`} title="Open Ardorio deals: value × stage probability, in the month of the close date. Never added to contracted figures." />
        <Tile label="No date" value={fmt(s.noDate.invoiced)} sub={`${plural(noDateMilestones, 'milestone')} with no planned date${s.noDate.pipeline > 0 ? ` · ${fmt(s.noDate.pipeline)} weighted pipeline with no close date` : ''}`} />
        <Tile label="Unscheduled" value={fmt(f.unscheduled)} sub="Contract not yet in milestones" />
      </div>
      <div className="sm" id={ids.recId} data-reconcile style={{ marginBottom: 12 }}>{recon}</div>

      {(f.noContract.length > 0 || f.retainerNoDate.length > 0 || slip > 0) && (
        <div className="col" style={{ gap: 8, marginBottom: 12 }}>
          {slip > 0 && <Banner tone="info">Planned milestones not yet delivered are moved {plural(slip, 'month')} later. Overdue and delivered milestones, issued invoices and the pipeline stay where they are.</Banner>}
          {f.noContract.length > 0 && (
            <Banner tone="info">
              {plural(f.noContract.length, 'won deal')} {f.noContract.length === 1 ? 'has' : 'have'} no contract yet and {f.noContract.length === 1 ? 'is' : 'are'} not in the forecast:{' '}
              {f.noContract.map((d, i) => <Fragment key={d.id}>{i > 0 && ', '}<Link to="deal" id={d.id} q={{ tab: 'billing' }}>{d.title || d.name}</Link></Fragment>)}.
            </Banner>
          )}
          {f.retainerNoDate.length > 0 && (
            <Banner tone="info">
              {plural(f.retainerNoDate.length, 'retainer')} {f.retainerNoDate.length === 1 ? 'has' : 'have'} no next invoice date, so nothing is forecast for {f.retainerNoDate.length === 1 ? 'it' : 'them'}:{' '}
              {f.retainerNoDate.map((d, i) => <Fragment key={d.id}>{i > 0 && ', '}<Link to="deal" id={d.id} q={{ tab: 'billing' }}>{d.title || d.name}</Link></Fragment>)}.
            </Banner>
          )}
        </div>
      )}

      <Card
        title={`By month, ${span}`}
        style={{ marginBottom: 14 }}
        right={(
          <span className="row wrap" style={{ gap: 12 }}>
            <span className="key"><i style={{ background: COLORS[0] }} />Forecast invoiced</span>
            <span className="key"><i style={{ background: COLORS[1] }} />Forecast collected</span>
            <span className="key"><i style={{ background: HATCH_CSS, border: '1px solid var(--fg3)' }} />Weighted pipeline (hatched, apart)</span>
          </span>
        )}
      >
        <Bars label={`Ardorio forecast by month, ${span}`} grouped series={SERIES} colors={COLORS} data={forecastBars(s)} fmt={v => formatCentsTile(Math.round(v * 100))} />
      </Card>

      <div className="col" style={{ gap: 14 }}>
        <Card title="Forecast by month" right={<span className="faint xs">ex GST</span>} pad={false}>
          <ForecastTable caption="Ardorio forecast by month" first="Month" rows={monthRows} total={s.inRange} unscheduled={f.unscheduled} f={f} open={sub(open, 'm:')} toggle={k => toggle(`m:${k}`)} />
        </Card>
        <Card title="Forecast by financial year (July to June)" right={<span className="faint xs">ex GST</span>} pad={false}>
          <ForecastTable caption="Ardorio forecast by financial year" first="Financial year" rows={fyRows} total={s.inRange} unscheduled={f.unscheduled} f={f} open={sub(open, 'y:')} toggle={k => toggle(`y:${k}`)} />
        </Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <Banner>As recorded in SalesOS. Milestones not yet invoiced are forecast on their planned date; overdue and delivered ones this month. Collected is the forecast invoice date plus the days to pay; issued invoices are collected from their issue date. The retainer continues monthly and is drawn to the end of the range only. Cancelled and test invoices are left out.</Banner>
      </div>
    </section>
  )
}
