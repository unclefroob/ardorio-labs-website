import { Btn, Empty } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { UI } from '../../ui/store'

export function NoEditModal({ title, what }: { title: string; what: string }) {
  return (
    <Modal title={title} footer={<Btn onClick={UI.close}>Close</Btn>}>
      <Empty icon="lock" title="Read-only access" body={`You need edit access to at least one business to ${what}. Ask an administrator if you should have it.`} />
    </Modal>
  )
}

export function MissingModal({ title, what }: { title: string; what: string }) {
  return (
    <Modal title={title} footer={<Btn onClick={UI.close}>Close</Btn>}>
      <Empty icon="search" title={`${what} not found`} body="It may have been archived or removed, or you may not have access to it." />
    </Modal>
  )
}
