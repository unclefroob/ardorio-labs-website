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
import { WonBilling } from '../../pages/deals/WonBilling'
import { MissingModal } from './guards'
import { quotedCents } from '../../shared/billing'
import { centsToInput, formatCents } from '../../shared/money'
import { checkContract, ContractStep, newPlanRow, type ContractDraft } from './WonContract'

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
  // Ardorio admins: Outcome, then Contract. The deal is won only from the Contract step (or Confirm won, without one).
  const ledger = d.businessId === 'ard' && Q.canBill()
  const [step, setStep] = useState<'outcome' | 'contract'>('outcome')
  const [contract, setContract] = useState<ContractDraft>({ amount: '', engagementType: 'fixed-price', rows: [newPlanRow()] })
  const [contractErrs, setContractErrs] = useState<{ amountErr?: string; planErr?: string }>({})
  const [pick, setPick] = useState<number[]>([0, 1, 2])
  // Ardorio only: open the deal Billing tab once this dialog closes, however it closes.
  const [milestones, setMilestones] = useState(false)
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

  const toContract = (): void => {
    if (!(+f.value > 0)) return UI.toast('Enter the estimate', 'bad')
    // Prefilled from the estimate once; going Back and on again keeps what was typed.
    if (!contract.amount) setContract({ ...contract, amount: centsToInput(Math.round(+f.value * 100)) })
    setStep('contract')
  }

  const winWithContract = (): void => {
    const c = checkContract(contract)
    if (!c.ok) return setContractErrs({ amountErr: c.amountErr, planErr: c.planErr })
    setContractErrs({})
    if (!UI.guard(d.businessId, 'Closing deals')) return
    Act.markWon(d.id, f)
    const r = Act.setContract(d.id, { baselineCents: c.baselineCents, engagementType: c.engagementType, contractedOn: f.close, estimateAtWonCents: quotedCents(d) }, c.milestones)
    UI.close()
    UI.nav('deal', { id: d.id, q: { tab: 'billing' } })
    if (r.ok) UI.toast(`Deal won. Contract of ${formatCents(c.baselineCents)} ex GST set${c.milestones.length ? ` with ${c.milestones.length} milestone${c.milestones.length === 1 ? '' : 's'}` : ''}.`)
    else UI.toast(`Deal won, but the contract was not saved: ${r.error}`, 'bad')
  }

  const finish = (): void => {
    UI.close()
    if (milestones) UI.nav('deal', { id: d.id, q: { tab: 'billing' } })
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
    finish()
    UI.toast(`${chosen.length} post-sale task${chosen.length !== 1 ? 's' : ''} created`)
  }

  if (done) {
    return (
      <Modal
        title="Deal won"
        icon="star"
        sub={d.name}
        onClose={finish}
        footer={
          <>
            <Btn onClick={finish}>Skip</Btn>
            <Btn kind="pri" disabled={!pick.length} onClick={createTasks}>Create {pick.length} task{pick.length !== 1 ? 's' : ''}</Btn>
          </>
        }
      >
        <Banner tone="ok">Won revenue of <b>{F.money(d.value)}</b> recorded. Dashboards, forecasts and goals have been recalculated.</Banner>
        <RosterioWinPrompt dealId={d.id} />
        <WonBilling dealId={d.id} milestones={milestones} onMilestones={setMilestones} />
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

  const steps = ledger && (
    <ol className="steps" aria-label="Steps">
      <li aria-current={step === 'outcome' ? 'step' : undefined}>1 Outcome</li>
      <li aria-current={step === 'contract' ? 'step' : undefined}>2 Contract</li>
      <li>3 Billing</li>
    </ol>
  )

  if (ledger && step === 'contract') {
    return (
      <Modal
        title="Mark as Closed Won"
        icon="star"
        sub={d.name}
        width={760}
        footer={
          <>
            <Btn kind="ghost" onClick={() => setStep('outcome')}>Back</Btn>
            <span className="sp" />
            <Btn onClick={confirm} title="Win the deal now and set the contract later from the Billing tab">Later</Btn>
            <Btn kind="pri" onClick={winWithContract}>Win and set up billing</Btn>
          </>
        }
      >
        {steps}
        <ContractStep draft={contract} onChange={setContract} errs={contractErrs} company={Q.company(d.companyId)} />
      </Modal>
    )
  }

  return (
    <Modal
      title="Mark as Closed Won"
      icon="star"
      sub={d.name}
      footer={ledger
        ? <><Btn onClick={UI.close}>Cancel</Btn><Btn onClick={confirm} title="Win the deal without setting a contract now">Confirm won</Btn><Btn kind="pri" onClick={toContract}>Next: contract</Btn></>
        : <><Btn onClick={UI.close}>Cancel</Btn><Btn kind="pri" onClick={confirm}>Confirm won</Btn></>}
    >
      {steps}
      <div className="grid g2">
        {ledger
          ? <Fld label="Estimate (A$, ex GST)" req hint="Stays the estimate. The contract is set in the next step."><Inp value={f.value} onChange={v => set('value', v.replace(/[^0-9.]/g, ''))} /></Fld>
          : <Fld label="Final contract value (A$)" req hint={d.recurring ? 'Annual value; MRR is derived' : null}><Inp value={f.value} onChange={v => set('value', v.replace(/[^0-9.]/g, ''))} /></Fld>}
        <Fld label="Close date" req><Inp type="date" value={f.close} onChange={v => set('close', v)} /></Fld>
        <Fld label="Contract term (months)"><Inp value={f.term} onChange={v => set('term', v)} /></Fld>
        <Fld label="Revenue type"><Sel value={f.revenueType} onChange={v => set('revenueType', v)} options={['One-off project', 'Recurring subscription', 'Project + recurring support']} /></Fld>
        <Fld label="Notes" style={{ gridColumn: '1/-1' }}><TA value={f.notes} onChange={v => set('notes', v)} rows={3} /></Fld>
      </div>
    </Modal>
  )
}
