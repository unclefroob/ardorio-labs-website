import type { BillingMilestone, EngagementType } from '../../api/contract'
import { invoiceError } from '../../api/invoices'
import { uid } from '../../data/ids'
import { Q } from '../../data/Q'
import type { Company } from '../../data/types'
import { Banner, Btn, Chip, Fld, Inp, Sel, Skel } from '../../kit'
import { Icon } from '../../kit/Icon'
import { useBillingLink } from '../../pages/companies/useBillingLink'
import { ENGAGEMENT_LABEL, isEngagementType, reconciliationLine, validateContractAmount, validateMilestones, WON_ENGAGEMENT_TYPES } from '../../shared/billing'
import { missingBilling } from '../../shared/invoices'
import { formatCents, parseCents } from '../../shared/money'
import { TermFields, type TermDraft, type TermErrs } from '../../pages/deals/TermForm'

/** One row of the quick milestone plan, as typed. */
export interface PlanRow { key: string; label: string; amount: string; date: string }
/** `term` is used when the engagement type is a term agreement: the contract is then the build fee plus the schedule. */
export interface ContractDraft { amount: string; engagementType: EngagementType; rows: PlanRow[]; term?: TermDraft }

export const newPlanRow = (): PlanRow => ({ key: uid('pr'), label: '', amount: '', date: '' })

const blank = (r: PlanRow): boolean => !r.label.trim() && !r.amount.trim() && !r.date

/** Sum of the rows whose amount parses, for the live reconciliation line. */
const scheduledOf = (rows: readonly PlanRow[]): number => rows.reduce((a, r) => a + (parseCents(r.amount) ?? 0), 0)

export type ContractCheck =
  | { ok: true; baselineCents: number; engagementType: EngagementType; milestones: BillingMilestone[] }
  | { ok: false; amountErr?: string; planErr?: string }

/** Validate the Contract step. Wholly blank milestone rows are ignored; a half-filled one is a mistake. */
export function checkContract(d: ContractDraft): ContractCheck {
  const cents = parseCents(d.amount)
  const amountErr = validateContractAmount(cents) ?? undefined
  const rows = d.rows.filter(r => !blank(r))
  const milestones: BillingMilestone[] = []
  let planErr: string | undefined
  for (let i = 0; i < rows.length && !planErr; i++) {
    const r = rows[i]
    const c = parseCents(r.amount)
    if (c === null) planErr = `Milestone ${i + 1}: the amount is dollars and cents, like 8000.00`
    else milestones.push({ id: uid('ms'), label: r.label, amountCents: c, ...(r.date ? { plannedDate: r.date } : {}) })
  }
  planErr = planErr ?? validateMilestones(milestones) ?? undefined
  if (amountErr || planErr || cents === null) return { ok: false, amountErr, planErr }
  if (!isEngagementType(d.engagementType)) return { ok: false, amountErr: 'Choose an engagement type' }
  return { ok: true, baselineCents: cents, engagementType: d.engagementType, milestones }
}

/**
 * The Contract step of the Won dialog, for Ardorio admins: the contracted amount (prefilled from the estimate),
 * the engagement type, the billing client, and an optional quick milestone plan reconciled live against the contract.
 */
export function ContractStep({ draft, onChange, errs, company, existingCents = 0 }: { draft: ContractDraft; onChange: (d: ContractDraft) => void; errs: { amountErr?: string; planErr?: string; termErrs?: TermErrs }; company: Company | undefined; existingCents?: number }) {
  const set = <K extends keyof ContractDraft>(k: K, v: ContractDraft[K]): void => onChange({ ...draft, [k]: v })
  const setRow = (key: string, patch: Partial<PlanRow>): void => set('rows', draft.rows.map(r => (r.key === key ? { ...r, ...patch } : r)))
  const contracted = parseCents(draft.amount)
  const scheduled = scheduledOf(draft.rows)
  const rec = contracted !== null && contracted > 0 ? reconciliationLine(scheduled, contracted, formatCents) : null
  const engagement = (
    <Fld label="Engagement type" hint={draft.engagementType === 'term-agreement' ? 'A multi-year agreement billed by schedule. No recurring revenue is counted for Ardorio.' : 'Shapes how billing is set up. No recurring revenue is counted for Ardorio.'}>
      <Sel value={draft.engagementType} onChange={v => set('engagementType', v as EngagementType)} options={WON_ENGAGEMENT_TYPES.map(t => [t, ENGAGEMENT_LABEL[t]] as const)} />
    </Fld>
  )

  if (draft.engagementType === 'term-agreement' && draft.term) {
    const term = draft.term
    return (
      <div className="col" style={{ gap: 14 }}>
        <div className="grid g2">{engagement}</div>
        {company && <ClientPick company={company} />}
        <TermFields draft={term} onChange={t => onChange({ ...draft, term: t })} errs={errs.termErrs ?? {}} existingCents={existingCents} />
      </div>
    )
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid g2">
        <Fld label="Contracted amount (A$, ex GST)" req err={errs.amountErr} hint="Prefilled from the estimate. Frozen when you win; later changes go through variations.">
          <Inp className="mono" inputMode="decimal" value={draft.amount} onChange={v => set('amount', v)} aria-invalid={errs.amountErr ? true : undefined} />
        </Fld>
        {engagement}
      </div>

      {company && <ClientPick company={company} />}

      <div className="fld">
        <span className="lbl" id="won-plan-h" style={{ fontSize: 12, fontWeight: 600 }}>Milestone plan (optional now, editable later)</span>
        {draft.rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" aria-labelledby="won-plan-h" style={{ minWidth: 520 }}>
              <thead><tr><th>Milestone</th><th style={{ textAlign: 'right' }}>Amount ex GST</th><th>Planned</th><th /></tr></thead>
              <tbody>
                {draft.rows.map((r, i) => (
                  <tr key={r.key}>
                    <td><Inp aria-label={`Milestone ${i + 1} label`} value={r.label} onChange={v => setRow(r.key, { label: v })} /></td>
                    <td><Inp aria-label={`Milestone ${i + 1} amount`} className="mono" inputMode="decimal" style={{ textAlign: 'right' }} value={r.amount} onChange={v => setRow(r.key, { amount: v })} /></td>
                    <td><Inp aria-label={`Milestone ${i + 1} planned date`} type="date" value={r.date} onChange={v => setRow(r.key, { date: v })} /></td>
                    <td><Btn size="xs" kind="ghost" aria-label={`Remove milestone ${i + 1}`} onClick={() => set('rows', draft.rows.filter(x => x.key !== r.key))}>Remove</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {errs.planErr && <div className="err" role="alert">{errs.planErr}</div>}
        <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
          {rec && (
            <span role="status" aria-label="Milestone reconciliation">
              <Chip tone={rec.tone} icon={rec.tone === 'ok' ? 'check' : 'alert'}>{rec.text}</Chip>
            </span>
          )}
          <Btn size="sm" onClick={() => set('rows', [...draft.rows, newPlanRow()])}>+ Add milestone</Btn>
        </div>
      </div>
    </div>
  )
}

/** The billing client, linked or not, with the same click-only Link and Create actions as the Billing step. */
function ClientPick({ company }: { company: Company }) {
  const { clients, client, suggestions, dismiss, busy, fail, link, create } = useBillingLink(company, Q.canBill())
  const err = clients.error
  if (err != null && invoiceError(err, 'load').kind === 'denied') return null
  return (
    <div className="fld">
      <span className="lbl" style={{ fontSize: 12, fontWeight: 600 }}>Billing client</span>
      {clients.loading && !clients.data ? <div role="status" aria-label="Loading billing" aria-busy="true"><Skel rows={1} /></div> : client ? (
        <div role="status" className="row sm" style={{ gap: 6 }}>
          <Icon n="check" s={14} style={{ color: 'var(--ok)' }} />
          <span>Billing client linked: <b>{client.clientName}</b>{missingBilling(client).length ? <span className="muted"> · still missing {missingBilling(client).join(', ')}</span> : null}</span>
        </div>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {fail && <Banner tone="bad">{fail}</Banner>}
          {err != null && <Banner tone="bad" action={<Btn size="sm" onClick={clients.reload}>Try again</Btn>}>{invoiceError(err, 'load').message}</Banner>}
          {suggestions.map(s => (
            <div key={s.client.slug} className="banner" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="sm"><b>{s.client.clientName}</b>{s.client.billing.email ? ` · ${s.client.billing.email}` : ''}{s.client.billing.abn ? ` · ABN ${s.client.billing.abn}` : ''}<div className="faint sm">{s.reasons.join(' · ')}</div></span>
              <span className="row" style={{ gap: 6 }}>
                <Btn size="sm" kind="pri" disabled={!!busy} aria-label={`Link ${s.client.clientName}`} onClick={() => void link(s.client.slug)}>{busy === s.client.slug ? 'Linking…' : 'Link'}</Btn>
                <Btn size="sm" kind="ghost" disabled={!!busy} aria-label={`Not it, ${s.client.clientName}`} onClick={() => dismiss(s.client.slug)}>Not it</Btn>
              </span>
            </div>
          ))}
          <div className="row wrap" style={{ gap: 8 }}>
            <Btn size="sm" disabled={!!busy} onClick={() => void create()}>{busy === 'create' ? 'Creating…' : `Create billing client from "${company.name}"`}</Btn>
          </div>
          <div className="hint">{suggestions.length ? 'Suggested because it looks like this company. Nothing is linked until you click.' : `No billing client is linked to ${company.name} yet. Invoices need one; you can also do this later.`}</div>
        </div>
      )}
    </div>
  )
}
