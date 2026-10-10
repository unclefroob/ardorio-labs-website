import { Fragment, useRef, useState } from 'react'
import { F } from '../data/F'
import { Q } from '../data/Q'
import { S, useStore } from '../data/store'
import { Chip, Empty, Icon, AIC, useFocusTrap } from '../kit'
import { UI } from '../ui/store'

interface Result {
  g: string
  ic: string
  l: string
  s: string
  go: () => void
}

function search(ql: string): Result[] {
  const out: Result[] = []
  const m = (s: string | null | undefined): boolean => (s ?? '').toLowerCase().includes(ql)
  Q.companies().filter(c => m(c.name) || m(c.domain) || m(c.industry)).slice(0, 6)
    .forEach(c => out.push({ g: 'Companies', ic: 'building', l: c.name, s: [c.industry, c.hq].filter(Boolean).join(' · '), go: () => UI.nav('company', { id: c.id }) }))
  Q.contacts().filter(c => m(c.name) || m(c.email) || m(c.title)).slice(0, 6)
    .forEach(c => out.push({ g: 'Contacts', ic: 'user', l: c.name, s: [c.title, Q.company(c.companyId)?.name].filter((x): x is string => !!x).join(' · '), go: () => UI.nav('contact', { id: c.id }) }))
  Q.deals().filter(d => m(d.name)).slice(0, 6)
    .forEach(d => out.push({ g: 'Deals', ic: 'kanban', l: d.name, s: `${Q.stage(d)?.name ?? ''} · ${F.money(d.value, 1)}`, go: () => UI.nav('deal', { id: d.id }) }))
  Q.tasks().filter(t => m(t.title) && !Q.done(t)).slice(0, 5)
    .forEach(t => out.push({ g: 'Tasks', ic: 'checksq', l: t.title, s: `Due ${F.dt(t.due)} · ${Q.user(t.assigneeId)?.name ?? ''}`, go: () => UI.nav('tasks', { q: { search: t.title } }) }))
  S.sequences.filter(s => Q.inScope(s.businessId) && m(s.name)).slice(0, 4)
    .forEach(s => out.push({ g: 'Sequences', ic: 'send', l: s.name, s: `${Q.biz(s.businessId)?.name ?? ''} · ${s.status}`, go: () => UI.nav('sequence', { id: s.id }) }))
  Q.activities().filter(a => Q.actVisible(a) && m(a.subject)).slice(-4).reverse()
    .forEach(a => out.push({
      g: 'Activities', ic: AIC[a.type]?.[0] ?? 'activity', l: a.subject || 'Activity', s: F.dt(a.ts),
      go: () => (a.dealId ? UI.nav('deal', { id: a.dealId }) : a.contactId ? UI.nav('contact', { id: a.contactId }) : a.companyId ? UI.nav('company', { id: a.companyId }) : UI.nav('activities')),
    }))
  return out
}

export function Palette() {
  useStore()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const close = (): void => UI.palette(false)
  useFocusTrap(ref, close)
  const ql = q.trim().toLowerCase()
  const res = ql.length < 2 ? [] : search(ql)
  const go = (r: Result): void => {
    UI.palette(false)
    r.go()
  }
  const ws = Q.wsBiz()
  return (
    <div className="pal" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div ref={ref} className="pal-b" role="dialog" aria-modal="true" aria-label="Search" tabIndex={-1}>
        <div className="row" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <Icon n="search" style={{ color: 'var(--fg3)' }} />
          <input
            autoFocus
            value={q}
            onChange={e => { setQ(e.target.value); setI(0) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(res.length - 1, i + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)) }
              if (e.key === 'Enter' && res[i]) go(res[i])
            }}
            placeholder="Search by name, company, email or keyword…"
            style={{ border: 0, outline: 0, flex: 1, fontSize: 15, background: 'none' }}
            aria-label="Search query"
          />
          <Chip>{ws ? Q.biz(ws)?.name : 'All businesses'}</Chip>
        </div>
        <div style={{ maxHeight: '55vh', overflow: 'auto', padding: '4px 0' }}>
          {ql.length < 2 ? (
            <div className="faint sm" style={{ padding: 14 }}>Type at least two characters. Results respect your workspace and permissions.</div>
          ) : !res.length ? (
            <Empty icon="search" title="No matches" body={`Nothing in your accessible records matches “${q}”.`} />
          ) : (
            res.map((r, k) => (
              <Fragment key={k}>
                {(k === 0 || res[k - 1].g !== r.g) && <div className="mlab" style={{ padding: '8px 14px 2px' }}>{r.g}</div>}
                <button type="button" className={'pal-i' + (k === i ? ' on' : '')} onMouseEnter={() => setI(k)} onClick={() => go(r)}>
                  <Icon n={r.ic} s={14} style={{ color: 'var(--fg3)' }} />
                  <span className="b trunc">{r.l}</span>
                  <span className="faint sm trunc" style={{ marginLeft: 'auto', maxWidth: '50%' }}>{r.s}</span>
                </button>
              </Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
