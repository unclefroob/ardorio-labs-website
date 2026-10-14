import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, field, type } from '../../testing/dom'
import { PricingFields, type PricingState } from './PricingFields'

let host: HTMLDivElement
let root: Root
let last: PricingState

function Harness({ init }: { init: PricingState }) {
  const [s, set] = useState(init)
  return <PricingFields state={s} onChange={n => { last = n; set(n) }} />
}
const mount = async (init: PricingState): Promise<void> => { await act(async () => root.render(<Harness init={init} />)) }
const months = (): HTMLInputElement | null => host.querySelector('input[aria-label="Term in months"]')
const text = (): string => host.textContent ?? ''

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

describe('PricingFields', () => {
  it('opens a deal with a typed value in total mode and leaves the value alone', async () => {
    await mount({ value: '100000', months: '24', fields: {} })
    expect(field(host, 'Estimated project value (A$)')?.value).toBe('100000')
    expect(text()).not.toContain('total contract')
  })

  it('works the total out from a yearly price and the term', async () => {
    await mount({ value: '', months: '12', fields: {} })
    await click(button(host, 'Price × term'))
    await type(field(host, 'Price (A$, ex GST)'), '50000')
    await click(button(host, '2 yr'))
    expect(last.value).toBe('100000')
    expect(last.months).toBe('24')
    expect(text()).toContain('A$100,000 total contract')
    expect(text()).toContain('A$50,000 a year')
  })

  it('recalculates when the term changes, including a custom number of months', async () => {
    await mount({ value: '', months: '12', fields: { priceUnit: 'year', priceAmount: '50000', priceOneOff: '' } })
    await type(months(), '18')
    expect(last.value).toBe('75000')
  })

  it('prices a monthly rate across the term and adds the one-off fee once', async () => {
    await mount({ value: '', months: '36', fields: { priceUnit: 'year', priceAmount: '4000', priceOneOff: '20000' } })
    await click(button(host, 'Per month'))
    expect(last.value).toBe('164000')
    expect(text()).toContain('A$48,000 a year')
  })

  it('ignores the term for a one-off price', async () => {
    await mount({ value: '', months: '24', fields: { priceUnit: 'year', priceAmount: '80000', priceOneOff: '' } })
    await click(button(host, 'One-off'))
    expect(last.value).toBe('80000')
    expect(months()).toBeNull()
  })

  it('keeps the calculated total as a typed value when switched back to Enter total', async () => {
    await mount({ value: '100000', months: '24', fields: { priceUnit: 'year', priceAmount: '50000', priceOneOff: '' } })
    await click(button(host, 'Enter total'))
    expect(field(host, 'Estimated project value (A$)')?.value).toBe('100000')
    expect(last.fields.priceUnit).toBe('')
  })

  it('seeds the price from an existing total when switching a typed deal to Price × term', async () => {
    await mount({ value: '100000', months: '24', fields: {} })
    await click(button(host, 'Price × term'))
    expect(field(host, 'Price (A$, ex GST)')?.value).toBe('50000')
    expect(last.value).toBe('100000')
  })
})
