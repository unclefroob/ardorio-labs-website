import { useState, type ReactNode } from 'react'
import type { RosterioAccount } from '../../api/contract'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import { accountSnapshot, linkAccount, planLabel, rosterioLinkOf, standing, useDismissed } from '../../data/rosterio'
import type { Company } from '../../data/types'
import { Banner, Btn, Card, Chip, Fld, Inp, Spinner } from '../../kit'
import { Modal } from '../../kit/overlay'
import { accountForCompany, matchAccounts, REASON_TEXT } from '../../shared/rosterioMatch'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from './guards'

const TITLE = 'Link to a CRM company'

export function LinkRosterio({ accountId, companyId }: { accountId: string; companyId?: string }) {
  const account = accountSnapshot(accountId)
  if (!account) return <MissingModal title={TITLE} what="Rosterio account" />
  if (!Q.canEdit('ros')) return <NoEditModal title={TITLE} what="link Rosterio accounts" />
  return <Dialog account={account} initial={companyId} />
}

function Dialog({ account, initial }: { account: RosterioAccount; initial?: string }) {
  useStore()
  const dismissed = useDismissed()
  const [cid, setCid] = useState<string | undefined>(initial)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const company = cid ? Q.company(cid) : undefined
  const linkable = (c: Company): boolean => !c.archived && !rosterioLinkOf(c)?.accountId
  const suggestion = matchAccounts([account], S.companies, { linkOf: rosterioLinkOf, dismissed: new Set() }).get(account.id)
  const others = suggestion?.kind === 'suggested' ? [suggestion.company, ...suggestion.others].filter(c => c.id !== cid) : []
  const why = company
    ? accountForCompany(company, [account], { linkOf: () => undefined, takenIds: new Set(), dismissed: new Set() })
    : null
  const needle = q.trim().toLowerCase()
  const found = needle.length >= 2 ? S.companies.filter(c => linkable(c) && c.id !== cid && c.name.toLowerCase().includes(needle)).slice(0, 6) : []
  const st = standing(account)
  void dismissed

  const submit = async (): Promise<void> => {
    if (!company || busy) return
    setBusy(true)
    setErr('')
    const r = await linkAccount(company.id, account.id)
    setBusy(false)
    if (r.ok) {
      UI.close()
      const id = company.id
      UI.toast(`Linked ${account.name} to ${company.name}`, 'ok', { label: 'Open company', fn: () => UI.nav('company', { id }) })
    } else setErr(r.message)
  }

  const row = (label: string, v: ReactNode) => (
    <div className="row"><span className="faint sm" style={{ width: 92, flex: 'none' }}>{label}</span><span style={{ minWidth: 0 }}>{v}</span></div>
  )
  const rel = company ? Q.rel(company.id, 'ros') : undefined
  const openDeals = company ? S.deals.filter(d => d.companyId === company.id && d.businessId === 'ros' && d.status === 'open').length : 0

  return (
    <Modal
      title={`Link ${account.name} to a CRM company`}
      width={780}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" disabled={!company || busy} onClick={() => void submit()}>{busy ? 'Linking…' : err ? 'Retry' : 'Link company'}</Btn>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="grid g2">
          <Card title={<Chip tone="acc">Rosterio account</Chip>} style={{ background: 'var(--surf2)', boxShadow: 'none' }}>
            <div className="col" style={{ gap: 6 }}>
              <div className="b" style={{ fontSize: 14 }}>{account.name}</div>
              {row('Plan', <span className="row">{account.plan ? planLabel(account.plan) : '—'}<Chip tone={st.kind === 'paid' ? 'ok' : st.kind === 'trial' ? 'warn' : 'bad'}>{st.label}</Chip></span>)}
              {row('Users', <span className="num">{account.memberCount} active</span>)}
              {account.billingEmail && row('Billing email', <span className="mono">{account.billingEmail}</span>)}
              {account.createdAt && row('Joined', F.date(account.createdAt))}
            </div>
          </Card>
          <Card title={<Chip tone="info">CRM company</Chip>} style={{ boxShadow: 'none', borderColor: 'var(--acc-line)' }}>
            {company ? (
              <div className="col" style={{ gap: 6 }}>
                <div className="b" style={{ fontSize: 14 }}>{company.name}</div>
                {row('Website', <span className="mono">{company.domain || '—'}</span>)}
                {row('Industry', company.industry || '—')}
                {row('Owner', (rel && Q.user(rel.ownerId)?.name) || '—')}
                {row('Open deals', <span className="num">{openDeals}</span>)}
              </div>
            ) : <div className="faint sm">No company chosen yet. Pick one below.</div>}
          </Card>
        </div>

        {company && (
          <Banner tone="info">
            {why ? <><b>Why this match:</b> {REASON_TEXT[why.reason].toLowerCase()}.</> : <>You chose this company. There is no automatic match between these two.</>}
          </Banner>
        )}

        <div>
          <div className="b sm" style={{ marginBottom: 6 }}>{company ? 'Not the right company?' : 'Choose a company'}</div>
          {others.length > 0 && (
            <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
              {others.map(c => <Btn key={c.id} size="sm" onClick={() => setCid(c.id)}>{c.name}</Btn>)}
            </div>
          )}
          <Fld label="Search all companies">
            <Inp value={q} onChange={setQ} placeholder="Type at least 2 letters of the company name" />
          </Fld>
          {found.length > 0 && (
            <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
              {found.map(c => <Btn key={c.id} size="sm" onClick={() => { setCid(c.id); setQ('') }}>{c.name}</Btn>)}
            </div>
          )}
          {needle.length >= 2 && found.length === 0 && <div className="faint sm" style={{ marginTop: 6 }}>No unlinked company matches that name.</div>}
        </div>

        <Card style={{ background: 'var(--surf2)', boxShadow: 'none' }}>
          <div className="col" style={{ gap: 4 }}>
            <div className="b sm">What linking does</div>
            <div className="sm muted">Saves the Rosterio account id on this company, so its page shows the live plan, status and trial end.</div>
            <div className="sm muted">Stops new Rosterio deals on this company from being sent to Rosterio as leads. A note on the deal says why.</div>
            <div className="sm muted">Changes nothing in Rosterio. You can unlink later.</div>
          </div>
        </Card>
        {busy && <div className="row sm muted" role="status"><Spinner />Saving the link…</div>}
        {err && <Banner tone="bad">{err}</Banner>}
      </div>
    </Modal>
  )
}
