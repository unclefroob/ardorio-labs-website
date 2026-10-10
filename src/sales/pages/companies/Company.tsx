import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Contact } from '../../data/types'
import { Av, BizDot, Btn, Card, Chip, CtLink, DataTable, DlLink, Due, Empty, EnrolChip, Icon, Link, Menu, Owner, Tabs, Timeline, type Col } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { LinkBtn } from '../deals/LinkBtn'
import type { Route } from '../../ui/store'
import { UI } from '../../ui/store'
import { BizRels } from './BizRels'
import { CompanyIntel } from './CompanyIntel'
import { ActFilter } from './parts/ActFilter'
import { Notes } from './parts/Notes'
import { RosterioCard } from '../deals/RosterioCard'
import { qStr, safeHref } from './query'
import { Coord, DealTable } from './tables'

const dash = <span className="faint">—</span>

export function Company({ route }: { route: Route }) {
  useStore()
  const c = Q.company(route.id)
  const [tab, setTab] = useState(qStr(route.q, 'tab') || 'overview')

  if (!c) {
    return (
      <div className="page">
        <Empty icon="building" title="Company not found" body="It may have been deleted, or the link is out of date." action={<Btn onClick={() => UI.nav('companies')}>Back to companies</Btn>} />
      </div>
    )
  }
  const rels = Q.relsOf(c.id)
  const vis = rels.filter(r => Q.member(r.businessId))
  if (!vis.length) {
    return (
      <div className="page">
        <Empty icon="lock" title="Restricted record" body={c.name + ' is only associated with businesses you are not a member of.'} action={<Btn onClick={() => UI.nav('companies')}>Back to companies</Btn>} />
      </div>
    )
  }
  const sc = Q.scope()
  const ws = Q.wsBiz()
  const b = ws && Q.rel(c.id, ws) ? ws : (vis.find(r => sc.includes(r.businessId)) ?? vis[0]).businessId
  const can = Q.canEdit(b)
  const cts = S.contacts.filter(x => x.companyId === c.id && !x.archived)
  const deals = S.deals.filter(d => d.companyId === c.id && Q.member(d.businessId))
  const openDeals = deals.filter(Q.open)
  const hiddenDeals = S.deals.filter(d => d.companyId === c.id && !Q.member(d.businessId)).length
  const acts = Q.activities().filter(a => a.companyId === c.id).sort((x, y) => y.ts.localeCompare(x.ts))
  const nt = S.tasks.filter(t => t.companyId === c.id && Q.member(t.businessId) && !Q.done(t)).sort((x, y) => x.due.localeCompare(y.due))
  const site = safeHref(c.website)
  const li = safeHref(c.linkedin)

  const enrich = (): void => {
    const gaps = cts.filter(x => !x.email || !x.phone)
    if (!gaps.length) {
      UI.toast('All contacts already have email and phone')
      return
    }
    UI.open('enrich', { contactId: gaps[0].id })
  }
  const qa: ReadonlyArray<readonly [label: string, icon: string, fn: () => void]> = [
    ['Add contact', 'user', () => UI.open('newContact', { companyId: c.id, businessId: b })],
    ['Create deal', 'kanban', () => UI.open('newDeal', { companyId: c.id, businessId: b })],
    ['Log call', 'phone', () => UI.open('logCall', { companyId: c.id, businessId: b })],
    ['Log meeting', 'users', () => UI.open('logMeeting', { companyId: c.id, businessId: b })],
    ['Email', 'mail', () => (cts.length ? UI.open('compose', { contactId: cts[0].id, businessId: b }) : UI.toast('Add a contact to email first', 'bad'))],
    ['Task', 'checksq', () => UI.open('newTask', { companyId: c.id, businessId: b })],
    ['Research', 'spark', () => setTab('intel')],
    ['Enrich contact', 'zap', enrich],
    ['Find contacts', 'search', () => UI.open('findPeople', { companyId: c.id, businessId: b })],
    ['Add to list', 'list', () => (cts.length ? UI.open('addToList', { contactIds: cts.map(x => x.id) }) : UI.toast('No contacts to add', 'bad'))],
  ]

  const ctCols: Array<Col<Contact>> = [
    { k: 'name', l: 'Name', r: x => <b>{x.name}</b> },
    { k: 'title', l: 'Job title' },
    { k: 'email', l: 'Email', r: x => x.email || <Chip tone="warn">Missing</Chip> },
    { k: 'phone', l: 'Phone', r: x => x.phone || x.mobile || dash },
    { k: 'seniority', l: 'Seniority' },
    { k: 'buyingRole', l: 'Buying influence' },
    { k: 'o', l: 'Owner', r: x => <Owner id={Q.crel(x.id, b)?.ownerId} />, sort: x => Q.user(Q.crel(x.id, b)?.ownerId)?.name },
    {
      k: 'e', l: 'Engagement', nosort: true,
      r: x => {
        const e = Q.activeEnrol(x.id)[0]
        return e ? <EnrolChip s={e.status} /> : <Chip>{Q.crel(x.id, b)?.leadStatus ?? '—'}</Chip>
      },
    },
    {
      k: 'n', l: 'Next action', nosort: true,
      r: x => {
        const t = S.tasks.filter(y => y.contactId === x.id && !Q.done(y)).sort((p, q) => p.due.localeCompare(q.due))[0]
        return t ? <span className="trunc" style={{ maxWidth: 180, display: 'inline-block' }}>{t.title}</span> : '—'
      },
    },
  ]

  return (
    <div className="page">
      <PageHead
        crumb={[<Link to="companies">Companies</Link>]}
        title={c.name}
        sub={
          <span className="row wrap" style={{ gap: 8 }}>
            <span>{c.industry}{c.subindustry ? ' · ' + c.subindustry : ''}</span>·<span><Icon n="pin" s={12} /> {c.hq}, {c.state}</span>
            {c.website && (site ? <a href={site} target="_blank" rel="noopener noreferrer"><Icon n="globe" s={12} /> {c.domain}</a> : <span><Icon n="globe" s={12} /> {c.domain}</span>)}
            {li && <a href={li} target="_blank" rel="noopener noreferrer"><Icon n="li" s={12} /> LinkedIn</a>}
            {(c.tags ?? []).map(t => <Chip key={t}>{t}</Chip>)}
          </span>
        }
      >
        {can && <Btn icon="edit" onClick={() => UI.open('editCompany', { id: c.id })}>Edit</Btn>}
        {can && (
          <Menu
            align="right"
            trigger={<Btn icon="more" aria-label="More actions" />}
            items={[{
              label: 'Archive company', icon: 'archive',
              onClick: () => UI.confirm({
                title: 'Archive ' + c.name + '?',
                body: 'The company is hidden from lists. Deals, contacts and activity history stay linked and intact.',
                confirm: 'Archive', danger: true,
                onConfirm: () => { Act.archiveCompany(c.id); UI.nav('companies') },
              }),
            }]}
          />
        )}
      </PageHead>
      <div className="col gap12" style={{ marginBottom: 14 }}>
        <Coord companyId={c.id} />
        {can && (
          <div className="row wrap" style={{ gap: 6 }}>
            {qa.map(([l, i, fn]) => <Btn key={l} size="sm" icon={i} onClick={fn}>{l}</Btn>)}
          </div>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[['overview', 'Overview'], ['contacts', 'Contacts', cts.length], ['deals', 'Deals', deals.length], ['activity', 'Activities', acts.length], ['intel', 'Intelligence'], ['notes', 'Notes', (c.notes ?? []).length], ['rels', 'Business relationships', rels.length]]}
      />
      {tab === 'overview' && (
        <div className="split">
          <div className="col" style={{ gap: 14 }}>
            <Card title="About">
              <div className="muted" style={{ marginBottom: 12 }}>{c.description || 'No description yet.'}</div>
              <dl className="dl">
                <dt>Employees (est.)</dt><dd>{F.num(c.employees)}</dd>
                <dt>Locations</dt><dd>{c.locations || '—'}</dd>
                {typeof c.students === 'number' && <><dt>Students</dt><dd>{F.num(c.students)} · {F.num(c.eligibleStudents)} eligible</dd></>}
                <dt>Company type</dt><dd>{c.type || '—'}</dd>
                <dt>Revenue estimate</dt><dd>{typeof c.revenue === 'string' && c.revenue ? c.revenue : '—'}</dd>
                <dt>Technology</dt><dd>{(c.tech ?? []).join(', ') || '—'}</dd>
                <dt>Data source</dt><dd>{c.source}</dd>
                <dt>Research status</dt><dd>{c.researchStatus}{c.lastResearched ? ' · ' + F.date(c.lastResearched) : ''}</dd>
                <dt>Last updated</dt><dd>{F.dt(c.updatedAt)}</dd>
              </dl>
            </Card>
            <Card title="Recent activity" right={<Btn size="sm" kind="ghost" onClick={() => setTab('activity')}>All</Btn>}>
              <Timeline items={acts.slice(0, 6)} />
            </Card>
          </div>
          <div className="col" style={{ gap: 14 }}>
            <Card title="Relationships">
              {rels.map(r => (
                <div key={r.id} className="row" style={{ padding: '6px 0' }}>
                  <BizDot b={r.businessId} />
                  <b className="sm">{Q.biz(r.businessId)?.name}</b>
                  {Q.member(r.businessId) ? <><Chip>{r.status}</Chip><span className="sp" /><Owner id={r.ownerId} s={18} /></> : <><span className="sp" /><Chip icon="lock">Restricted</Chip></>}
                </div>
              ))}
            </Card>
            <Card title="Open deals">
              {openDeals.length
                ? openDeals.map(d => (
                    <div key={d.id} className="row" style={{ padding: '5px 0' }}>
                      <BizDot b={d.businessId} />
                      <DlLink id={d.id} />
                      <span className="sp" />
                      <span className="num sm">{F.money(d.value, true)}</span>
                    </div>
                  ))
                : <div className="faint sm">No open deals</div>}
              {hiddenDeals > 0 && <div className="faint xs" style={{ marginTop: 6 }}><Icon n="lock" s={11} /> {hiddenDeals} deal{hiddenDeals > 1 ? 's' : ''} in other businesses (restricted)</div>}
            </Card>
            <RosterioCard companyId={c.id} />
            <Card title="Next activity">
              {nt.length
                ? nt.slice(0, 4).map(t => (
                    <div key={t.id} className="sm" style={{ padding: '4px 0' }}>
                      <LinkBtn onClick={() => UI.drawer('task', { id: t.id })}>{t.title}</LinkBtn>
                      <div><Due t={t} /></div>
                    </div>
                  ))
                : <div className="faint sm">Nothing scheduled</div>}
            </Card>
            <Card title={'Key contacts (' + cts.length + ')'}>
              {cts.length
                ? cts.slice(0, 5).map(x => (
                    <div key={x.id} className="row sm" style={{ padding: '4px 0' }}>
                      <Av name={x.name} s={22} />
                      <CtLink id={x.id} />
                      <span className="faint trunc">{x.title}</span>
                    </div>
                  ))
                : <div className="faint sm">No contacts yet</div>}
            </Card>
          </div>
        </div>
      )}
      {tab === 'contacts' && (
        <Card pad={false} title={'Contacts at ' + c.name} right={can && <span className="row" style={{ gap: 6 }}><Btn size="sm" icon="search" onClick={() => UI.open('findPeople', { companyId: c.id, businessId: b })}>Find people</Btn><Btn size="sm" icon="plus" onClick={() => UI.open('newContact', { companyId: c.id, businessId: b })}>Add contact</Btn></span>}>
          <DataTable rows={cts} cols={ctCols} onRow={x => UI.nav('contact', { id: x.id })} empty={<Empty icon="user" title="No contacts" body="Add a contact, or find people who work here." action={can && <span className="row" style={{ gap: 6 }}><Btn kind="pri" icon="search" onClick={() => UI.open('findPeople', { companyId: c.id, businessId: b })}>Find people</Btn><Btn icon="plus" onClick={() => UI.open('newContact', { companyId: c.id, businessId: b })}>Add contact</Btn></span>} />} />
        </Card>
      )}
      {tab === 'deals' && (
        <Card pad={false} title="Deals" right={can && <Btn size="sm" icon="plus" onClick={() => UI.open('newDeal', { companyId: c.id, businessId: b })}>Create deal</Btn>}>
          <DealTable rows={deals} />
          {hiddenDeals > 0 && <div className="faint sm" style={{ padding: 12 }}><Icon n="lock" s={12} /> {hiddenDeals} deal(s) belong to businesses you can't access. Use “Request introduction” to coordinate.</div>}
        </Card>
      )}
      {tab === 'activity' && <Card><ActFilter items={acts} /></Card>}
      {tab === 'intel' && <CompanyIntel c={c} b={b} />}
      {tab === 'notes' && <Notes kind="company" id={c.id} b={b} notes={c.notes} />}
      {tab === 'rels' && <BizRels c={c} />}
    </div>
  )
}
