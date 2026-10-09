import { useState } from 'react'
import { UI } from '../ui/store'
import { Btn, Inp } from './basic'
import { Modal } from './overlay'

interface AskTextProps {
  title: string
  def?: string
  cb: (v: string) => void
}

export function AskText({ title, def, cb }: AskTextProps) {
  const [v, setV] = useState(def ?? '')
  const ok = (): void => {
    if (!v.trim()) return
    UI.close()
    cb(v.trim())
  }
  return (
    <Modal
      title={title}
      width={420}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" disabled={!v.trim()} onClick={ok}>Save</Btn>
        </>
      }
    >
      <Inp value={v} onChange={setV} autoFocus aria-label={title} onKeyDown={e => { if (e.key === 'Enter') ok() }} style={{ width: '100%' }} />
    </Modal>
  )
}
