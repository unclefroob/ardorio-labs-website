import { Act } from '../../data/Act'
import { uid } from '../../data/ids'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId } from '../../data/types'
import { Banner, Btn, Fld, Inp, Modal, Sel, TA } from '../../kit'
import { useF } from '../../shared/useF'
import { UI } from '../../ui/store'

export function NewSeq() {
  const editable = Q.myBiz().filter(b => Q.canEdit(b))
  const def = Q.defaultBiz()
  const b0: BusinessId | undefined = def && Q.canEdit(def) ? def : editable[0]
  const [f, set] = useF({ name: '', businessId: b0 ?? ('' as BusinessId | ''), description: '', ownerId: Q.me().id, mailboxId: '' })
  const me = Q.me()
  const mbs = S.mailboxes.filter(m => (f.businessId ? m.businessIds.includes(f.businessId) : false) && (m.type === 'shared' ? m.authorised.includes(me.id) || Q.isSuper() : m.ownerId === me.id))
  const mb = mbs.find(m => m.id === f.mailboxId)?.id ?? mbs[0]?.id

  if (!b0) {
    return (
      <Modal title="Create sequence" icon="send" width={560} footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Banner tone="warn">You need edit access to a business before you can create a sequence.</Banner>
      </Modal>
    )
  }

  const create = (): void => {
    if (!f.businessId) return
    if (!f.name.trim()) return UI.toast('Name the sequence', 'bad')
    if (!mb) return UI.toast('No sender mailbox available for this business', 'bad')
    const s = Act.saveSequence({
      name: f.name.trim(), businessId: f.businessId, description: f.description, ownerId: f.ownerId, mailboxId: mb,
      steps: [{ id: uid('st'), type: 'email', delay: 0, unit: 'days', subject: '', body: '' }],
    })
    UI.close()
    UI.nav('sequence', { id: s.id })
  }

  return (
    <Modal title="Create sequence" icon="send" width={560} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={create}>Create &amp; open builder</Btn></>}>
      <div className="col gap12">
        <Fld label="Sequence name" req><Inp value={f.name} onChange={v => set('name', v)} autoFocus /></Fld>
        <div className="grid g2">
          <Fld label="Business">
            <Sel value={f.businessId} onChange={v => set({ businessId: editable.find(b => b === v) ?? b0, mailboxId: '' })} options={editable.map(b => [b, Q.biz(b)?.name ?? b] as const)} />
          </Fld>
          <Fld label="Owner">
            <Sel value={f.ownerId} onChange={v => set('ownerId', v)} options={Q.usersIn(f.businessId).map(u => [u.id, u.name + (u.id === me.id ? ' (you)' : '')] as const)} />
          </Fld>
        </div>
        <Fld label="Description"><TA value={f.description} onChange={v => set('description', v)} rows={2} /></Fld>
        <Fld label="Sender mailbox" err={!mb ? 'No sender mailbox is available to you for this business.' : undefined}>
          <Sel value={mb ?? ''} onChange={v => set('mailboxId', v)} placeholder={mb ? null : 'No mailbox available'} options={mbs.map(m => [m.id, m.address + (m.type === 'shared' ? ' (shared)' : ' (personal)') + (m.status !== 'connected' ? ' — disconnected' : '')] as const)} />
        </Fld>
        <Banner tone="info">Email steps become tasks for the owner to send by hand. SalesOS does not send email.</Banner>
      </div>
    </Modal>
  )
}
