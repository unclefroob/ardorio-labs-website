import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId } from '../../data/types'
import { Banner, Btn, Ck, Fld, Inp, Modal, Sel } from '../../kit'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'

interface Props { id?: string }
interface Form { name: string; businessId: BusinessId | ''; managerId: string; members: string[] }

export function TeamEdit({ id }: Props) {
  const t = id ? S.teams.find(x => x.id === id) : undefined
  const bs = Q.myBiz().filter(b => Q.canAdmin(b))
  const [f, set] = useF<Form>(t
    ? { name: t.name, businessId: t.businessId, managerId: t.managerId, members: t.members.slice() }
    : { name: '', businessId: bs[0] ?? '', managerId: '', members: [] })
  const people = f.businessId ? Q.usersIn(f.businessId) : []

  if (!bs.length || (id && !t) || (t && !Q.canAdmin(t.businessId))) {
    return (
      <Modal title={t ? 'Edit team' : 'Create team'} icon="users" width={480} footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Banner tone={id && !t ? 'bad' : 'warn'}>{id && !t ? 'This team no longer exists.' : 'Only business admins can manage teams.'}</Banner>
      </Modal>
    )
  }
  const save = (): void => {
    if (!f.name.trim() || !f.managerId || !f.businessId) {
      UI.toast('Name and manager required', 'bad')
      return
    }
    Act.saveTeam({ id: t?.id, name: f.name.trim(), businessId: f.businessId, managerId: f.managerId, members: f.members })
    UI.close()
    UI.toast('Team saved')
  }
  return (
    <Modal
      title={t ? 'Edit team' : 'Create team'}
      icon="users"
      width={480}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" onClick={save}>Save</Btn>
        </>
      }
    >
      <div className="col gap12">
        <Fld label="Team name" req><Inp value={f.name} onChange={v => set('name', v)} /></Fld>
        <Fld label="Business">
          <Sel value={f.businessId} onChange={v => set({ businessId: v as BusinessId, managerId: '', members: [] })} options={bs.map(b => [b, Q.biz(b)?.name ?? b] as const)} />
        </Fld>
        <Fld label="Team manager" req hint={people.length ? undefined : 'No active users have access to this business yet.'}>
          <Sel value={f.managerId} onChange={v => set('managerId', v)} placeholder="Select…" options={people.map(u => [u.id, u.name] as const)} />
        </Fld>
        <Fld label="Members">
          {people.length ? (
            <div className="col" style={{ gap: 4 }}>
              {people.map(u => (
                <Ck key={u.id} checked={f.members.includes(u.id)} onChange={v => set('members', v ? f.members.concat(u.id) : f.members.filter(x => x !== u.id))}>
                  {u.name} <span className="faint xs">· {Q.roleOf(u, f.businessId)}</span>
                </Ck>
              ))}
            </div>
          ) : (
            <div className="faint sm">Nobody to add yet.</div>
          )}
        </Fld>
      </div>
    </Modal>
  )
}
