import type { BusinessId, CompanySignal, SourceCheck } from '../api/contract'
import { Act } from '../data/Act'
import { Q, type ScoreBreakdown } from '../data/Q'
import { adjustSummary } from '../data/signalAdjust'
import { daysAgo, hostOf } from './intelText'
import { Btn, Chip, Icon } from '../kit'
import { UI } from '../ui/store'
import { safeHref } from '../pages/companies/query'

/** A cited page as a link. Only http(s) becomes an anchor. */
export function Src({ url, label }: { url: string | undefined; label?: string }) {
  const href = safeHref(url)
  if (!href) return <span className="faint">No usable source</span>
  return <a href={href} target="_blank" rel="noreferrer noopener">{label ?? hostOf(href)}</a>
}

/** Whether the server found the value on the page it cited. Text and an icon, never colour alone. */
export function CheckNote({ check }: { check: SourceCheck | undefined }) {
  if (!check) return null
  const ok = check === 'confirmed'
  return (
    <span className="row xs" style={{ gap: 3, display: 'inline-flex' }}>
      <Icon n={ok ? 'check' : 'alert'} s={12} style={{ color: ok ? 'var(--ok)' : 'var(--warn)' }} />
      {ok ? 'Found on page' : "Couldn't confirm on the page, check the source yourself"}
    </span>
  )
}

/** A reported closure nobody has answered yet. It moves no score until someone confirms it. */
export function ClosureReview({ companyId, b, closure, compact }: { companyId: string; b: BusinessId; closure: Pick<CompanySignal, 'headline' | 'sourceUrl'>; compact?: boolean }) {
  const answer = (d: 'confirmed' | 'dismissed'): void => {
    if (!UI.guard(b, 'Reviewing a closure')) return
    if (!Act.reviewClosure(companyId, b, closure, d)) UI.toast('That closure is no longer saved', 'warn')
    else UI.toast(d === 'confirmed' ? 'Closure confirmed. It now lowers the score.' : 'Closure dismissed')
  }
  return (
    <div className="row wrap" style={{ gap: 6 }} role="group" aria-label="Possible closure">
      <Chip tone="warn" icon="alert">Possible closure, confirm or dismiss</Chip>
      {!compact && <span className="xs faint">Not counted in the score until confirmed.</span>}
      <Src url={closure.sourceUrl} />
      {Q.canEdit(b) && (
        <>
          <Btn size="xs" onClick={() => answer('confirmed')}>Confirm closure</Btn>
          <Btn size="xs" kind="ghost" onClick={() => answer('dismissed')}>Dismiss</Btn>
        </>
      )}
    </div>
  )
}

/** Why saved web signals moved a score: each reason with its source and date, any unanswered closure, and when the web was last checked. */
export function ScoreWhy({ bd, companyId, b }: { bd: ScoreBreakdown; companyId: string; b: BusinessId }) {
  if (!bd.parts.length && !bd.pending.length) return null
  return (
    <div className="col" style={{ gap: 4 }} data-testid="score-why">
      {bd.parts.length > 0 && (
        <>
          <div className="xs">{adjustSummary({ delta: bd.adjust, parts: bd.parts, pending: [] })} from saved web signals.</div>
          {bd.parts.map(p => (
            <div key={p.label} className="row wrap xs" style={{ gap: 6 }}>
              <span className="muted">{p.label}</span>
              {p.date && <span className="faint">{p.date}</span>}
              {p.sourceUrl && <Src url={p.sourceUrl} />}
              <span className="sp" />
              <span className="num" style={{ color: p.points < 0 ? 'var(--bad)' : 'var(--ok)' }}>{p.points > 0 ? '+' : '−'}{Math.abs(p.points)}</span>
            </div>
          ))}
        </>
      )}
      {bd.pending.map(c => <ClosureReview key={c.sourceUrl + c.headline} companyId={companyId} b={b} closure={c} compact />)}
      {bd.checkedAt && <div className="xs faint">Signals checked {daysAgo(bd.checkedAt)}.</div>}
    </div>
  )
}
