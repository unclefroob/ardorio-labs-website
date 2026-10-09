import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import type { Notification } from '../../data/types'
import { Btn, Card, Chip, Empty, Sel, Seg } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

function open(n: Notification): void {
  Act.readNotif(n.id)
  const l = n.link
  if (!l) return
  if (l.page === 'deal' && l.id && !Q.member(Q.deal(l.id)?.businessId)) {
    UI.toast('You no longer have access to that record', 'bad')
    return
  }
  UI.nav(l.page, { id: l.id ?? undefined, q: l.q })
}

export function Notifications() {
  const [f, setF] = useState('all')
  const all = Q.notifs()
  const types = [...new Set(all.map(n => n.type))]
  const rows = all.filter(n => f === 'all' || (f === 'unread' ? !n.read : n.type === f))
  const unread = all.filter(n => !n.read).length
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHead title="Notifications" sub={`${unread} unread · in-app only, no external notifications are sent`}>
        <Btn icon="check" disabled={!unread} onClick={() => { Act.readAll(); UI.toast('All marked read') }}>Mark all read</Btn>
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Seg value={f === 'all' || f === 'unread' ? f : 'type'} onChange={v => setF(v === 'type' ? (types[0] ?? 'all') : v)} opts={[['all', 'All'], ['unread', 'Unread'], ['type', 'By type']]} />
        {f !== 'all' && f !== 'unread' && <Sel className="sm" style={{ width: 240 }} value={f} onChange={setF} aria-label="Notification type" options={types} />}
      </div>
      <Card pad={false}>
        {rows.length ? rows.map(n => (
          <div
            key={n.id}
            className="row"
            role="button"
            tabIndex={0}
            style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', alignItems: 'flex-start', cursor: 'pointer', background: n.read ? undefined : 'var(--acc-soft)' }}
            onClick={() => open(n)}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(n) } }}
          >
            <span className="dot" style={{ background: n.read ? 'transparent' : 'var(--acc)', marginTop: 6 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 6 }}><b className="sm">{n.title}</b><Chip>{n.type}</Chip></div>
              {n.body && <div className="muted sm">{n.body}</div>}
              <div className="faint xs">{F.dt(n.ts)}</div>
            </div>
            {!n.read && <Btn size="xs" kind="ghost" onClick={e => { e.stopPropagation(); Act.readNotif(n.id) }}>Mark read</Btn>}
          </div>
        )) : (
          <Empty
            icon="bell"
            title={all.length ? 'Nothing matches this filter' : 'No notifications'}
            body={all.length ? 'Try All or another type.' : 'Replies, approvals, assignments and reminders will show up here.'}
            action={all.length ? <Btn onClick={() => setF('all')}>Show all</Btn> : undefined}
          />
        )}
      </Card>
    </div>
  )
}
