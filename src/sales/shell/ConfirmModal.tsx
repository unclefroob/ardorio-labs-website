import { Btn, Modal } from '../kit'
import { UI, type ConfirmProps } from '../ui/store'

export function ConfirmModal({ title, body, points, confirm = 'Confirm', danger, onConfirm }: ConfirmProps) {
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
      {points && points.length > 0 && (
        <ul className="muted sm" style={{ lineHeight: 1.55, margin: '10px 0 0', paddingLeft: 18 }}>
          {points.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
    </Modal>
  )
}
