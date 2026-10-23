import { useState } from 'react'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { uid } from '../../data/ids'
import { Q } from '../../data/Q'
import type { Deal } from '../../data/types'
import { Btn, Card, Chip, Empty, Fld, Inp, Seg, TA } from '../../kit'
import {
  acceptPatch, describeOption, figuresOf, MAX_OPTIONS, newOption, optionsOf, PARTY_LABEL, STATUS_LABEL, type CommercialOption, type Party,
} from '../../shared/commercialOptions'
import { PRICE_UNITS, TERM_PICKS, UNIT_LABEL, type PriceUnit } from '../../shared/dealPricing'
import { UI } from '../../ui/store'

// Several ways to structure one deal, side by side, inside the Commercials tab. Nothing here makes a second deal: the options are saved on
// this deal, the ones proposed are marked, and when the client picks one it sets the deal's value and price. The others stay for reference.

const digits = (v: string): string => v.replace(/[^0-9.]/g, '')
const num = (v: string): number => { const n = parseFloat(digits(v)); return Number.isFinite(n) ? n : 0 }
const shown = (n: number): string => (n > 0 ? String(n) : '')
const TONE: Record<CommercialOption['status'], string> = { draft: '', proposed: 'info', accepted: 'ok' }

function OptionCard({ o, can, onChange, onDuplicate, onRemove, onAccept }: {
  o: CommercialOption; can: boolean; onChange: (p: Partial<CommercialOption>) => void; onDuplicate: () => void; onRemove: () => void; onAccept: () => void
}) {
  const fig = figuresOf(o)
  const party = (k: 'hosting' | 'aiUsage', label: string) => (
    <div className="fld">
      <span className="lbl">{label}</span>
      <Seg label={label} value={o[k]} onChange={v => can && onChange({ [k]: v as Party })} opts={[['client', PARTY_LABEL.client], ['ardorio', PARTY_LABEL.ardorio]]} />
    </div>
  )
  return (
    <div className="card card-b col gap12" data-testid="commercial-option" aria-label={o.name}>
      <div className="row wrap" style={{ gap: 8 }}>
        <Inp aria-label="Option name" value={o.name} onChange={v => onChange({ name: v })} disabled={!can} style={{ maxWidth: 320, fontWeight: 600 }} />
        <Chip tone={TONE[o.status]}>{STATUS_LABEL[o.status]}</Chip>
        <span className="sp" />
        {can && <Btn size="xs" icon="copy" onClick={onDuplicate}>Duplicate</Btn>}
        {can && <Btn size="xs" kind="ghost" icon="trash" onClick={onRemove}>Remove</Btn>}
      </div>
      <div className="grid g3">
        <Fld label="Price (A$, ex GST)"><Inp className="mono" value={shown(o.amount)} onChange={v => onChange({ amount: num(v) })} disabled={!can} inputMode="decimal" /></Fld>
        <div className="fld">
          <span className="lbl">Charged</span>
          <Seg label="Charged" value={o.unit} onChange={v => can && onChange({ unit: v as PriceUnit })} opts={PRICE_UNITS.map(u => [u, UNIT_LABEL[u]] as const)} />
        </div>
        <Fld label="One-off fee (A$)" hint="Build or setup, charged once"><Inp className="mono" value={shown(o.oneOff)} onChange={v => onChange({ oneOff: num(v) })} disabled={!can} inputMode="decimal" /></Fld>
      </div>
      <div className="fld">
        <span className="lbl">Contract term</span>
        <div className="row wrap" style={{ gap: 8 }}>
          <Seg label="Contract term" value={String(o.months)} onChange={v => can && onChange({ months: parseInt(v, 10) })} opts={TERM_PICKS.map(m => [String(m), m % 12 === 0 ? `${m / 12} yr` : `${m} mo`] as const)} />
          <Inp aria-label="Term in months" className="mono" inputMode="numeric" style={{ width: 64, textAlign: 'right' }} value={shown(o.months)} onChange={v => onChange({ months: Math.min(600, Math.floor(num(v))) })} disabled={!can} />
          <span className="sm muted">months{o.unit === 'once' ? ' (costs only; a one-off price does not depend on it)' : ''}</span>
        </div>
      </div>
      <div className="grid g2">
        {party('hosting', 'Hosting')}
        {party('aiUsage', 'AI usage costs')}
        <Fld label="Ongoing support"><Inp value={o.support} onChange={v => onChange({ support: v })} disabled={!can} placeholder="e.g. Included, or 8 hours a month" /></Fld>
        <Fld label="Custom development included"><Inp value={o.customDev} onChange={v => onChange({ customDev: v })} disabled={!can} placeholder="e.g. Agreed custom features" /></Fld>
      </div>
      <div className="fld">
        <span className="lbl">Estimated cost to Ardorio (A$, ex GST)</span>
        <div className="grid g4">
          <Fld label="One-off"><Inp className="mono" value={shown(o.costOneOff)} onChange={v => onChange({ costOneOff: num(v) })} disabled={!can} inputMode="decimal" /></Fld>
          <Fld label="Hosting / yr" hint={o.hosting === 'ardorio' ? undefined : 'Not counted: the client hosts'}><Inp className="mono" value={shown(o.costHostingYear)} onChange={v => onChange({ costHostingYear: num(v) })} disabled={!can || o.hosting !== 'ardorio'} inputMode="decimal" /></Fld>
          <Fld label="AI usage / yr" hint={o.aiUsage === 'ardorio' ? undefined : 'Not counted: the client pays'}><Inp className="mono" value={shown(o.costAiYear)} onChange={v => onChange({ costAiYear: num(v) })} disabled={!can || o.aiUsage !== 'ardorio'} inputMode="decimal" /></Fld>
          <Fld label="Support / yr"><Inp className="mono" value={shown(o.costSupportYear)} onChange={v => onChange({ costSupportYear: num(v) })} disabled={!can} inputMode="decimal" /></Fld>
        </div>
      </div>
      <Fld label="Notes"><TA value={o.notes} onChange={v => onChange({ notes: v })} disabled={!can} rows={2} /></Fld>
      <div className="row wrap" style={{ gap: 12 }} aria-live="polite">
        <span className="sm muted">{describeOption(o, F.money)}</span>
        <span className="sp" />
        <span className="sm">Contract <strong className="num">{F.money(fig.revenue)}</strong></span>
        <span className="sm">Cost <strong className="num">{F.money(fig.cost)}</strong></span>
        <span className="sm">Margin <strong className="num">{F.money(fig.margin)}{fig.marginPct != null ? ` (${fig.marginPct}%)` : ''}</strong></span>
      </div>
      {can && (
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn size="sm" kind={o.status === 'proposed' ? 'default' : 'ghost'} icon="send" onClick={() => onChange({ status: o.status === 'proposed' ? 'draft' : 'proposed' })} disabled={o.status === 'accepted'}>
            {o.status === 'proposed' ? 'Take out of the proposal' : 'Propose this option'}
          </Btn>
          {o.status !== 'accepted' && <Btn size="sm" kind="pri" icon="check" onClick={onAccept}>Client chose this</Btn>}
          {o.status === 'accepted' && <span className="sm muted">Accepted: the deal's value and price follow this option.</span>}
        </div>
      )}
    </div>
  )
}

export function CommercialOptions({ d }: { d: Deal }) {
  const can = Q.canEdit(d.businessId)
  const saved = optionsOf(d.fields)
  const [list, setList] = useState<CommercialOption[]>(saved)
  const dirty = JSON.stringify(list) !== JSON.stringify(saved)

  const patch = (id: string, p: Partial<CommercialOption>): void => setList(l => l.map(o => (o.id === id ? { ...o, ...p } : o)))
  const add = (): void => setList(l => [...l, newOption(uid('opt'), l.length + 1)])
  const duplicate = (o: CommercialOption): void => setList(l => [...l, { ...o, id: uid('opt'), name: `${o.name} (copy)`, status: 'draft' }])
  const remove = (o: CommercialOption): void => {
    if (o.status === 'accepted') return void UI.toast('This option is the accepted one. Choose another option first.', 'bad')
    setList(l => l.filter(x => x.id !== o.id))
  }
  const save = (): void => {
    if (list.some(o => !o.name.trim())) return void UI.toast('Give every option a name', 'bad')
    Act.updateDeal(d.id, { fields: { options: list } })
    UI.toast('Commercial options saved')
  }
  const accept = (o: CommercialOption): void => {
    const p = acceptPatch(list, o.id)
    if (!p) return
    Act.updateDeal(d.id, p)
    setList(p.fields.options as CommercialOption[])
    UI.toast(`${o.name} accepted · deal value now ${F.money(p.value)}`)
  }

  return (
    <Card
      title="Commercial options"
      right={can && (
        <span className="row" style={{ gap: 8 }}>
          <Btn size="sm" icon="plus" onClick={add} disabled={list.length >= MAX_OPTIONS}>Add option</Btn>
          <Btn size="sm" kind="pri" onClick={save} disabled={!dirty}>Save options</Btn>
        </span>
      )}
    >
      {list.length === 0 ? (
        <Empty
          icon="dollar" title="No options yet"
          body="Add the ways this deal could be structured, such as an outright purchase or SaaS, then propose one or more. The accepted option sets the deal's value."
          action={can ? <Btn kind="pri" icon="plus" onClick={add}>Add the first option</Btn> : undefined}
        />
      ) : (
        <div className="col gap12">
          {list.length > 1 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" aria-label="Options compared">
                <thead><tr><th>Option</th><th>Status</th><th className="r">Contract</th><th className="r">Per year</th><th className="r">Est. cost</th><th className="r">Margin</th><th>Hosting</th><th>AI usage</th></tr></thead>
                <tbody>
                  {list.map(o => {
                    const f = figuresOf(o)
                    return (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td><Chip tone={TONE[o.status]}>{STATUS_LABEL[o.status]}</Chip></td>
                        <td className="r num">{F.money(f.revenue)}</td>
                        <td className="r num">{f.annual != null ? F.money(f.annual) : '—'}</td>
                        <td className="r num">{F.money(f.cost)}</td>
                        <td className="r num">{F.money(f.margin)}{f.marginPct != null ? ` · ${f.marginPct}%` : ''}</td>
                        <td>{o.hosting ? PARTY_LABEL[o.hosting] : '—'}</td>
                        <td>{o.aiUsage ? PARTY_LABEL[o.aiUsage] : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {dirty && can && <div className="sm muted" role="status">Unsaved changes. Choosing an option saves all of them.</div>}
          {list.map(o => (
            <OptionCard key={o.id} o={o} can={can} onChange={p => patch(o.id, p)} onDuplicate={() => duplicate(o)} onRemove={() => remove(o)} onAccept={() => accept(o)} />
          ))}
        </div>
      )}
    </Card>
  )
}
