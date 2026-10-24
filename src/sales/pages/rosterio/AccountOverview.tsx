import type { ReactNode } from 'react'
import type { RosterioAccountDetail } from '../../api/contract'
import { planDriftText, planLabel, safeUrl } from '../../data/rosterio'
import { roleLabel } from '../../data/rosterioAccount'
import { dayText, perOf, rosMoneyOf, statePill } from '../../data/rosterioBilling'
import { Banner, Btn, Card, Chip, Prog } from '../../kit'
import { AlsoOnAccount } from './AccountPanels'

export type AccountTab = 'overview' | 'billing' | 'invoices' | 'people' | 'activity'

function Fig({ label, value, sub, bar, onClick }: { label: string; value: ReactNode; sub?: ReactNode; bar?: number; onClick?: () => void }) {
  const body = (
    <>
      <span className="l">{label}</span>
      <span className="v">{value}</span>
      {bar !== undefined && <Prog v={bar} />}
      {sub && <span className="s">{sub}</span>}
    </>
  )
  return onClick
    ? <button type="button" className="kpi" onClick={onClick}>{body}</button>
    : <div className="kpi static">{body}</div>
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="row"><span className="faint sm" style={{ width: 96, flex: 'none' }}>{label}</span><span style={{ minWidth: 0 }}>{children}</span></div>
}

/** What the contract says, ex GST: the price and how it is counted. */
const priceText = (t: NonNullable<RosterioAccountDetail['terms']>): string =>
  t.billingModel === 'flat' ? `${rosMoneyOf(t.amountCents)} ${perOf(t.interval)}, flat` : `${rosMoneyOf(t.amountCents)} per user ${perOf(t.interval)}`

export function AccountOverview({ d, go }: { d: RosterioAccountDetail; go: (t: AccountTab) => void }) {
  const t = d.terms
  const managed = d.pricing?.managedContract ?? !!t
  const pill = statePill(d.billingState, managed)
  const monthly = d.pricing?.monthlyCost
  const day = (s: string): string => dayText(s.slice(0, 10))
  return (
    <div className="col" style={{ gap: 14 }}>
      {d.planDrift && <Banner tone="info">{planDriftText(d.planDrift)} SalesOS leaves the deal as it is.</Banner>}
      <div className="grid g4">
        <Fig label="Active users" value={<>{d.memberCount} <span className="faint sm">of {d.maxUsers ?? 'unlimited'}</span></>} bar={d.maxUsers ? (d.memberCount / d.maxUsers) * 100 : undefined} />
        <Fig
          label="Locations"
          value={d.locationCount === null ? '—' : <>{d.locationCount} <span className="faint sm">of {d.maxLocations ?? 'unlimited'}</span></>}
          sub={d.locationCount === null ? 'Rosterio could not list them' : undefined}
          bar={d.locationCount !== null && d.maxLocations ? (d.locationCount / d.maxLocations) * 100 : undefined}
        />
        <Fig
          label="Contract value"
          value={monthly == null ? '—' : <>{rosMoneyOf(Math.round(monthly * 100))} <span className="faint sm">a month ex GST</span></>}
          sub={monthly == null ? 'No price from Rosterio' : `${rosMoneyOf(Math.round(monthly * 1200))} a year ex GST`}
        />
        <Fig label="Stripe billing" value={<Chip tone={pill.tone}>{pill.label}</Chip>} sub={managed ? 'Open the Billing tab' : undefined} onClick={managed ? () => go('billing') : undefined} />
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title="Contract terms" icon="file" right={managed && safeUrl(d.adminUrl) ? <a className="sm" href={safeUrl(d.adminUrl)} target="_blank" rel="noopener noreferrer">Correct terms</a> : undefined}>
          {t ? (
            <div className="col" style={{ gap: 8 }}>
              <Line label="Price">{priceText(t)} <span className="faint">ex GST</span></Line>
              <Line label="From">{day(t.effectiveFrom)}</Line>
              <Line label="Until">{t.effectiveUntil ? day(t.effectiveUntil) : 'No end date'}</Line>
              <Line label="Includes">{d.maxUsers ? `${d.maxUsers} users` : 'Unlimited users'}, {d.maxLocations ? `${d.maxLocations} locations` : 'unlimited locations'}</Line>
              {t.contractReference && <Line label="Reference">{t.contractReference}</Line>}
              <Line label="Status">{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</Line>
            </div>
          ) : (
            <div className="sm">
              No contract terms: this account is self-serve{d.plan ? ` on the ${planLabel(d.plan)} plan` : ''} and pays at checkout.
              {d.subscriptionStatus && <span className="faint"> Subscription {d.subscriptionStatus}.</span>}
            </div>
          )}
        </Card>

        <AlsoOnAccount d={d} />
      </div>

      <Card title="Account admins" icon="users" right={<Btn size="xs" kind="ghost" onClick={() => go('people')}>All {d.people.active} people</Btn>}>
        {d.admins.length === 0 ? <div className="faint sm">No active super admins.</div> : (
          <div className="col" style={{ gap: 6 }}>
            {d.admins.map((a, i) => <div key={i} className="row"><b>{a.name}</b><span className="faint sm">{roleLabel(a.role)}</span></div>)}
          </div>
        )}
      </Card>
    </div>
  )
}
