import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import type { BusinessId } from '../../data/types'
import { Banner, Btn, Fld, Modal, Sel } from '../../kit'
import { UI } from '../../ui/store'
import { NoEditModal } from '../entities/guards'

interface Props { kind?: 'task' | 'deal' | 'rel' | 'crel' | 'contacts' | 'companies'; id?: string; businessId?: BusinessId; ids?: string[] }

export function Reassign(p: Props) {
  if (!p.businessId || !p.kind) return <NoEditModal title="Reassign owner" what="reassign records" />
  if (!Q.canEdit(p.businessId)) return <NoEditModal title="Reassign owner" what="reassign records" />
  return <ReassignForm kind={p.kind} id={p.id} ids={p.ids ?? []} b={p.businessId} />
}

function ReassignForm({ kind, id, ids, b }: { kind: NonNullable<Props['kind']>; id?: string; ids: string[]; b: BusinessId }) {
  const [u, setU] = useState('')
  const us = Q.sellersIn(b).concat(Q.usersIn(b).filter(x => x.super && !Q.sellersIn(b).some(s => s.id === x.id)))
  const target = id ? [id] : ids

  const go = (): void => {
    if (!target.length) return
    if (kind === 'task' && id) Act.updateTask(id, { assigneeId: u })
    if (kind === 'deal' && id) Act.updateDeal(id, { ownerId: u })
    if (kind === 'rel' && id) Act.updateRel(id, { ownerId: u })
    if (kind === 'crel' && id) Act.updateCrel(id, { ownerId: u })
    if (kind === 'contacts') Act.assignContacts(ids, b, u)
    if (kind === 'companies') Act.bulkCompanies(ids, 'owner', u)
    UI.close()
    UI.toast('Reassigned to ' + (Q.user(u)?.name ?? 'new owner') + ' · audit logged')
  }

  return (
    <Modal title="Reassign owner" icon="swap" width={420} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" disabled={!u || !target.length} onClick={go}>Reassign</Btn></>}>
      {us.length ? (
        <Fld label={'New owner (' + (Q.biz(b)?.name ?? b) + ')'}>
          <Sel value={u} onChange={setU} placeholder="Select…" options={us.map(x => [x.id, x.name + ' — ' + Q.roleOf(x, b)] as const)} />
        </Fld>
      ) : (
        <Banner tone="warn">No one in {Q.biz(b)?.name ?? 'this business'} can own records yet. Add a salesperson in Admin first.</Banner>
      )}
    </Modal>
  )
}
