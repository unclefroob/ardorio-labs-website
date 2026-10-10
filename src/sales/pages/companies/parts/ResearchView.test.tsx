import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Research } from '../../../data/types'
import { ResearchView } from './ResearchView'

const base = {
  id: 'rs1', companyId: '', businessId: 'ard', ts: '2026-10-10T00:00:00.000Z', companyName: 'Spuntino Group', score: 40,
  overview: 'A hospitality group.', model: '', challenges: [], offerings: [], stakeholders: [], angle: '',
  facts: [['Name provided', 'Spuntino Group']], sources: [], inferred: [],
} as unknown as Research

const html = (r: Record<string, unknown>) => renderToStaticMarkup(<ResearchView r={{ ...base, ...r } as Research} />)

describe('ResearchView with no CRM match', () => {
  it('shows web-research wording and no score for a Grok result', () => {
    const out = html({ limited: true, provider: 'xai', webSources: [] })
    expect(out).toContain('Everything here is public web research')
    expect(out).not.toContain('Generic sector content only')
    expect(out).toContain('Not scored')
    expect(out).not.toContain('Opportunity score')
  })

  it('keeps the generic-content wording when no web search was involved', () => {
    const out = html({ limited: true })
    expect(out).toContain('Generic sector content only')
    expect(out).toContain('Not scored')
  })

  it('shows the score for a matched company', () => {
    const out = html({ limited: false, provider: 'xai' })
    expect(out).toContain('Opportunity score')
    expect(out).not.toContain('Not scored')
    expect(out).not.toContain('no CRM record matched')
  })
})
