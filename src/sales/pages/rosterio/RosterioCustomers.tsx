import { useMemo, useState } from 'react'
import type { RosterioAccount, RosterioAccountsResponse } from '../../api/contract'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { createCompanyFor, dismissAccount, planLabel, rosterioLinkOf, standing, useDismissed, useRosterioAccounts, useRosterioLinks, type AccountStanding } from '../../data/rosterio'
import { S, useStore } from '../../data/store'
import { Banner, Btn, Card, Chip, CoLink, DataTable, Empty, Fld, Icon, Inp, Prog, Seg, Skel, Spinner, Tabs, type Col } from '../../kit'
import { accountTab, isPriced, mrrOf, trialDaysLeft, type RosterioTab } from '../../shared/customers'
import { matchAccounts, REASON_TEXT, type AccountMatch } from '../../shared/rosterioMatch'
import { UI } from '../../ui/store'

/** How long an account has been a customer: "New this month", "5 months", "1 yr 3 mo". */
function tenure(createdAt: string): string {
  const a = new Date(createdAt), n = new Date()
  const months = (n.getFullYear() - a.getFullYear()) * 12 + n.getMonth() - a.getMonth() - (n.getDate() < a.getDate() ? 1 : 0)
  if (months < 1) return 'New this month'
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const y = Math.floor(months / 12), mo = months % 12
  return `${y} yr${mo ? ` ${mo} mo` : ''}`
}

interface Row extends RosterioAccount { match: AccountMatch; st: AccountStanding; tab: Exclude<RosterioTab, 'needs'> }

type PlanFilter = 'all' | 'starter' | 'pro' | 'enterprise'

const TONE: Record<AccountStanding['kind'], string> = { paid: 'ok', trial: 'warn', trialEnded: 'bad', inactive: 'bad' }

const NO_MATCH_TEXT: Record<'free-mail' | 'no-email' | 'no-similar', string> = {
  'free-mail': 'Personal email address, and no similar company name',
  'no-email': 'No similar company name',
  'no-similar': 'No company with the same email domain or a similar name',
}

const EMPTY: Record<RosterioTab, { title: string; body: string }> = {
  paid: { title: 'No paid accounts yet', body: 'Accounts that are active and not on a trial appear here.' },
  trials: { title: 'No accounts on trial', body: 'Accounts on a running trial appear here, soonest to end first.' },
  ended: { title: 'No ended trials or cancelled accounts', body: 'Accounts whose trial ran out, or that were cancelled or switched off, appear here.' },
  needs: { title: 'Every account is linked', body: 'Accounts without a CRM company appear here, whatever their status.' },
}

export function RosterioCustomers({ tab, onTab }: { tab: RosterioTab; onTab: (t: RosterioTab) => void }) {
  useStore()
  useRosterioLinks()
  const acc = useRosterioAccounts('always')
  const dismissed = useDismissed()
  const [plan, setPlan] = useState<PlanFilter>('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [errs, setErrs] = useState<Record<string, string>>({})
  const canEdit = Q.canEdit('ros')

  const data: RosterioAccountsResponse | undefined = acc.s === 'ok' ? acc.data : acc.s === 'loading' || acc.s === 'error' ? acc.previous : undefined
  const rows = useMemo<Row[]>(() => {
    if (!data) return []
    const m = matchAccounts(data.accounts, S.companies, { linkOf: rosterioLinkOf, dismissed })
    return data.accounts.map(a => ({ ...a, match: m.get(a.id) ?? { kind: 'none', why: 'no-similar' }, st: standing(a), tab: accountTab(a) }))
    // S.companies is read live; useStore() re-renders on every change to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dismissed, S.companies.length, S.companies])

  const paid = rows.filter(r => r.tab === 'paid')
  const trials = rows.filter(r => r.tab === 'trials').sort((a, b) => (a.st.days ?? 9999) - (b.st.days ?? 9999))
  const ended = rows.filter(r => r.tab === 'ended')
  const needs = rows.filter(r => r.match.kind !== 'linked')
  const soon = trials.filter(r => (trialDaysLeft(r.st) ?? 99) <= 7).length
  const linkedPaid = paid.filter(r => r.match.kind === 'linked').length
  const users = paid.reduce((n, r) => n + r.memberCount, 0)
  const byPlan = (['starter', 'pro', 'enterprise'] as const).map(p => [p, paid.filter(r => r.plan === p).length] as const).filter(([, n]) => n > 0)
  const showEmail = rows.some(r => !!r.billingEmail)
  // Only when Rosterio sent a price for at least one paying account (a Rosterio admin on a server that returns it). Never estimated.
  const mrr = mrrOf(paid)
  const hasPrice = !!mrr

  const needle = q.trim().toLowerCase()
  const search = (r: Row): boolean => !needle || r.name.toLowerCase().includes(needle) || (r.billingEmail ?? '').toLowerCase().includes(needle)
  const shownPaid = paid.filter(r => (plan === 'all' || r.plan === plan) && search(r))

  const create = async (a: RosterioAccount): Promise<void> => {
    setBusy(b => ({ ...b, [a.id]: true }))
    setErrs(e => ({ ...e, [a.id]: '' }))
    const r = await createCompanyFor(a)
    setBusy(b => ({ ...b, [a.id]: false }))
    if (r.ok) {
      const cid = r.companyId
      UI.toast(`Created ${a.name} and linked it`, 'ok', cid ? { label: 'Open company', fn: () => UI.nav('company', { id: cid }) } : undefined)
    } else setErrs(e => ({ ...e, [a.id]: r.message }))
  }
  const link = (a: RosterioAccount, companyId?: string): void => UI.open('linkRosterio', { accountId: a.id, companyId })
  const needsEdit = canEdit ? undefined : 'You need edit access to Rosterio'
  const suggestedId = (r: Row): string | undefined => (r.match.kind === 'suggested' ? r.match.company.id : undefined)

  const crmFull = (r: Row) => {
    const err = errs[r.id]
    const m = r.match
    if (m.kind === 'linked') {
      return (
        <div>
          <div className="row"><Chip tone="ok" icon="check">Linked</Chip><CoLink id={m.company.id} /></div>
          <div className="faint sm" style={{ marginTop: 2 }}>Lead pushes paused for this company</div>
        </div>
      )
    }
    return (
      <div style={{ minWidth: 260 }}>
        {m.kind === 'suggested' ? (
          <>
            <div className="b">Possible match: {m.company.name}</div>
            <div className="faint sm">{REASON_TEXT[m.reason]}</div>
          </>
        ) : (
          <>
            <div className="b faint">No match found</div>
            <div className="faint sm">{NO_MATCH_TEXT[m.why]}</div>
          </>
        )}
        {err && <div className="sm" role="alert" style={{ color: 'var(--bad-ink)', marginTop: 4 }}>{err}</div>}
        <div className="row" style={{ marginTop: 6 }}>
          {busy[r.id] ? <span className="row sm"><Spinner />Working…</span> : m.kind === 'suggested' ? (
            <>
              <Btn size="sm" kind="pri" disabled={!canEdit} title={needsEdit} onClick={() => link(r, m.company.id)}>Link</Btn>
              <Btn size="sm" kind="ghost" onClick={() => dismissAccount(r.id)}>Not it</Btn>
            </>
          ) : (
            <>
              <Btn size="sm" disabled={!canEdit} title={needsEdit} onClick={() => void create(r)}>{err ? 'Retry' : 'Create company'}</Btn>
              <Btn size="sm" kind="ghost" disabled={!canEdit} onClick={() => link(r)}>Link to existing…</Btn>
            </>
          )}
        </div>
      </div>
    )
  }

  // The short cell for the Paid, Trials and Ended tabs: say whether it is linked, and offer the one click that links it.
  const crmShort = (r: Row) => {
    const m = r.match
    if (m.kind === 'linked') return <div className="row" style={{ gap: 6 }}><Icon n="check" s={13} style={{ color: 'var(--ok)' }} /><span className="sr-only">Linked to</span><CoLink id={m.company.id} /></div>
    return (
      <Btn size="sm" icon="link" disabled={!canEdit} title={needsEdit} aria-label={`Link ${r.name} to a CRM company`} onClick={() => link(r, suggestedId(r))}>Link company</Btn>
    )
  }

  // The account, with its billing email underneath for the admins the server sends it to.
  const account = (r: Row) => (
    <div style={{ minWidth: 0 }}>
      <b>{r.name}</b>
      {showEmail && r.billingEmail && <div className="faint sm trunc" title={r.billingEmail}>{r.billingEmail}</div>}
    </div>
  )
  const planCell = (r: Row) => (r.plan ? <Chip tone={r.plan === 'starter' ? '' : 'acc'}>{planLabel(r.plan)}</Chip> : <span className="faint">—</span>)
  const usersCol: Col<Row> = { k: 'memberCount', l: 'Users', right: true, r: r => <span className="num">{r.memberCount}</span> }
  const revenueCol: Col<Row> = {
    k: 'revenue', l: 'Monthly revenue', right: true, desc: true, hide: !hasPrice,
    sort: r => (isPriced(r) ? r.monthlyCost : null),
    r: r => {
      if (!isPriced(r)) return <span className="faint" title="No price returned">—</span>
      // A custom contract is one flat price (its seat count is not meaningful), so say what it comes to per user instead.
      const custom = r.pricingSource === 'custom'
      const perUser = custom && r.memberCount > 0 ? `A$${(r.monthlyCost / r.memberCount).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per user` : ''
      const seats = !custom && typeof r.billingQuantity === 'number' && r.billingQuantity > 0 ? `${r.billingQuantity} seat${r.billingQuantity === 1 ? '' : 's'}` : ''
      return (
        <div style={{ textAlign: 'right' }}>
          <span className="num b">{F.money(r.monthlyCost)}</span>
          <div className="faint sm">{custom ? <>Custom contract{perUser && <span className="num"> · {perUser}</span>}</> : seats}</div>
        </div>
      )
    },
  }
  const since: Col<Row> = {
    k: 'createdAt', l: 'Customer since', sort: r => r.createdAt ?? '',
    r: r => (r.createdAt ? <div>{F.date(r.createdAt)}<div className="faint sm">{tenure(r.createdAt)}</div></div> : '—'),
  }

  const tabCols: Record<RosterioTab, Col<Row>[]> = {
    paid: [
      { k: 'name', l: 'Account', wrap: true, w: 300, r: account },
      { k: 'plan', l: 'Plan', sort: r => String(r.plan ?? ''), r: planCell },
      usersCol, revenueCol, since,
      { k: 'crm', l: 'CRM company', nosort: true, r: crmShort },
    ],
    trials: [
      { k: 'name', l: 'Account', r: account },
      { k: 'plan', l: 'Plan', sort: r => String(r.plan ?? ''), r: planCell },
      usersCol,
      { k: 'trialEndDate', l: 'Trial ends', sort: r => r.trialEndDate ?? '', r: r => (r.trialEndDate ? F.date(r.trialEndDate) : '—') },
      { k: 'days', l: 'Days left', sort: r => r.st.days ?? 9999, r: r => {
        const d = trialDaysLeft(r.st)
        return d === undefined ? <Chip>Trial</Chip> : <Chip tone={d <= 7 ? 'bad' : d <= 14 ? 'warn' : ''}>{d === 0 ? 'Ends today' : `${d} day${d === 1 ? '' : 's'}`}</Chip>
      } },
      { k: 'crm', l: 'CRM company', nosort: true, r: crmShort },
      { k: 'act', l: '', nosort: true, r: r => (
        <Btn size="sm" disabled={!canEdit} title={needsEdit} onClick={() => UI.open('newTask', {
          businessId: 'ros', companyId: r.match.kind === 'linked' ? r.match.company.id : undefined, title: `Follow up the Rosterio trial for ${r.name}`, date: r.trialEndDate?.slice(0, 10),
        })}>Create follow-up task</Btn>
      ) },
    ],
    ended: [
      { k: 'name', l: 'Account', r: account },
      { k: 'plan', l: 'Plan', sort: r => String(r.plan ?? ''), r: planCell },
      { k: 'st', l: 'Status', sort: r => r.st.kind, r: r => <Chip tone={TONE[r.st.kind]}>{r.st.label}</Chip> },
      { k: 'ended', l: 'Ended', sort: r => r.trialEndDate ?? '', r: r => (r.st.kind === 'trialEnded' && r.trialEndDate ? F.date(r.trialEndDate) : '—') },
      usersCol,
      { k: 'crm', l: 'CRM company', nosort: true, r: crmShort },
    ],
    needs: [
      { k: 'name', l: 'Account', wrap: true, w: 280, r: r => <div>{account(r)}{r.createdAt && <div className="faint sm">Joined {F.date(r.createdAt)}</div>}</div> },
      { k: 'plan', l: 'Plan', sort: r => String(r.plan ?? ''), r: planCell },
      { k: 'st', l: 'Status', sort: r => r.st.kind + (r.st.days ?? 0), r: r => <Chip tone={TONE[r.st.kind]}>{r.st.label}</Chip> },
      { k: 'crm', l: 'Suggested CRM company', nosort: true, wrap: true, w: 340, r: crmFull },
    ],
  }
  const tabRows: Record<RosterioTab, Row[]> = { paid: shownPaid, trials, ended, needs }

  const refresh = (
    <>
      {data && <span className="faint sm" title={F.dt(data.fetchedAt)}>Read from Rosterio {F.rel(data.fetchedAt)}</span>}
      {acc.s !== 'notConfigured' && <Btn icon="refresh" disabled={acc.s === 'loading'} onClick={acc.reload}>Refresh</Btn>}
    </>
  )

  return (
    <>
      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 12, gap: 8 }}>{refresh}</div>

      {acc.s === 'notConfigured' && (
        <Card><div className="col" style={{ gap: 12, padding: 6 }}>
          <div><Chip tone="warn">Not set up</Chip></div>
          <div className="b" style={{ fontSize: 15 }}>Rosterio isn&apos;t connected yet</div>
          <div className="sm muted">The server needs the Rosterio URL and key before accounts can be listed. Ask an admin to add them. Deals can still be pushed once it&apos;s set up.</div>
          <div><Btn size="sm" onClick={() => UI.nav('integrations')}>Open Integrations</Btn></div>
        </div></Card>
      )}

      {acc.s === 'error' && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="bad" action={<Btn size="sm" kind="pri" onClick={acc.reload}>Try again</Btn>}>
            Couldn&apos;t load accounts from Rosterio. It may be down, or the key may have changed. {acc.message}
          </Banner>
          {data && <div className="faint sm" style={{ marginTop: 6 }}>Showing the last read, {F.rel(data.fetchedAt)}. Nothing here has been changed.</div>}
        </div>
      )}

      {(acc.s === 'idle' || (acc.s === 'loading' && !data)) && (
        <Card><div className="row sm muted" role="status" style={{ marginBottom: 12 }}><Spinner />Reading accounts from Rosterio…</div><Skel rows={5} /></Card>
      )}

      {data && rows.length === 0 && acc.s !== 'error' && (
        <Card pad={false}><Empty icon="zap" title="No Rosterio accounts yet" body="When a customer signs up or you provision one from a won deal, it appears here with its plan and trial dates." action={<Btn size="sm" onClick={() => UI.nav('deals')}>Go to Deals</Btn>} /></Card>
      )}

      {data && rows.length > 0 && (
        <>
          <div className={`grid ${mrr ? 'g5' : 'g4'}`} style={{ marginBottom: 14 }}>
            <div className="kpi" style={{ cursor: 'default' }}><span className="l">Paying customers</span><span className="v">{paid.length}</span></div>
            {mrr && (
              <div className="kpi" style={{ cursor: 'default' }}>
                <span className="l">Monthly recurring revenue</span>
                <span className="v">{F.money(mrr.total)}</span>
                <span className="s">{F.money(mrr.total * 12)} a year</span>
                {mrr.priced < mrr.paying && <span className="s">{mrr.priced} of {mrr.paying} paying accounts have a price</span>}
              </div>
            )}
            <div className="kpi" style={{ cursor: 'default' }}><span className="l">Active users across them</span><span className="v">{users.toLocaleString()}</span></div>
            <div className="kpi" style={{ cursor: 'default' }}>
              <span className="l">By plan</span>
              <span className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                {byPlan.length ? byPlan.map(([p, n]) => <Chip key={p} tone={p === 'starter' ? '' : p === 'pro' ? 'acc' : 'info'}>{planLabel(p)} {n}</Chip>) : <span className="faint sm">None yet</span>}
              </span>
            </div>
            <div className="kpi" style={{ cursor: 'default' }}>
              <span className="l">Linked to a CRM company</span>
              <span className="v row">{linkedPaid}<span style={{ width: 70 }}><Prog v={paid.length ? (linkedPaid / paid.length) * 100 : 0} /></span></span>
              <span className="s">of {paid.length} paying</span>
            </div>
          </div>

          <Tabs value={tab} onChange={k => onTab(k as RosterioTab)} tabs={[['paid', 'Paid', paid.length], ['trials', 'Trials', trials.length], ['ended', 'Ended', ended.length], ['needs', 'Needs linking', needs.length]]} />

          {tab === 'trials' && soon > 0 && (
            <div style={{ marginBottom: 12 }}><Banner tone="warn">{soon === 1 ? '1 trial ends' : `${soon} trials end`} within 7 days. Sorted by days left.</Banner></div>
          )}
          {tab === 'needs' && needs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Banner tone="info">{needs.length === 1 ? '1 account has' : `${needs.length} accounts of any status have`} no CRM company. Review the suggestions. Nothing links or creates a company until you click.</Banner>
            </div>
          )}
          {tab === 'paid' && (
            <div className="row wrap" style={{ marginBottom: 12, gap: 10 }}>
              <Seg value={plan} onChange={k => setPlan(k as PlanFilter)} opts={[['all', 'All plans'], ['starter', 'Starter'], ['pro', 'Pro'], ['enterprise', 'Enterprise']]} />
              <Fld><Inp value={q} onChange={setQ} placeholder={showEmail ? 'Search account or billing email' : 'Search account'} aria-label="Search accounts" style={{ width: 240 }} /></Fld>
              <span className="sp" />
              <span className="faint sm">Showing {shownPaid.length} of {paid.length}</span>
            </div>
          )}

          <Card pad={false}>
            <DataTable
              key={`${tab}-${hasPrice}`}
              sortInit={tab === 'paid' && hasPrice ? ['revenue', -1] : null}
              cols={tabCols[tab]}
              rows={tabRows[tab]}
              page={50}
              empty={tab === 'paid' && paid.length > 0
                ? <Empty icon="search" title="No accounts match these filters" body="Try a different plan, or clear the search." action={<Btn size="sm" onClick={() => { setPlan('all'); setQ('') }}>Clear filters</Btn>} />
                : <Empty icon="search" title={EMPTY[tab].title} body={EMPTY[tab].body} />}
            />
          </Card>
          {data.truncated && (
            <div className="faint sm" style={{ marginTop: 12 }}>Rosterio listed its newest {data.accounts.length} accounts. Older ones are not shown here, and the filters work only on what was loaded.</div>
          )}
        </>
      )}
    </>
  )
}
