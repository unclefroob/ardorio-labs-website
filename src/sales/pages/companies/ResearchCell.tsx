import { aiNotConfigured } from '../../ai/client'
import { cancelResearch, getResearch, researchBusiness, startResearch, usageFor, useResearchVersion } from '../../ai/profileResearch'
import { F } from '../../data/F'
import type { Company } from '../../data/types'
import { Btn, Chip } from '../../kit'
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

  if (st?.status === 'running') return <span className="row" style={{ gap: 6 }}><Chip tone="ai"><span className="spin" aria-hidden="true" /> Researching…</Chip><Btn size="xs" kind="ghost" onClick={stop(() => cancelResearch(c.id))}>Cancel</Btn></span>
  if (st?.status === 'ready') return <span className="row" style={{ gap: 6 }}><Chip tone="ai">{st.items.length} {st.items.length === 1 ? 'suggestion' : 'suggestions'} ready</Chip><Btn size="xs" kind="pri" onClick={review}>Review</Btn></span>
  if (st?.status === 'failed') {
    return (
      <span className="row" style={{ gap: 6 }}>
        <Chip tone={st.kind === 'error' ? 'bad' : 'warn'} title={st.message}>{st.kind === 'cap' ? 'Limit reached' : st.kind === 'notConfigured' ? 'Not set up' : 'Research failed'}</Chip>
        {st.kind === 'error' && <Btn size="xs" onClick={go(true)}>Try again</Btn>}
      </span>
    )
  }
  if (st?.status === 'nothing') return <span className="row" style={{ gap: 6 }}><Chip>Researched · nothing new</Chip><Btn size="xs" kind="ghost" disabled={!can || notSet || atCap} onClick={go(true)}>Run again</Btn></span>
  const why = !can ? 'You need edit access to one of this company\'s businesses.' : notSet ? 'Research is not set up. An admin adds the xAI key under Admin, Integrations.' : atCap ? 'The monthly research limit has been reached.' : undefined
  if (c.lastResearched) {
    return <span className="row" style={{ gap: 6 }}><Chip tone="ok">Researched {F.rel(c.lastResearched)}</Chip><Btn size="xs" kind="ghost" disabled={!!why} title={why} onClick={go(true)}>Run again</Btn></span>
  }
  return <span className="row" style={{ gap: 6 }}><Chip>Not researched</Chip><Btn size="xs" disabled={!!why} title={why} aria-label={`Research ${c.name}`} onClick={go()}>Research</Btn></span>
}
