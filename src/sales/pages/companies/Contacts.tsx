import { useState } from 'react'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { BusinessId, Company, Contact, ContactRel, Enrolment, Task } from '../../data/types'
import { BizDot, Btn, BulkBar, Chip, DataTable, Empty, EnrolChip, FilterBar, Icon, Menu, Owner, SearchInp, Sel, download, toCSV, type Col, type MenuItem, type SortState } from '../../kit'
import { LEAD_STATUSES, SENIORITY } from '../../modals/entities/options'
import { INDUSTRIES } from '../../shared/constants'
import { PageHead } from '../../shared/PageHead'
import type { ScoreResult } from '../../data/Q'
import type { Route } from '../../ui/store'
import { UI } from '../../ui/store'
import { qStr, safeHref } from './query'
import { ColMenu, Views, useColumns } from './tables'

type Row = Contact & {
  co: Company | undefined
  bs: BusinessId[]
  b: BusinessId
  rel: ContactRel | undefined
  score: ScoreResult
  enr: Enrolment | undefined
  next: Task | undefined
}
type RowCol = Col<Row> & { fixed?: boolean }

const SEQ_LIVE = ['active', 'awaiting_approval', 'awaiting_task', 'paused']

function buildRows(bz: string): Row[] {
  const sc = Q.scope()
  const out: Row[] = []
  for (const c of Q.contacts()) {
    const bs = Q.contactBiz(c)
    const b = bz && (bs as string[]).includes(bz) ? (bz as BusinessId) : (bs[0] ?? Q.primaryBiz(c))
    if (!b) continue
    const enr = Q.activeEnrol(c.id).find(x => sc.includes(x.businessId)) ?? S.enrolments.filter(x => x.contactId === c.id && sc.includes(x.businessId)).pop()
    const next = S.tasks.filter(t => t.contactId === c.id && !Q.done(t) && sc.includes(t.businessId)).sort((x, y) => x.due.localeCompare(y.due))[0]
    out.push({ ...c, co: Q.company(c.companyId), bs, b, rel: Q.crel(c.id, b), score: Q.score(c.id, b), enr, next })
  }
  return out
}

export function Contacts({ route }: { route: Route }) {
  useStore()
  const sc = Q.scope()
  const [q, setQ] = useState('')
  const [bz, setBz] = useState('')
  const [ind, setInd] = useState('')
  const [sen, setSen] = useState('')
  const [own, setOwn] = useState('')
  const [ls, setLs] = useState('')
  const [em, setEm] = useState('')
  const [ph, setPh] = useState('')
  const [seqF, setSeqF] = useState('')
  const [minS, setMinS] = useState(qStr(route.q, 'minScore'))
  const [eng, setEng] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [hid, tog] = useColumns('ct', ['linkedin', 'phone'])
  const [sortInit] = useState<SortState | null>(() => (qStr(route.q, 'minScore') ? ['score', -1] : null))

  const needle = q.toLowerCase()
  const rows = buildRows(bz).filter(c => {
    const hasPhone = !!(c.phone || c.mobile)
    const inSeq = !!c.enr && SEQ_LIVE.includes(c.enr.status)
    return (
      (!q || (c.name + ' ' + c.email + ' ' + c.title + ' ' + (c.co?.name ?? '')).toLowerCase().includes(needle)) &&
      (!bz || (c.bs as string[]).includes(bz)) &&
      (!ind || c.co?.industry === ind) &&
      (!sen || c.seniority === sen) &&
      (!own || c.rel?.ownerId === own) &&
      (!ls || c.rel?.leadStatus === ls) &&
      (!em || (em === 'y' ? !!c.email : !c.email)) &&
      (!ph || (ph === 'y' ? hasPhone : !hasPhone)) &&
      (!seqF || (seqF === 'in' ? inSeq : !inSeq)) &&
      (!minS || c.score.total >= +minS) &&
      (!eng || (!!c.rel?.lastActivity && F.days(c.rel.lastActivity, F.nowIso()) <= +eng))
    )
  })
  const more = [em, ph, seqF, minS, eng].filter(Boolean).length
  const filtered = !!(q || bz || ind || sen || own || ls) || more > 0
  const clear = (): void => { setQ(''); setBz(''); setInd(''); setSen(''); setOwn(''); setLs(''); setEm(''); setPh(''); setSeqF(''); setMinS(''); setEng('') }
  const ids = new Set(rows.map(r => r.id))
  const picked = sel.filter(id => ids.has(id))
  const can = Q.anyEdit()
  const bd = Q.defaultBiz()

  const defs: RowCol[] = [
    { k: 'name', l: 'Name', fixed: true, r: c => <div><b>{c.name}</b><div className="faint xs">{c.title}</div></div> },
    { k: 'co', l: 'Company', r: c => c.co?.name ?? '—', sort: c => c.co?.name },
    {
      k: 'email', l: 'Email',
      r: c => (c.email ? <span className="row" style={{ gap: 4 }}>{c.email}{c.deliverability === 'Bounced' && <Chip tone="bad">Bounced</Chip>}</span> : <Chip tone="warn">No email</Chip>),
    },
    { k: 'phone', l: 'Phone', r: c => c.phone || c.mobile || '—' },
    {
      k: 'linkedin', l: 'LinkedIn', nosort: true,
      r: c => {
        const href = safeHref(c.linkedin)
        return href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={'LinkedIn profile of ' + c.name} onClick={e => e.stopPropagation()}><Icon n="li" s={13} /></a> : '—'
      },
    },
    {
      k: 'bs', l: 'Business', nosort: true,
      r: c => (
        <span className="row" style={{ gap: 3 }}>
          {Q.crelsOf(c.id).map(r => <span key={r.id} title={Q.biz(r.businessId)?.name}><BizDot b={r.businessId} s={9} /></span>)}
        </span>
      ),
    },
    { k: 'owner', l: 'Owner', r: c => <Owner id={c.rel?.ownerId} />, sort: c => Q.user(c.rel?.ownerId)?.name },
    {
      k: 'score', l: 'Lead score', right: true, desc: true,
      r: c => <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><span className="num b">{c.score.total}</span><Chip tone={Q.scoreTone(c.score.label)}>{c.score.label}</Chip></span>,
      sort: c => c.score.total,
    },
    { k: 'seq', l: 'Sequence', r: c => (c.enr ? <EnrolChip s={c.enr.status} /> : <span className="faint">—</span>), sort: c => c.enr?.status },
    { k: 'last', l: 'Last contacted', r: c => (c.rel?.lastActivity ? F.rel(c.rel.lastActivity) : '—'), sort: c => c.rel?.lastActivity },
    { k: 'next', l: 'Next action', max: 200, r: c => (c.next ? <span className="trunc" style={{ display: 'block' }}>{c.next.title}</span> : '—'), sort: c => c.next?.due },
  ]
  const cols = defs.map(c => ({ ...c, hide: hid.includes(c.k) }))

  const exp = (): void => {
    const src = picked.length ? rows.filter(r => picked.includes(r.id)) : rows
    download('contacts.csv', toCSV([['Name', 'Title', 'Company', 'Email', 'Phone', 'LinkedIn', 'Score', 'Owner'], ...src.map(c => [c.name, c.title, c.co?.name, c.email, c.phone, c.linkedin, c.score.total, Q.user(c.rel?.ownerId)?.name])]))
  }

  const moreItems: MenuItem[] = [
    { label: 'Email', head: true },
    { label: 'Has email', checked: em === 'y', onClick: () => setEm(em === 'y' ? '' : 'y') },
    { label: 'Missing email', checked: em === 'n', onClick: () => setEm(em === 'n' ? '' : 'n') },
    { label: 'Phone', head: true },
    { label: 'Has phone', checked: ph === 'y', onClick: () => setPh(ph === 'y' ? '' : 'y') },
    { label: 'Missing phone', checked: ph === 'n', onClick: () => setPh(ph === 'n' ? '' : 'n') },
    { label: 'Sequence', head: true },
    { label: 'In active sequence', checked: seqF === 'in', onClick: () => setSeqF(seqF === 'in' ? '' : 'in') },
    { label: 'Not in a sequence', checked: seqF === 'out', onClick: () => setSeqF(seqF === 'out' ? '' : 'out') },
    { label: 'Lead score', head: true },
    ...[40, 60, 75].map((n): MenuItem => ({ label: n + '+', checked: +minS === n, onClick: () => setMinS(+minS === n ? '' : String(n)) })),
    { label: 'Last engagement', head: true },
    ...[7, 30].map((n): MenuItem => ({ label: 'Within ' + n + ' days', checked: +eng === n, onClick: () => setEng(+eng === n ? '' : String(n)) })),
  ]
  const newCt = can ? <Btn kind="pri" icon="plus" onClick={() => UI.open('newContact')}>New contact</Btn> : undefined

  return (
    <div className="page">
      <PageHead title="Contacts" sub={rows.length + ' contacts · one identity per person across the portfolio'}>
        <Btn icon="download" disabled={!rows.length} onClick={exp}>Export</Btn>
        <Btn icon="upload" disabled={!can} onClick={() => UI.nav('prospecting', { q: { tab: 'import' } })}>Import</Btn>
        <Btn kind="pri" icon="plus" disabled={!can} onClick={() => UI.open('newContact')}>New contact</Btn>
      </PageHead>
      <div className="card">
        <FilterBar>
          <SearchInp value={q} onChange={setQ} placeholder="Name, email, title, company" />
          {sc.length > 1 && <Sel className="sm" style={{ width: 130 }} aria-label="Business" value={bz} onChange={setBz} placeholder="All businesses" options={sc.map(b => [b, Q.biz(b)?.name ?? b] as const)} />}
          <Sel className="sm" style={{ width: 140 }} aria-label="Industry" value={ind} onChange={setInd} placeholder="Any industry" options={INDUSTRIES} />
          <Sel className="sm" style={{ width: 130 }} aria-label="Seniority" value={sen} onChange={setSen} placeholder="Any seniority" options={SENIORITY} />
          <Sel
            className="sm" style={{ width: 140 }} aria-label="Owner" value={own} onChange={setOwn} placeholder="Any owner"
            options={[...new Set(S.contactRels.filter(r => sc.includes(r.businessId)).map(r => r.ownerId))].map(u => [u, Q.user(u)?.name ?? 'Unknown user'] as const)}
          />
          <Sel className="sm" style={{ width: 130 }} aria-label="Lead status" value={ls} onChange={setLs} placeholder="Lead status" options={LEAD_STATUSES} />
          <Menu trigger={<Btn size="sm" icon="filter">More{more ? ' (' + more + ')' : ''}</Btn>} width={240} items={moreItems} />
          {filtered && <Btn size="sm" kind="ghost" onClick={clear}>Clear filters</Btn>}
          <span className="sp" />
          <Views
            page="contacts"
            q={{ minScore: minS }}
            apply={v => { clear(); setMinS(qStr(v, 'minScore')) }}
          />
          <ColMenu cols={cols} hid={hid} tog={tog} />
        </FilterBar>
        <BulkBar n={picked.length} clear={() => setSel([])}>
          <Btn size="sm" icon="send" disabled={!can} onClick={() => UI.open('enrol', { contactIds: picked })}>Enrol in sequence</Btn>
          <Btn size="sm" icon="list" disabled={!can} onClick={() => UI.open('addToList', { contactIds: picked })}>Add to list</Btn>
          <Btn size="sm" icon="swap" disabled={!bd || !Q.canManage(bd)} onClick={() => UI.open('reassign', { kind: 'contacts', ids: picked, businessId: bd })}>Assign owner</Btn>
          <Btn size="sm" icon="download" onClick={exp}>Export</Btn>
        </BulkBar>
        <DataTable
          cols={cols}
          rows={rows}
          sel={picked}
          setSel={setSel}
          onRow={c => UI.nav('contact', { id: c.id })}
          sortInit={sortInit}
          empty={
            filtered
              ? <Empty icon="search" title="No contacts match these filters" body="Try a broader search, or clear the filters to see every contact." action={<Btn onClick={clear}>Clear filters</Btn>} />
              : <Empty icon="user" title="No contacts yet" body={can ? 'Add a contact, or import a CSV from Prospecting.' : 'Contacts your team adds will appear here.'} action={newCt} />
          }
        />
      </div>
    </div>
  )
}
