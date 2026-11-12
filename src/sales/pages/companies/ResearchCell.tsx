import type { ReactNode } from 'react'
import { aiNotConfigured } from '../../ai/client'
import { cancelResearch, getResearch, researchBusiness, startResearch, usageFor, useResearchVersion } from '../../ai/profileResearch'
import { F } from '../../data/F'
import type { Company } from '../../data/types'
import { Btn, Icon } from '../../kit'
import { UI } from '../../ui/store'

// The Research control on a company row. Research is on demand: one click starts it for this company, the result waits as "ready to review",
// and nothing is applied until the person has chosen in the review dialog.
export function ResearchCell({ c }: { c: Company }) {
  useResearchVersion()
  const st = getResearch(c.id)
  const can = researchBusiness(c.id) !== null
  const notSet = aiNotConfigured('xai')
  const u = usageFor(c.id)
  const atCap = !!u && u.used >= u.limit
  const stop = (fn: () => void) => (e: { stopPropagation: () => void }): void => { e.stopPropagation(); fn() }
  const go = (again = false) => stop(() => { void startResearch(c.id, { again }) })
  const review = stop(() => UI.open('companyResearch', { companyId: c.id }))

  // One status line and one button, the same in every row: the status column has a fixed width so the buttons line up down the table.
  const cell = (tone: string, icon: ReactNode, text: string, action: ReactNode, title?: string) => (
    <span className="rcell"><span className={'rcell-s ' + tone} title={title ?? text}>{icon}<span className="rcell-t">{text}</span></span>{action}</span>
  )
  const ico = (n: string) => <Icon n={n} s={13} />

  if (st?.status === 'running') return cell('ai', <span className="spin rcell-spin" aria-hidden="true" />, 'Researching…', <Btn size="xs" onClick={stop(() => cancelResearch(c.id))}>Cancel</Btn>)
  if (st?.status === 'ready') {
    const n = `${st.items.length} ${st.items.length === 1 ? 'suggestion' : 'suggestions'} ready`
    return cell('ai', ico('spark'), n, <Btn size="xs" kind="pri" onClick={review}>Review</Btn>)
  }
  if (st?.status === 'failed') {
    const label = st.kind === 'cap' ? 'Limit reached' : st.kind === 'notConfigured' ? 'Not set up' : 'Research failed'
    return cell(st.kind === 'error' ? 'bad' : 'warn', ico('alert'), label, st.kind === 'error' ? <Btn size="xs" onClick={go(true)}>Try again</Btn> : null, st.message)
  }
  const why = !can ? 'You need edit access to one of this company\'s businesses.' : notSet ? 'Research is not set up. An admin adds the xAI key under Admin, Integrations.' : atCap ? 'The monthly research limit has been reached.' : undefined
  const again = <Btn size="xs" disabled={!!why} title={why} aria-label={`Research ${c.name} again`} onClick={go(true)}>Run again</Btn>
  if (st?.status === 'nothing') return cell('mute', ico('check'), 'Researched · nothing new', again)
  if (c.lastResearched) return cell('ok', ico('check'), `Researched ${F.rel(c.lastResearched)}`, again, `Researched ${F.date(c.lastResearched)}`)
  return cell('mute', <span className="rcell-dot" aria-hidden="true" />, 'Not researched', <Btn size="xs" disabled={!!why} title={why} aria-label={`Research ${c.name}`} onClick={go()}>Research</Btn>)
}
