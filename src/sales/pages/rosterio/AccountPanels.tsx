import type { RosterioAccountDetail, RosterioBilling, RosterioInvoicesResponse } from '../../api/contract'
import { F } from '../../data/F'
import { roleLabel } from '../../data/rosterioAccount'
import { Banner, Card, Chip, DataTable, Empty, type Col } from '../../kit'
import type { RosterioInvoice } from '../../api/contract'
import { payState, rosMoney } from '../invoices/RosterioInvoices'

const cols: Col<RosterioInvoice>[] = [
  { k: 'number', l: 'Invoice', sort: i => i.number ?? '', r: i => <span className="mono sm">{i.number ?? '—'}</span> },
  { k: 'period', l: 'Period', sort: i => i.periodStart ?? '', r: i => (i.periodStart && i.periodEnd ? <span className="sm">{F.date(i.periodStart)} – {F.date(i.periodEnd)}</span> : <span className="faint">—</span>) },
  { k: 'amount', l: 'Amount', right: true, sort: i => i.amountDueCents, r: i => <span className="num">{rosMoney(i.amountDueCents, i.currency)}</span> },
  { k: 'status', l: 'Status', sort: i => payState(i).label, r: i => { const s = payState(i); return <Chip tone={s.tone}>{s.label}</Chip> } },
  { k: 'when', l: 'Paid / due', sort: i => i.paidAt ?? i.dueAt ?? i.createdAt, r: i => <span className="sm">{i.paidAt ? F.date(i.paidAt) : i.dueAt ? `Due ${F.date(i.dueAt)}` : F.date(i.createdAt)}</span> },
  { k: 'open', l: '', nosort: true, r: i => (i.hostedUrl?.startsWith('https://') ? <a className="sm" href={i.hostedUrl} target="_blank" rel="noopener noreferrer">View in Stripe</a> : null) },
]

export function InvoicesPanel({ data }: { data: RosterioInvoicesResponse | null }) {
  return (
    <div className="col" style={{ gap: 12 }}>
      {data && !data.configured && <Banner tone="warn">Stripe or Rosterio is not connected on the server, so payments cannot be read.</Banner>}
      {data?.syncError && <Banner tone="bad">The last check with Stripe failed: {data.syncError}</Banner>}
      <Card pad={false}>
        <DataTable<RosterioInvoice>
          cols={cols} rows={data?.invoices ?? []} page={25} sortInit={['when', -1]}
          empty={<Empty icon="file" title="No Stripe invoices yet" body="Invoices appear once Stripe has billed this account." />}
        />
      </Card>
    </div>
  )
}

export function PeoplePanel({ d }: { d: RosterioAccountDetail }) {
  const by = d.people.byRole
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Card title="Active people" icon="users" right={<span className="num b">{d.people.active}</span>}>
        <div className="col" style={{ gap: 6 }}>
          <div className="row"><span style={{ flex: 1 }}>Super admins</span><span className="num">{by.super_admin}</span></div>
          <div className="row"><span style={{ flex: 1 }}>Managers</span><span className="num">{by.manager}</span></div>
          <div className="row"><span style={{ flex: 1 }}>Staff</span><span className="num">{by.staff}</span></div>
          <div className="faint sm" style={{ marginTop: 4 }}>{d.maxUsers ? `The plan allows ${d.maxUsers} users.` : 'The plan has no user limit.'}</div>
        </div>
      </Card>
      <Card title="Account admins" icon="shield">
        {d.admins.length === 0 ? <div className="faint sm">No active super admins.</div> : (
          <div className="col" style={{ gap: 6 }}>
            {d.admins.map((a, i) => <div key={i} className="row"><b>{a.name}</b><span className="faint sm">{roleLabel(a.role)}</span></div>)}
          </div>
        )}
        <div className="faint sm" style={{ marginTop: 8 }}>Names only. Email addresses stay in Rosterio.</div>
      </Card>
    </div>
  )
}

/** AI credits and award setup, as Rosterio reports them. The operator feature switches are not shown here: they live in Rosterio Admin. */
export function AlsoOnAccount({ d }: { d: RosterioAccountDetail }) {
  return (
    <Card title="Also on the account" icon="info">
      <div className="col" style={{ gap: 8 }}>
        <div className="row"><span style={{ flex: 1 }}>AI credits each period</span><span className="num">{d.aiCreditsPerPeriod ?? '—'}</span></div>
        <div className="row">
          <span style={{ flex: 1 }}>Award setup</span>
          <span>{d.awardSetup ? <>{d.awardSetup.status.replace(/_/g, ' ')}{d.awardSetup.updatedAt && <span className="faint sm"> · {F.date(d.awardSetup.updatedAt)}</span>}</> : 'Not started'}</span>
        </div>
      </div>
    </Card>
  )
}

interface Event { at: string; what: string; sub?: string }

/** What can be said for certain: the account's creation, and each step of its billing as Rosterio has recorded it. */
export function activityOf(d: RosterioAccountDetail, b: RosterioBilling | null): Event[] {
  const out: Event[] = []
  if (d.createdAt) out.push({ at: d.createdAt, what: 'Account created' })
  const bl = b?.billing
  if (bl) {
    out.push({ at: bl.startedAt, what: 'Billing started', sub: `${bl.collection === 'charge_automatically' ? 'Card on file' : 'Emailed invoice'}, sent to ${bl.billingEmail}` })
    out.push({ at: bl.firstBillingDate, what: 'First bill', sub: bl.state === 'scheduled' ? 'Not yet: scheduled' : undefined })
    if (bl.cardSavedAt) out.push({ at: bl.cardSavedAt, what: 'Card added' })
    if (bl.stoppedAt) out.push({ at: bl.stoppedAt, what: 'Billing stopped' })
    else if (bl.state === 'stopping' && bl.currentPeriodEnd) out.push({ at: bl.currentPeriodEnd, what: 'Billing ends', sub: 'At the close of the period already billed' })
  }
  return out.sort((x, y) => y.at.localeCompare(x.at))
}

export function ActivityPanel({ d, billing }: { d: RosterioAccountDetail; billing: RosterioBilling | null }) {
  const events = activityOf(d, billing)
  return (
    <Card title="Activity" icon="activity">
      <div className="col" style={{ gap: 10 }}>
        {events.map((e, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="faint sm" style={{ width: 110, flex: 'none' }}>{F.date(e.at)}</span>
            <span><b>{e.what}</b>{e.sub && <span className="faint sm"> · {e.sub}</span>}</span>
          </div>
        ))}
        {!events.length && <div className="faint sm">Nothing recorded yet.</div>}
        <div className="faint sm">Only account creation and billing are listed. Sign-ins and changes inside Rosterio are not.</div>
      </div>
    </Card>
  )
}

