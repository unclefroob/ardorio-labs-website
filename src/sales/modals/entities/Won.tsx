import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import type { Deal } from '../../data/types'
import { Banner, Btn, Ck, Fld, Inp, Sel, TA } from '../../kit/basic'
import { Icon } from '../../kit/Icon'
import { Modal } from '../../kit/overlay'
import { useF } from '../../shared/forms'
import { UI } from '../../ui/store'
import { RosterioWinPrompt } from '../../pages/deals/RosterioCard'
import { MissingModal } from './guards'

interface WonDraft { value: string; close: string; term: string; revenueType: string; notes: string }
type Suggestion = readonly [title: string, type: string, inDays: number]

export function Won({ id }: { id: string }) {
  const d = Q.deal(id)
  if (!d) return <MissingModal title="Mark as Closed Won" what="Deal" />
  return <WonForm d={d} />
}

function WonForm({ d }: { d: Deal }) {
  const [f, set] = useF<WonDraft>({
    value: String(d.value), close: F.today(), term: String(d.contractMonths || 12),
    revenueType: d.businessId === 'ard' ? 'One-off project' : 'Recurring subscription', notes: '',
  })
  const [done, setDone] = useState(false)
  const [pick, setPick] = useState<number[]>([0, 1, 2])
  const sugs: Suggestion[] = [
    [`Schedule kickoff / onboarding with ${Q.contact(d.primaryContact)?.firstName ?? 'customer'}`, 'Meeting Preparation', 2],
    ['Send welcome pack and implementation timeline', 'Email', 1],
    ['Internal handover to delivery team', 'Administrative', 1],
    [`Review cross-business fit for ${Q.company(d.companyId)?.name ?? 'this company'}`, 'Research', 14],
  ]

  const confirm = (): void => {
    if (!(+f.value > 0)) return UI.toast('Enter the final contract value', 'bad')
    if (!UI.guard(d.businessId, 'Closing deals')) return
    Act.markWon(d.id, f)
    setDone(true)
  }

  const createTasks = (): void => {
    const chosen = pick.slice().sort().map(i => sugs[i])
    // Only the last create commits, so the batch lands as one change instead of one per task.
    chosen.forEach(([title, type, inDays], i) => {
      Act.createTask({
        title, type, businessId: d.businessId, assigneeId: d.ownerId, due: F.addDays(F.today() + 'T10:00', inDays),
        dealId: d.id, companyId: d.companyId, contactId: d.primaryContact, source: 'Post-sale suggestion',
      }, i < chosen.length - 1)
    })
    UI.close()
    UI.toast(`${chosen.length} post-sale task${chosen.length !== 1 ? 's' : ''} created`)
  }

  if (done) {
    return (
      <Modal
        title="Deal won"
        icon="star"
        sub={d.name}
        footer={
          <>
            <Btn onClick={UI.close}>Skip</Btn>
            <Btn kind="pri" disabled={!pick.length} onClick={createTasks}>Create {pick.length} task{pick.length !== 1 ? 's' : ''}</Btn>
          </>
        }
      >
        <Banner tone="ok">Won revenue of <b>{F.money(d.value)}</b> recorded. Dashboards, forecasts and goals have been recalculated.</Banner>
        <RosterioWinPrompt dealId={d.id} />
        <div className="ai card-b" style={{ marginTop: 14 }}>
          <div className="ai-h"><Icon n="spark" s={14} />Suggested post-sale follow-up</div>
          <div className="col" style={{ marginTop: 10 }}>
            {sugs.map(([s, t, dd], i) => (
              <Ck key={s} checked={pick.includes(i)} onChange={v => setPick(v ? pick.concat(i) : pick.filter(x => x !== i))}>
                <span>{s} <span className="faint">· {t} · in {dd}d</span></span>
              </Ck>
            ))}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Mark as Closed Won" icon="star" sub={d.name} footer={<><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={confirm}>Confirm won</Btn></>}>
      <div className="grid g2">
        <Fld label="Final contract value (A$)" req hint={d.recurring ? 'Annual value; MRR is derived' : null}><Inp value={f.value} onChange={v => set('value', v.replace(/[^0-9.]/g, ''))} /></Fld>
        <Fld label="Close date" req><Inp type="date" value={f.close} onChange={v => set('close', v)} /></Fld>
        <Fld label="Contract term (months)"><Inp value={f.term} onChange={v => set('term', v)} /></Fld>
        <Fld label="Revenue type"><Sel value={f.revenueType} onChange={v => set('revenueType', v)} options={['One-off project', 'Recurring subscription', 'Project + recurring support']} /></Fld>
        <Fld label="Notes" style={{ gridColumn: '1/-1' }}><TA value={f.notes} onChange={v => set('notes', v)} rows={3} /></Fld>
      </div>
    </Modal>
  )
}
