import { useEffect, useRef, useState } from 'react'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId } from '../../data/types'
import { Banner, BizDot, Btn, Chip, Modal } from '../../kit'
import { businessCounts, planBusinessChange } from '../../shared/businessChange'
import { UI } from '../../ui/store'

type Choice = 'keep' | 'add' | 'remove'

// Which businesses a set of companies belong to. A business is ticked, unticked or left as it is; the dialog says exactly what Apply will add
// and remove, and what it will not remove (a business with an open deal on the company, or a contact in a live sequence).
export function ChangeBusinesses({ companyIds }: { companyIds?: string[] }) {
  const ids = (companyIds ?? []).filter(id => Q.company(id))
  const businesses = Q.myBiz().filter(Q.canEdit)
  const [choice, setChoice] = useState<Partial<Record<BusinessId, Choice>>>({})
  const [withContacts, setWithContacts] = useState(true)
  if (!ids.length) return <Modal title="Change businesses" icon="layers" width={420} footer={<Btn onClick={UI.close}>Close</Btn>}><Banner tone="warn">Select at least one company first.</Banner></Modal>
  if (!businesses.length) return <Modal title="Change businesses" icon="layers" width={420} footer={<Btn onClick={UI.close}>Close</Btn>}><Banner tone="warn">You need edit access to a business to change which businesses a company belongs to.</Banner></Modal>

  const counts = businessCounts(ids, S.companyRels, businesses)
  const people = S.contacts.filter(c => ids.includes(c.companyId) && !c.archived)
  const add = businesses.filter(b => choice[b] === 'add')
  const remove = businesses.filter(b => choice[b] === 'remove')
  const plan = planBusinessChange({ companyIds: ids, add, remove, withContacts }, { companyRels: S.companyRels, contactRels: S.contactRels, contacts: S.contacts, deals: S.deals, enrolments: S.enrolments, canEdit: Q.canEdit })
  const changes = plan.addCo.length + plan.addCt.length + plan.removeCo.length + plan.removeCt.length
  const nCo = (rows: ReadonlyArray<{ businessId: BusinessId }>, b: BusinessId): number => rows.filter(r => r.businessId === b).length
  const names = ids.slice(0, 3).map(id => Q.company(id)?.name).join(', ') + (ids.length > 3 ? ` and ${ids.length - 3} more` : '')

  const next = (b: BusinessId, on: number, total: number): Choice => {
    const cur = choice[b] ?? 'keep'
    if (on === 0) return cur === 'add' ? 'keep' : 'add'
    if (on === total) return cur === 'remove' ? 'keep' : 'remove'
    return cur === 'keep' ? 'add' : cur === 'add' ? 'remove' : 'keep'
  }

  const apply = (): void => {
    if (!changes) return
    const undo = Act.applyBusinessChange(plan)
    const cos = new Set([...plan.addCo, ...plan.removeCo].map(x => x.companyId)).size
    const cts = new Set([...plan.addCt, ...plan.removeCt].map(x => x.contactId)).size
    UI.close()
    UI.toast(`Updated ${cos} ${cos === 1 ? 'company' : 'companies'} and ${cts} ${cts === 1 ? 'contact' : 'contacts'}`, 'ok', { label: 'Undo', fn: () => { Act.undoBusinessChange(undo); UI.toast('Businesses change undone') } })
  }

  return (
    <Modal
      title="Change businesses" icon="layers" width={640}
      sub={`${ids.length} ${ids.length === 1 ? 'company' : 'companies'} selected: ${names}`}
      footer={<><span className="faint xs">Contacts follow their company when a business is removed.</span><span className="sp" /><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" disabled={!changes} onClick={apply}>Apply changes</Btn></>}
    >
      <div className="col gap12">
        {counts.map(({ businessId: b, on, total }) => (
          <BizRow key={b} b={b} on={on} total={total} choice={choice[b] ?? 'keep'} addN={nCo(plan.addCo, b)} remN={nCo(plan.removeCo, b)} onToggle={() => setChoice({ ...choice, [b]: next(b, on, total) })} />
        ))}
        {plan.blocked.length > 0 && (
          <Banner tone="warn">
            <div>
              {plan.blocked.map(x => (
                <div key={x.companyId + x.businessId}><b>{Q.company(x.companyId)?.name}</b> stays in {Q.biz(x.businessId)?.name}: {x.reason === 'Open deal' ? 'it has an open deal there. Close or move the deal first.' : x.reason === 'Contact in a sequence' ? 'a contact is in a live sequence there. Stop it first.' : 'you cannot edit that business.'}</div>
              ))}
            </div>
          </Banner>
        )}
        {add.length > 0 && people.length > 0 && (
          <label className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={withContacts} onChange={e => setWithContacts(e.target.checked)} style={{ accentColor: 'var(--acc)' }} />
            <span>Also add the <b>{people.length}</b> {people.length === 1 ? 'contact' : 'contacts'} at {ids.length === 1 ? 'this company' : 'these companies'} to the businesses being added</span>
          </label>
        )}
        <div className="card" style={{ background: 'var(--surf2)', boxShadow: 'none' }}>
          <div className="card-b col" style={{ gap: 4 }}>
            <div className="xs b" style={{ textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--fg2)' }}>This will</div>
            {changes === 0 && <div className="muted">Change nothing yet. Tick a business to add it, untick one to remove it.</div>}
            {add.filter(b => plan.addCo.some(x => x.businessId === b) || plan.addCt.some(x => x.businessId === b)).map(b => (
              <div key={'a' + b} className="row" style={{ gap: 8 }}><Chip tone="ok">Add</Chip><span>{Q.biz(b)?.name} to {nCo(plan.addCo, b)} {nCo(plan.addCo, b) === 1 ? 'company' : 'companies'}{plan.addCt.some(x => x.businessId === b) ? ` and ${plan.addCt.filter(x => x.businessId === b).length} contacts` : ''}</span></div>
            ))}
            {remove.filter(b => nCo(plan.removeCo, b) > 0).map(b => (
              <div key={'r' + b} className="row" style={{ gap: 8 }}><Chip tone="warn">Remove</Chip><span>{Q.biz(b)?.name} from {nCo(plan.removeCo, b)} {nCo(plan.removeCo, b) === 1 ? 'company' : 'companies'} and {plan.removeCt.filter(x => x.businessId === b).length} contacts</span></div>
            ))}
            <div className="xs faint">Notes and activity stay on the shared profile. Removing a business takes the record out of that business's lists and pipelines only.</div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function BizRow({ b, on, total, choice, addN, remN, onToggle }: { b: BusinessId; on: number; total: number; choice: Choice; addN: number; remN: number; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const checked = choice === 'add' ? true : choice === 'remove' ? false : on === total
  const mixed = choice === 'keep' && on > 0 && on < total
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
  const note = choice === 'add' ? <Chip tone="ok">Add to {addN}</Chip> : choice === 'remove' ? <Chip tone="warn">Remove from {remN}</Chip>
    : <span className="xs muted">{on === total ? `On ${total === 1 ? 'it' : `all ${total}`}` : on === 0 ? 'Not on any' : `On ${on} of ${total}`}{mixed ? ' · no change' : ''}</span>
  return (
    <label className="row" style={{ gap: 12, padding: '12px 14px', border: '1px solid var(--line2)', borderRadius: 10, background: choice === 'add' ? 'var(--ok-bg)' : choice === 'remove' ? 'var(--warn-bg)' : 'var(--surf)', cursor: 'pointer' }}>
      <input ref={ref} type="checkbox" checked={checked} onChange={onToggle} aria-label={Q.biz(b)?.name ?? b} style={{ accentColor: 'var(--acc)', width: 16, height: 16 }} />
      <BizDot b={b} s={9} /><b>{Q.biz(b)?.name ?? b}</b><span className="sp" />{note}
    </label>
  )
}
