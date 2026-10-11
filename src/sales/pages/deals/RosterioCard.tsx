import type { ReactNode } from 'react'
import type { RosterioAccount } from '../../api/contract'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import {
  accountOf, canOfferProvision, dismissAccount, linkSummary, planLabel, rosDealFor, rosterioLinkOf, standing, unlinkAccount, useDismissed, useRosterioAccounts,
  useRosterioLinks, useRosterioStatus,
} from '../../data/rosterio'
import { Banner, Btn, Card, Chip } from '../../kit'
import { accountForCompany, REASON_TEXT } from '../../shared/rosterioMatch'
import { UI } from '../../ui/store'

const open = (dealId: string): void => UI.open('provisionRosterio', { dealId })

const TONE = { paid: 'ok', trial: 'warn', trialEnded: 'bad', inactive: 'bad' } as const
const PAUSE_NOTE = 'New Rosterio deals on this company are not sent as leads, because it already has a live account.'

function unlink(companyId: string, accountName: string): void {
  const name = Q.company(companyId)?.name ?? 'This company'
  UI.confirm({
    title: 'Unlink the Rosterio account?',
    body: `${name} will no longer be linked to ${accountName}. Nothing changes in Rosterio, and new Rosterio deals on this company will be sent as leads again.`,
    confirm: 'Unlink',
    danger: true,
    onConfirm: () => {
      void unlinkAccount(companyId).then(r => UI.toast(r.ok ? 'Unlinked' : r.message, r.ok ? 'ok' : 'bad'))
    },
  })
}

function Live({ account, companyId, fetchedAt, reload, busy }: { account: RosterioAccount; companyId: string; fetchedAt: string; reload: () => void; busy: boolean }) {
  const st = standing(account)
  const edit = Q.canEdit('ros')
  const row = (label: string, v: ReactNode) => (
    <div className="row"><span className="faint sm" style={{ width: 92, flex: 'none' }}>{label}</span><span style={{ minWidth: 0 }}>{v}</span></div>
  )
  return (
    <div className="col" style={{ gap: 8 }}>
      {row('Account', <b>{account.name}</b>)}
      {row('Plan', account.plan ? <Chip tone="acc">{planLabel(account.plan)}</Chip> : '—')}
      {row('Status', <Chip tone={TONE[st.kind]}>{st.label}</Chip>)}
      {row('Active users', <span className="num">{account.memberCount}</span>)}
      {account.createdAt && row('Customer since', F.date(account.createdAt))}
      {account.billingEmail && row('Billing email', <span className="mono sm">{account.billingEmail}</span>)}
      {st.kind === 'trial' && edit && (
        <div>
          <Btn size="sm" kind="pri" onClick={() => UI.open('newTask', {
            businessId: 'ros', companyId, title: `Follow up the Rosterio trial for ${account.name}`, date: account.trialEndDate?.slice(0, 10),
          })}>Create a follow-up task</Btn>
        </div>
      )}
      <div className="row" style={{ marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <span className="faint sm" title={F.dt(fetchedAt)}>Read from Rosterio {F.rel(fetchedAt)}</span>
        <span className="sp" />
        <Btn size="xs" kind="ghost" icon="refresh" aria-label="Refresh" disabled={busy} onClick={reload} />
        {edit && <Btn size="xs" kind="ghost" onClick={() => unlink(companyId, account.name)}>Unlink</Btn>}
      </div>
    </div>
  )
}

/**
 * The Rosterio account for a company, on its Rosterio deal and on the company page.
 * Shows nothing unless the viewer is in Rosterio and there is something true to say.
 */
export function RosterioCard({ companyId, dealId }: { companyId: string; dealId?: string }) {
  const st = useRosterioStatus()
  useRosterioLinks()
  const dismissed = useDismissed()
  const member = Q.member('ros')
  const company = Q.company(companyId)
  const link = rosterioLinkOf(company)
  const inRos = !!Q.rel(companyId, 'ros')
  const wantsAccounts = member && ((link?.state === 'provisioned' && !!link.accountId) || (!link && inRos))
  const acc = useRosterioAccounts(wantsAccounts ? 'ifStale' : 'never')
  if (!member) return null
  const deal = (dealId ? Q.deal(dealId) : undefined) ?? rosDealFor(companyId)
  const hasRosDeal = !!deal && deal.businessId === 'ros'
  const offer = hasRosDeal && canOfferProvision(st, link)
  const recheck = hasRosDeal && Q.canEdit('ros') && link?.state === 'unknown' && st.s === 'ok' && st.status.configured

  const fresh = acc.s === 'ok' ? acc.data : undefined
  const live = link?.accountId ? accountOf(fresh, link.accountId) : undefined
  const lastSeen = !live && acc.s === 'error' && link?.accountId ? accountOf(acc.previous, link.accountId) : undefined
  const taken = new Set(S.companies.map(c => rosterioLinkOf(c)?.accountId).filter((x): x is string => !!x))
  const found = !link && company && fresh ? accountForCompany(company, fresh.accounts, { linkOf: rosterioLinkOf, dismissed, takenIds: taken }) : null

  if (!link && !hasRosDeal && !found) return null
  if (!link && !offer && !found) return null

  return (
    <Card
      title="Rosterio account"
      icon="zap"
      right={live ? <Chip tone="ok">Live</Chip> : lastSeen && acc.s === 'error' && acc.previous ? <Chip tone="warn">Last seen {F.rel(acc.previous.fetchedAt)}</Chip> : !link && found ? <Chip>Not linked</Chip> : undefined}
    >
      {link?.state === 'provisioned' && live && fresh && (
        <Live account={live} companyId={companyId} fetchedAt={fresh.fetchedAt} reload={acc.reload} busy={acc.s !== 'ok'} />
      )}
      {link?.state === 'provisioned' && !live && (
        <div className="col" style={{ gap: 8 }}>
          <div className="row wrap sm" style={{ gap: 6 }}>
            <Chip tone="ok">Set up</Chip>
            <span>Rosterio account: {linkSummary(link)}</span>
          </div>
          {acc.s === 'error' && (
            <Banner tone="warn" action={Q.canEdit('ros') ? <Btn size="xs" onClick={acc.reload}>Retry</Btn> : undefined}>
              Rosterio can&apos;t be reached right now. This is {lastSeen ? 'the last status SalesOS saw' : 'the saved link'}.
            </Banner>
          )}
          {acc.s === 'ok' && <div className="faint sm">This account is not in the latest list from Rosterio.</div>}
        </div>
      )}
      {link?.state === 'provisioned' && <div className="faint sm" style={{ marginTop: 8 }}>{PAUSE_NOTE}</div>}
      {link?.state === 'provisioning' && <div className="sm">Setting up the Rosterio account…</div>}
      {link?.state === 'unknown' && (
        <Banner tone="warn" action={recheck && deal ? <Btn size="sm" onClick={() => open(deal.id)}>Check status</Btn> : undefined}>
          We could not confirm whether the Rosterio account was created.
        </Banner>
      )}
      {found && (
        <div className="col" style={{ gap: 8, marginBottom: offer ? 12 : 0 }}>
          <div className="sm muted">A Rosterio account looks like this company: <b>{found.account.name}</b> ({REASON_TEXT[found.reason].toLowerCase()}).</div>
          <div className="row">
            <Btn size="sm" kind="pri" disabled={!Q.canEdit('ros')} onClick={() => UI.open('linkRosterio', { accountId: found.account.id, companyId })}>Review and link</Btn>
            <Btn size="sm" kind="ghost" onClick={() => dismissAccount(found.account.id)}>Not it</Btn>
          </div>
        </div>
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

