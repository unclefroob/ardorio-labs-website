import type { ReactNode } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Task } from '../../data/types'
import { Banner, Btn, Chip, Icon, Modal } from '../../kit'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from '../entities/guards'

function copy(text: string, what: string): void {
  if (!navigator.clipboard) return UI.toast('Copy is not available in this browser. Select the text and copy it.', 'warn')
  navigator.clipboard.writeText(text).then(
    () => UI.toast(`${what} copied`),
    () => UI.toast('Could not copy. Select the text and copy it.', 'warn'),
  )
}

function Row({ label, value, copyLabel, pre }: { label: string; value: ReactNode; copyLabel: string; pre?: string }) {
  return (
    <div className="fld">
      <label>{label}</label>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div
          className="card-b"
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: 'var(--surf2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', whiteSpace: pre ? 'pre-wrap' : undefined, overflowWrap: 'anywhere' }}
        >
          {value}
        </div>
        {pre !== undefined && <Btn size="sm" icon="copy" aria-label={copyLabel} onClick={() => copy(pre, copyLabel.replace(/^Copy /, '').replace(/^./, c => c.toUpperCase()))}>Copy</Btn>}
      </div>
    </div>
  )
}

export function SendEmailTask({ taskId }: { taskId?: string }) {
  useStore()
  const t = Q.task(taskId)
  if (!t || t.kind !== 'email' || !t.draft) return <MissingModal title="Send email" what="Email task" />
  if (!Q.canEdit(t.businessId)) return <NoEditModal title="Send email" what="mark emails as sent" />
  return <Draft t={t} />
}

function Draft({ t }: { t: Task }) {
  const d = t.draft
  const ct = Q.contact(t.contactId)
  const open = !Q.done(t)
  const sup = open && ct ? Q.suppressed(ct, t.businessId) : null
  const sendable = open && !sup
  const co = Q.company(t.companyId ?? ct?.companyId)

  if (!d) return null

  const markSent = (): void => {
    if (!UI.guard(t.businessId, 'Marking emails as sent')) return
    const r = Act.markEmailSent(t.id)
    if (r.ok) {
      UI.close()
      UI.toast('Marked as sent. The sequence moves on to the next step.')
    } else if (r.reason === 'duplicate') {
      UI.close()
      UI.toast('This email was already marked as sent.')
    } else if (r.reason === 'suppressed') UI.toast('This contact is suppressed. Nothing was recorded.', 'bad')
    else UI.toast('This email task is no longer open.', 'bad')
  }

  const skip = (): void => UI.confirm({
    title: 'Skip this email?',
    body: 'Nothing is recorded as sent and the sequence moves on to its next step.',
    confirm: 'Skip email',
    onConfirm: () => {
      const r = Act.skipEmailTask(t.id)
      if (r.ok) {
        UI.close()
        UI.toast('Email skipped')
      } else UI.toast('This email task is no longer open.', 'bad')
    },
  })

  const stop = (): void => UI.confirm({
    title: `Stop emailing ${ct?.name ?? 'this contact'}?`,
    body: 'They are removed from this sequence and no further steps run. This does not add them to the suppression list.',
    confirm: 'Stop emailing',
    danger: true,
    onConfirm: () => {
      const r = Act.stopEmailing(t.id)
      if (r.ok) {
        UI.close()
        UI.toast('Removed from the sequence')
      } else UI.toast('This email task is no longer open.', 'bad')
    },
  })

  const all = `To: ${d.to}${d.cc ? `\nCc: ${d.cc}` : ''}\nSubject: ${d.subject}\n\n${d.body}`

  return (
    <Modal
      title="Email to send"
      icon="mail"
      width={640}
      sub={<>{ct?.name ?? d.to}{co ? ` · ${co.name}` : ''} {open && <Chip tone="warn">Waiting to be sent</Chip>}</>}
      footer={
        open ? (
          <>
            <Btn kind="ghost" onClick={stop}>Stop emailing this contact</Btn>
            <span style={{ flex: 1 }} />
            <Btn onClick={skip}>Skip this email</Btn>
            <Btn kind="pri" icon="check" onClick={markSent} disabled={!sendable}>Mark as sent</Btn>
          </>
        ) : (
          <Btn onClick={UI.close}>Close</Btn>
        )
      }
    >
      <div className="col gap12">
        {open && (
          <Banner tone="info" icon="send">
            SalesOS does not send email. Copy this into your own mail client, send it from <strong>{d.from}</strong>, then come back and mark it as sent.
          </Banner>
        )}
        {sup && (
          <Banner tone="bad">
            {ct?.name} is suppressed ({sup.reason.toLowerCase()}). Do not email them. You can skip this step or stop emailing the contact.
          </Banner>
        )}
        {!open && (
          <Banner tone="ok">
            This email was already {t.status === 'Completed' ? 'marked as sent' : 'skipped or stopped'}{t.outcome ? ` (${t.outcome})` : ''}.
          </Banner>
        )}
        <Row label="From" value={<span className="mono">{d.from}</span>} copyLabel="Copy from" />
        <Row label="To" value={<span className="mono">{d.to}</span>} copyLabel="Copy to" pre={d.to} />
        {d.cc && <Row label="Cc" value={<span className="mono">{d.cc}</span>} copyLabel="Copy cc" pre={d.cc} />}
        <Row label="Subject" value={d.subject} copyLabel="Copy subject" pre={d.subject} />
        <Row label="Body" value={d.body} copyLabel="Copy body" pre={d.body} />
        <div className="row">
          <Btn icon="copy" aria-label="Copy all" onClick={() => copy(all, 'Email')}>Copy all</Btn>
          <span className="faint sm"><Icon n="info" s={12} /> To, subject and body in one go.</span>
        </div>
      </div>
    </Modal>
  )
}
