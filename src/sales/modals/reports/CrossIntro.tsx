import { useState } from 'react'
import { cross } from '../../ai/rules'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId } from '../../data/types'
import { Banner, Btn, Ck, Fld, Icon, Modal, TA } from '../../kit'
import { UI } from '../../ui/store'

interface Props { companyId: string; toBiz: BusinessId; fromBiz?: BusinessId; recId?: string }

export function CrossIntro({ companyId, toBiz, fromBiz, recId }: Props) {
  const c = Q.company(companyId)
  const sug = cross().find(x => x.companyId === companyId && x.toBiz === toBiz)
  const from = fromBiz ?? sug?.fromBiz
  const mem = Q.member(toBiz)
  const can = Q.canEdit(toBiz)
  const rel = Q.rel(companyId, toBiz)
  const [note, setNote] = useState('')
  const [mk, setMk] = useState(can && !rel)
  const [deal, setDeal] = useState(false)
  const toName = Q.biz(toBiz)?.name ?? toBiz
  if (!c || !from) {
    return (
      <Modal title="Cross-business coordination" icon="swap" width={480} footer={<Btn onClick={UI.close}>Close</Btn>}>
        <Banner tone="bad">This company is no longer available, or its existing relationship could not be found.</Banner>
      </Modal>
    )
  }
  const fromName = Q.biz(from)?.name ?? from
  const own = rel?.ownerId || S.teams.find(t => t.businessId === toBiz)?.managerId
  const send = (): void => {
    const r = Act.introRequest(companyId, from, toBiz, note)
    if (mk && can && !rel) Act.linkCompany(companyId, toBiz, Q.me().id)
    if (recId) Act.recStatus(recId, 'Accepted')
    UI.close()
    UI.toast(`Introduction request sent to ${r?.owner?.name ?? `the ${toName} team`} · task created`)
    if (deal && can) UI.open('newDeal', { companyId, businessId: toBiz, source: 'Cross-business introduction' })
  }
  return (
    <Modal
      title="Cross-business coordination"
      icon="swap"
      sub={`${c.name} · ${fromName} → ${toName}`}
      width={600}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn kind="pri" onClick={send}>Send request</Btn>
        </>
      }
    >
      <div className="col gap12">
        {sug && (
          <div className="ai card-b">
            <div className="ai-h"><Icon n="spark" s={13} />Why {toName}?</div>
            <div className="sm" style={{ marginTop: 4 }}>{sug.reason}</div>
            {sug.stakeholders.length > 0 && (
              <div className="xs muted" style={{ marginTop: 6 }}>
                Relevant stakeholders on file: {sug.stakeholders.map(i => `${Q.contact(i)?.name} (${Q.contact(i)?.title})`).join(', ')}
              </div>
            )}
          </div>
        )}
        <Banner tone="warn">
          Coordinate before outreach. {Q.member(from) ? `Existing ${fromName} owner: ${Q.user(Q.rel(companyId, from)?.ownerId)?.name ?? 'unassigned'}.` : 'Details of the existing relationship are restricted.'} Private correspondence stays with its business.
        </Banner>
        <dl className="dl">
          <dt>Request goes to</dt>
          <dd>{mem && own ? `${Q.user(own)?.name ?? 'Unassigned'} (${toName})` : `The ${toName} team lead`}</dd>
          <dt>Creates</dt>
          <dd>A follow-up task + in-app notification</dd>
          <dt>Master record</dt>
          <dd>Reused — {c.name} ({c.domain}); no duplicate created</dd>
        </dl>
        <Fld label="Note for the owner"><TA value={note} onChange={setNote} rows={3} placeholder="Context, who to speak to, timing…" /></Fld>
        {can && !rel && <Ck checked={mk} onChange={setMk}>Also create the {toName} business relationship now</Ck>}
        {can && <Ck checked={deal} onChange={setDeal}>Then create a {toName} deal</Ck>}
      </div>
    </Modal>
  )
}
