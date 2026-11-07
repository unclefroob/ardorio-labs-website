import { useMemo, useState, type ReactNode } from 'react'
import type { RosterioInvoice } from '../../api/contract'
import { SalesHttpError } from '../../api/http'
import { rosterioInvoices, rosterioInvoicesSync } from '../../api/rosterio'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { Banner, Btn, Card, Chip, CoLink, DataTable, Empty, Kpi, SearchInp, Seg, Skel, Tabs, type Col } from '../../kit'
import { qStr } from '../companies/query'
import { ageBucket, ageText, collectionOf, collectionTotals, type AgeBucket, type Collection } from '../../shared/rosterioCollection'
import { stripeXero } from '../../shared/xero'
import { Q } from '../../data/Q'
import { RosterioXeroPanel } from './RosterioXeroPanel'
import { PageHead } from '../../shared/PageHead'
import { UI, useUi } from '../../ui/store'

// Rosterio's subscription invoices, as Stripe has them: who has paid, who is behind, whose card failed. Read-only: Stripe takes
// the payments and SalesOS never changes anything there. Kept current every 15 minutes (and at once when Stripe tells the server).

export const rosMoney = (cents: number, cur = 'aud'): string =>
  (cur.toLowerCase() === 'aud' ? 'A$' : cur.toUpperCase() + ' ') + (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Filter = 'all' | 'unpaid' | 'late' | 'notdue' | 'paid' | 'void'
const FILTERS: Array<[Filter, string, (c: Collection) => boolean]> = [
  ['all', 'All', () => true],
  ['unpaid', 'Unpaid', c => c.ageDays !== null],
  ['late', 'Overdue or failed', c => c.rank <= 2],
  ['notdue', 'Not yet due', c => c.key === 'open'],
  ['paid', 'Paid', c => c.key === 'paid'],
  ['void', 'Void / written off', c => c.key === 'void' || c.key === 'written-off'],
]
const filterOf = (v: string): Filter => FILTERS.find(f => f[0] === v)?.[0] ?? 'all'

type Bucket = 'all' | AgeBucket
const BUCKETS: ReadonlyArray<readonly [Bucket, string]> = [['all', 'All'], ['0-7', '0-7 days'], ['8-30', '8-30 days'], ['30+', '30+ days']]

/** The date that matters for the invoice's state: paid on, next retry, due, or else when it was issued. */
const dateText = (i: RosterioInvoice): string =>
  i.paidAt ? `Paid ${F.date(i.paidAt)}` : i.status === 'open' && i.nextAttemptAt ? `Retry ${F.date(i.nextAttemptAt)}` : i.dueAt ? `Due ${F.date(i.dueAt)}` : `Issued ${F.date(i.createdAt)}`

const all_find = (l: RosterioInvoice[] | undefined, id: string | null): RosterioInvoice | null => (id && l ? l.find(i => i.id === id) ?? null : null)

export function RosterioInvoices({ tabs }: { tabs: ReactNode }) {
  const list = useLoad(s => rosterioInvoices({}, s), 'ros-invoices')
  const route = useUi().route
  // The filter lives in the address (q.filter), so a link can open one; an unknown one shows everything.
  const f = filterOf(qStr(route.q, 'filter'))
  const [bucket, setBucket] = useState<Bucket>('all')
  const choose = (k: Filter): void => {
    if (k === 'paid' || k === 'void') setBucket('all')
    UI.setRoute({ q: k === 'all' ? { tab: 'ros' } : { tab: 'ros', filter: k } })
  }
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  // Xero actions belong to admins of Ardorio; anyone else sees the state only.
  const canAct = Q.canAdmin('ard')
  const open = all_find(list.data?.invoices, openId)
  const all = useMemo(() => list.data?.invoices ?? [], [list.data])
  const now = F.now().getTime()
  const tot = collectionTotals(all, now)
  const states = new Map(all.map(i => [i.id, collectionOf(i, now)] as const))
  const stateOf = (i: RosterioInvoice): Collection => states.get(i.id) ?? collectionOf(i, now)
  const bucketCents = (b: Bucket): number => all.reduce((t, i) => { const c = stateOf(i); return c.ageDays !== null && (b === 'all' || ageBucket(c.ageDays) === b) ? t + c.owingCents : t }, 0)
  const pick = FILTERS.find(x => x[0] === f)![2]
  const rows = all
    .filter(i => pick(stateOf(i)))
    .filter(i => { const d = stateOf(i).ageDays; return bucket === 'all' || (d !== null && ageBucket(d) === bucket) })
    .filter(i => !q || i.customerName.toLowerCase().includes(q.toLowerCase()) || (i.number ?? '').toLowerCase().includes(q.toLowerCase()))

  const check = async (): Promise<void> => {
    setSyncing(true)
    try {
      const r = await rosterioInvoicesSync()
      if (r.error) UI.toast(`Stripe could not be read: ${r.error}`, 'bad')
      else UI.toast(r.invoices ? `${r.invoices} invoice${r.invoices === 1 ? '' : 's'} checked` : 'Up to date')
      list.reload()
    } catch (e) {
      UI.toast(e instanceof SalesHttpError ? e.message : 'Could not reach the server. Try again.', 'bad')
    } finally {
      setSyncing(false)
    }
  }

  // Most urgent first: the status rank, then the longest unpaid. Customer, status and amount lead so a phone shows them without scrolling.
  const cols: Col<RosterioInvoice>[] = [
    { k: 'customer', l: 'Customer', sort: i => i.customerName, r: i => (i.companyId ? <CoLink id={i.companyId} /> : <span className="row" style={{ gap: 6 }}>{i.customerName}<Chip title="This Rosterio account is not linked to a company in SalesOS yet">Not linked</Chip></span>) },
    { k: 'status', l: 'Status', sort: i => { const s = stateOf(i); return s.rank * 1e6 - (s.ageDays ?? 0) }, r: i => { const s = stateOf(i); return <Chip tone={s.tone}>{s.label}</Chip> } },
    { k: 'amount', l: 'Amount', right: true, sort: i => i.amountDueCents, r: i => <span className="num">{rosMoney(i.amountDueCents, i.currency)}</span> },
    { k: 'age', l: <span title="Days since the invoice date, while it is unpaid">Unpaid for</span>, sort: i => stateOf(i).ageDays ?? -1, r: i => { const d = stateOf(i).ageDays; return d === null ? <span className="faint">—</span> : <span className="sm">{ageText(d)}</span> } },
    { k: 'when', l: 'Date', sort: i => i.paidAt ?? i.nextAttemptAt ?? i.dueAt ?? i.createdAt, r: i => <span className="sm">{dateText(i)}</span> },
    { k: 'number', l: 'Invoice', sort: i => i.number ?? '', r: i => <span className="mono sm">{i.number ?? '—'}</span> },
    { k: 'period', l: 'Period', sort: i => i.periodStart ?? '', r: i => (i.periodStart && i.periodEnd ? <span className="sm">{F.date(i.periodStart)} – {F.date(i.periodEnd)}</span> : <span className="faint">—</span>) },
    { k: 'xero', l: 'Xero', sort: i => stripeXero(i.xero)?.label ?? '', r: i => { const x = stripeXero(i.xero); return x ? <Chip tone={x.tone}>{x.label}</Chip> : <span className="faint">—</span> } },
    { k: 'details', l: '', nosort: true, r: i => <Btn size="sm" kind="ghost" onClick={() => setOpenId(openId === i.id ? null : i.id)} aria-label={`Xero details for ${i.number ?? i.customerName}`}>Xero</Btn> },
    { k: 'open', l: '', nosort: true, r: i => (i.hostedUrl ? <a className="sm" href={i.hostedUrl} target="_blank" rel="noopener noreferrer">View in Stripe</a> : null) },
  ]

  return (
    <div className="page">
      <PageHead title="Invoices" sub="Rosterio subscriptions, as Stripe has them. Read-only: Stripe takes the payments, and nothing here changes them.">
        <span className="faint xs">{list.data?.syncedAt ? `Checked with Stripe ${F.rel(list.data.syncedAt)}` : 'Not checked with Stripe yet'}</span>
        <Btn icon="refresh" onClick={() => void check()} loading={syncing}>{syncing ? 'Checking…' : 'Check Stripe now'}</Btn>
      </PageHead>
      {tabs}
      <div className="col" style={{ gap: 14 }}>
        {list.data && !list.data.configured && <Banner tone="warn">Stripe or Rosterio is not connected on the server, so payments cannot be read. Nothing below is current.</Banner>}
        {list.data?.syncError && <Banner tone="bad">The last check with Stripe failed: {list.data.syncError}</Banner>}
        <div className="grid g4">
          <Kpi label="Collected, last 30 days" value={list.data ? rosMoney(tot.collected30) : '—'} onClick={() => choose('paid')} title="Show paid invoices" />
          <Kpi label="Outstanding" value={list.data ? rosMoney(tot.outstanding) : '—'} onClick={() => choose('unpaid')} title="Show unpaid invoices" />
          <Kpi
            label="Overdue or failed" value={list.data ? rosMoney(tot.atRisk) : '—'} tone={tot.overdue ? 'bad2' : undefined}
            sub={list.data ? `${tot.atRiskCount} invoice${tot.atRiskCount === 1 ? '' : 's'}` : undefined} onClick={() => choose('late')} title="Show overdue or failed invoices"
          />
          <Kpi label="Payment failed" value={list.data ? tot.failedCount : '—'} tone={tot.finalCount ? 'bad2' : undefined} onClick={() => choose('late')} title="Show overdue or failed invoices" />
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Tabs tabs={FILTERS.map(([k, l, fn]) => [k, l, list.data ? all.filter(i => fn(stateOf(i))).length : null] as const)} value={f} onChange={k => choose(filterOf(k))} />
          <span className="sp" />
          <SearchInp value={q} onChange={setQ} placeholder="Search customer or invoice" w={260} />
        </div>
        {list.data && f !== 'paid' && f !== 'void' && <div className="row wrap" style={{ gap: 8 }}><span className="faint xs">Age of unpaid invoices</span><Seg className="nowrap" label="Age of unpaid invoices" value={bucket} onChange={k => setBucket(BUCKETS.find(b => b[0] === k)?.[0] ?? 'all')} opts={BUCKETS.map(([k, l]) => [k, `${l} · ${rosMoney(bucketCents(k))}`] as const)} /></div>}
        {list.error ? (
          <Banner tone="bad">{list.error instanceof SalesHttpError ? list.error.message : 'Could not load Rosterio invoices. Try again.'}</Banner>
        ) : !list.data ? (
          <Card><Skel rows={8} table label="Loading Rosterio invoices" /></Card>
        ) : (
          <>
          {open && <RosterioXeroPanel key={open.id} invoice={open} canAct={canAct} onChange={list.reload} onClose={() => setOpenId(null)} />}
          <Card pad={false}>
            <DataTable<RosterioInvoice>
              cols={cols} rows={rows} page={50} sortInit={['status', 1]}
              empty={<Empty icon="file" title={all.length ? 'No invoices match' : 'No Rosterio invoices yet'} body={all.length ? 'Try another filter or search.' : 'Invoices appear once Stripe has billed a Rosterio account linked here. Use Check Stripe now to look again.'} />}
            />
          </Card>
          </>
        )}
      </div>
    </div>
  )
}
