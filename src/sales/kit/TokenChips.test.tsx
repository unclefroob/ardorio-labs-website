import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chipify, chipsInHtml, copyChips, serializeHtml, serializeText } from './tokenChips'
import { RichText } from './RichText'
import { TokenInput, TokenText } from './TokenField'

// Variables show as chips; what every editor stores stays plain {{key}} text.

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

const chips = (el: ParentNode = host): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('.tok')]

describe('chips in and out', () => {
  it('turn {{key}} text into labelled chips and back, fallbacks included, unchanged', () => {
    const el = document.createElement('div')
    el.innerHTML = 'Hey {{first_name}}! <b>{{ company_name | your team }}</b> {{job_title|}}'
    chipify(el)
    expect(chips(el).map(c => c.textContent)).toEqual(['First name', 'Company name · or “your team”', 'Job title · or leave out'])
    expect(chips(el).every(c => c.getAttribute('contenteditable') === 'false')).toBe(true)
    expect(serializeHtml(el)).toBe('Hey {{first_name}}! <b>{{company_name|your team}}</b> {{job_title|}}')
    expect(serializeText(el)).toBe('Hey {{first_name}}! {{company_name|your team}} {{job_title|}}')
  })

  it('colour by whose data it is, and mark a misspelt one red with a suggestion', () => {
    const el = document.createElement('div')
    el.textContent = '{{first_name}} {{sender_name}} {{firstname}}'
    chipify(el)
    const [c, s, bad] = chips(el)
    expect(c.className).toBe('tok tok-contact')
    expect(s.className).toBe('tok tok-sender')
    expect(bad.className).toContain('tok-bad')
    expect(bad.title).toContain('did you mean First name?')
  })

  it('in read-only HTML too', () => {
    expect(chipsInHtml('<div>Hi {{first_name}}</div>')).toMatch(/^<div>Hi <span class="tok tok-contact"[^>]*>First name<\/span><\/div>$/)
    expect(chipsInHtml('<div>No variables</div>')).toBe('<div>No variables</div>')
  })

  it('copy as {{key}} text, so they paste back as chips here and read sensibly anywhere else', () => {
    const el = document.createElement('div')
    el.textContent = 'Hi {{first_name}} there'
    document.body.appendChild(el)
    chipify(el)
    const r = document.createRange()
    r.selectNodeContents(el)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(r)
    const data = new Map<string, string>()
    const e = { clipboardData: { setData: (k: string, v: string) => data.set(k, v) } as unknown as DataTransfer, preventDefault: vi.fn() }
    copyChips(e, el, false)
    expect(data.get('text/plain')).toBe('Hi {{first_name}} there')
    expect(e.preventDefault).toHaveBeenCalled()
    el.remove()
  })
})

describe('the email editor', () => {
  it('shows the stored body\'s variables as chips, and hands back {{key}} text when edited', async () => {
    const onChange = vi.fn()
    await act(async () => { root.render(<RichText value="Hey {{first_name}}!" onChange={onChange} tokens={['first_name']} />) })
    const ed = host.querySelector<HTMLElement>('[contenteditable="true"]')!
    expect(chips(ed).map(c => c.textContent)).toEqual(['First name'])
    await act(async () => { ed.appendChild(document.createTextNode(' See {{company_name}}')); ed.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(chips(ed)).toHaveLength(2) // typed-in {{company_name}} became a chip
    expect(onChange).toHaveBeenLastCalledWith('Hey {{first_name}}! See {{company_name}}')
  })

  it('the Insert menu lists variables by name and adds one as a chip', async () => {
    const onChange = vi.fn()
    await act(async () => { root.render(<RichText value="Hi " onChange={onChange} tokens={['first_name']} />) })
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Insert variable'))!.click() })
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"], .menu button, button')].find(b => b.textContent?.startsWith('Job title'))
    expect(item).toBeDefined()
    await act(async () => { item!.click() })
    expect(String(onChange.mock.calls.at(-1)?.[0])).toContain('{{job_title}}')
  })

  it('colours a chip amber when told some contacts have no value', async () => {
    await act(async () => { root.render(<RichText value="{{job_title}}" onChange={() => undefined} tokens={['job_title']} info={() => ({ tone: 'warn', note: '3 of 9 have none' })} />) })
    expect(chips()[0].className).toContain('tok-warn')
    expect(chips()[0].title).toContain('3 of 9 have none')
  })
})

describe('clicking a chip', () => {
  it('sets a fallback, or leaves it out when empty, or removes the variable; the stored text follows', async () => {
    const onChange = vi.fn()
    await act(async () => { root.render(<RichText value="As {{job_title}} at {{company_name}}" onChange={onChange} tokens={['job_title']} />) })
    const job = (): HTMLElement => chips().find(c => c.dataset.tok === 'job_title')!
    await act(async () => { job().click() })
    const input = host.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'your role')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent === 'Save')!.click() })
    expect(onChange).toHaveBeenLastCalledWith('As {{job_title|your role}} at {{company_name}}')
    expect(job().textContent).toBe('Job title · or “your role”')

    await act(async () => { chips().find(c => c.dataset.tok === 'company_name')!.click() })
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent === 'Leave out if empty')!.click() })
    expect(onChange).toHaveBeenLastCalledWith('As {{job_title|your role}} at {{company_name|}}')

    await act(async () => { job().click() })
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent === 'Remove')!.click() })
    expect(onChange).toHaveBeenLastCalledWith('As  at {{company_name|}}')
  })
})

describe('a one-line field (subjects)', () => {
  it('shows chips, stores text, and keeps to one line', async () => {
    const onChange = vi.fn()
    await act(async () => { root.render(<TokenInput label="Subject" value="{{company_name}} - Intranet Discovery" onChange={onChange} />) })
    const box = host.querySelector<HTMLElement>('[aria-label="Subject"]')!
    expect(chips(box).map(c => c.textContent)).toEqual(['Company name'])
    expect(box.textContent).toBe('Company name - Intranet Discovery')
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => { box.dispatchEvent(enter) })
    expect(enter.defaultPrevented).toBe(true)
    await act(async () => { box.appendChild(document.createTextNode(' for {{first_name}}')); box.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(onChange).toHaveBeenLastCalledWith('{{company_name}} - Intranet Discovery for {{first_name}}')
  })

  it('typing {{ opens a picker that inserts the chosen variable', async () => {
    const onChange = vi.fn()
    await act(async () => { root.render(<TokenInput label="Subject" value="" onChange={onChange} />) })
    const box = host.querySelector<HTMLElement>('[aria-label="Subject"]')!
    const t = document.createTextNode('Hello {{comp')
    box.appendChild(t)
    const r = document.createRange()
    r.setStart(t, t.data.length)
    r.collapse(true)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(r)
    await act(async () => { box.dispatchEvent(new Event('input', { bubbles: true })) })
    const opts = [...host.querySelectorAll('[role="option"]')]
    expect(opts.map(o => o.textContent)).toEqual(['Company namee.g. Acme'])
    await act(async () => { opts[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) })
    expect(onChange).toHaveBeenLastCalledWith('Hello {{company_name}} '.replace(' ', ' '))
  })

  it('read-only text (step cards) shows chips too', async () => {
    await act(async () => { root.render(<p><TokenText text="Call — {{first_name}}" /></p>) })
    expect(host.textContent).toBe('Call — First name')
    expect(chips()).toHaveLength(1)
  })
})
