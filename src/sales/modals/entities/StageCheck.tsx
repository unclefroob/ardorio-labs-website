import { useState } from 'react'
import { Act } from '../../data/Act'
import type { MissingField } from '../../data/Q'
import { Q } from '../../data/Q'
import type { Deal } from '../../data/types'
import { Banner, Btn, Fld, Inp, TA } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { CtSel, DealFieldInput } from '../../shared/forms'
import { doMove } from '../../shared/moves'
import { UI } from '../../ui/store'
import { MissingModal } from './guards'

export interface StageCheckProps { id: string; stageId: string; missing: MissingField[] }

export function StageCheck({ id, stageId, missing }: StageCheckProps) {
  const d = Q.deal(id)
  const st = d ? Q.pipeline(d.businessId).stages.find(s => s.id === stageId) : undefined
  if (!d || !st) return <MissingModal title="Required fields" what="Deal or stage" />
  return <StageCheckForm d={d} stageId={stageId} stageName={st.name} missing={missing} />
}

function StageCheckForm({ d, stageId, stageName, missing }: { d: Deal; stageId: string; stageName: string; missing: MissingField[] }) {
  const [v, setV] = useState<Record<string, unknown>>({})
  const pl = Q.pipeline(d.businessId)
  const st = pl.stages.find(s => s.id === stageId)
  const put = (k: string, x: unknown): void => setV(p => ({ ...p, [k]: x }))

  const save = (): void => {
    if (!st) return
    const p: Partial<Deal> = {}
    const fields: Record<string, unknown> = {}
    for (const m of missing) {
      const x = v[m.key]
      if (x == null || x === '') continue
      if (m.key.startsWith('f.')) fields[m.key.slice(2)] = x
      else if (m.key === 'primaryContact') p.contactIds = [String(x), ...d.contactIds.filter(c => c !== x)]
      else p[m.key] = m.key === 'value' ? +String(x) : x
    }
    if (Object.keys(fields).length) p.fields = fields
    const still = Q.missingFor(d, st, p)
    if (still.length) return UI.toast('Still missing: ' + still.map(s => s.label).join(', '), 'bad')
    Act.updateDeal(d.id, p, true)
    UI.close()
    doMove(d.id, stageId)
  }

  const input = (m: MissingField) => {
    if (m.field) return <DealFieldInput fd={m.field} value={v[m.key]} onChange={x => put(m.key, x)} companyId={d.companyId} />
    if (m.key === 'primaryContact') return <CtSel companyId={d.companyId} value={String(v[m.key] ?? '')} onChange={x => put(m.key, x)} />
    if (m.key === 'description') return <TA value={String(v[m.key] ?? '')} onChange={x => put(m.key, x)} rows={3} />
    return <Inp value={String(v[m.key] ?? '')} onChange={x => put(m.key, x)} />
  }

  return (
    <Modal
      title={'Required before ' + stageName}
      icon="alert"
      sub={d.name}
      footer={<><Btn onClick={UI.close}>Keep in {Q.stage(d)?.name ?? 'current stage'}</Btn><Btn kind="pri" onClick={save}>Save &amp; move to {stageName}</Btn></>}
    >
      <Banner tone="warn">
        Your administrator requires {missing.length} field{missing.length > 1 ? 's' : ''} before a {pl.name} deal can enter <b>{stageName}</b>. Complete {missing.length > 1 ? 'them' : 'it'} below to continue.
      </Banner>
      <div className="col gap12" style={{ marginTop: 14 }}>
        {missing.map(m => <Fld key={m.key} label={m.label} req>{input(m)}</Fld>)}
      </div>
    </Modal>
  )
}
