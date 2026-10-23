import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Research } from '../../../data/types'
import { ResearchView, cleanFact, identityOf } from './ResearchView'

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

const ident = { name: 'Atlantic Group', website: 'atlanticgroup.com.au', note: 'Melbourne hospitality group, not the staffing firms of the same name.', ambiguous: true }

describe('ResearchView identity banner', () => {
  it('asks whether it is the right company when several firms share the name', () => {
    const out = html({ identity: ident, provider: 'xai' })
    expect(out).toContain('Is this the right company?')
    expect(out).toContain('Atlantic Group')
    expect(out).toContain('Melbourne hospitality group')
    expect(out).toContain('href="https://atlanticgroup.com.au"')
    expect(out).toContain('Wrong company')
  })

  it('offers no confirm button for research that is not saved', () => {
    expect(html({ identity: ident })).not.toContain('Yes, this is it')
  })

  it('shows who confirmed it instead of the buttons', () => {
    const out = html({ identity: ident, identityConfirmedBy: 'nobody', identityConfirmedAt: '2026-10-11T02:00:00.000Z' })
    expect(out).toContain('Confirmed by')
    expect(out).not.toContain('Is this the right company?')
    expect(out).not.toContain('Wrong company')
  })

  it('shows a quiet line when the match is clear, and nothing when there is no identity', () => {
    const quiet = html({ identity: { ...ident, ambiguous: false } })
    expect(quiet).toContain('Researched: Atlantic Group')
    expect(quiet).not.toContain('Wrong company')
    expect(html({})).not.toContain('research-identity')
  })

  it('drops an identity with no name and a website that is not http(s)', () => {
    expect(identityOf({ name: '', note: 'x', ambiguous: true })).toBeNull()
    expect(identityOf({ name: 'A', website: 'javascript:alert(1)', note: '', ambiguous: false })?.href).toBe('')
    expect(html({ identity: { ...ident, website: 'javascript:alert(1)' } })).not.toContain('javascript:')
  })
})

describe('ResearchView facts and score', () => {
  it('hides empty facts, a lone comma and Unknown, and drops the (CRM) label suffix', () => {
    expect(cleanFact(' , ')).toBe('')
    expect(cleanFact('Unknown')).toBe('')
    expect(cleanFact('—')).toBe('')
    expect(cleanFact('Retail')).toBe('Retail')
    const out = html({ facts: [['Industry (CRM)', 'Retail'], ['Headquarters (CRM)', ','], ['Employees (CRM estimate)', 'Unknown']] })
    expect(out).toContain('Industry')
    expect(out).toContain('Retail')
    expect(out).not.toContain('Headquarters')
    expect(out).not.toContain('Employees')
    expect(out).not.toContain('(CRM)')
    expect(out).not.toContain('Low confidence')
  })

  it('says so, with a low-confidence score, when the CRM record has no facts', () => {
    const out = html({ facts: [['Headquarters (CRM)', ','], ['Locations (CRM)', 'Unknown']] })
    expect(out).toContain('Low confidence')
    expect(out).toContain('Opportunity score')
    expect(out).toContain('Nothing recorded yet')
    expect(out).not.toContain('Not scored')
  })

  it('shows no facts and no confidence note when there is no CRM record', () => {
    const out = html({ limited: true, facts: [['Name provided', 'Spuntino Group']] })
    expect(out).toContain('No CRM record, so there are no facts to show.')
    expect(out).not.toContain('Low confidence')
    expect(out).not.toContain('Spuntino Group</dd>')
  })
})

describe('ResearchView sources and angle', () => {
  const web = Array.from({ length: 7 }, (_, i) => ({ title: 'Page ' + (i + 1), url: `https://site${i + 1}.example/page` }))

  it('shows the first five sources as numbered domain chips and offers the rest', () => {
    const out = html({ provider: 'xai', webSources: web })
    expect(out).toContain('7 web')
    expect(out).toContain('1 · site1.example')
    expect(out).toContain('5 · site5.example')
    expect(out).not.toContain('6 · site6.example')
    expect(out).toContain('Show all 7')
  })

  it('does not link a source that is not http(s)', () => {
    const out = html({ provider: 'xai', webSources: [{ title: 'x', url: 'javascript:alert(1)' }] })
    expect(out).not.toContain('javascript:')
    expect(out).toContain('no linked sources')
  })

  it('lists the other sources on one line, with the AI note and caveats', () => {
    const out = html({ provider: 'xai', webSources: [], sources: [{ label: 'CRM company record', kind: 'CRM data' }, { label: 'Rosterio product knowledge', kind: 'Configured knowledge' }], inferred: ['Not verified.'] })
    expect(out).toContain('Also used: CRM company record, Rosterio product knowledge')
    expect(out).toContain('AI inference')
    expect(out).toContain('Not verified.')
  })

  it('disables Draft email until the company has a contact, and says why', () => {
    const noCompany = html({ angle: 'Lead with rostering.', companyId: '' })
    expect(noCompany).toContain('Draft email with this angle')
    expect(noCompany).toContain('disabled')
    expect(noCompany).toContain('Save the research as a company')
    expect(html({ angle: 'Lead with rostering.', companyId: 'co-none' })).toContain('Add a contact first')
    expect(html({ angle: '' })).not.toContain('Draft email')
  })

  it('shows the business model behind a closed toggle', () => {
    const out = html({ model: 'Venue hire and catering.' })
    expect(out).toContain('Show business model')
    expect(out).toContain('aria-expanded="false"')
    expect(out).not.toContain('Venue hire and catering.')
  })
})

describe('ResearchView head office and headcount', () => {
  const profile = { headOffice: 'Sydney, NSW, Australia', employees: { count: 850, basis: 'estimated', note: 'Company website says about 850 staff' } }

  it('shows the estimate in the size chip and the found-by-search card when the CRM has no size', () => {
    const out = html({ size: 'Unknown', profile })
    expect(out).toContain('Size: about 850 (estimate)')
    expect(out).toContain('Head office: Sydney, NSW, Australia')
    expect(out).toContain('Employees (estimate)')
    expect(out).toContain('Company website says about 850 staff')
  })

  it('shows a stated headcount without calling it an estimate', () => {
    const out = html({ size: 'Unknown', profile: { employees: { count: 1200, basis: 'stated', note: '' } } })
    expect(out).toContain('Size: 1,200')
    expect(out).not.toContain('(estimate)')
  })

  it('keeps the CRM size when there is one, and shows nothing extra without a profile', () => {
    expect(html({ size: '400 employees (est.)' })).toContain('Size: 400 employees (est.)')
    expect(html({ size: 'Unknown' })).not.toContain('research-found')
    expect(html({ size: 'Unknown' })).toContain('Size: not stated')
  })

  it('ignores a malformed profile', () => {
    const out = html({ profile: { headOffice: 7, employees: { count: 'lots', basis: 'stated' } } })
    expect(out).not.toContain('research-found')
  })
})
