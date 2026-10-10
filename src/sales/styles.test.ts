/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// These read the source text. They keep the rules in place; they do not show how the page looks.
// Nothing here was checked in a browser.
const ROOT = join(process.cwd(), 'src/sales')
const css = readFileSync(join(ROOT, 'sales.css'), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(n) && !/\.test\.tsx?$/.test(n) && n !== 'fonts.css') out.push(p)
  }
  return out
}

/** The rules inside the first `@media` block whose query contains `query`. */
function mediaBlock(query: string): string {
  const start = css.indexOf(`@media ${query}`)
  if (start < 0) throw new Error(`no @media ${query}`)
  let i = css.indexOf('{', start) + 1
  let depth = 1
  const from = i
  while (depth && i < css.length) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') depth--
    i++
  }
  return css.slice(from, i - 1)
}

describe('minimum text size', () => {
  it('no stylesheet rule sets text smaller than 12px', () => {
    const small = [...css.matchAll(/font-size:\s*([\d.]+)(px|rem|em)/g)].filter(m => (m[2] === 'px' ? +m[1] : +m[1] * 16) < 12).map(m => m[0])
    expect(small).toEqual([])
  })

  it('no component sets an inline pixel font size smaller than 12', () => {
    const bad: string[] = []
    for (const f of walk(ROOT)) {
      if (!f.endsWith('.tsx')) continue
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/fontSize:\s*['"]?(\d+(?:\.\d+)?)(?:px)?['"]?\s*[,}]/g)) if (+m[1] < 12) bad.push(`${f}: ${m[0]}`)
      for (const m of src.matchAll(/font-size=["'{]+(\d+(?:\.\d+)?)/g)) if (+m[1] < 12) bad.push(`${f}: ${m[0]}`)
    }
    expect(bad).toEqual([])
  })
})

describe('narrow inbox', () => {
  const narrow = mediaBlock('(max-width:900px){.sos .app')
  it('shows the list until a conversation is open, then only the reader', () => {
    expect(narrow).toContain('.sos .inbox .ib-r{display:none}')
    expect(narrow).toContain('.sos .inbox.has-sel .ib-m{display:none}')
    expect(narrow).toMatch(/\.sos \.inbox\.has-sel \.ib-r\{display:block/)
  })
})

describe('filter bars on touch and narrow screens', () => {
  const touch = mediaBlock('(max-width:900px),(pointer:coarse)')
  it('keeps every control at least 36px tall', () => {
    expect(touch).toMatch(/\.sos \.fbar \.inp[^{]*\{[^}]*min-height:(\d+)px/)
    const min = +(touch.match(/\.sos \.fbar \.inp[^{]*\{[^}]*min-height:(\d+)px/)?.[1] ?? 0)
    expect(min).toBeGreaterThanOrEqual(36)
    expect(touch).toMatch(/\.sos \.fbar \.btn[^{]*\{[^}]*min-height:/)
  })
})

describe('SalesOS styles stay out of the main site', () => {
  const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8')
  const salesFamilies = new Set([...read('src/sales/fonts.css').matchAll(/font-family:\s*'([^']+)'/g)].map(m => m[1]))

  it('declares font families the main site does not use', () => {
    const site = read('index.html') + read('tailwind.config.js') + read('src/index.css') + read('src/App.css')
    const siteFamilies = [...site.matchAll(/family=([A-Za-z+]+)/g)].map(m => m[1].replace(/\+/g, ' ')).concat([...site.matchAll(/'([A-Z][A-Za-z ]+)'/g)].map(m => m[1]))
    expect(siteFamilies.length).toBeGreaterThan(0)
    expect([...salesFamilies].filter(f => siteFamilies.includes(f))).toEqual([])
    expect(salesFamilies.size).toBeGreaterThan(0)
  })

  it('fonts.css contains only @font-face rules', () => {
    const rest = read('src/sales/fonts.css').replace(/\/\*.*?\*\//gs, '').replace(/@font-face\s*\{[^}]*\}/g, '').trim()
    expect(rest).toBe('')
  })

  it('every selector in sales.css is under .sos, and animation names carry the sos- prefix', () => {
    const flat = css.replace(/\/\*.*?\*\//gs, '')
    const loose: string[] = []
    const walkRules = (txt: string): void => {
      let i = 0
      while (i < txt.length) {
        const j = txt.indexOf('{', i)
        if (j < 0) break
        const sel = txt.slice(i, j).trim()
        let depth = 1
        let k = j + 1
        while (depth && k < txt.length) {
          if (txt[k] === '{') depth++
          else if (txt[k] === '}') depth--
          k++
        }
        const body = txt.slice(j + 1, k - 1)
        if (/^@(media|supports)/.test(sel)) walkRules(body)
        else if (/^@keyframes/.test(sel)) { if (!/^@keyframes sos-/.test(sel)) loose.push(sel) }
        else for (const part of sel.split(',')) if (!part.trim().startsWith('.sos')) loose.push(part.trim())
        i = k
      }
    }
    walkRules(flat)
    expect(loose).toEqual([])
  })
})
