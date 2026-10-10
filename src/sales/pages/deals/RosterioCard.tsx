import { Q } from '../../data/Q'
import { canOfferProvision, linkSummary, rosDealFor, rosterioLinkOf, useRosterioLinks, useRosterioStatus } from '../../data/rosterio'
import { Banner, Btn, Card, Chip } from '../../kit'
import { UI } from '../../ui/store'

const open = (dealId: string): void => UI.open('provisionRosterio', { dealId })

/**
 * The Rosterio account for a company, on its Rosterio deal and on the company page.
 * Shows nothing unless the viewer is in Rosterio and there is something true to say.
 */
export function RosterioCard({ companyId, dealId }: { companyId: string; dealId?: string }) {
  const st = useRosterioStatus()
  useRosterioLinks()
  if (!Q.member('ros')) return null
  const deal = (dealId ? Q.deal(dealId) : undefined) ?? rosDealFor(companyId)
  const link = rosterioLinkOf(Q.company(companyId))
  const hasRosDeal = !!deal && deal.businessId === 'ros'
  if (!link && !hasRosDeal) return null
  const offer = hasRosDeal && canOfferProvision(st, link)
  const recheck = hasRosDeal && Q.canEdit('ros') && link?.state === 'unknown' && st.s === 'ok' && st.status.configured
  if (!link && !offer) return null

  return (
    <Card title="Rosterio account" icon="zap">
      {link?.state === 'provisioned' && (
        <div className="row wrap sm" style={{ gap: 6 }}>
          <Chip tone="ok">Set up</Chip>
          <span>Rosterio account: {linkSummary(link)}</span>
        </div>
      )}
      {link?.state === 'provisioning' && <div className="sm">Setting up the Rosterio account…</div>}
      {link?.state === 'unknown' && (
        <Banner tone="warn" action={recheck && deal ? <Btn size="sm" onClick={() => open(deal.id)}>Check status</Btn> : undefined}>
          We could not confirm whether the Rosterio account was created.
        </Banner>
      )}
      {offer && deal && (
        <div className="col" style={{ gap: 8 }}>
          <div className="faint sm">No Rosterio account yet. Creating one makes a live account and a login for the customer.</div>
          <div><Btn size="sm" kind="pri" icon="zap" onClick={() => open(deal.id)}>Provision Rosterio account</Btn></div>
        </div>
      )}
    </Card>
  )
}

/** Shown after a Rosterio deal is won. It only asks: nothing is created until the person opens the dialog and confirms. */
export function RosterioWinPrompt({ dealId }: { dealId: string }) {
  const st = useRosterioStatus()
  useRosterioLinks()
  const d = Q.deal(dealId)
  if (!d || d.businessId !== 'ros') return null
  const link = rosterioLinkOf(Q.company(d.companyId))
  if (!canOfferProvision(st, link)) return null
  const name = Q.company(d.companyId)?.name ?? 'this company'
  return (
    <div style={{ marginTop: 14 }}>
      <Banner tone="info" action={<Btn size="sm" kind="pri" onClick={() => open(d.id)}>Set up account</Btn>}>
        Provision a Rosterio account for {name}?
      </Banner>
    </div>
  )
}

