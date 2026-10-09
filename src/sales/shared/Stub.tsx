import { Banner } from '../kit/basic'
import { Drawer, Modal } from '../kit/overlay'

const NOTE = 'Placeholder. This part of SalesOS has not been ported into this build yet.'

export function StubPage({ name }: { name: string }) {
  return (
    <div className="page">
      <h1 tabIndex={-1}>{name}</h1>
      <Banner tone="warn">{NOTE}</Banner>
    </div>
  )
}

export function StubModal({ name }: { name: string }) {
  return (
    <Modal title={name}>
      <Banner tone="warn">{NOTE}</Banner>
    </Modal>
  )
}

export function StubDrawer({ name }: { name: string }) {
  return (
    <Drawer title={name}>
      <Banner tone="warn">{NOTE}</Banner>
    </Drawer>
  )
}

export function StubInline({ name }: { name: string }) {
  return <div className="faint xs">{name}: not ported yet</div>
}
