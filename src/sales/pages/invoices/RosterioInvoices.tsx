import { useMemo, useState, type ReactNode } from 'react'
import type { RosterioInvoice } from '../../api/contract'
import { SalesHttpError } from '../../api/http'
import { rosterioInvoices, rosterioInvoicesSync } from '../../api/rosterio'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { Banner, Btn, Card, Chip, CoLink, DataTable, Empty, SearchInp, Skel, Tabs, type Col } from '../../kit'
import { stripeXero } from '../../shared/xero'
import { Q } from '../../data/Q'
import { RosterioXeroPanel } from './RosterioXeroPanel'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

// Rosterio's subscription invoices, as Stripe has them: who has paid, who is behind, whose card failed. Read-only: Stripe takes
// the payments and SalesOS never changes anything there. Kept current every 15 minutes (and at once when Stripe tells the server).

export const rosMoney = (cents: number, cur = 'aud'): string =>
  (cur.toLowerCase() === 'aud' ? 'A$' : cur.toUpperCase() + ' ') + (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** One word for where an invoice stands, most urgent first. */
export function payState(i: RosterioInvoice): { label: string; tone: string } {
  if (i.status === 'paid') return { label: 'Paid', tone: 'ok' }
  if (i.status === 'void') return { label: 'Void', tone: '' }
  if (i.status === 'uncollectible') return { label: 'Written off', tone: 'bad' }
  if (i.status === 'draft') return { label: 'Draft', tone: '' }
  if (i.failed) return { label: i.nextAttemptAt ? `Payment failed · retry ${F.date(i.nextAttemptAt)}` : 'Payment failed', tone: 'bad' }
  if (i.overdue) return { label: 'Overdue', tone: 'warn' }
  return { label: 'Open', tone: 'info' }
}

type Filter = 'all' | 'paid' | 'open' | 'failed' | 'overdue' | 'void'
const FILTERS: Array<[Filter, string, (i: RosterioInvoice) => boolean]> = [
  ['all', 'All', () => true],
  ['failed', 'Payment failed', i => i.failed],
  ['overdue', 'Overdue', i => i.overdue && !i.failed],
  ['open', 'Open', i => i.status === 'open'],
  ['paid', 'Paid', i => i.status === 'paid'],
  ['void', 'Void / written off', i => i.status === 'void' || i.status === 'uncollectible'],
]

const all_find = (l: RosterioInvoice[] | undefined, id: string | null): RosterioInvoice | null => (id && l ? l.find(i => i.id === id) ?? null : null)

export function RosterioInvoices({ tabs }: { tabs: ReactNode }) {
  const list = useLoad(s => rosterioInvoices({}, s), 'ros-invoices')
  const [f, setF] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  // Xero actions belong to admins of Ardorio; anyone else sees the state only.
  const canAct = Q.canAdmin('ard')
  const open = all_find(list.data?.invoices, openId)
  const all = useMemo(() => list.data?.invoices ?? [], [list.data])
  const month = F.today().slice(0, 7)
  const collected = all.filter(i => i.status === 'paid' && (i.paidAt ?? '').slice(0, 7) === month).reduce((t, i) => t + i.amountPaidCents, 0)
  const outstanding = all.filter(i => i.status === 'open').reduce((t, i) => t + i.amountRemainingCents, 0)
  const failedN = all.filter(i => i.failed).length
  const rows = all.filter(i => FILTERS.find(x => x[0] === f)![2](i)).filter(i => !q || i.customerName.toLowerCase().includes(q.toLowerCase()) || (i.number ?? '').toLowerCase().includes(q.toLowerCase()))

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

  const cols: Col<RosterioInvoice>[] = [
    { k: 'number', l: 'Invoice', sort: i => i.number ?? '', r: i => <span className="mono sm">{i.number ?? '—'}</span> },
    { k: 'customer', l: 'Customer', sort: i => i.customerName, r: i => (i.companyId ? <CoLink id={i.companyId} /> : <span className="row" style={{ gap: 6 }}>{i.customerName}<Chip title="This Rosterio account is not linked to a company in SalesOS yet">Not linked</Chip></span>) },
    { k: 'period', l: 'Period', sort: i => i.periodStart ?? '', r: i => (i.periodStart && i.periodEnd ? <span className="sm">{F.date(i.periodStart)} – {F.date(i.periodEnd)}</span> : <span className="faint">—</span>) },
    { k: 'amount', l: 'Amount', right: true, sort: i => i.amountDueCents, r: i => <span className="num">{rosMoney(i.amountDueCents, i.currency)}</span> },
    { k: 'status', l: 'Status', sort: i => payState(i).label, r: i => { const s = payState(i); return <Chip tone={s.tone}>{s.label}</Chip> } },
    { k: 'xero', l: 'Xero', sort: i => stripeXero(i.xero)?.label ?? '', r: i => { const x = stripeXero(i.xero); return x ? <Chip tone={x.tone}>{x.label}</Chip> : <span className="faint">—</span> } },
    { k: 'when', l: 'Paid / due', sort: i => i.paidAt ?? i.dueAt ?? i.createdAt, r: i => <span className="sm">{i.paidAt ? F.date(i.paidAt) : i.dueAt ? `Due ${F.date(i.dueAt)}` : F.date(i.createdAt)}</span> },
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
        <div className="grid g3">
          <Card><div className="faint xs">Collected this month</div><div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{list.data ? rosMoney(collected) : '—'}</div></Card>
          <Card><div className="faint xs">Outstanding</div><div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{list.data ? rosMoney(outstanding) : '—'}</div></Card>
          <Card><div className="faint xs">Payment failed</div><div className="num" style={{ fontSize: 22, fontWeight: 600, color: failedN ? 'var(--bad2)' : undefined }}>{list.data ? failedN : '—'}</div></Card>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Tabs tabs={FILTERS.map(([k, l, pick]) => [k, l, list.data ? all.filter(pick).length : null] as const)} value={f} onChange={k => setF(k as Filter)} />
          <span className="sp" />
          <SearchInp value={q} onChange={setQ} placeholder="Search customer or invoice" w={260} />
        </div>
        {list.error ? (
          <Banner tone="bad">{list.error instanceof SalesHttpError ? list.error.message : 'Could not load Rosterio invoices. Try again.'}</Banner>
        ) : !list.data ? (
          <Card><Skel rows={8} table label="Loading Rosterio invoices" /></Card>
        ) : (
          <>
          {open && <RosterioXeroPanel key={open.id} invoice={open} canAct={canAct} onChange={list.reload} onClose={() => setOpenId(null)} />}
          <Card pad={false}>
            <DataTable<RosterioInvoice>
              cols={cols} rows={rows} page={50} sortInit={['when', -1]}
              empty={<Empty icon="file" title={all.length ? 'No invoices match' : 'No Rosterio invoices yet'} body={all.length ? 'Try another filter or search.' : 'Invoices appear once Stripe has billed a Rosterio account linked here. Use Check Stripe now to look again.'} />}
            />
          </Card>
          </>
        )}
      </div>
    </div>
  )
}
