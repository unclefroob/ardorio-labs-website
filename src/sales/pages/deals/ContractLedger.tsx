import { useEffect, useRef, useState } from 'react'
import type { BillingPlan, BillingVariation, EngagementType } from '../../api/contract'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { useStore } from '../../data/store'
import type { Deal } from '../../data/types'
import { Banner, Btn, Card, Chip, Fld, Inp, Sel } from '../../kit'
import {
  contractedCents, ENGAGEMENT_LABEL, ENGAGEMENT_TYPES, quotedCents, signedCents, validateContractAmount, VARIATION_LABEL, VARIATION_TONE, variationEffect, wonDay,
} from '../../shared/billing'
import { fmtDay } from '../../shared/invoices'
import { centsToInput, formatCents, parseCents } from '../../shared/money'
import { UI } from '../../ui/store'

/**
 * The contract ledger of a won Ardorio deal: the baseline frozen at Won, every variation with its status and who
 * decided it, and the contracted total. Proposed and rejected variations are shown but never counted. A deal won
 * before contracts were recorded (or with Later) offers Set contract instead. Admins of Ardorio only, like billing.
 */
export function ContractLedger({ deal }: { deal: Deal }) {
  useStore()
  if (deal.businessId !== 'ard' || !Q.canBill()) return null
  const plan = Q.billingPlan(deal.id)
  if (plan?.contract) return <Ledger deal={deal} plan={plan as BillingPlan & { contract: NonNullable<BillingPlan['contract']> }} />
  return deal.status === 'won' ? <SetContract deal={deal} /> : null
}

const who = (id: string | undefined): string => Q.user(id)?.name ?? 'Unknown user'
const day = (iso: string | undefined): string => fmtDay((iso ?? '').slice(0, 10))

/** The success line after an approval: the new contract and what it leaves outside the milestones. */
export function approvedLine(label: string, plan: BillingPlan | undefined): string {
  const total = contractedCents(plan) ?? 0
  const gap = total - (plan?.milestones ?? []).reduce((a, m) => a + m.amountCents, 0)
  const tail = gap > 0 ? `and ${formatCents(gap)} is not yet in a milestone.` : gap < 0 ? `and the milestones are ${formatCents(-gap)} over the contract.` : 'and all of it is in milestones.'
  return `${label} approved. Contracted is now ${formatCents(total)}, ${tail}`
}

function Ledger({ deal, plan }: { deal: Deal; plan: BillingPlan & { contract: NonNullable<BillingPlan['contract']> } }) {
  const [done, setDone] = useState('')
  const [err, setErr] = useState('')
  const said = useRef<HTMLDivElement>(null)
  useEffect(() => { if (done) said.current?.focus() }, [done])
  const c = plan.contract
  const total = contractedCents(plan) ?? c.baselineCents
  const variations = plan.variations ?? []

  const approved = (v: BillingVariation): void => {
    setErr('')
    setDone(approvedLine(v.label, Q.billingPlan(deal.id)))
  }

  const decide = (v: BillingVariation, status: 'approved' | 'rejected'): void => {
    const eff = variationEffect(plan, v.amountCents)
    UI.confirm({
      title: status === 'approved' ? `Approve ${v.label}?` : `Reject ${v.label}?`,
      body: status === 'approved'
        ? `Contracted changes from ${formatCents(eff?.from ?? total)} to ${formatCents(eff?.to ?? total)}. The entry can't be edited afterwards; correct it with another variation.`
        : 'It stays on the ledger as rejected and is never counted. This can’t be undone.',
      confirm: status === 'approved' ? 'Approve' : 'Reject',
      danger: status === 'rejected',
      onConfirm: () => {
        const r = Act.decideVariation(deal.id, v.id, status)
        if (!r.ok) return setErr(r.error)
        if (status === 'approved') approved(r.variation)
        else { setDone(''); setErr(''); UI.toast(`${v.label} rejected. It is kept on the ledger and not counted.`) }
      },
    })
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {done && <div ref={said} tabIndex={-1}><Banner tone="ok">{done}</Banner></div>}
      <Card
        title="Contract ledger"
        right={
          <span className="row" style={{ gap: 6 }}>
            <span className="sm muted">append-only</span>
            <Chip>{ENGAGEMENT_LABEL[c.engagementType] ?? c.engagementType}</Chip>
            <Btn size="sm" kind="pri" onClick={() => UI.open('addVariation', { dealId: deal.id, onApproved: approved })}>+ Add variation</Btn>
          </span>
        }
        pad={false}
      >
        {err && <div className="card-b"><Banner tone="bad">{err}</Banner></div>}
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" aria-label="Contract ledger" style={{ minWidth: 560 }}>
            <thead><tr><th>Entry</th><th>Status</th><th style={{ textAlign: 'right' }}>Amount (ex GST)</th><th /></tr></thead>
            <tbody>
              <tr>
                <td className="w"><div className="b">Baseline at Won</div><div className="sm muted">{fmtDay(c.contractedOn)} · {who(c.contractedBy)}{c.estimateAtWonCents !== c.baselineCents ? ` · estimate was ${formatCents(c.estimateAtWonCents)}` : ''}</div></td>
                <td><Chip tone="ok">Contracted</Chip></td>
                <td className="money" style={{ textAlign: 'right' }}>{formatCents(c.baselineCents)}</td>
                <td />
              </tr>
              {variations.map(v => {
                const counted = v.status === 'approved'
                const sub = v.status === 'proposed'
                  ? `Proposed ${day(v.createdAt)} · ${who(v.createdBy)} · not counted until approved`
                  : `${VARIATION_LABEL[v.status]} ${day(v.decidedAt)} · ${who(v.decidedBy)}${counted ? '' : ' · not counted'}`
                return (
                  <tr key={v.id}>
                    <td className="w">
                      <div className={'b' + (counted ? '' : ' struck')}>{v.label}</div>
                      <div className="sm muted">{sub}</div>
                      {v.reason && <div className="sm faint">{v.reason}</div>}
                    </td>
                    <td><Chip tone={VARIATION_TONE[v.status]}>{VARIATION_LABEL[v.status]}</Chip></td>
                    <td className={'money' + (counted ? '' : ' struck')} style={{ textAlign: 'right' }}>
                      {counted ? signedCents(v.amountCents, formatCents) : `(${signedCents(v.amountCents, formatCents)})`}
                    </td>
                    <td>
                      {v.status === 'proposed' && (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <Btn size="xs" aria-label={`Approve ${v.label}`} onClick={() => decide(v, 'approved')}>Approve</Btn>
                          <Btn size="xs" kind="ghost" aria-label={`Reject ${v.label}`} onClick={() => decide(v, 'rejected')}>Reject</Btn>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={2}>Contracted (baseline plus approved variations)</td><td className="money" style={{ textAlign: 'right' }}>{formatCents(total)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}

/** For a won deal with no contract yet: freeze one, once, prefilled from the deal value. */
function SetContract({ deal }: { deal: Deal }) {
  const [form, setForm] = useState<{ amount: string; type: EngagementType } | null>(null)
  const [err, setErr] = useState('')
  const save = (): void => {
    if (!form) return
    const cents = parseCents(form.amount)
    const bad = validateContractAmount(cents)
    if (bad || cents === null) return setErr(bad ?? '')
    const r = Act.setContract(deal.id, { baselineCents: cents, engagementType: form.type, contractedOn: wonDay(deal) || F.today(), estimateAtWonCents: quotedCents(deal) })
    if (!r.ok) return setErr(r.error)
    setErr('')
    setForm(null)
    UI.toast(`Contract of ${formatCents(cents)} ex GST set`)
  }
  return (
    <Card title="Contract" right={!form && <Btn size="sm" kind="pri" onClick={() => { setErr(''); setForm({ amount: centsToInput(quotedCents(deal)), type: 'fixed-price' }) }}>Set contract</Btn>}>
      <div className="col" style={{ gap: 10 }}>
        <div className="sm muted">
          No contract is recorded for this deal yet, so billing is measured against the estimate of {formatCents(quotedCents(deal))}. Set the contracted amount once; later changes go through variations.
        </div>
        {form && (
          <div className="grid g3" style={{ alignItems: 'end' }}>
            <Fld label="Contracted amount (A$, ex GST)" req err={err}>
              <Inp className="mono" inputMode="decimal" value={form.amount} onChange={v => setForm({ ...form, amount: v })} aria-invalid={err ? true : undefined} />
            </Fld>
            <Fld label="Engagement type"><Sel value={form.type} onChange={v => setForm({ ...form, type: v as EngagementType })} options={ENGAGEMENT_TYPES.map(t => [t, ENGAGEMENT_LABEL[t]] as const)} /></Fld>
            <span className="row" style={{ gap: 6 }}>
              <Btn size="sm" kind="pri" onClick={save}>Save contract</Btn>
              <Btn size="sm" onClick={() => { setForm(null); setErr('') }}>Cancel</Btn>
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}
