import { useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import type { BusinessId } from '../../data/types'
import { Banner, Btn, Fld, Modal, Seg, TA } from '../../kit'
import { UI } from '../../ui/store'
import { MissingModal, NoEditModal } from '../entities/guards'

type LiKind = 'linkedin_conn' | 'linkedin_msg' | 'linkedin_reply'
const KINDS: readonly LiKind[] = ['linkedin_conn', 'linkedin_msg', 'linkedin_reply']
const isKind = (v: string): v is LiKind => (KINDS as readonly string[]).includes(v)

interface Props { contactId?: string; taskId?: string; businessId?: BusinessId }

export function LinkedIn(p: Props) {
  const ct = Q.contact(p.contactId)
  if (!ct) return <MissingModal title="Log LinkedIn activity" what="Contact" />
  const t = p.taskId ? Q.task(p.taskId) : undefined
  const b = p.businessId ?? t?.businessId ?? Q.primaryBiz(ct)
  if (!b || !Q.canEdit(b)) return <NoEditModal title={'Log LinkedIn activity — ' + ct.name} what="log activity" />
  return <LinkedInForm contactId={ct.id} taskId={t?.id} b={b} />
}

function LinkedInForm({ contactId, taskId, b }: { contactId: string; taskId?: string; b: BusinessId }) {
  const ct = Q.contact(contactId)
  const t = taskId ? Q.task(taskId) : undefined
  const [k, setK] = useState<LiKind>(t ? 'linkedin_conn' : 'linkedin_msg')
  const [txt, setT] = useState(t?.script ?? '')
  const url = ct?.linkedin ?? ''
  const safeUrl = /^https?:\/\//i.test(url)

  const copy = (): void => {
    if (!navigator.clipboard) return UI.toast('Copy is not available in this browser. Select the text and copy it.', 'warn')
    navigator.clipboard.writeText(txt).then(
      () => UI.toast('Copied. Paste it into LinkedIn.'),
      () => UI.toast('Could not copy. Select the text and copy it.', 'warn'),
    )
  }
  const save = (): void => {
    if (t) Act.completeTask(t.id, { liKind: k, notes: txt, outcome: 'Done' })
    else Act.logLinkedIn(contactId, b, k, txt)
    UI.close()
    UI.toast('LinkedIn activity logged')
  }

  return (
    <Modal
      title={'Log LinkedIn activity — ' + (ct?.name ?? '')}
      icon="li"
      width={520}
      sub="Manual logging only. SalesOS does not automate or scrape LinkedIn."
      footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={save}>{t ? 'Log & complete task' : 'Log activity'}</Btn></>}
    >
      <div className="col gap12">
        {safeUrl ? (
          <Btn icon="ext" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open LinkedIn profile</Btn>
        ) : (
          <Banner tone="warn">{url ? 'The saved LinkedIn URL is not a web address.' : 'No LinkedIn URL saved for this contact.'}</Banner>
        )}
        <Fld label="Activity"><Seg value={k} onChange={v => { if (isKind(v)) setK(v) }} opts={[['linkedin_conn', 'Connection request'], ['linkedin_msg', 'Message sent'], ['linkedin_reply', 'Response received']]} /></Fld>
        <Fld label={k === 'linkedin_reply' ? 'Their response' : 'Message / note'}><TA value={txt} onChange={setT} rows={4} /></Fld>
        {txt && k !== 'linkedin_reply' && <Btn size="sm" icon="copy" onClick={copy}>Copy message</Btn>}
      </div>
    </Modal>
  )
}
