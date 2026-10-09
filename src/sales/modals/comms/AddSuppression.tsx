import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import type { BusinessId } from '../../data/types'
import { Banner, Btn, Fld, Modal, Seg, Sel } from '../../kit'
import { BizSel, useF } from '../../shared/forms'
import { UI } from '../../ui/store'
import { NoEditModal } from '../entities/guards'

interface SupForm { contactId: string; scope: 'business' | 'global'; businessId: BusinessId; reason: string }

export function AddSuppression({ contactId }: { contactId?: string }) {
  const biz = Q.defaultBiz()
  if (!biz) return <NoEditModal title="Add suppression" what="manage suppressions" />
  return <SuppressionForm contactId={contactId ?? ''} biz={biz} />
}

function SuppressionForm({ contactId, biz }: { contactId: string; biz: BusinessId }) {
  const [f, set] = useF<SupForm>({ contactId, scope: 'business', businessId: biz, reason: 'Manual suppression' })
  const contacts = Q.contacts()

  const go = (): void => {
    const ct = Q.contact(f.contactId)
    if (!ct) return UI.toast('Select a contact', 'bad')
    if (f.scope === 'business' && !UI.guard(f.businessId, 'Suppressing contacts')) return
    Act.addSuppression({ contactId: ct.id, scope: f.scope, businessId: f.scope === 'global' ? null : f.businessId, reason: f.reason, email: ct.email })
    UI.close()
    UI.toast('Suppression recorded · active outreach stopped')
  }

  return (
    <Modal title="Add suppression" icon="stop" width={480} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="danger" onClick={go} disabled={!contacts.length}>Suppress</Btn></>}>
      <div className="col gap12">
        {!contacts.length && <Banner tone="info">There are no contacts to suppress yet.</Banner>}
        <Fld label="Contact"><Sel value={f.contactId} onChange={v => set('contactId', v)} placeholder="Select…" options={contacts.map(c => [c.id, c.name + ' · ' + (c.email || 'no email')] as const)} /></Fld>
        <Fld label="Scope">
          {Q.isSuper() ? (
            <Seg value={f.scope} onChange={v => set('scope', v === 'global' ? 'global' : 'business')} opts={[['business', 'Business'], ['global', 'Global (all businesses)']]} />
          ) : (
            <div className="sm">Business scope <span className="faint">(global requires Super Admin)</span></div>
          )}
        </Fld>
        {f.scope === 'business' && <Fld label="Business"><BizSel value={f.businessId} onChange={v => set('businessId', v as BusinessId)} /></Fld>}
        <Fld label="Reason"><Sel value={f.reason} onChange={v => set('reason', v)} options={['Unsubscribe', 'Invalid address', 'Delivery failure', 'Manual suppression', 'Compliance review']} /></Fld>
      </div>
    </Modal>
  )
}
