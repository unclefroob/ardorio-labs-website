import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { F } from '../data/F'
import { Q } from '../data/Q'
import type { Enrolment, Task } from '../data/types'
import { routeToPath } from '../routes'
import { UI } from '../ui/store'
import { Av, Chip } from './basic'
import { Icon } from './Icon'
import { EST } from './util'

/** A real anchor to the page, so open-in-new-tab works; plain clicks navigate in place. */
export function Link({ to, id, q, children, style }: { to: string; id?: string | null; q?: Record<string, unknown>; children?: ReactNode; style?: CSSProperties }) {
  const href = routeToPath(to, { id: id ?? undefined, q })
  const go = (e: MouseEvent<HTMLAnchorElement>): void => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
      e.stopPropagation()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    UI.nav(to, { id: id ?? undefined, q })
  }
  return (
    <a href={href} style={style} onClick={go}>
      {children}
    </a>
  )
}

const dash = <span className="faint">—</span>

export function CoLink({ id }: { id: string | null | undefined }) {
  const c = Q.company(id)
  return c && id ? <Link to="company" id={id}>{c.name}</Link> : dash
}

export function CtLink({ id }: { id: string | null | undefined }) {
  const c = Q.contact(id)
  return c && id ? <Link to="contact" id={id}>{c.name}</Link> : dash
}

export function DlLink({ id, full }: { id: string | null | undefined; full?: boolean }) {
  const d = Q.deal(id)
  if (!d || !id) return dash
  if (!Q.member(d.businessId)) {
    return (
      <span className="faint">
        <Icon n="lock" s={11} /> Restricted deal
      </span>
    )
  }
  return <Link to="deal" id={id}>{full ? d.name : d.title || d.name}</Link>
}

export function Owner({ id, s = 20 }: { id: string | null | undefined; s?: number }) {
  const u = Q.user(id)
  if (!u) return dash
  return (
    <span className="row" style={{ gap: 6 }}>
      <Av u={u} s={s} />
      <span className="trunc">{u.name}</span>
    </span>
  )
}

export function Due({ t }: { t: Task }) {
  if (Q.done(t)) return <span className="faint">{t.completedAt ? 'Done ' + F.date(t.completedAt) : t.status}</span>
  if (t.status === 'Snoozed') return <Chip icon="clock">Snoozed to {F.dt(t.snoozeUntil)}</Chip>
  const od = Q.overdue(t)
  return (
    <span style={{ color: od ? 'var(--bad2)' : Q.isToday(t.due) ? 'var(--fg)' : 'var(--fg2)', fontWeight: od ? 600 : 400 }}>
      {od ? 'Overdue · ' : ''}
      {F.rel(t.due)}
    </span>
  )
}

export function EnrolChip({ s }: { s: Enrolment['status'] | string }) {
  const [l, t] = EST[s] ?? [s, '']
  return <Chip tone={t}>{l}</Chip>
}
