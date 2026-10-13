import { useState } from 'react'
import type { BillingVariation } from '../../api/contract'
import { Act } from '../../data/Act'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import { Banner, Btn, Fld, Inp, Modal, Seg, TA } from '../../kit'
import { nextVariationLabel, signedCents, variationEffect } from '../../shared/billing'
import { formatCents, parseCents } from '../../shared/money'
import { UI } from '../../ui/store'
import { MissingModal } from '../entities/guards'

type Direction = 'up' | 'down'

/** "$4,000.00" unscheduled, or "$3,600.00 over-scheduled" when the milestones pass the contract. */
const unscheduled = (n: number): string => (n < 0 ? `${formatCents(-n)} over-scheduled` : `${formatCents(n)} unscheduled`)

/**
 * Add a variation to a deal's contract ledger, proposed or approved now. Every amount is ex GST. The entry is
 * appended and never edited; a mistake is corrected with another variation. Admins of Ardorio only.
 */
export function AddVariation({ dealId, onApproved }: { dealId: string; onApproved?: (v: BillingVariation) => void }) {
  useStore()
  const deal = Q.deal(dealId)
  const plan = Q.billingPlan(dealId)
  const [label, setLabel] = useState(() => nextVariationLabel(plan))
  const [dir, setDir] = useState<Direction>('up')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  if (!deal || !plan?.contract) return <MissingModal title="Add variation" what="Contract" />

  const cents = parseCents(amount)
  const signed = cents === null ? null : dir === 'down' ? -cents : cents
  const eff = signed ? variationEffect(plan, signed) : null

  const save = (approve: boolean): void => {
    if (signed === null) return setErr('Enter the amount in dollars and cents, like 2400.00')
    const r = Act.addVariation(dealId, { label, amountCents: signed, reason }, approve)
    if (!r.ok) return setErr(r.error)
    UI.close()
    if (approve) onApproved?.(r.variation)
    else UI.toast(`${r.variation.label} saved as proposed. It is not counted until approved.`)
  }

  return (
    <Modal
      title={`Add variation to ${deal.name}`}
      width={640}
      footer={
        <>
          <Btn onClick={UI.close}>Cancel</Btn>
          <Btn onClick={() => save(false)}>Save as proposed</Btn>
          <Btn kind="pri" onClick={() => save(true)}>Approve now</Btn>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {err && <Banner tone="bad">{err}</Banner>}
        <div className="grid g2">
          <Fld label="Label" req hint="Shown on the ledger and on any invoice for it."><Inp value={label} onChange={setLabel} /></Fld>
          <div className="fld">
            <label htmlFor="vo-amount">Amount (A$, ex GST) <span style={{ color: 'var(--bad2)' }}>*</span></label>
            <div className="row" style={{ gap: 8 }}>
              <Seg label="Direction" value={dir} onChange={v => setDir(v as Direction)} opts={[['up', '+ Increase'], ['down', '− Decrease']]} />
              <Inp id="vo-amount" className="mono" inputMode="decimal" style={{ flex: 1 }} value={amount} onChange={setAmount} />
            </div>
            <div className="hint">Use Decrease for descoped work. The baseline never changes.</div>
          </div>
        </div>
        <Fld label="Reason" req><TA rows={3} value={reason} onChange={setReason} /></Fld>
        <div className="card" style={{ boxShadow: 'none', background: 'var(--surf2)' }}>
          <div className="card-b col" style={{ gap: 6 }} role="status" aria-label="What approving does">
            <div className="b sm">What approving does</div>
            {eff && signed ? (
              <>
                <div className="sm">Contracted changes from <b className="money">{formatCents(eff.from)}</b> to <b className="money">{formatCents(eff.to)}</b>.</div>
                <div className="sm">Unscheduled changes by <b className="money">{signedCents(signed, formatCents)}</b>, from {unscheduled(eff.unscheduledFrom)} to {unscheduled(eff.unscheduledTo)}.</div>
              </>
            ) : <div className="sm muted">Enter an amount to see how the contract changes.</div>}
            <div className="sm muted">Save as proposed records it without counting it. Approve now records you, {Q.me().name}, as approving it today. The entry can’t be edited later; correct it with another variation.</div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

