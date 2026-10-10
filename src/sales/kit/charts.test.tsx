import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bars, Funnel, Legend, Line } from './charts'
import { LINE_DASH } from './util'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
const draw = async (el: React.ReactElement): Promise<void> => { await act(async () => { root.render(el) }) }
const rows = (): string[][] => [...host.querySelectorAll('table tr')].map(tr => [...tr.children].map(c => c.textContent ?? ''))

// jsdom checks only the markup a screen reader would be given; it has not been read by one.
describe('chart accessibility', () => {
  it('a plain bar chart has a named group and a table of its values', async () => {
    await draw(<Bars label="Pipeline by stage" data={[{ l: 'Lead', v: 5 }, { l: 'Won', v: 2 }]} />)
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Pipeline by stage')
    expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(host.querySelector('caption')?.textContent).toBe('Pipeline by stage')
    expect(rows()).toEqual([['Item', 'Value'], ['Lead', '5'], ['Won', '2']])
  })

  it('a clickable bar chart keeps its table, and each bar says what it is', async () => {
    await draw(<Bars label="Open pipeline" data={[{ l: 'Rosterio', v: 7 }]} onBar={() => undefined} />)
    expect(rows()).toEqual([['Item', 'Value'], ['Rosterio', '7']])
    const svg = host.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBeNull()
    expect(svg?.getAttribute('aria-label')).toContain('Open pipeline')
    expect(host.querySelector('[role="button"]')?.getAttribute('aria-label')).toBe('Rosterio: 7')
  })

  it('a stacked chart names each part in the table and in the bar label, not just by colour', async () => {
    await draw(<Bars label="Won revenue" stacked series={['Rosterio', 'Advisory']} colors={['red', 'blue']} data={[{ l: 'Jan', v: [3, 2] }]} onBar={() => undefined} />)
    expect(rows()).toEqual([['Item', 'Rosterio', 'Advisory', 'Total'], ['Jan', '3', '2', '5']])
    expect(host.querySelector('[role="button"]')?.getAttribute('aria-label')).toBe('Jan: 5 (Rosterio 3, Advisory 2)')
  })

  it('a line chart has a named group, a table, and a different line style for each series', async () => {
    await draw(<Line label="Activity by week" labels={['W1', 'W2']} series={[{ n: 'Emails', c: 'red', v: [1, 2] }, { n: 'Calls', c: 'blue', v: [3, 4] }]} />)
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Activity by week')
    expect(rows()).toEqual([['Period', 'Emails', 'Calls'], ['W1', '1', '3'], ['W2', '2', '4']])
    const lines = [...host.querySelectorAll('polyline')]
    expect(lines[0].getAttribute('stroke-dasharray')).toBeNull()
    expect(lines[1].getAttribute('stroke-dasharray')).toBe(LINE_DASH[1])
    expect(LINE_DASH[1]).not.toBe(LINE_DASH[2])
  })

  it('the legend shows the dash pattern next to the colour when given one', async () => {
    await draw(<Legend items={[['Emails', 'red', LINE_DASH[0]], ['Calls', 'blue', LINE_DASH[1]], ['Plain', 'green']]} />)
    const dashes = [...host.querySelectorAll('line')].map(l => l.getAttribute('stroke-dasharray'))
    expect(dashes).toEqual([null, LINE_DASH[1]])
    expect(host.querySelectorAll('.dot')).toHaveLength(1)
  })

  it('a funnel is a named group whose steps are text with their numbers', async () => {
    await draw(<Funnel label="Outreach funnel" steps={[{ l: 'Emailed', v: 100 }, { l: 'Replied', v: 25 }]} />)
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Outreach funnel')
    const t = host.textContent ?? ''
    expect(t).toContain('Replied')
    expect(t).toContain('25')
    expect(t).toContain('25%')
    expect(host.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
  })
})
