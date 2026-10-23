import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { Btn } from '../../kit/basic'
import { Modal } from '../../kit/overlay'
import { describeOption, figuresOf, optionsOf, PARTY_LABEL, withProposed } from '../../shared/commercialOptions'
import { proceedMove } from '../../shared/moves'
import { UI } from '../../ui/store'
import { MissingModal } from './guards'

export interface ProposeOptionsProps { id: string; stageId: string }

/** Moving a deal into Proposal: which of its saved commercial options are going to the client. The rest stay saved. */
export function ProposeOptions({ id, stageId }: ProposeOptionsProps) {
  const d = Q.deal(id)
  const st = d ? Q.pipeline(d.businessId).stages.find(s => s.id === stageId) : undefined
  const options = d ? optionsOf(d.fields) : []
  const [ticked, setTicked] = useState<Set<string>>(() => new Set())
  if (!d || !st || options.length === 0) return <MissingModal title="Commercial options" what="Deal, stage or options" />

  const toggle = (oid: string): void => setTicked(s => { const n = new Set(s); if (n.has(oid)) n.delete(oid); else n.add(oid); return n })
  const go = (propose: boolean): void => {
    if (propose) Act.updateDeal(d.id, { fields: { options: withProposed(options, ticked) } }, true)
    UI.close()
    proceedMove(d.id, stageId)
  }

  return (
    <Modal
      title="Which commercial model are you proposing?"
      icon="dollar"
      sub={`${d.name} → ${st.name}`}
      width={720}
      footer={(
        <>
          <Btn onClick={UI.close}>Keep in {Q.stage(d)?.name ?? 'current stage'}</Btn>
          <Btn onClick={() => go(false)}>Move without choosing</Btn>
          <Btn kind="pri" disabled={ticked.size === 0} onClick={() => go(true)}>Propose {ticked.size > 1 ? `${ticked.size} options` : 'this option'} &amp; move</Btn>
        </>
      )}
    >
      <div className="col gap12">
        <div className="sm muted">Pick one or more to present. The other options stay saved on the deal.</div>
        {options.map(o => {
          const f = figuresOf(o)
          return (
            <label key={o.id} className="card card-b row" style={{ gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={ticked.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Propose ${o.name}`} style={{ accentColor: 'var(--acc)', width: 16, height: 16, marginTop: 3 }} />
              <div className="col" style={{ gap: 2, flex: 1 }}>
                <b>{o.name}</b>
                <span className="sm">{describeOption(o, F.money)} · <b className="num">{F.money(f.revenue)}</b> total contract</span>
                <span className="xs faint">
                  Hosting: {o.hosting ? PARTY_LABEL[o.hosting] : 'not set'} · AI usage: {o.aiUsage ? PARTY_LABEL[o.aiUsage] : 'not set'}
                  {o.support ? ` · Support: ${o.support}` : ''}{o.customDev ? ` · Custom development: ${o.customDev}` : ''}
                </span>
                <span className="xs faint">Estimated margin {F.money(f.margin)}{f.marginPct != null ? ` (${f.marginPct}%)` : ''}</span>
              </div>
            </label>
          )
        })}
      </div>
    </Modal>
  )
}
