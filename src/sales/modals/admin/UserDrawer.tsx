import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import { BizDot, Btn, Card, Chip, Drawer, Banner, Timeline } from '../../kit'
import { UI } from '../../ui/store'

interface Props { id: string }

export function UserDrawer({ id }: Props) {
  const u = S.users.find(x => x.id === id)
  if (!u) {
    return (
      <Drawer title="User">
        <Banner tone="bad">This user no longer exists.</Banner>
      </Drawer>
    )
  }
  const roles = Object.values(u.m)
  const readOnly = roles.length > 0 && roles.every(r => r === 'viewer')
  const acts = S.audit.filter(a => a.actorId === id).slice(-8).reverse()
  const ac = S.activities.filter(a => a.actorId === id && Q.actVisible(a)).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 6)
  const canEdit = Q.anyAdmin() && (Q.isSuper() || !u.super)
  return (
    <Drawer
      title={u.name}
      sub={[u.title, u.email].filter(Boolean).join(' · ')}
      footer={canEdit && <Btn kind="pri" icon="edit" onClick={() => { UI.drawer(null); UI.open('userEdit', { id }) }}>Edit access</Btn>}
    >
      <div className="col gap12">
        {!u.active && <Banner tone="warn">This user is deactivated and cannot sign in to SalesOS.</Banner>}
        <Card title="Current access">
          {u.super ? (
            <div className="sm">Super Administrator: all businesses, portfolio reporting, administration and audit.</div>
          ) : (
            S.businesses.map(b => (
              <div key={b.id} className="row sm" style={{ padding: '4px 0' }}>
                <BizDot b={b.id} />
                <span style={{ width: 80 }}>{b.name}</span>
                {u.m[b.id] ? <Chip tone="acc">{u.m[b.id]}</Chip> : <span className="faint">No access</span>}
              </div>
            ))
          )}
          {!u.super && (
            <div className="faint xs" style={{ marginTop: 8 }}>
              {readOnly ? 'Read-only: cannot create or edit records.' : 'Can view all records in assigned businesses; private mailbox content stays private.'}
            </div>
          )}
        </Card>
        <Card title="Recent admin actions">
          {acts.length
            ? acts.map(a => <div key={a.id} className="sm" style={{ padding: '3px 0' }}>{a.action} <span className="faint">· {a.target} · {F.rel(a.ts)}</span></div>)
            : <div className="faint sm">No admin actions recorded.</div>}
        </Card>
        <Card title="Recent sales activity">
          <Timeline items={ac} />
        </Card>
      </div>
    </Drawer>
  )
}
