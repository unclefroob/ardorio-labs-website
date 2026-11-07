import { rosterioInvoices } from '../../api/rosterio'
import { F } from '../../data/F'
import { useLoad } from '../../data/invoicing'
import { Banner, Btn, Card, Kpi, Skel } from '../../kit'
import { collectionTotals } from '../../shared/rosterioCollection'
import { UI } from '../../ui/store'

// Dashboard > Rosterio collections: what Stripe has collected from Rosterio customers, what is owed, and what is late or failed.
// Rosterio admins only. It reads every Rosterio invoice, so the owner, team, source and Mine filters do not apply.

// Whole Australian dollars, like the dashboard tiles around it.
const fmt = (cents: number): string => F.money(cents / 100)
const open = (filter: 'paid' | 'unpaid' | 'late'): void => UI.nav('invoices', { q: { tab: 'ros', filter } })

/** The dashboard card. `filtered`: an owner, team, source or Mine filter is on, which this card does not follow. */
export function RosterioCollections({ filtered }: { filtered: boolean }) {
  const list = useLoad(s => rosterioInvoices({}, s), 'ros-invoices-dash')
  const title = 'Rosterio collections'
  const note = <span className="faint xs">{filtered ? 'All Rosterio invoices · filters above do not apply' : 'All Rosterio invoices'}</span>

  if (list.error) {
    return (
      <Card title={title} right={note}>
        <Banner tone="bad" action={<Btn size="sm" onClick={() => list.reload()}>Try again</Btn>}>Rosterio collections could not be loaded. The rest of the dashboard is unaffected.</Banner>
      </Card>
    )
  }
  if (!list.data) {
    return (
      <Card title={title} right={note}>
        <div style={{ minHeight: 72 }}><Skel rows={2} label="Loading Rosterio collections" /></div>
      </Card>
    )
  }
  if (!list.data.invoices.length) {
    return (
      <Card title={title} right={note}>
        <div className="sm muted">{list.data.configured ? 'No Rosterio invoices yet.' : 'Stripe is not connected, so there is nothing to show yet.'}</div>
      </Card>
    )
  }

  const t = collectionTotals(list.data.invoices, F.now().getTime())
  return (
    <Card title={title} right={note}>
      <div className="grid g3" style={{ gap: 12 }}>
        <Kpi label="Collected, last 30 days" value={fmt(t.collected30)} onClick={() => open('paid')} title="Open paid invoices" />
        <Kpi label="Outstanding" value={fmt(t.outstanding)} onClick={() => open('unpaid')} title="Open unpaid invoices" />
        <Kpi
          label="Overdue or failed" value={fmt(t.atRisk)} tone={t.overdue > 0 ? 'bad2' : undefined}
          sub={`${t.atRiskCount} invoice${t.atRiskCount === 1 ? '' : 's'}`} onClick={() => open('late')} title="Open overdue or failed invoices"
        />
      </div>
    </Card>
  )
}
