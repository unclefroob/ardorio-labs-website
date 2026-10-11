import { useMemo, useState } from 'react'
import type { RosterioAccount, RosterioAccountsResponse } from '../../api/contract'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { createCompanyFor, dismissAccount, planLabel, rosterioLinkOf, standing, useDismissed, useRosterioAccounts, useRosterioLinks, type AccountStanding } from '../../data/rosterio'
import { S, useStore } from '../../data/store'
import { Banner, Btn, Card, Chip, CoLink, DataTable, Empty, Fld, Inp, Prog, Seg, Skel, Spinner, type Col } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { matchAccounts, REASON_TEXT, type AccountMatch } from '../../shared/rosterioMatch'
import { UI } from '../../ui/store'

interface Row extends RosterioAccount { match: AccountMatch; st: AccountStanding }

type StatusFilter = 'all' | 'paid' | 'trial' | 'cancelled'
type LinkFilter = 'any' | 'linked' | 'notLinked'

const TONE: Record<AccountStanding['kind'], string> = { paid: 'ok', trial: 'warn', trialEnded: 'bad', inactive: 'bad' }
const isTrial = (r: Row): boolean => r.st.kind === 'trial' || r.st.kind === 'trialEnded'

const NO_MATCH_TEXT: Record<'free-mail' | 'no-email' | 'no-similar', string> = {
  'free-mail': 'Personal email address, and no similar company name',
  'no-email': 'No similar company name',
  'no-similar': 'No company with the same email domain or a similar name',
}

export function RosterioCustomers() {
  useStore()
  useRosterioLinks()
  const acc = useRosterioAccounts('always')
  const dismissed = useDismissed()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [linkF, setLinkF] = useState<LinkFilter>('any')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [errs, setErrs] = useState<Record<string, string>>({})
  const canEdit = Q.canEdit('ros')

  const data: RosterioAccountsResponse | undefined = acc.s === 'ok' ? acc.data : acc.s === 'loading' || acc.s === 'error' ? acc.previous : undefined
  const rows = useMemo<Row[]>(() => {
    if (!data) return []
    const m = matchAccounts(data.accounts, S.companies, { linkOf: rosterioLinkOf, dismissed })
    return data.accounts.map(a => ({ ...a, match: m.get(a.id) ?? { kind: 'none', why: 'no-similar' }, st: standing(a) }))
    // S.companies is read live; useStore() re-renders on every change to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dismissed, S.companies.length, S.companies])

  const count = {
    live: rows.filter(r => r.isActive).length,
    paid: rows.filter(r => r.st.kind === 'paid').length,
    trial: rows.filter(isTrial).length,
    soon: rows.filter(r => r.st.kind === 'trial' && (r.st.days ?? 99) <= 7).length,
    cancelled: rows.filter(r => r.st.kind === 'inactive').length,
    linked: rows.filter(r => r.match.kind === 'linked').length,
  }
  const notLinked = rows.length - count.linked

  const needle = q.trim().toLowerCase()
  const shown = rows.filter(r =>
    (status === 'all' || (status === 'paid' ? r.st.kind === 'paid' : status === 'trial' ? isTrial(r) : r.st.kind === 'inactive'))
    && (linkF === 'any' || (linkF === 'linked') === (r.match.kind === 'linked'))
    && (!needle || r.name.toLowerCase().includes(needle) || (r.billingEmail ?? '').toLowerCase().includes(needle)))
  const showEmail = rows.some(r => !!r.billingEmail)

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

  const crm = (r: Row) => {
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
              <Btn size="sm" kind="pri" disabled={!canEdit} title={canEdit ? undefined : 'You need edit access to Rosterio'} onClick={() => link(r, m.company.id)}>Link</Btn>
              <Btn size="sm" kind="ghost" onClick={() => dismissAccount(r.id)}>Not it</Btn>
            </>
          ) : (
            <>
              <Btn size="sm" disabled={!canEdit} title={canEdit ? undefined : 'You need edit access to Rosterio'} onClick={() => void create(r)}>{err ? 'Retry' : 'Create company'}</Btn>
              <Btn size="sm" kind="ghost" disabled={!canEdit} onClick={() => link(r)}>Link to existing…</Btn>
            </>
          )}
        </div>
      </div>
    )
  }

  const cols: Col<Row>[] = [
    { k: 'name', l: 'Account', r: r => <div><b>{r.name}</b>{r.createdAt && <div className="faint sm">Joined {F.date(r.createdAt)}</div>}</div> },
    { k: 'plan', l: 'Plan', sort: r => String(r.plan ?? ''), r: r => (r.plan ? <Chip tone={r.plan === 'starter' ? '' : 'acc'}>{planLabel(r.plan)}</Chip> : <span className="faint">—</span>) },
    { k: 'st', l: 'Status', sort: r => r.st.kind + (r.st.days ?? 0), r: r => <Chip tone={TONE[r.st.kind]}>{r.st.label}</Chip> },
    { k: 'memberCount', l: 'Users', right: true, r: r => <span className="num">{r.memberCount}</span> },
    { k: 'billingEmail', l: <>Billing email <Chip style={{ marginLeft: 4 }}>admins only</Chip></>, hide: !showEmail, r: r => <span className="mono">{r.billingEmail ?? '—'}</span> },
    { k: 'crm', l: 'CRM company', nosort: true, wrap: true, w: 330, r: crm },
  ]

  const clear = (): void => { setStatus('all'); setLinkF('any'); setQ('') }
  const refresh = <Btn icon="refresh" disabled={acc.s === 'loading'} onClick={acc.reload}>Refresh</Btn>

  return (
    <div className="page">
      <PageHead title="Rosterio customers" sub="Live accounts, read from Rosterio each time you open this page. Nothing is copied into SalesOS.">
        {data && <span className="faint sm" title={F.dt(data.fetchedAt)}>Updated {F.rel(data.fetchedAt)}</span>}
        {acc.s !== 'notConfigured' && refresh}
      </PageHead>

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
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <div className="kpi" style={{ cursor: 'default' }}><span className="l">Live accounts</span><span className="v">{count.live}</span></div>
            <div className="kpi" style={{ cursor: 'default' }}><span className="l">Paid</span><span className="v">{count.paid}</span></div>
            <div className="kpi" style={{ cursor: 'default' }}>
              <span className="l">On trial</span>
              <span className="v row">{count.trial}{count.soon > 0 && <Chip tone="warn">{count.soon} end within 7 days</Chip>}</span>
            </div>
            <div className="kpi" style={{ cursor: 'default' }}>
              <span className="l">Linked to a CRM company</span>
              <span className="v row">{count.linked}<span style={{ width: 70 }}><Prog v={(count.linked / rows.length) * 100} /></span></span>
              <span className="s">{notLinked} not linked</span>
            </div>
          </div>

          {notLinked > 0 && (
            <div style={{ marginBottom: 14 }}>
              <Banner tone="info">{notLinked === 1 ? '1 account is' : `${notLinked} accounts are`} not linked to a CRM company. Review the suggestions below. Nothing links or creates a company until you click.</Banner>
            </div>
          )}

          <div className="row wrap" style={{ marginBottom: 12, gap: 10 }}>
            <Seg value={status} onChange={k => setStatus(k as StatusFilter)} opts={[['all', `All ${rows.length}`], ['paid', `Paid ${count.paid}`], ['trial', `Trial ${count.trial}`], ['cancelled', `Cancelled ${count.cancelled}`]]} />
            <Seg value={linkF} onChange={k => setLinkF(k as LinkFilter)} opts={[['any', 'Any'], ['linked', `Linked ${count.linked}`], ['notLinked', `Not linked ${notLinked}`]]} />
            <Fld><Inp value={q} onChange={setQ} placeholder={showEmail ? 'Search account or billing email' : 'Search account'} aria-label="Search accounts" style={{ width: 240 }} /></Fld>
            <span className="sp" />
            <span className="faint sm">Showing {shown.length} of {rows.length}</span>
          </div>

          <Card pad={false}>
            <DataTable
              cols={cols}
              rows={shown}
              page={50}
              empty={<Empty icon="search" title="No accounts match these filters" body="Try a different status or link filter, or clear the search." action={<Btn size="sm" onClick={clear}>Clear filters</Btn>} />}
            />
          </Card>
          {data.truncated && (
            <div className="faint sm" style={{ marginTop: 12 }}>Rosterio listed its newest {data.accounts.length} accounts. Older ones are not shown here, and the filters work only on what was loaded.</div>
          )}
        </>
      )}
    </div>
  )
}
