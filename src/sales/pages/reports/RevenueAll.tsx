import type { ReactNode } from 'react'
import { useState } from 'react'
import { invoiceError, listInvoices } from '../../api/invoices'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { Q } from '../../data/Q'
import { useRosterioAccounts } from '../../data/rosterio'
import { testAccountIds } from '../../data/rosterioTest'
import { S, useStore } from '../../data/store'
import type { Deal } from '../../data/types'
import { Btn, Card, Chip, Icon, Seg } from '../../kit'
import { buildForecast, latestDay, paymentLag, rangeMonths, summarise, type FcRange } from '../../shared/forecast'
import { formatCentsTile } from '../../shared/money'
import { PageHead } from '../../shared/PageHead'
import { monthName } from '../../shared/revenueReport'
import { ardorioPlaceholder, ardorioRow, barsOf, dealsRow, rosterioRow, rowContracted, rowPipeline, totalsOf, type BizRevenue } from '../../shared/revenueAll'
import { attentionOf, recurringRunRate } from '../../shared/revenueOutlook'
import { UI } from '../../ui/store'

// Reports > Revenue: what every business is expected to bring in, ex GST, from the source each one really has (see shared/revenueAll.ts).
// Contracted money is solid; the weighted pipeline is hatched, apart, and never added to it. A source that is not available says why.

const fmt = formatCentsTile
const HATCH = 'repeating-linear-gradient(45deg, var(--fg3) 0 2px, var(--surf2) 2px 5px)'
const R: { textAlign: 'right' } = { textAlign: 'right' }
const RANGES: ReadonlyArray<readonly [FcRange, string]> = [['m12', 'Next 12 months'], ['m24', 'Next 24 months'], ['fy', 'By financial year']]
const probOf = (d: Deal): number => Q.stage(d)?.prob ?? d.probability ?? 0
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`

function Tile({ label, value, sub, hatched }: { label: ReactNode; value: ReactNode; sub?: ReactNode; hatched?: boolean }) {
  return (
    <div className="kpi static">
      <span className="l row" style={{ gap: 6 }}>{hatched && <i aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 10, border: '1px solid var(--fg3)', background: HATCH }} />}{label}</span>
      <span className="v num" style={hatched ? { color: 'var(--fg2)' } : undefined}>{hatched ? <i>{value}</i> : value}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  )
}

function Dot({ c }: { c: string }) {
  return <i aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: c, flex: 'none' }} />
}

function StackedChart({ rows, bars, label }: { rows: readonly BizRevenue[]; bars: ReturnType<typeof barsOf>; label: string }) {
  const H = 190
  const totals = bars.map(b => b.parts.reduce((a, p) => a + p.cents, 0))
  const max = Math.max(1, ...totals, ...bars.map(b => b.pipeline))
  const px = (c: number): number => (c > 0 ? Math.max(2, Math.round((c / max) * H)) : 0)
  return (
    <div>
      <div role="img" aria-label={`${label}. ${bars.map((b, i) => `${b.label}: ${fmt(totals[i])} contracted, weighted pipeline ${fmt(b.pipeline)}`).join('. ')}`} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: H + 22, borderBottom: '1px solid var(--line2)', padding: '0 4px' }}>
        {bars.map((b, i) => (
          <div key={b.key} title={`${b.label}: ${b.parts.filter(p => p.cents > 0).map(p => `${p.name} ${fmt(p.cents)}`).join(', ') || 'nothing contracted'}; weighted pipeline ${fmt(b.pipeline)}`} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
            <span className="xs muted num" style={{ whiteSpace: 'nowrap' }}>{totals[i] > 0 ? fmt(totals[i]) : ''}</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' }}>
              <div style={{ width: '44%', maxWidth: 36, display: 'flex', flexDirection: 'column-reverse' }}>
                {b.parts.map(p => <div key={p.id} style={{ height: px(p.cents), background: p.accent }} />)}
              </div>
              <div style={{ width: '44%', maxWidth: 36, height: px(b.pipeline), background: HATCH, border: b.pipeline ? '1px solid var(--fg3)' : undefined, borderBottom: 0, borderRadius: '2px 2px 0 0' }} />
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 8, padding: '4px 4px 0' }}>
        {bars.map(b => <span key={b.key} className="xs muted" style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{b.label}</span>)}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Period</th>{rows.map(r => <th key={r.id} scope="col">{r.name}</th>)}<th scope="col">Weighted pipeline</th></tr></thead>
        <tbody>{bars.map(b => <tr key={b.key}><th scope="row">{b.label}</th>{b.parts.map(p => <td key={p.id}>{fmt(p.cents)}</td>)}<td>{fmt(b.pipeline)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

/** Reports > Revenue. Any member sees it; a business whose source they may not read, or that failed, is a row that says so. */
export function RevenueAll({ tabs }: { tabs?: ReactNode }) {
  useStore()
  const today = F.today()
  const sc = Q.scope()
  const [range, setRange] = useState<FcRange>('m12')
  const canBill = Q.canBill()
  const hasArd = sc.includes('ard')
  const hasRos = sc.includes('ros')
  const inv = useLoad(s => (hasArd && canBill ? listInvoices({}, s).then(r => r.invoices) : Promise.resolve(null)), `ard-invoices:${hasArd && canBill}`)
  const acc = useRosterioAccounts(hasRos ? 'ifStale' : 'never')
  const rosData = acc.s === 'ok' ? acc.data : acc.s === 'loading' || acc.s === 'error' ? acc.previous : undefined
  const tests = testAccountIds()

  // Ardorio first, so the other businesses share its months.
  const invoices = inv.data ?? null
  const denied = !!inv.error && invoiceError(inv.error, 'load').kind === 'denied'
  const base = invoices ? { today, deals: S.deals, companies: S.companies, plans: S.billingPlans, invoices, lagDays: paymentLag(invoices, today).days, slip: 0, prob: probOf } : null
  const latest = base ? latestDay(buildForecast({ ...base, retainerUntil: today }).entries) : null
  const months = rangeMonths(range, today, latest)
  const f = base ? buildForecast({ ...base, retainerUntil: `${months[months.length - 1]}-31` }) : null
  const s = f ? summarise(f, months) : null

  const rows: BizRevenue[] = []
  for (const b of S.businesses) {
    if (!sc.includes(b.id)) continue
    if (b.id === 'ard') {
      const place = (state: 'loading' | 'locked' | 'error', reason: string): BizRevenue => ardorioPlaceholder({ name: b.name, accent: b.accent, months, deals: S.deals, prob: probOf, state, reason })
      if (!canBill) rows.push(place('locked', 'Ardorio contracts are shown to Ardorio admins.'))
      else if (denied) rows.push(place('locked', 'Ardorio contracts are shown to Ardorio admins.'))
      else if (inv.error) rows.push(place('error', 'Ardorio’s invoices could not be read.'))
      else if (!s || !f) rows.push(place('loading', 'Reading invoices and billing plans…'))
      else rows.push(ardorioRow({ name: b.name, accent: b.accent, s, runRate: recurringRunRate(S.billingPlans, S.deals, today) * 100, contracts: f.deals.length, deals: S.deals, prob: probOf }))
    } else if (b.id === 'ros') {
      rows.push(rosterioRow({ name: b.name, accent: b.accent, deals: S.deals, months, prob: probOf, accounts: rosData?.accounts, tests, isAdmin: Q.canAdmin('ros'), failed: acc.s === 'error' }))
    } else {
      rows.push(dealsRow({ id: b.id, name: b.name, accent: b.accent, deals: S.deals, months, prob: probOf }))
    }
  }

  const t = totalsOf(rows)
  const bars = barsOf(rows, months, range === 'fy' ? 'fy' : range, ym => monthName(ym).split(' ')[0])
  const shown = rows.filter(r => r.state === 'ok')
  const span = `${monthName(months[0])} to ${monthName(months[months.length - 1])}`
  const ros = rows.find(r => r.id === 'ros')
  const attention: Array<{ k: string; chip: string; tone: string; title: string; note: string }> = []
  if (ros?.unpriced) attention.push({ k: 'ros-unpriced', chip: plural(ros.unpriced, 'account'), tone: 'warn', title: 'Rosterio accounts with no price', note: 'Paying, but Rosterio sent no monthly cost. Counted as $0.' })
  if (ros?.trialsEnding) attention.push({ k: 'ros-trials', chip: plural(ros.trialsEnding, 'trial'), tone: 'info', title: 'Rosterio trials ending within 14 days', note: 'Not counted until they pay.' })
  if (f) for (const a of attentionOf(f)) attention.push({ k: `ard-${a.key}`, chip: a.key === 'noContract' ? plural(a.count ?? 0, 'deal') : fmt(a.amount), tone: a.tone, title: `Ardorio: ${a.title.charAt(0).toLowerCase()}${a.title.slice(1)}`, note: a.note })
  for (const r of rows) if (r.id !== 'ros' && r.id !== 'ard') for (const n of r.notes) attention.push({ k: `${r.id}-note`, chip: r.name, tone: 'warn', title: `${r.name}: ${n}`, note: 'Nothing to forecast for it.' })

  const stateCell = (r: BizRevenue): ReactNode => {
    if (r.state === 'ok') return <>{r.basis}{r.notes.map(n => <Chip key={n} tone="warn" style={{ marginLeft: 6 }}>{n}</Chip>)}{r.id === 'ard' && <> · <Btn size="sm" kind="ghost" onClick={() => UI.nav('reports', { q: { tab: 'ardorio', view: 'forecast' } })}>Ardorio forecast</Btn></>}</>
    if (r.state === 'loading') return <span className="muted">{r.reason}</span>
    if (r.state === 'error') return <span role="alert" style={{ color: 'var(--bad2)' }}>{r.reason} It is not in the totals. <Btn size="sm" onClick={() => (r.id === 'ard' ? inv.reload() : acc.reload())}>Try again</Btn></span>
    return <span className="row" style={{ gap: 6 }}><Icon n="lock" s={13} />{r.reason} Not counted in the totals.</span>
  }
  const money = (r: BizRevenue, n: number): ReactNode => (r.state === 'ok' ? fmt(n) : r.state === 'loading' ? <span className="skel" style={{ display: 'inline-block', width: 64, height: 14 }} /> : <span className="muted">Not shown</span>)

  return (
    <section aria-label="Revenue" data-revenue-all>
      <div className="crumb">Reports <span aria-hidden="true">›</span> Revenue</div>
      <PageHead title="Revenue" sub="Forecast from this month: what each business is expected to bring in, ex GST. The weighted pipeline is shown apart and never added to contracted figures.">
        <Seg label="Range" value={range} onChange={v => setRange(v as FcRange)} opts={RANGES} />
      </PageHead>
      {tabs}

      <div className="grid g4" style={{ gap: 12, marginBottom: 14 }}>
        <Tile label={`Contracted, ${range === 'fy' ? 'by financial year' : range === 'm24' ? 'next 24 months' : 'next 12 months'}`} value={fmt(t.contracted)} sub={t.complete ? 'All businesses, ex GST' : 'Of the businesses shown'} />
        <Tile label="Recurring revenue (ARR)" value={fmt(t.arr)} sub={shown.length ? 'Subscriptions; Ardorio is kept apart' : 'Nothing shown yet'} />
        <Tile label="Ardorio recurring run-rate" value={rows.some(r => r.id === 'ard' && r.state === 'ok') ? <>{fmt(t.ardorioRunRate)} <span className="sm muted">a year</span></> : <span className="muted">Not shown</span>} sub="Term agreements and retainers, kept apart from ARR" />
        <Tile hatched label="Weighted pipeline" value={fmt(t.pipeline)} sub="Not contracted · never added to the totals" />
      </div>

      <Card
        title={`By ${range === 'fy' ? 'financial year' : 'month'}, ${span}`} style={{ marginBottom: 14 }}
        right={(
          <span className="row wrap" style={{ gap: 12 }}>
            {rows.map(r => <span key={r.id} className="key"><i style={{ background: r.accent }} />{r.name}</span>)}
            <span className="key"><i style={{ background: HATCH, border: '1px solid var(--fg3)' }} />Weighted pipeline (hatched, apart)</span>
          </span>
        )}
      >
        <StackedChart rows={rows} bars={bars} label={`Contracted revenue by ${range === 'fy' ? 'financial year' : 'month'} and business, ${span}`} />
        <div className="faint xs" style={{ marginTop: 8 }}>The figure above each bar is contracted money only. Subscriptions are held flat at today’s prices: no churn, price rises or new customers are assumed.</div>
      </Card>

      <Card title="By business" right={<span className="faint xs">ex GST</span>} pad={false} style={{ marginBottom: 14 }}>
        <div className="tw">
          <table className="tbl" aria-label="Revenue by business">
            <thead><tr><th scope="col">Business</th><th scope="col" style={R}>Recurring a year</th><th scope="col" style={R}>{range === 'fy' ? 'In range' : range === 'm24' ? 'Next 24 months' : 'Next 12 months'}</th><th scope="col" style={R}>Weighted pipeline</th><th scope="col">Based on</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><span className="row" style={{ gap: 8 }}><Dot c={r.accent} /><b>{r.name}</b></span></td>
                  <td style={R} className="num">{money(r, r.recurring)}{r.state === 'ok' && !r.isArr && r.recurring > 0 && <span className="faint xs"> run-rate</span>}</td>
                  <td style={R} className="num">{money(r, rowContracted(r))}</td>
                  <td style={R} className="num muted"><i>{fmt(rowPipeline(r))}</i></td>
                  <td className="w">{stateCell(r)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" style={{ textAlign: 'left' }}>{t.complete ? 'Total' : 'Total of the businesses shown'}</th>
                <td style={R} className="num b">{fmt(t.recurring)}</td>
                <td style={R} className="num b">{fmt(t.contracted)}</td>
                <td style={R} className="num muted"><i>{fmt(t.pipeline)}</i></td>
                <td className="faint xs" style={{ whiteSpace: 'normal' }}>Recurring here includes Ardorio’s run-rate; the ARR tile does not.</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="grid g2" style={{ gap: 14 }}>
        <Card title="Forecast by month" pad={false} right={<span className="faint xs">ex GST</span>}>
          <div className="tw">
            <table className="tbl" aria-label="Revenue forecast by month">
              <thead><tr><th scope="col">{range === 'fy' ? 'Period' : 'Month'}</th>{rows.map(r => <th key={r.id} scope="col" style={R}>{r.name}</th>)}<th scope="col" style={R}>Total</th><th scope="col" style={R}>Pipeline</th></tr></thead>
              <tbody>
                {bars.map(b => (
                  <tr key={b.key}>
                    <th scope="row" style={{ textAlign: 'left', fontWeight: 500 }}>{b.label}</th>
                    {b.parts.map((p, i) => <td key={p.id} style={R} className="num">{rows[i].state === 'ok' ? fmt(p.cents) : <span className="muted">—</span>}</td>)}
                    <td style={R} className="num b">{fmt(b.parts.reduce((a, p) => a + p.cents, 0))}</td>
                    <td style={R} className="num muted"><i>{fmt(b.pipeline)}</i></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Needs attention" pad={false}>
          {attention.length ? (
            <ul className="col" style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
              {attention.map(a => (
                <li key={a.k} className="row" style={{ gap: 10, padding: '8px 14px', alignItems: 'flex-start' }}>
                  <Chip tone={a.tone}>{a.chip}</Chip>
                  <span><b>{a.title}</b><div className="faint xs">{a.note}</div></span>
                </li>
              ))}
            </ul>
          ) : <div className="sm muted" style={{ padding: '12px 14px' }}>Nothing needs attention.</div>}
        </Card>
      </div>

      <div className="faint xs" style={{ marginTop: 14, maxWidth: 980 }}>
        As recorded in SalesOS. Ardorio comes from contracts and billing plans (admins of Ardorio). Rosterio is its live paying accounts at the prices Rosterio returns (admins of Rosterio); trials and test accounts are left out. Other businesses come from won subscription deals, read as a yearly value. Nothing is estimated where a figure is not available: that row says why and is left out of the totals.
      </div>
    </section>
  )
}
