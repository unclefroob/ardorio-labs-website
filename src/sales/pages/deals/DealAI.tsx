import { useState } from 'react'
import { draft } from '../../ai/client'
import { dealInsights } from '../../ai/rules'
import { Act } from '../../data/Act'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import type { Deal } from '../../data/types'
import { AiNotConfigured, Banner, Btn, Card, Chip, Icon, ScoreRing } from '../../kit'
import { UI } from '../../ui/store'

function Bullets({ items }: { items: readonly string[] }) {
  return <>{items.map(x => <div key={x} className="sm" style={{ padding: '2px 0' }}>• {x}</div>)}</>
}

export function DealAI({ d }: { d: Deal }) {
  const [busy, setBusy] = useState(false)
  const ins = dealInsights(d)
  const can = Q.canEdit(d.businessId)
  const ct = Q.contact(d.primaryContact)
  const bn = Q.biz(d.businessId)?.name ?? ''

  const createTask = (): void => {
    Act.createTask({
      title: ins.next + ' — ' + d.title,
      type: 'Follow-up',
      businessId: d.businessId,
      assigneeId: d.ownerId,
      due: F.addDays(F.today() + 'T10:00', 1),
      dealId: d.id,
      companyId: d.companyId,
      contactId: d.primaryContact,
      source: 'Deal insight',
    })
    UI.toast('Task created')
  }

  const followUp = async (): Promise<void> => {
    if (!ct) return
    setBusy(true)
    try {
      const r = await draft(ct, d.businessId, F.days(d.lastActivity, F.nowIso()) > 7 ? 'stale' : 'follow', { deal: d })
      UI.open('compose', { contactId: ct.id, dealId: d.id, businessId: d.businessId, subject: r.value.subject, body: r.value.body, ai: r.ai })
    } catch {
      UI.toast('Could not draft a follow-up. Try again, or write one yourself.', 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <Chip icon="spark" title="Calculated by rules from CRM data. No AI model is used for these insights.">Rule-based insights from CRM activity, fields and email metadata</Chip>
      </div>
      <div className="grid g3">
        <div className="ai card-b row" style={{ gap: 14 }}>
          <ScoreRing v={ins.health} s={60} />
          <div>
            <div className="ai-h">Deal health</div>
            <div className="sm muted">{ins.health >= 70 ? 'Healthy momentum' : ins.health >= 45 ? 'Needs attention' : 'At risk'}</div>
          </div>
        </div>
        <div className="ai card-b" style={{ gridColumn: 'span 2' }}>
          <div className="ai-h"><Icon n="arrow" s={13} />Suggested next action</div>
          <div className="sm b" style={{ marginTop: 6 }}>{ins.next}</div>
          <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>
            {can && <Btn size="xs" kind="pri" icon="checksq" onClick={createTask}>Create task</Btn>}
            {can && ct && <Btn size="xs" icon="mail" disabled={busy} onClick={() => void followUp()}>{busy ? 'Drafting…' : 'Draft follow-up'}</Btn>}
            {can && ct && <AiNotConfigured />}
          </div>
          {can && !ct && d.status === 'open' && <div className="faint xs" style={{ marginTop: 6 }}>Add a stakeholder to draft a follow-up email.</div>}
          {ins.forecast && <div className="xs muted" style={{ marginTop: 8 }}><b>Forecast:</b> {ins.forecast}</div>}
        </div>
      </div>
      <div className="grid g2">
        <Card title="Missing qualification information" icon="alert">
          {ins.missing.length ? <Bullets items={ins.missing} /> : <div className="sm" style={{ color: 'var(--ok)' }}>Key fields complete</div>}
        </Card>
        <Card title="Stakeholder gaps" icon="users">
          {ins.gaps.length ? <Bullets items={ins.gaps} /> : <div className="sm" style={{ color: 'var(--ok)' }}>Buying group looks covered ({d.contactIds.length} stakeholders)</div>}
        </Card>
        <Card title="Potential objections" icon="flag">
          <Bullets items={ins.objections} />
          <div className="faint xs" style={{ marginTop: 6 }}>Combines objections detected in replies with typical {bn} patterns (inferred).</div>
        </Card>
        <Card title={'Recommended for this ' + bn + ' deal'} icon="spark">
          <Bullets items={ins.recs} />
          {ins.stalled && <Banner tone="warn">{ins.stalled}</Banner>}
        </Card>
      </div>
    </div>
  )
}
