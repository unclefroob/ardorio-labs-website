import { describe, expect, it } from 'vitest'
import { bootstrap, rec, user } from '../testing/fixtures'
import { loadSales } from '../testing/load'

const PIPELINE = {
  businessId: 'ard', name: 'Sales', lostReasons: [], forecast: [], card: [],
  stages: [
    { id: 's1', name: 'Qualified', prob: 20, required: [], won: false, lost: false },
    { id: 's2', name: 'Proposal sent', prob: 50, required: [], won: false, lost: false },
  ],
  fields: [
    { key: 'budget', label: 'Approved budget', type: 'currency' },
    { key: 'champion', label: 'Champion', type: 'contact' },
    { key: 'renewal', label: 'Renewal on', type: 'date' },
    { key: 'legal', label: 'Legal review', type: 'boolean' },
  ],
}

async function world() {
  const m = await loadSales()
  const labels = await import('./fieldLabels')
  const F = (await import('./F')).F
  m.bootstrap.hydrate(bootstrap({
    pipelines: [rec('p1', PIPELINE)],
    companies: [rec('co1', { name: 'Acme Pty Ltd', tags: [], notes: [] })],
    contacts: [rec('ct1', { name: 'Jane Citizen', notes: [] })],
    deals: [rec('d1', { name: 'Big deal', businessId: 'ard', pipelineId: 'p1', stageId: 's1', fields: {}, contactIds: [], stageHistory: [], notes: [] })],
  }, [user('u-other', 'Olivia Other')]))
  return { ...labels, F }
}

describe('fieldLabel', () => {
  it('uses pipeline field definitions for custom deal fields', async () => {
    const { fieldLabel } = await world()
    expect(fieldLabel('deals', 'd1', 'fields/budget')).toBe('Approved budget')
  })

  it('falls back to a readable label for an unknown custom key', async () => {
    const { fieldLabel } = await world()
    expect(fieldLabel('deals', 'd1', 'fields/secretSauce')).toBe('Secret sauce')
  })

  it('uses the core map for built-in fields', async () => {
    const { fieldLabel } = await world()
    expect(fieldLabel('deals', 'd1', 'stageId')).toBe('Stage')
    expect(fieldLabel('deals', 'd1', 'close')).toBe('Expected close')
    expect(fieldLabel('companies', 'co1', 'tradingName')).toBe('Trading name')
    expect(fieldLabel('contacts', 'ct1', 'linkedin')).toBe('LinkedIn')
  })

  it('humanises anything else instead of showing a dotted path', async () => {
    const { fieldLabel } = await world()
    expect(fieldLabel('tasks', 't1', 'snoozedUntilAt')).toBe('Snoozed until at')
    expect(fieldLabel('tasks', 't1', 'some_thing-else')).toBe('Some thing else')
  })

  it('labels a keyed note', async () => {
    const { fieldLabel } = await world()
    expect(fieldLabel('companies', 'co1', 'notes#n42')).toBe('A note')
  })
})

describe('formatFieldValue', () => {
  it('formats money', async () => {
    const { formatFieldValue } = await world()
    expect(formatFieldValue('deals', 'd1', 'value', 52000)).toBe('A$52,000')
    expect(formatFieldValue('deals', 'd1', 'fields/budget', 1500)).toBe('A$1,500')
  })

  it('formats dates and date-times', async () => {
    const { formatFieldValue, F } = await world()
    expect(formatFieldValue('deals', 'd1', 'close', '2031-11-05')).toBe(F.date('2031-11-05'))
    expect(formatFieldValue('deals', 'd1', 'close', '2031-11-05')).toContain('5 Nov')
    expect(formatFieldValue('tasks', 't1', 'due', '2031-11-05T14:30')).toBe(F.dt('2031-11-05T14:30'))
    expect(formatFieldValue('deals', 'd1', 'fields/renewal', '2031-03-01')).toContain('1 Mar')
  })

  it('shows stage names, not ids', async () => {
    const { formatFieldValue } = await world()
    expect(formatFieldValue('deals', 'd1', 'stageId', 's2')).toBe('Proposal sent')
    expect(formatFieldValue('deals', 'd1', 'stageId', 'zzz')).toBe('Unknown stage')
  })

  it('shows user, company and contact names', async () => {
    const { formatFieldValue } = await world()
    expect(formatFieldValue('deals', 'd1', 'ownerId', 'u-other')).toBe('Olivia Other')
    expect(formatFieldValue('deals', 'd1', 'ownerId', 'u-gone')).toBe('A teammate')
    expect(formatFieldValue('deals', 'd1', 'companyId', 'co1')).toBe('Acme Pty Ltd')
    expect(formatFieldValue('deals', 'd1', 'fields/champion', 'ct1')).toBe('Jane Citizen')
    expect(formatFieldValue('deals', 'd1', 'contactIds', ['ct1', 'ct9'])).toBe('Jane Citizen, Unknown contact')
  })

  it('shows probability as a percentage and booleans as Yes/No', async () => {
    const { formatFieldValue } = await world()
    expect(formatFieldValue('deals', 'd1', 'probability', 60)).toBe('60%')
    expect(formatFieldValue('deals', 'd1', 'recurring', true)).toBe('Yes')
    expect(formatFieldValue('deals', 'd1', 'fields/legal', false)).toBe('No')
  })

  it('reads absent and empty values as "empty"', async () => {
    const { formatFieldValue } = await world()
    for (const v of [undefined, null, '']) expect(formatFieldValue('deals', 'd1', 'next', v)).toBe('empty')
  })

  it('shows plain text, lists and notes as readable text', async () => {
    const { formatFieldValue } = await world()
    expect(formatFieldValue('companies', 'co1', 'hq', 'Perth')).toBe('Perth')
    expect(formatFieldValue('companies', 'co1', 'tags', ['a', 'b'])).toBe('a, b')
    expect(formatFieldValue('companies', 'co1', 'tags', [])).toBe('None')
    expect(formatFieldValue('companies', 'co1', 'notes#n1', { body: 'Called them' })).toBe('Called them')
  })
})
