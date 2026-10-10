import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import type { Deal } from '../../data/types'
import { Btn, Fld, Inp, Sel, TA } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { useF } from '../../shared/forms'
import { UI } from '../../ui/store'
import { MissingModal } from './guards'

interface LostDraft { reason: string; notes: string; reengage: string }

export function Lost({ id }: { id: string }) {
  const d = Q.deal(id)
  if (!d) return <MissingModal title="Mark as Closed Lost" what="Deal" />
  return <LostForm d={d} />
}

function LostForm({ d }: { d: Deal }) {
  const pl = Q.pipeline(d.businessId)
  const [f, set] = useF<LostDraft>({ reason: '', notes: '', reengage: '' })
  const save = (): void => {
    if (!f.reason) return UI.toast('Select a loss reason', 'bad')
    if (!UI.guard(d.businessId, 'Closing deals')) return
    Act.markLost(d.id, f)
    UI.close()
    UI.toast('Deal marked lost' + (f.reengage ? ' · re-engagement task scheduled' : ''))
  }
  return (
    <Modal title="Mark as Closed Lost" icon="x" sub={d.name} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="danger" onClick={save}>Mark lost</Btn></>}>
      <div className="col gap12">
        <Fld label="Loss reason" req hint={pl.lostReasons.length ? null : 'No loss reasons are configured for this pipeline. An administrator can add them.'}>
          <Sel value={f.reason} onChange={v => set('reason', v)} placeholder="Select reason…" options={pl.lostReasons} />
        </Fld>
        <Fld label="Notes"><TA value={f.notes} onChange={v => set('notes', v)} rows={3} /></Fld>
        <Fld label="Schedule re-engagement (optional)" hint="Creates a follow-up task on this date"><Inp type="date" value={f.reengage} onChange={v => set('reengage', v)} /></Fld>
      </div>
    </Modal>
  )
}
