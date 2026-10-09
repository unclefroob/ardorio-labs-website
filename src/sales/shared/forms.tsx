import { Chip, Ck, Fld, Inp, Sel, Toggle } from '../kit/basic'
import { Icon } from '../kit/Icon'
import { F } from '../data/F'
import { Q } from '../data/Q'
import { S } from '../data/store'
import type { PipelineField } from '../data/types'

// Stays exported from here (the planned path); the hook lives in useF.ts because this file exports components.
// eslint-disable-next-line react-refresh/only-export-components
export { useF } from './useF'

const str = (v: unknown): string => (v == null ? '' : String(v))

export function BizSel({ value, onChange, all }: { value: string; onChange: (v: string) => void; all?: boolean }) {
  const ids = all ? Q.myBiz() : Q.myBiz().filter(Q.canEdit)
  return <Sel value={value} onChange={onChange} options={ids.map(b => [b, Q.biz(b)?.name ?? b] as const)} />
}

export function OwnerSel({ b, value, onChange, selfOnly, placeholder }: { b: string; value: string; onChange: (v: string) => void; selfOnly?: boolean; placeholder?: string }) {
  const us = selfOnly ? [Q.me()] : Q.usersIn(b)
  return <Sel value={value} onChange={onChange} placeholder={placeholder} options={us.map(u => [u.id, u.name + (u.id === Q.me().id ? ' (you)' : '')] as const)} />
}

export function CoSel({ value, onChange, b }: { value: string; onChange: (v: string) => void; b?: unknown }) {
  const cs = (b ? S.companies.filter(c => !c.archived && Q.relsOf(c.id).some(r => Q.member(r.businessId))) : Q.companies()).slice().sort((a, c) => a.name.localeCompare(c.name))
  return <Sel value={value} onChange={onChange} placeholder="Select company…" options={cs.map(c => [c.id, c.name] as const)} />
}

export function CtSel({ companyId, value, onChange, placeholder }: { companyId: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const cs = S.contacts.filter(c => c.companyId === companyId && !c.archived)
  return <Sel value={value} onChange={onChange} placeholder={placeholder || 'Select contact…'} options={cs.map(c => [c.id, c.name + ' — ' + c.title] as const)} />
}

export function MultiCt({ companyId, value, onChange }: { companyId: string; value: string[]; onChange: (v: string[]) => void }) {
  const cs = S.contacts.filter(c => c.companyId === companyId && !c.archived)
  if (!companyId) return <div className="faint sm">Choose a company first.</div>
  if (!cs.length) return <div className="faint sm">No contacts at this company yet.</div>
  return (
    <div className="col" style={{ gap: 4, maxHeight: 150, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 7, padding: 8 }}>
      {cs.map(c => (
        <Ck key={c.id} checked={value.includes(c.id)} onChange={v => onChange(v ? value.concat(c.id) : value.filter(x => x !== c.id))}>
          <span>{c.name} <span className="faint">· {c.title} · {c.buyingRole}</span></span>
        </Ck>
      ))}
    </div>
  )
}

export function DealFieldInput({ fd, value, onChange, companyId }: { fd: PipelineField; value: unknown; onChange: (v: unknown) => void; companyId: string }) {
  if (fd.type === 'select') return <Sel value={str(value)} onChange={onChange} placeholder="—" options={fd.options ?? []} />
  if (fd.type === 'boolean') {
    return (
      <div className="row">
        <Toggle on={!!value} onChange={onChange} label={fd.label} />
        <span className="sm muted">{value ? 'Yes' : value === false ? 'No' : 'Not set'}</span>
      </div>
    )
  }
  if (fd.type === 'date') return <Inp type="date" value={str(value)} onChange={onChange} />
  if (fd.type === 'contact') return <CtSel companyId={companyId} value={str(value)} onChange={onChange} placeholder="—" />
  const numeric = fd.type === 'number' || fd.type === 'currency'
  return <Inp value={str(value)} onChange={v => onChange(numeric ? (v === '' ? '' : +v.replace(/[^0-9.]/g, '')) : v)} inputMode={numeric ? 'decimal' : undefined} />
}

export function RosCalc({ f, set }: { f: Record<string, unknown>; set: (k: string, v: unknown) => void }) {
  const mrr = Q.rosMrr(f)
  return (
    <div className="card card-b" style={{ background: 'var(--surf2)' }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <Icon n="dollar" s={14} /><b>Recurring revenue calculator</b><span className="sp" />
        <Ck checked={!!f.override} onChange={v => set('override', v)}>Custom commercial arrangement</Ck>
      </div>
      <div className="grid g3">
        <Fld label="Billable employees"><Inp value={str(f.employees)} onChange={v => set('employees', +v || '')} inputMode="numeric" /></Fld>
        <Fld label="A$ per employee / month"><Inp value={str(f.rate)} onChange={v => set('rate', v.replace(/[^0-9.]/g, ''))} inputMode="decimal" /></Fld>
        {f.override ? <Fld label="Custom MRR (A$)"><Inp value={str(f.overrideMrr)} onChange={v => set('overrideMrr', +v || '')} /></Fld> : <div />}
      </div>
      <div className="row" style={{ marginTop: 10, gap: 24 }}>
        <div><div className="faint xs">MRR {f.override ? '(custom override)' : '= employees × rate'}</div><div className="b num" style={{ fontSize: 18 }}>{F.money(mrr)}</div></div>
        <div><div className="faint xs">ARR = MRR × 12</div><div className="b num" style={{ fontSize: 18 }}>{F.money(mrr * 12)}</div></div>
        {!!f.override && <Chip tone="warn">Calculation overridden</Chip>}
      </div>
    </div>
  )
}
