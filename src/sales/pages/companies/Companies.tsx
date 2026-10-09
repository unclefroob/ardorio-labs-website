import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { BusinessId, Company, CompanyRel, Task } from '../../data/types'
import { BizDot, BulkBar, Btn, Chip, DataTable, Empty, FilterBar, Menu, Owner, SearchInp, Sel, TONE, download, toCSV, type Col } from '../../kit'
import { INDUSTRIES, STATES } from '../../shared/constants'
import { PageHead } from '../../shared/PageHead'
import type { Route } from '../../ui/store'
import { UI } from '../../ui/store'
import { qStr } from './query'
import { ColMenu, Views, useColumns } from './tables'

type Row = Company & {
  rels: CompanyRel[]
  myr: CompanyRel[]
  deals: number
  pipe: number
  next: Task | undefined
  last: string
  owner: string | undefined
  pri: string | undefined
}
type RowCol = Col<Row> & { fixed?: boolean }

const WEIGHT: Record<string, number> = { High: 3, Medium: 2, Low: 1 }
const SIZES: ReadonlyArray<readonly [string, string]> = [['5', '5+ locations'], ['10', '10+ locations'], ['20', '20+ locations']]

function buildRows(): Row[] {
  const sc = Q.scope()
  return Q.companies().map(c => {
    const rels = Q.relsOf(c.id)
    const myr = rels.filter(r => sc.includes(r.businessId))
    const ds = S.deals.filter(d => d.companyId === c.id && sc.includes(d.businessId) && d.status === 'open')
    const next = S.tasks.filter(t => t.companyId === c.id && sc.includes(t.businessId) && !Q.done(t)).sort((a, b) => a.due.localeCompare(b.due))[0]
    const lastContact = myr.map(r => r.lastContacted).filter((x): x is string => !!x).sort().pop() ?? ''
    const lastAct = S.activities.filter(a => a.companyId === c.id && sc.includes(a.businessId)).reduce((m, a) => (a.ts > m ? a.ts : m), '')
    return { ...c, rels, myr, deals: ds.length, pipe: ds.reduce((s, d) => s + d.value, 0), next, last: lastAct || lastContact, owner: myr[0]?.ownerId, pri: myr[0]?.priority }
  })
}

export function Companies({ route }: { route: Route }) {
  useStore()
  const sc = Q.scope()
  const [q, setQ] = useState(qStr(route.q, 'search'))
  const [ind, setInd] = useState(qStr(route.q, 'industry'))
  const [st, setSt] = useState('')
  const [bz, setBz] = useState('')
  const [own, setOwn] = useState('')
  const [minLoc, setMinLoc] = useState(qStr(route.q, 'minLoc'))
  const [sel, setSel] = useState<string[]>([])
  const [hid, tog] = useColumns('co', ['revenue'])

  const all = buildRows()
  const needle = q.toLowerCase()
  const rows = all.filter(c =>
    (!q || (c.name + ' ' + c.domain + ' ' + c.industry + ' ' + c.hq).toLowerCase().includes(needle)) &&
    (!ind || c.industry === ind) &&
    (!st || c.state === st) &&
    (!bz || c.rels.some(r => r.businessId === bz)) &&
    (!own || c.myr.some(r => r.ownerId === own)) &&
    (!minLoc || (c.locations ?? 0) >= +minLoc),
  )
  const filtered = !!(q || ind || st || bz || own || minLoc)
  const clear = (): void => { setQ(''); setInd(''); setSt(''); setBz(''); setOwn(''); setMinLoc('') }
  const ids = new Set(rows.map(r => r.id))
  const picked = sel.filter(id => ids.has(id))
  const can = Q.anyEdit()
  const bd = Q.defaultBiz()

  const defs: RowCol[] = [
    { k: 'name', l: 'Company', fixed: true, r: c => <div><b>{c.name}</b><div className="faint xs">{c.domain}</div></div> },
    { k: 'industry', l: 'Industry' },
    { k: 'hq', l: 'Location', r: c => c.hq + ', ' + c.state },
    { k: 'employees', l: 'Employees', right: true, r: c => <span className="num">{F.num(c.employees)}</span> },
    { k: 'locations', l: 'Locations', right: true },
    {
      k: 'biz', l: 'Businesses', nosort: true,
      r: c => (
        <span className="row" style={{ gap: 3 }}>
          {c.rels.map(r => <span key={r.id} title={(Q.biz(r.businessId)?.name ?? '') + (Q.member(r.businessId) ? ' · ' + r.status : ' · restricted')}><BizDot b={r.businessId} s={9} /></span>)}
        </span>
      ),
    },
    { k: 'owner', l: 'Owner', r: c => <Owner id={c.owner} />, sort: c => Q.user(c.owner)?.name },
    { k: 'deals', l: 'Active deals', right: true },
    { k: 'pipe', l: 'Pipeline', right: true, r: c => <span className="num">{c.pipe ? F.money(c.pipe, true) : '—'}</span> },
    { k: 'last', l: 'Last activity', r: c => (c.last ? F.rel(c.last) : <span className="faint">—</span>) },
    {
      k: 'next', l: 'Next action', max: 220,
      r: c => (c.next ? <span className="trunc" style={{ display: 'block' }} title={c.next.title}>{c.next.title}</span> : <span className="faint">—</span>),
      sort: c => c.next?.due,
    },
    { k: 'pri', l: 'Priority', r: c => (c.pri ? <Chip tone={TONE[c.pri]}>{c.pri}</Chip> : <span className="faint">—</span>), sort: c => WEIGHT[c.pri ?? ''] ?? 0 },
    { k: 'revenue', l: 'Revenue est.', r: c => (typeof c.revenue === 'string' && c.revenue ? c.revenue : '—') },
  ]
  const cols = defs.map(c => ({ ...c, hide: hid.includes(c.k) }))

  const exp = (): void => {
    const src = picked.length ? rows.filter(r => picked.includes(r.id)) : rows
    download('companies.csv', toCSV([['Company', 'Domain', 'Industry', 'Location', 'Employees', 'Locations', 'Owner', 'Active deals', 'Pipeline'], ...src.map(c => [c.name, c.domain, c.industry, c.hq, c.employees, c.locations, Q.user(c.owner)?.name, c.deals, c.pipe])]))
  }
  const newCo = can ? <Btn kind="pri" icon="plus" onClick={() => UI.open('newCompany')}>New company</Btn> : undefined

  return (
    <div className="page">
      <PageHead title="Companies" sub={rows.length + ' companies · master database shared across businesses'}>
        <Btn icon="download" disabled={!rows.length} onClick={exp}>Export</Btn>
        <Btn kind="pri" icon="plus" disabled={!can} onClick={() => UI.open('newCompany')}>New company</Btn>
      </PageHead>
      <div className="card">
        <FilterBar>
          <SearchInp value={q} onChange={setQ} placeholder="Search name, domain, industry" />
          <Sel className="sm" style={{ width: 150 }} aria-label="Industry" value={ind} onChange={setInd} placeholder="All industries" options={INDUSTRIES} />
          <Sel className="sm" style={{ width: 100 }} aria-label="State" value={st} onChange={setSt} placeholder="Any state" options={STATES} />
          {sc.length > 1 && <Sel className="sm" style={{ width: 140 }} aria-label="Business" value={bz} onChange={setBz} placeholder="All businesses" options={sc.map(b => [b, Q.biz(b)?.name ?? b] as const)} />}
          <Sel
            className="sm" style={{ width: 150 }} aria-label="Owner" value={own} onChange={setOwn} placeholder="Any owner"
            options={[...new Set(S.companyRels.filter(r => sc.includes(r.businessId)).map(r => r.ownerId))].map(u => [u, Q.user(u)?.name ?? 'Unknown user'] as const)}
          />
          <Sel className="sm" style={{ width: 130 }} aria-label="Size" value={minLoc} onChange={setMinLoc} placeholder="Any size" options={SIZES} />
          {filtered && <Btn size="sm" kind="ghost" onClick={clear}>Clear filters</Btn>}
          <span className="sp" />
          <Views
            page="companies"
            q={{ search: q, industry: ind, minLoc }}
            apply={v => { setQ(qStr(v, 'search')); setInd(qStr(v, 'industry')); setMinLoc(qStr(v, 'minLoc')); setSt(''); setBz(''); setOwn('') }}
          />
          <ColMenu cols={cols} hid={hid} tog={tog} />
        </FilterBar>
        <BulkBar n={picked.length} clear={() => setSel([])}>
          <Btn size="sm" icon="flag" disabled={!can} onClick={() => UI.ask(t => { if (t.trim()) { Act.bulkCompanies(picked, 'tag', t.trim()); UI.toast('Tagged ' + picked.length + ' companies') } }, 'Tag to add')}>Tag</Btn>
          <Btn size="sm" icon="swap" disabled={!bd || !Q.canManage(bd)} onClick={() => UI.open('reassign', { kind: 'companies', ids: picked, businessId: bd })}>Assign owner</Btn>
          <Menu
            trigger={<Btn size="sm" icon="layers" disabled={!can}>Assign business</Btn>}
            items={Q.myBiz().filter(Q.canEdit).map((b: BusinessId) => ({
              label: Q.biz(b)?.name ?? b, dot: Q.biz(b)?.accent,
              onClick: () => { Act.bulkCompanies(picked, 'biz', b); UI.toast('Relationships created for ' + (Q.biz(b)?.name ?? b) + ' (existing master records reused)') },
            }))}
          />
          <Btn size="sm" icon="download" onClick={exp}>Export selected</Btn>
        </BulkBar>
        <DataTable
          cols={cols}
          rows={rows}
          sel={picked}
          setSel={setSel}
          onRow={c => UI.nav('company', { id: c.id })}
          empty={
            filtered
              ? <Empty icon="search" title="No companies match these filters" body="Try a broader search, or clear the filters to see every company." action={<Btn onClick={clear}>Clear filters</Btn>} />
              : <Empty icon="building" title="No companies yet" body={can ? 'Add your first company, or import a list from Prospecting.' : 'Companies your team adds will appear here.'} action={newCo} />
          }
        />
      </div>
    </div>
  )
}
