import { useMemo, useState } from 'react'
import { invoiceError, listInvoices } from '../../api/invoices'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Deal } from '../../data/types'
import { Banner, Btn, Card, Chip, Empty, Kpi, Link, Seg, Skel } from '../../kit'
import { buildForecast, latestDay, paymentLag, rangeMonths, summarise, type FcEntry, type FcRange } from '../../shared/forecast'
import { fmtDay } from '../../shared/invoices'
import { formatCentsTile } from '../../shared/money'
import { attentionOf, nextToInvoice, OUTLOOK_BASES, OUTLOOK_RANGES, outlookBars, outlookTotals, recurringRunRate, weightedArdPipeline, type OutlookBar, type OutlookBasis, type OutlookRange } from '../../shared/revenueOutlook'
import { monthName } from '../../shared/revenueReport'
import { UI } from '../../ui/store'

// Dashboard > Revenue outlook: what Ardorio projects are expected to bring in, from the same forecast as Reports > Ardorio revenue
// (shared/forecast.ts). Contracted money is solid; the weighted pipeline is hatched, stands apart and is never added to it.

const fmt = formatCentsTile
const HATCH = 'repeating-linear-gradient(45deg, var(--fg3) 0 2px, var(--surf2) 2px 5px)'
const probOf = (d: Deal): number => Q.stage(d)?.prob ?? d.probability ?? 0
const openForecast = (): void => UI.nav('reports', { q: { tab: 'ardorio', view: 'forecast' } })
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`

const RANGE_WORDS: Record<OutlookRange, string> = { m6: 'next 6 months', m12: 'next 12 months', fy: 'this and later financial years' }

function Swatch({ kind }: { kind: 'project' | 'recurring' | 'pipeline' }) {
  const style = kind === 'pipeline'
    ? { background: HATCH, border: '1px solid var(--fg3)' }
    : { background: kind === 'project' ? 'var(--b-inv)' : 'var(--b-col)' }
  return <i aria-hidden="true" style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 2, flex: 'none', ...style }} />
}

function Key({ kind, children }: { kind: 'project' | 'recurring' | 'pipeline'; children: string }) {
  return <span className="row sm muted" style={{ gap: 6 }}><Swatch kind={kind} />{children}</span>
}

const barLabel = (b: OutlookBar, basis: OutlookBasis): string =>
  `${b.label}: ${fmt(b.project + b.recurring)} ${basis === 'invoiced' ? 'to invoice' : 'to collect'} (projects ${fmt(b.project)}, instalments and retainers ${fmt(b.recurring)}), weighted pipeline ${fmt(b.pipeline)}`

/** Two bars a column: contracted (project over recurring, solid) and the weighted pipeline (hatched), each from the same baseline. */
function OutlookChart({ bars, basis, label }: { bars: readonly OutlookBar[]; basis: OutlookBasis; label: string }) {
  const max = Math.max(1, ...bars.map(b => Math.max(b.project + b.recurring, b.pipeline)))
  const H = 160
  const px = (c: number): number => (c > 0 ? Math.max(2, Math.round((c / max) * H)) : 0)
  const total = (b: OutlookBar): number => b.project + b.recurring
  return (
    <div>
      <div role="img" aria-label={`${label}. ${bars.map(b => barLabel(b, basis)).join('. ')}`} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: H + 22, borderBottom: '1px solid var(--line2)', padding: '0 4px' }}>
        {bars.map(b => (
          <div key={b.key} title={barLabel(b, basis)} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
            <span className="xs muted num" style={{ whiteSpace: 'nowrap' }}>{total(b) > 0 ? fmt(total(b)) : ''}</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' }}>
              <div style={{ width: '42%', maxWidth: 34, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ height: px(b.recurring), background: 'var(--b-col)', borderRadius: '2px 2px 0 0' }} />
                <div style={{ height: px(b.project), background: 'var(--b-inv)', borderRadius: b.recurring ? 0 : '2px 2px 0 0' }} />
              </div>
              <div style={{ width: '42%', maxWidth: 34, height: px(b.pipeline), background: HATCH, border: b.pipeline ? '1px solid var(--fg3)' : undefined, borderBottom: 0, borderRadius: '2px 2px 0 0' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '4px 4px 0' }} aria-hidden="true">
        {bars.map(b => <span key={b.key} className="xs muted" style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{b.label}</span>)}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Project milestones</th><th scope="col">Instalments and retainers</th><th scope="col">Weighted pipeline</th></tr></thead>
        <tbody>{bars.map(b => <tr key={b.key}><th scope="row">{b.label}</th><td>{fmt(b.project)}</td><td>{fmt(b.recurring)}</td><td>{fmt(b.pipeline)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function entryWhen(e: FcEntry, today: string): string {
  if (!e.invoiceDay) return 'no date'
  return e.invoiceDay < today ? `overdue since ${fmtDay(e.invoiceDay)}` : fmtDay(e.invoiceDay)
}

function Loaded({ filtered }: { filtered: boolean }) {
  useStore()
  const list = useLoad(s => listInvoices({}, s).then(r => r.invoices), 'ard-invoices')
  const [range, setRange] = useState<OutlookRange>('m12')
  const [basis, setBasis] = useState<OutlookBasis>('invoiced')
  const today = F.today()
  const title = 'Revenue outlook'

  const calc = useMemo(() => {
    if (!list.data) return null
    const lagDays = paymentLag(list.data, today).days
    const base = { today, deals: S.deals, companies: S.companies, plans: S.billingPlans, invoices: list.data, lagDays, slip: 0, prob: probOf }
    const key: FcRange = range === 'fy' ? 'fy' : 'm12'
    let months = rangeMonths(key, today, latestDay(buildForecast({ ...base, retainerUntil: today }).entries))
    if (range === 'm6') months = months.slice(0, 6)
    const last = months[months.length - 1]
    const f = buildForecast({ ...base, retainerUntil: `${last}-31` })
    return { f, s: summarise(f, months) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the store is read live; its changes arrive through useStore above
  }, [list.data, range, today, S.deals, S.billingPlans, S.companies])

  if (list.error) {
    const e = invoiceError(list.error, 'load')
    if (e.kind === 'denied') return <PipelineOnly filtered={filtered} />
    return (
      <Card title={title}>
        <Banner tone="bad" action={<Btn size="sm" onClick={() => list.reload()}>Try again</Btn>}>The invoicing forecast could not be loaded. The rest of the dashboard is unaffected.</Banner>
        <div className="sm muted" style={{ marginTop: 8 }}>Weighted pipeline needs no loading: <i className="num">{fmt(weightedArdPipeline(S.deals, probOf))}</i>.</div>
      </Card>
    )
  }
  if (!calc || !list.data) {
    return (
      <Card title={title} right={<span className="faint xs">Loading the forecast…</span>}>
        <div style={{ minHeight: 300 }}><Skel rows={5} label="Loading revenue outlook" /></div>
      </Card>
    )
  }

  const { f, s } = calc
  const t = outlookTotals(s, basis)
  const runRate = recurringRunRate(S.billingPlans, S.deals, today)
  const bars = outlookBars(s, range, basis, m => monthName(m).split(' ')[0])
  const attention = attentionOf(f)
  const next = nextToInvoice(f)
  const verb = basis === 'invoiced' ? 'invoice' : 'collect'
  const nothing = f.backlog === 0 && t.contracted === 0 && runRate === 0

  const head = (
    <>
      <span className="faint xs">{filtered ? 'All Ardorio projects · filters above do not apply · ' : ''}ex GST</span>
      <Seg label="Basis" value={basis} onChange={v => setBasis(v as OutlookBasis)} opts={OUTLOOK_BASES} />
      <Seg label="Range" value={range} onChange={v => setRange(v as OutlookRange)} opts={OUTLOOK_RANGES} />
      <Btn size="sm" kind="ghost" iconRight="right" onClick={openForecast}>Open full forecast</Btn>
    </>
  )

  if (nothing) {
    return (
      <Card title={title} right={head}>
        <Empty icon="chart" title="No contracted revenue yet" body={`Revenue appears here once a won deal has a contract and billing milestones. Open deals still show as weighted pipeline: ${fmt(t.pipeline)}.`}
          action={<Btn kind="pri" onClick={() => UI.nav('deals', { q: { status: 'won', view: 'list' } })}>Open won deals</Btn>} />
      </Card>
    )
  }

  return (
    <Card title={title} right={head}>
      <div className="col" style={{ gap: 14 }}>
        <div className="grid g4" style={{ gap: 12 }}>
          <Kpi label="Contracted backlog" value={fmt(f.backlog)} sub={`Contracted minus invoiced · ${plural(f.deals.length, 'contract')}`} onClick={openForecast} title="Open the full forecast" />
          <Kpi label={`To ${verb}, ${RANGE_WORDS[range]}`} value={fmt(t.contracted)} sub={`Milestones ${fmt(t.project)} · instalments and retainers ${fmt(t.recurring)}`} onClick={openForecast} title="Open the full forecast" />
          <Kpi label="Recurring run-rate" value={<>{fmt(runRate)} <span className="sm muted">a year</span></>} sub="Term agreements and support retainers in force" onClick={openForecast} title="Open the full forecast" />
          <Kpi label={<span className="row" style={{ gap: 6 }}><Swatch kind="pipeline" />Weighted pipeline</span>} value={<i>{fmt(t.pipeline)}</i>} sub="Not contracted · never added to the totals" onClick={openForecast} title="Open the full forecast" />
        </div>

        <div>
          <div className="row wrap" style={{ gap: '4px 16px', marginBottom: 6 }}>
            <b className="sm">{basis === 'invoiced' ? 'To invoice' : 'To collect'}, {range === 'fy' ? 'by financial year' : 'by month'}</b>
            <Key kind="project">Project milestones</Key>
            <Key kind="recurring">Instalments and retainers</Key>
            <Key kind="pipeline">Weighted pipeline (hatched, apart)</Key>
          </div>
          <OutlookChart bars={bars} basis={basis} label={`Ardorio forecast to ${verb}, ${RANGE_WORDS[range]}`} />
          <div className="faint xs" style={{ marginTop: 8 }}>
            Backlog {fmt(f.backlog)} = {fmt(s.inRange.invoiced + s.inRange.retainer)} in range + {fmt(s.later.invoiced)} later + {fmt(s.noDate.invoiced)} with no date + {fmt(f.unscheduled)} not yet in milestones{f.overScheduled > 0 ? ` − ${fmt(f.overScheduled)} over-scheduled` : ''}. The figure above each bar is contracted money only.
          </div>
        </div>

        <div className="grid g2" style={{ gap: 14 }}>
          <Card title="Next to invoice" pad={false} right={<Btn size="sm" kind="ghost" onClick={openForecast}>All milestones</Btn>}>
            {next.length ? (
              <table className="tbl" aria-label="Next to invoice">
                <thead><tr><th scope="col">Deal and milestone</th><th scope="col">Invoice date</th><th scope="col" style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {next.map(e => (
                    <tr key={e.id}>
                      <td className="w" style={{ minWidth: 0 }}>
                        {e.dealId && S.deals.some(d => d.id === e.dealId) ? <Link to="deal" id={e.dealId} q={{ tab: 'billing' }}><b>{e.dealName}</b></Link> : <b>{e.dealName}</b>}
                        <div className="faint xs">{e.label}</div>
                      </td>
                      <td>{e.flags.includes('overdue-invoice') ? <Chip tone="bad">Overdue · {entryWhen(e, today).replace('overdue since ', '')}</Chip> : entryWhen(e, today)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{fmt(e.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty icon="check" title="Nothing waiting to be invoiced" />}
          </Card>
          <Card title="Needs attention" pad={false}>
            {attention.length ? (
              <ul className="col" style={{ listStyle: 'none', margin: 0, padding: '6px 0', gap: 0 }}>
                {attention.map(a => (
                  <li key={a.key} className="row" style={{ gap: 10, padding: '8px 12px', alignItems: 'flex-start' }}>
                    <Chip tone={a.tone}>{a.key === 'noContract' ? plural(a.count ?? 0, 'deal') : fmt(a.amount)}</Chip>
                    <span><b><button type="button" className="btn ghost xs" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={openForecast}>{a.title}</button></b><div className="faint xs">{a.note}</div></span>
                  </li>
                ))}
              </ul>
            ) : <Empty icon="check" title="Nothing needs attention" />}
          </Card>
        </div>
      </div>
    </Card>
  )
}

/** A viewer who is not an Ardorio admin never loads invoices: only what the deals themselves show, and a note saying why. */
function PipelineOnly({ filtered }: { filtered: boolean }) {
  useStore()
  const pipeline = weightedArdPipeline(S.deals, probOf)
  return (
    <Card title="Revenue outlook" right={<span className="faint xs">{filtered ? 'All Ardorio projects · filters above do not apply · ' : ''}ex GST</span>}>
      <div className="col" style={{ gap: 12 }}>
        <div className="grid g4" style={{ gap: 12 }}>
          <Kpi label={<span className="row" style={{ gap: 6 }}><Swatch kind="pipeline" />Weighted pipeline</span>} value={<i>{fmt(pipeline)}</i>} sub="Open Ardorio deals × stage probability" onClick={() => UI.nav('deals', { q: { status: 'open', view: 'list' } })} />
        </div>
        <Banner tone="info">Contracted backlog and the invoicing forecast are shown to Ardorio admins. Nothing is estimated for you.</Banner>
      </div>
    </Card>
  )
}

/** The dashboard card. `filtered`: an owner, team, source or Mine filter is on, which this card does not follow. */
export function RevenueOutlook({ filtered }: { filtered: boolean }) {
  useStore()
  return Q.canBill() ? <Loaded filtered={filtered} /> : <PipelineOnly filtered={filtered} />
}
