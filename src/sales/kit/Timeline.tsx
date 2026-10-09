import type { Activity } from '../data/types'
import { F } from '../data/F'
import { Q } from '../data/Q'
import { BizDot, Chip, Empty } from './basic'
import { CoLink, CtLink, DlLink } from './links'
import { Icon } from './Icon'
import { AIC } from './util'

function iconStyle(type: string): { color?: string; background?: string } | undefined {
  if (type === 'won') return { color: 'var(--ok)' }
  if (type === 'email_in') return { color: 'var(--acc-ink)', background: 'var(--acc-soft)' }
  if (type === 'bounce' || type === 'suppressed') return { color: 'var(--bad2)' }
  return undefined
}

export function Timeline({ items, showCompany }: { items: readonly Activity[]; showCompany?: boolean }) {
  if (!items.length) return <Empty icon="activity" title="No activity yet" body="Emails, calls, meetings and stage changes will appear here." />
  return (
    <div className="tl">
      {items.map(a => {
        const [ic, lab] = AIC[a.type] ?? ['activity', a.type]
        const vis = Q.actVisible(a)
        return (
          <div key={a.id} className="tl-i">
            <div className="tl-ic" style={iconStyle(a.type)}>
              <Icon n={ic} s={13} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="b">{vis ? a.subject : 'Private email'}</span>
                {!vis && <Chip icon="lock">Content restricted</Chip>}
                {a.outcome && vis && <Chip>{a.outcome}</Chip>}
              </div>
              <div className="faint xs row wrap" style={{ gap: 6, marginTop: 2 }}>
                <span>{lab}</span>·<span>{F.dt(a.ts)}</span>·<span>{Q.user(a.actorId)?.name || 'System'}</span>
                <BizDot b={a.businessId} s={6} />
                {showCompany && a.companyId && (
                  <>
                    <span>·</span>
                    <CoLink id={a.companyId} />
                  </>
                )}
                {a.contactId && (
                  <>
                    <span>·</span>
                    <CtLink id={a.contactId} />
                  </>
                )}
                {a.dealId && (
                  <>
                    <span>·</span>
                    <DlLink id={a.dealId} />
                  </>
                )}
              </div>
              {vis && a.desc && (
                <div className="muted sm" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
                  {a.desc}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
