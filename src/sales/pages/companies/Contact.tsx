import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { EnrichField } from '../../api/contract'
import type { BusinessId, Contact as ContactT } from '../../data/types'
import { Av, Banner, BizDot, Btn, Card, Chip, CLS_TONE, CoLink, Empty, Icon, Link, Menu, Owner, ScoreRing, Seg, Sel, Tabs, Timeline } from '../../kit'
import { LEAD_STATUSES } from '../../modals/entities/options'
import { PERM } from '../../shared/constants'
import { PageHead } from '../../shared/PageHead'
import type { Route } from '../../ui/store'
import { UI } from '../../ui/store'
import { ContactIntel } from './ContactIntel'
import { EnrolTable } from './parts/EnrolTable'
import { ActFilter } from './parts/ActFilter'
import { Notes } from './parts/Notes'
import { TaskTable } from './parts/TaskTable'
import { qStr, safeHref } from './query'
import { Coord, DealTable } from './tables'
import { ScorePanel } from './ScorePanel'

const VERIFY_TONE: Record<string, string> = { Verified: 'ok', Invalid: 'bad', Inferred: 'warn' }

/** Badge and cited link for a field that Grok filled. Only http(s) links are rendered as links. */
function Prov({ ct, k }: { ct: ContactT; k: EnrichField }) {
  const e = ct.enrichment?.[k]
  if (!e) return null
  const href = safeHref(e.sourceUrl ?? '')
  return (
    <span className="row" style={{ gap: 6, display: 'inline-flex', marginLeft: 8 }}>
      <Chip tone={e.kind === 'inferred' ? 'warn' : 'info'} title={`Added ${F.dt(e.at)} by ${Q.user(e.by)?.name ?? 'a user'}${e.pattern ? `, pattern ${e.pattern}` : ''}`}>{e.kind === 'inferred' ? 'Guessed' : 'Published'}</Chip>
      {href && <a className="xs" href={href} target="_blank" rel="noopener noreferrer">source</a>}
    </span>
  )
}

export function Contact({ route }: { route: Route }) {
  useStore()
  const ct = Q.contact(route.id)
  const [tab, setTab] = useState(qStr(route.q, 'tab') || 'overview')
  const [bSel, setB] = useState('')

  if (!ct) {
    return (
      <div className="page">
        <Empty icon="user" title="Contact not found" body="It may have been deleted, or the link is out of date." action={<Btn onClick={() => UI.nav('contacts')}>Back to contacts</Btn>} />
      </div>
    )
  }
  const bs: BusinessId[] = Q.crelsOf(ct.id).map(r => r.businessId).filter(x => Q.member(x))
  if (!bs.length) {
    return (
      <div className="page">
        <Empty icon="lock" title="Restricted record" body="This contact is only associated with businesses you are not a member of." action={<Btn onClick={() => UI.nav('contacts')}>Back to contacts</Btn>} />
      </div>
    )
  }
  const ws = Q.wsBiz()
  const b = bs.find(x => x === bSel) ?? (ws && bs.includes(ws) ? ws : bs[0])
  const r = Q.crel(ct.id, b)
  const co = Q.company(ct.companyId)
  const can = Q.canEdit(b)
  const s = Q.score(ct.id, b)
  const sup = Q.suppressed(ct, b)
  const li = safeHref(ct.linkedin)
  const mock = Q.mockVerified(ct)
  const markVerified = (): void => {
    Act.markVerified(ct.id)
    UI.toast('Email marked verified')
  }
  const acts = Q.activities().filter(a => a.contactId === ct.id).sort((a, x) => x.ts.localeCompare(a.ts))
  const ths = S.threads.filter(t => t.contactId === ct.id && Q.member(t.businessId)).sort((a, x) => x.updatedAt.localeCompare(a.updatedAt))
  const ens = S.enrolments.filter(e => e.contactId === ct.id && Q.member(e.businessId))
  const deals = S.deals.filter(d => d.contactIds.includes(ct.id) && Q.member(d.businessId))
  const tasks = S.tasks.filter(t => t.contactId === ct.id && Q.member(t.businessId))
  const live = Q.activeEnrol(ct.id)
  const tCtx = { businessId: b, companyId: ct.companyId, contactId: ct.id }

  return (
    <div className="page">
      <PageHead
        crumb={[<Link to="contacts">Contacts</Link>, ...(co ? [<CoLink id={co.id} />] : [])]}
        title={<span className="row" style={{ gap: 12 }}><Av name={ct.name} s={40} color="var(--acc)" />{ct.name}</span>}
        sub={
          <span className="row wrap" style={{ gap: 8 }}>
            <span>{ct.title || 'No title'}{co && <> at <CoLink id={co.id} /></>}</span>
            {ct.email && <span><Icon n="mail" s={12} /> {ct.email}</span>}
            {(ct.phone || ct.mobile) && <span className="mono"><Icon n="phone" s={12} /> {ct.phone || ct.mobile}</span>}
            <Chip tone={VERIFY_TONE[ct.verification] ?? ''} title={ct.verification === 'Verified' && ct.verifiedAt ? `Verified by ${Q.user(ct.verifiedBy)?.name ?? 'a former user'}, ${F.dt(ct.verifiedAt)}` : undefined}>{ct.verification === 'Inferred' ? 'Guessed' : ct.verification}</Chip>
            {mock && <Chip tone="warn">Verified by the old simulation, please confirm</Chip>}
            {can && ct.email && ct.verification !== 'Verified' && ct.verification !== 'Invalid' && <Btn size="xs" icon="check" onClick={markVerified}>Mark verified</Btn>}
            {can && mock && <Btn size="xs" icon="check" onClick={markVerified}>Mark verified</Btn>}
          </span>
        }
      >
        {bs.length > 1 && <Seg value={b} onChange={setB} opts={bs.map(x => [x, Q.biz(x)?.name ?? x] as const)} />}
        <div className="row" style={{ gap: 8 }}>
          <ScoreRing v={s.total} s={38} />
          <div className="col" style={{ gap: 2 }}>
            <Chip tone={Q.scoreTone(s.label)}>{s.label}</Chip>
            <span className="xs faint">Owner: {Q.user(r?.ownerId)?.name ?? 'Unassigned'}</span>
          </div>
        </div>
        {can && <Btn icon="edit" onClick={() => UI.open('editContact', { id: ct.id })}>Edit</Btn>}
      </PageHead>
      <div className="col gap12" style={{ marginBottom: 14 }}>
        {sup && <Banner tone="bad"><b>Do not contact.</b> {sup.scope === 'global' ? 'Global' : 'Business'} suppression — {sup.reason} ({F.date(sup.date)}). Source: {sup.source}</Banner>}
        {ct.deliverability === 'Bounced' && (
          <Banner tone="bad" action={can && <Btn size="sm" icon="zap" onClick={() => UI.open('enrich', { contactId: ct.id })}>Find new email</Btn>}>
            Email address bounced. Sequences will not send to this contact.
          </Banner>
        )}
        {co && <Coord companyId={co.id} contactId={ct.id} />}
        {can && (
          <div className="row wrap" style={{ gap: 6 }}>
            <Btn size="sm" icon="mail" onClick={() => UI.open('compose', { contactId: ct.id, businessId: b })}>Send email</Btn>
            <Btn size="sm" icon="phone" onClick={() => UI.open('logCall', { contactId: ct.id, businessId: b })}>Log call</Btn>
            <Btn size="sm" icon="checksq" onClick={() => UI.open('newTask', tCtx)}>Create task</Btn>
            <Btn size="sm" icon="send" onClick={() => UI.open('enrol', { contactIds: [ct.id] })}>Enrol in sequence</Btn>
            <Btn size="sm" icon="zap" onClick={() => UI.open('enrich', { contactId: ct.id })}>Enrich contact</Btn>
            <Btn size="sm" icon="spark" onClick={() => setTab('intel')}>Research contact</Btn>
            <Btn size="sm" icon="kanban" onClick={() => UI.open('newDeal', { companyId: ct.companyId, contactIds: [ct.id], businessId: b })}>Create deal</Btn>
            <Menu
              trigger={<Btn size="sm" icon="li" iconRight="down">LinkedIn</Btn>}
              items={[
                { label: 'Open profile', icon: 'ext', disabled: !li, onClick: () => { if (li) window.open(li, '_blank', 'noopener') } },
                { label: 'Log connection request', onClick: () => UI.open('linkedin', { contactId: ct.id, businessId: b }) },
                { label: 'Log message / response', onClick: () => UI.open('linkedin', { contactId: ct.id, businessId: b }) },
                { label: 'LinkedIn follow-up task', onClick: () => UI.open('newTask', { ...tCtx, type: 'LinkedIn Activity', title: 'LinkedIn follow-up — ' + ct.firstName }) },
              ]}
            />
          </div>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[['overview', 'Overview'], ['activity', 'Activity timeline', acts.length], ['emails', 'Email conversations', ths.length], ['seq', 'Sequences', ens.length], ['deals', 'Deals', deals.length], ['tasks', 'Tasks', tasks.filter(t => !Q.done(t)).length], ['notes', 'Notes', ct.notes.length], ['intel', 'Intelligence']]}
      />
      {tab === 'overview' && (
        <div className="split">
          <div className="col" style={{ gap: 14 }}>
            <Card title="Details">
              <dl className="dl">
                <dt>Job title</dt><dd>{ct.title || '—'}<Prov ct={ct} k="title" /></dd>
                <dt>Department</dt><dd>{ct.department || '—'}</dd>
                <dt>Seniority</dt><dd>{ct.seniority}</dd>
                <dt>Buying role</dt><dd>{ct.buyingRole}</dd>
                <dt>Work email</dt><dd>{ct.email || <Chip tone="warn">Missing</Chip>}<Prov ct={ct} k="email" /></dd>
                <dt>Secondary email</dt><dd>{ct.email2 || '—'}<Prov ct={ct} k="email2" /></dd>
                <dt>Work phone</dt><dd>{ct.phone || '—'}<Prov ct={ct} k="phone" /></dd>
                <dt>Mobile</dt><dd>{ct.mobile || '—'}<Prov ct={ct} k="mobile" /></dd>
                <dt>LinkedIn</dt><dd>{li ? <a href={li} target="_blank" rel="noopener noreferrer">{li.replace(/^https?:\/\/(www\.)?/, '')}</a> : '—'}<Prov ct={ct} k="linkedin" /></dd>
                <dt>Location</dt><dd>{ct.location || '—'}</dd>
                <dt>Deliverability</dt><dd>{ct.deliverability}</dd>
                <dt>Data source</dt><dd>{ct.source}</dd>
                <dt>Last enriched</dt><dd>{ct.lastEnriched ? F.dt(ct.lastEnriched) : 'Never'}</dd>
                <dt>Created</dt><dd>{F.date(ct.createdAt)}</dd>
              </dl>
            </Card>
            <Card title="Business relationships">
              {Q.crelsOf(ct.id).map(x => (
                <div key={x.id} className="row wrap" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <BizDot b={x.businessId} />
                  <b className="sm" style={{ width: 80 }}>{Q.biz(x.businessId)?.name}</b>
                  {Q.member(x.businessId) ? (
                    <>
                      {Q.canEdit(x.businessId)
                        ? <Sel className="sm" style={{ width: 140 }} aria-label={'Lead status for ' + (Q.biz(x.businessId)?.name ?? '')} value={x.leadStatus} onChange={v => Act.updateCrel(x.id, { leadStatus: v })} options={LEAD_STATUSES} />
                        : <Chip>{x.leadStatus}</Chip>}
                      <Chip>Score {Q.score(ct.id, x.businessId).total}</Chip>
                      <span className="sp" />
                      <Owner id={x.ownerId} s={18} />
                      {Q.canManage(x.businessId) && <Btn size="xs" kind="ghost" onClick={() => UI.open('reassign', { kind: 'crel', id: x.id, businessId: x.businessId })}>Reassign</Btn>}
                    </>
                  ) : (
                    <><span className="sp" /><Chip icon="lock">Restricted</Chip></>
                  )}
                </div>
              ))}
            </Card>
            <Card title="Recent activity" right={<Btn size="sm" kind="ghost" onClick={() => setTab('activity')}>All</Btn>}>
              <Timeline items={acts.slice(0, 5)} />
            </Card>
          </div>
          <div className="col" style={{ gap: 14 }}>
            <ScorePanel ct={ct} b={b} />
            <Card title="Outreach eligibility" icon="shield">
              <dl className="dl" style={{ gridTemplateColumns: '130px 1fr' }}>
                <dt>Email available</dt><dd>{ct.email ? 'Yes' : 'No'}</dd>
                <dt>Deliverability</dt><dd>{ct.deliverability}</dd>
                <dt>Permission basis</dt><dd>{ct.permission || <span style={{ color: 'var(--bad2)' }}>Not recorded</span>}</dd>
                <dt>Source</dt><dd>{ct.permissionSource || '—'}</dd>
                <dt>Recorded</dt><dd>{ct.permissionDate ? F.date(ct.permissionDate) : '—'}</dd>
                <dt>Opt-out</dt><dd>{sup ? <Chip tone="bad">{sup.scope} · {sup.reason}</Chip> : 'None'}</dd>
                <dt>Active sequence</dt><dd>{live.length ? live.map(e => Q.seq(e.seqId)?.name ?? 'Unknown sequence').join(', ') : 'None'}</dd>
              </dl>
              {can && (
                <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>
                  {!ct.permission && <Menu trigger={<Btn size="xs" icon="shield">Record basis</Btn>} items={PERM.map(p => ({ label: p, onClick: () => { Act.setPermission(ct.id, p); UI.toast('Permission basis recorded') } }))} />}
                  {!sup && <Btn size="xs" kind="danger" onClick={() => UI.open('addSuppression', { contactId: ct.id })}>Suppress</Btn>}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
      {tab === 'activity' && <Card><ActFilter items={acts} /></Card>}
      {tab === 'emails' && (
        <Card pad={false}>
          {ths.length ? ths.map(t => {
            const ok = Q.threadBody(t)
            const last = Q.msgs(t.id).filter(m => m.status !== 'pending').pop()
            return (
              <div key={t.id} className="row" role="link" tabIndex={0} style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => UI.nav('inbox', { id: t.id })} onKeyDown={e => { if (e.key === 'Enter') UI.nav('inbox', { id: t.id }) }}>
                <BizDot b={t.businessId} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <b className="sm trunc">{ok ? t.subject : 'Private conversation'}</b>
                    {t.visibility === 'private' && <Chip icon="lock">{ok ? 'Private' : 'Restricted'}</Chip>}
                    {t.classification && ok && <Chip tone={CLS_TONE(t.classification.cat)}>{t.classification.cat}</Chip>}
                  </div>
                  <div className="faint xs trunc">{ok && last ? F.plain(last.body).slice(0, 120) : 'Owner: ' + (Q.user(t.ownerId)?.name ?? 'Unknown') + ' · content visible only to the mailbox owner'}</div>
                </div>
                <span className="faint xs">{F.rel(t.updatedAt)}</span>
              </div>
            )
          }) : <Empty icon="mail" title="No email conversations" body="Emails sent to or received from this contact will appear here." action={can && <Btn icon="mail" onClick={() => UI.open('compose', { contactId: ct.id, businessId: b })}>Send email</Btn>} />}
        </Card>
      )}
      {tab === 'seq' && (
        <Card pad={false} title="Sequence enrolments" right={can && <Btn size="sm" icon="send" onClick={() => UI.open('enrol', { contactIds: [ct.id] })}>Enrol</Btn>}>
          <EnrolTable rows={ens} showSeq />
        </Card>
      )}
      {tab === 'deals' && <Card pad={false}><DealTable rows={deals} /></Card>}
      {tab === 'tasks' && (
        <Card pad={false} title="Tasks" right={can && <Btn size="sm" icon="plus" onClick={() => UI.open('newTask', tCtx)}>Task</Btn>}>
          <TaskTable rows={tasks} />
        </Card>
      )}
      {tab === 'notes' && <Notes kind="contact" id={ct.id} b={b} notes={ct.notes} />}
      {tab === 'intel' && <ContactIntel ct={ct} b={b} />}
    </div>
  )
}
