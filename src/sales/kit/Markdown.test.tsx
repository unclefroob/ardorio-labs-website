import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { looksLikeMarkdown, renderSalesMarkdown } from './markdown'
import { FormattedSwitch, MarkdownArea, MarkdownText } from './MarkdownText'

// Markdown in descriptions: formatting only, nothing that loads or runs; plain text stays as typed; a switch to see it raw.

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const SCOPE = '**OZDARE — SALESOS CRM & AI PLATFORM**\n\n**Opportunity Overview**\n\n- Centralised customer CRM\n- AI-powered prospecting\n\n## Commercials\nSee [the proposal](https://ardorio.co/p)'

describe('rendering', () => {
  it('turns bold, headings, lists and links into formatting', () => {
    const html = renderSalesMarkdown(SCOPE)
    expect(html).toContain('<strong>OZDARE — SALESOS CRM &amp; AI PLATFORM</strong>')
    expect(html).toContain('<li>Centralised customer CRM</li>')
    expect(html).toContain('<h2>Commercials</h2>')
    expect(html).toContain('<a href="https://ardorio.co/p" target="_blank" rel="noopener noreferrer">the proposal</a>')
  })

  it('lets nothing through that loads or runs', () => {
    const html = renderSalesMarkdown('<script>alert(1)</script>![x](https://t.test/p.gif)<img src=x onerror=alert(1)>[bad](javascript:alert(1)) <iframe src="https://x"></iframe><b onclick="x()">b</b>')
    const box = document.createElement('div')
    box.innerHTML = html
    expect(box.querySelectorAll('script, img, iframe, style, form').length).toBe(0)
    const attrs = [...box.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => `${a.name}=${a.value}`))
    expect(attrs.filter(a => /^on/i.test(a) || /javascript:/i.test(a))).toEqual([]) // (a javascript: link is left as plain text, not a link)
    expect(html).toContain('<b>b</b>')
  })

  it('leaves plain text exactly as typed', () => {
    expect(looksLikeMarkdown('Call Jo on Tuesday.\nThen send the quote.')).toBe(false)
    expect(looksLikeMarkdown(SCOPE)).toBe(true)
  })
})

describe('the switch and the editor', () => {
  it('Formatted shows it rendered; off shows the raw text with its asterisks', async () => {
    await act(async () => { root.render(<MarkdownText text={SCOPE} formatted />) })
    expect(host.querySelector('strong')?.textContent).toBe('OZDARE — SALESOS CRM & AI PLATFORM')
    await act(async () => { root.render(<MarkdownText text={SCOPE} formatted={false} />) })
    expect(host.querySelector('strong')).toBeNull()
    expect(host.textContent).toContain('**OZDARE')
  })

  it('the switch is a labelled on/off control', async () => {
    const onChange = vi.fn()
    await act(async () => { root.render(<FormattedSwitch on onChange={onChange} />) })
    const sw = host.querySelector('[role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await act(async () => { (sw as HTMLButtonElement).click() })
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('Preview shows what Write will look like', async () => {
    await act(async () => { root.render(<MarkdownArea label="Scope summary" value={SCOPE} onChange={() => undefined} />) })
    expect(host.querySelector('textarea[aria-label="Scope summary"]')).not.toBeNull()
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent === 'Preview')!.click() })
    expect(host.querySelector('textarea')).toBeNull()
    expect(host.querySelector('h2')?.textContent).toBe('Commercials')
  })
})
