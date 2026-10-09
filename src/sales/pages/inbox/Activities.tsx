import { useState } from 'react'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S, useStore } from '../../data/store'
import type { Activity } from '../../data/types'
import { AIC, BizDot, Btn, Card, Chip, DataTable, DlLink, Empty, FilterBar, Fld, Icon, Inp, Owner, SearchInp, Sel, download, toCSV, type Col } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI, type Route } from '../../ui/store'
import { includesCI, str } from './parts/util'

const typeLabel = (t: string): string => AIC[t]?.[1] ?? t

export function Activities({ route }: { route: Route }) {
  useStore()
  const q0 = route.q ?? {}
  const [ty, setTy] = useState(str(q0.type))
  const [u, setU] = useState('')
  const [bz, setBz] = useState('')
  const [from, setFrom] = useState(str(q0.from).slice(0, 10))
  const [q, setQ] = useState('')

  const all = Q.activities()
  const horizon = F.addDays(F.nowIso(), 1)
  const rows = all
    .filter(a =>
      (!ty || a.type === ty) && (!u || a.actorId === u) && (!bz || a.businessId === bz) && (!from || a.ts >= from) && a.ts <= horizon &&
      (!q || (Q.actVisible(a) && includesCI(a.subject + ' ' + (a.desc ?? ''), q)) || includesCI(Q.company(a.companyId)?.name, q)),
    )
    .sort((a, b) => b.ts.localeCompare(a.ts))
  const filtered = !!(ty || u || bz || from || q)
  const clear = (): void => { setTy(''); setU(''); setBz(''); setFrom(''); setQ('') }

  const open = (a: Activity): void => {
    const d = Q.deal(a.dealId)
    if (a.dealId && d && Q.member(d.businessId)) UI.nav('deal', { id: a.dealId })
    else if (a.contactId) UI.nav('contact', { id: a.contactId })
    else if (a.companyId) UI.nav('company', { id: a.companyId })
  }

  const cols: Col<Activity>[] = [
    {
      k: 'subject', l: 'Activity',
      r: a => {
        const ic = AIC[a.type]?.[0] ?? 'activity'
        return (
          <span className="row">
            <Icon n={ic} s={13} style={{ color: 'var(--fg3)' }} />
            <span className="trunc" style={{ maxWidth: 340 }}>{Q.actVisible(a) ? a.subject : <><Icon n="lock" s={11} /> Private email: content restricted</>}</span>
          </span>
        )
      },
    },
    { k: 'type', l: 'Type', r: a => typeLabel(a.type) },
    { k: 'ts', l: 'Date', r: a => F.dt(a.ts) },
    { k: 'u', l: 'User', r: a => <Owner id={a.actorId} s={18} />, sort: a => Q.user(a.actorId)?.name },
    { k: 'co', l: 'Company', r: a => Q.company(a.companyId)?.name ?? '—', sort: a => Q.company(a.companyId)?.name },
    { k: 'ct', l: 'Contact', r: a => Q.contact(a.contactId)?.name ?? '—' },
    { k: 'b', l: 'Business', r: a => <BizDot b={a.businessId} />, sort: a => a.businessId },
    { k: 'd', l: 'Deal', nosort: true, r: a => (a.dealId ? <DlLink id={a.dealId} /> : '—') },
    { k: 'outcome', l: 'Outcome', r: a => (a.outcome ? <Chip>{a.outcome}</Chip> : '—') },
  ]

  const exportCsv = (): void =>
    download('activities.csv', toCSV([['Date', 'Type', 'User', 'Business', 'Company', 'Contact', 'Subject', 'Outcome']].concat(
      rows.map(a => [a.ts, typeLabel(a.type), Q.user(a.actorId)?.name ?? '', Q.biz(a.businessId)?.name ?? '', Q.company(a.companyId)?.name ?? '', Q.contact(a.contactId)?.name ?? '', Q.actVisible(a) ? (a.subject ?? '') : 'Private email', a.outcome ?? ''])),
    ))

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <PageHead title="Activities" sub={`${rows.length} interaction${rows.length === 1 ? '' : 's'} · one central activity log shown on every related record`}>
        <Btn icon="download" disabled={!rows.length} onClick={exportCsv}>Export</Btn>
      </PageHead>
      {all.length === 0 ? (
        <Card><Empty icon="activity" title="No activity yet" body="Calls, emails, meetings, notes and stage changes are recorded here as your team works." /></Card>
      ) : (
        <div className="card">
          <FilterBar>
            <SearchInp value={q} onChange={setQ} placeholder="Search activity" />
            <Sel className="sm" style={{ width: 170 }} aria-label="Activity type" value={ty} onChange={setTy} placeholder="All types" options={Object.entries(AIC).map(([k, v]) => [k, v[1]] as const)} />
            <Sel className="sm" style={{ width: 150 }} aria-label="User" value={u} onChange={setU} placeholder="Any user" options={S.users.map(x => [x.id, x.name] as const)} />
            {Q.scope().length > 1 && <Sel className="sm" style={{ width: 140 }} aria-label="Business" value={bz} onChange={setBz} placeholder="All businesses" options={Q.scope().map(b => [b, Q.biz(b)?.name ?? b] as const)} />}
            <Fld><Inp type="date" className="sm" value={from} onChange={setFrom} aria-label="From date" /></Fld>
            {filtered && <Btn size="sm" kind="ghost" onClick={clear}>Clear</Btn>}
          </FilterBar>
          <DataTable
            rows={rows} cols={cols} page={50} onRow={open}
            empty={<Empty icon="activity" title="No activity for these filters" body="Nothing matches the filters you have set." action={<Btn onClick={clear}>Clear filters</Btn>} />}
          />
        </div>
      )}
    </div>
  )
}
