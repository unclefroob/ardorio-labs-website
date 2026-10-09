import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import type { BusinessId, Stage } from '../../data/types'
import { Banner, Btn, Fld, Modal, Sel } from '../../kit'
import { UI } from '../../ui/store'

interface Props { b: BusinessId; stage: Stage; n: number; others: Stage[]; onDone?: () => void }

export function Migrate({ b, stage, n, others, onDone }: Props) {
  const [to, setTo] = useState(others[0]?.id ?? '')
  if (!Q.canAdmin(b)) {
    return (
      <Modal title="Remove stage" icon="alert" width={460} footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Banner tone="warn">Only a business admin can change the pipeline.</Banner>
      </Modal>
    )
  }
  if (!others.length) {
    return (
      <Modal title={`Remove “${stage.name}”`} icon="alert" width={460} footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Banner tone="bad">There is no other saved stage to move the {n} deal{n === 1 ? '' : 's'} into. Keep at least one other stage and save the pipeline first.</Banner>
      </Modal>
    )
  }
  const go = (): void => {
    if (!to) return
    Act.removeStage(b, stage.id, to)
    UI.close()
    onDone?.()
    UI.toast(`${n} deal${n === 1 ? '' : 's'} migrated and stage removed`)
  }
  return (
    <Modal
      title={`Remove “${stage.name}”`}
      icon="alert"
      width={460}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="danger" disabled={!to} onClick={go}>Migrate & remove</Btn>
        </>
      }
    >
      <Banner tone="warn">{n} deal{n === 1 ? ' is' : 's are'} currently in this stage. Choose where to move {n === 1 ? 'it' : 'them'} before removing the stage.</Banner>
      <Fld label="Move deals to" style={{ marginTop: 12 }}>
        <Sel value={to} onChange={setTo} options={others.map(s => [s.id, s.name] as const)} />
      </Fld>
    </Modal>
  )
}
