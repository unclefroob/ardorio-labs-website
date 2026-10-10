import type { SourceCheck } from '../api/contract'
import { hostOf } from './intelText'
import { Icon } from '../kit'
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
