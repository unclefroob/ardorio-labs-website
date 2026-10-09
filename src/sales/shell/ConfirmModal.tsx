import { Btn, Modal } from '../kit'
import { UI, type ConfirmProps } from '../ui/store'

export function ConfirmModal({ title, body, confirm = 'Confirm', danger, onConfirm }: ConfirmProps) {
  return (
    <Modal
      title={title}
      width={440}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn
            kind={danger ? 'danger' : 'pri'}
            onClick={() => {
              UI.close()
              onConfirm()
            }}
          >
            {confirm}
          </Btn>
        </>
      }
    >
      <div className="muted" style={{ lineHeight: 1.55 }}>{body}</div>
    </Modal>
  )
}
