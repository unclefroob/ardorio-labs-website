import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { SalesUser, Team } from '../../data/types'
import { Av, BizDot, Btn, Card, Chip, DataTable, Empty, FilterBar, Menu, Owner, SearchInp, Tabs, type Col } from '../../kit'
import { PageHead } from '../../shared/PageHead'
import { UI } from '../../ui/store'

function toggleActive(u: SalesUser): void {
  const want = !u.active
  void Act.setUserActive(u.id, want).then(() => {
    if (Q.user(u.id)?.active === want) UI.toast(`${u.name} ${want ? 'activated' : 'deactivated'}`)
  })
}

function TeamCard({ t }: { t: Team }) {
  const admin = Q.canAdmin(t.businessId)
  const candidates = Q.usersIn(t.businessId).filter(u => !t.members.includes(u.id))
  return (
    <Card
      title={<span className="row"><BizDot b={t.businessId} />{t.name}</span>}
      right={admin && (
        <>
          <Btn size="xs" kind="ghost" icon="edit" aria-label="Edit team" onClick={() => UI.open('teamEdit', { id: t.id })} />
          <Btn size="xs" kind="ghost" icon="trash" aria-label="Delete team" onClick={() => UI.confirm({
            title: 'Delete team?', body: 'Users keep their business roles.', danger: true, confirm: 'Delete',
            onConfirm: () => { Act.deleteTeam(t.id); UI.toast('Team deleted') },
          })} />
        </>
      )}
    >
      <div className="sm" style={{ marginBottom: 8 }}><span className="faint">Manager:</span> <b>{Q.user(t.managerId)?.name ?? 'Unassigned'}</b></div>
      <div className="col" style={{ gap: 6 }}>
        {t.members.map(m => {
          const mu = Q.user(m)
          return (
            <div key={m} className="row sm">
              <Owner id={m} />
              <span className="faint xs">{mu ? Q.roleOf(mu, t.businessId) : ''}</span>
              <span className="sp" />
              {admin && m !== t.managerId && <Btn size="xs" kind="ghost" onClick={() => Act.saveTeam({ ...t, members: t.members.filter(x => x !== m) })}>Remove</Btn>}
            </div>
          )
        })}
      </div>
      {admin && (
        <div style={{ marginTop: 10 }}>
          <Menu
            trigger={<Btn size="xs" icon="plus">Add member</Btn>}
            items={[
              ...candidates.map(u => ({ label: u.name, onClick: () => Act.saveTeam({ ...t, members: t.members.concat(u.id) }) })),
              { label: candidates.length ? `Only users with access to ${Q.biz(t.businessId)?.name ?? 'this business'} can join` : 'Everyone with access is already a member', disabled: true },
            ]}
          />
        </div>
      )}
    </Card>
  )
}

export function Users() {
  const [tab, setTab] = useState('users')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = S.users.filter(u => !needle || `${u.name} ${u.email} ${u.username}`.toLowerCase().includes(needle))
  const canAny = Q.anyAdmin()
  const meId = Q.me().id
  const cols: Col<SalesUser>[] = [
    { k: 'name', l: 'User', r: u => <span className="row"><Av u={u} s={26} /><div><b>{u.name}</b><div className="faint xs">{u.email}</div></div></span> },
    { k: 'title', l: 'Title' },
    {
      k: 'm', l: 'Access', nosort: true,
      r: u => (u.super
        ? <Chip tone="acc">Super Administrator · all businesses</Chip>
        : Object.keys(u.m).length
          ? <span className="row wrap" style={{ gap: 4 }}>{S.businesses.filter(b => u.m[b.id]).map(b => <Chip key={b.id}><BizDot b={b.id} />{b.name}: {u.m[b.id]}</Chip>)}</span>
          : <span className="faint">No access</span>),
    },
    { k: 't', l: 'Teams', sort: u => S.teams.filter(t => t.members.includes(u.id)).map(t => t.name).join(', '), r: u => S.teams.filter(t => t.members.includes(u.id)).map(t => t.name).join(', ') || '—' },
    { k: 'active', l: 'Status', r: u => <Chip tone={u.active ? 'ok' : ''}>{u.active ? 'Active' : 'Deactivated'}</Chip> },
    {
      k: 'a', l: '', nosort: true,
      r: u => canAny && (Q.isSuper() || !u.super) && (
        <span className="row" style={{ gap: 2 }} onClick={e => e.stopPropagation()}>
          <Btn size="xs" kind="ghost" icon="edit" aria-label={`Edit ${u.name}`} onClick={() => UI.open('userEdit', { id: u.id })} />
          {u.id !== meId && <Btn size="xs" kind="ghost" onClick={() => toggleActive(u)}>{u.active ? 'Deactivate' : 'Activate'}</Btn>}
        </span>
      ),
    },
  ]
  return (
    <div className="page">
      <PageHead title="Users & teams" sub="Roles are assigned per business. Changes take effect immediately.">
        {tab === 'users'
          ? <Btn kind="pri" icon="plus" onClick={() => UI.open('userEdit')}>Add user</Btn>
          : <Btn kind="pri" icon="plus" onClick={() => UI.open('teamEdit')}>Create team</Btn>}
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[['users', 'Users', S.users.length], ['teams', 'Teams', S.teams.length]]} />
      {tab === 'users' && (
        <div className="card">
          <FilterBar><SearchInp value={q} onChange={setQ} placeholder="Search name or email" /></FilterBar>
          <DataTable
            rows={rows}
            cols={cols}
            onRow={u => UI.drawer('user', { id: u.id })}
            empty={q
              ? <Empty icon="search" title="No users match" body={`Nobody matches “${q}”.`} action={<Btn size="sm" onClick={() => setQ('')}>Clear search</Btn>} />
              : <Empty icon="users" title="No users yet" body="Add an existing login to give them access to SalesOS." action={<Btn size="sm" icon="plus" onClick={() => UI.open('userEdit')}>Add user</Btn>} />}
          />
        </div>
      )}
      {tab === 'teams' && (S.teams.length
        ? <div className="grid g2">{S.teams.map(t => <TeamCard key={t.id} t={t} />)}</div>
        : <div className="card"><Empty icon="users" title="No teams yet" body="Teams group salespeople under a manager and are used for team goals." action={<Btn size="sm" icon="plus" onClick={() => UI.open('teamEdit')}>Create team</Btn>} /></div>)}
    </div>
  )
}
