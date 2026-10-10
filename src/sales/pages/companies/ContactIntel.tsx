import { useState } from 'react'
import { research as localResearch } from '../../ai/local'
import { F } from '../../data/F'
import { Q } from '../../data/Q'
import { S } from '../../data/store'
import type { BusinessId, Contact } from '../../data/types'
import { Btn, Card, Chip, Empty, Icon } from '../../kit'

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function ContactIntel({ ct, b }: { ct: Contact; b: BusinessId }) {
  const [done, setDone] = useState(false)
  const co = Q.company(ct.companyId)
  const s = Q.score(ct.id, b)
  const bz = Q.biz(b)
  const bn = bz?.name ?? 'this business'
  const snap = S.research.filter(r => r.companyId === ct.companyId && r.businessId === b).pop()
  const fallback = co && !snap ? localResearch(co.id, b) : undefined
  const points = (snap ? strs(snap.challenges) : fallback && !('error' in fallback) ? strs(fallback.challenges) : []).slice(0, 3)
  const conv = S.activities.filter(a => a.contactId === ct.id && Q.actVisible(a)).sort((a, x) => x.ts.localeCompare(a.ts))
  const decider = /Decision|Economic/.test(ct.buyingRole)

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row">
        <Chip>Rules-based from CRM data</Chip>
        <span className="sp" />
        <Btn kind="pri" icon="spark" onClick={() => setDone(true)}>{done ? 'Refresh' : 'Research contact'}</Btn>
      </div>
      {done ? (
        <div className="ai card-b">
          <div className="ai-h"><Icon n="spark" s={14} />{ct.name} · {bn} briefing</div>
          <div className="grid g2" style={{ marginTop: 12 }}>
            <div>
              <div className="b sm">Role context</div>
              <div className="sm muted" style={{ marginTop: 4 }}>
                {co
                  ? <>As {ct.title || 'a contact'} ({ct.seniority}) at a {co.industry.toLowerCase()} organisation with ~{F.num(co.employees)} employees, {ct.firstName} is likely to be {decider ? 'a final approver' : 'an influencer or evaluator'} for {bn} initiatives{ct.department ? ' in ' + ct.department.toLowerCase() : ''}.</>
                  : 'Company details are unavailable for this contact.'}
              </div>
            </div>
            <div>
              <div className="b sm">Suggested talking points</div>
              {points.length ? points.map(x => <div key={x} className="sm" style={{ marginTop: 4 }}>• {x}</div>) : <div className="sm muted" style={{ marginTop: 4 }}>No company research yet. Research the company to get talking points.</div>}
            </div>
            <div>
              <div className="b sm">Relationship history</div>
              <div className="sm muted" style={{ marginTop: 4 }}>{conv.length ? conv.length + ' recorded interactions; most recent: ' + conv[0].subject + ' (' + F.rel(conv[0].ts) + ').' : 'No interactions yet.'}</div>
            </div>
            <div>
              <div className="b sm">Recommended next step</div>
              <div className="sm" style={{ marginTop: 4 }}>{s.next ?? 'No recommendation available.'}</div>
            </div>
          </div>
          <div className="xs faint" style={{ marginTop: 12 }}>Sources: CRM contact and company records · {bn} product knowledge. Inferred content is labelled and should be verified.</div>
        </div>
      ) : (
        <Card><Empty icon="spark" title="Generate a contact briefing" body="Uses CRM data and business-specific knowledge. No external lookup is performed." /></Card>
      )}
    </div>
  )
}
