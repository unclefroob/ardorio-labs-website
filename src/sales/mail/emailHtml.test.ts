import { describe, expect, it } from 'vitest'
import { emailDoc, foldQuotes } from './emailHtml'

const body = (srcdoc: string): Document => new DOMParser().parseFromString(srcdoc, 'text/html')
const doc = (raw: string, images = false) => body(emailDoc(raw, images).srcdoc)

describe('email HTML is made safe before it is shown', () => {
  it('removes script, frames, forms, svg, meta refresh, base, link and embedded objects, keeping any harmless text inside', () => {
    const d = doc(`<p>Hi</p><script>alert(1)</script><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input name=x><button>Go</button></form>
      <svg onload="alert(1)"><script>alert(2)</script></svg><meta http-equiv="refresh" content="0;url=https://evil.test"><link rel=stylesheet href="https://evil.test/x.css">
      <object data="x"></object><embed src="x"><base href="https://evil.test/"><math><mi>x</mi></math><video src="v"></video><template><b>t</b></template>`)
    for (const t of ['script', 'iframe', 'form', 'input', 'button', 'svg', 'object', 'embed', 'math', 'video', 'template', 'link[rel="stylesheet"]']) expect(d.querySelectorAll(`body ${t}`)).toHaveLength(0)
    // The only meta and base left are the ones this module itself writes into the head.
    expect(d.querySelectorAll('meta[http-equiv]')).toHaveLength(1)
    expect(d.querySelector('meta[http-equiv]')?.getAttribute('http-equiv')).toBe('Content-Security-Policy')
    expect(d.querySelector('base')?.getAttribute('href')).toBeNull()
    expect(d.body.textContent).toContain('Hi')
  })

  it('removes every event handler and any attribute outside the allow-list', () => {
    const d = doc(`<div onclick="x()" onmouseover="x()" data-x="1" id="a" contenteditable="true" formaction="https://e.test" ping="https://e.test"><img src="data:image/png;base64,AAAA" onerror="x()" srcset="https://e.test/a.png 2x"><a href="https://ok.test" onfocus="x()">l</a></div>`)
    const all = [...d.body.querySelectorAll('*')]
    for (const el of all) for (const a of [...el.attributes]) expect(a.name).not.toMatch(/^on|^data-x$|^id$|contenteditable|formaction|ping|srcset/)
  })

  it('keeps only http, https, mailto and tel links, and opens them in a new tab without leaking the opener', () => {
    const d = doc(`<a href="javascript:alert(1)">a</a><a href="JaVaScRiPt:alert(1)">b</a><a href="data:text/html,<script>alert(1)</script>">c</a><a href="vbscript:x">d</a>
      <a href="https://ok.test/p">e</a><a href="mailto:a@b.test">f</a><a href="tel:+61400000000">g</a><a href="//evil.test">h</a>`)
    const hrefs = [...d.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs.filter(h => h && !/^(https?:|mailto:|tel:)/i.test(h))).toHaveLength(0) // nothing else keeps a destination, relative and protocol-relative included
    expect(hrefs).toEqual(expect.arrayContaining(['https://ok.test/p', 'mailto:a@b.test', 'tel:+61400000000']))
    for (const a of d.querySelectorAll('a[href]')) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
      expect(a.getAttribute('rel')).toContain('noreferrer')
    }
  })

  it('blocks remote images by default, counts them, and shows them only when asked, and only over https', () => {
    const raw = `<img src="https://track.test/p.gif" width=1 height=1><img src="http://insecure.test/a.png"><img src="cid:logo123"><img src="//proto.test/a.png"><img src="data:image/png;base64,iVBORw0KGgo=">`
    const off = emailDoc(raw, false)
    const d = body(off.srcdoc)
    // Two can be asked for (the https one and the protocol-relative one); an http: image and a cid: image are never shown, so are not offered.
    expect(off.blockedImages).toBe(2)
    expect([...d.querySelectorAll('img')].map(i => i.getAttribute('src')).filter(Boolean)).toEqual(['data:image/png;base64,iVBORw0KGgo='])
    const on = body(emailDoc(raw, true).srcdoc)
    expect([...on.querySelectorAll('img')].map(i => i.getAttribute('src')).filter(Boolean)).toEqual(['https://track.test/p.gif', 'https://proto.test/a.png', 'data:image/png;base64,iVBORw0KGgo='])
  })

  it('refuses a data: image that is not a plain raster image', () => {
    const d = doc(`<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+"><img src="data:text/html;base64,PHNjcmlwdD4=">`)
    expect([...d.querySelectorAll('img')].map(i => i.getAttribute('src')).filter(Boolean)).toEqual([])
  })

  it('removes CSS requests: @import and url() in style attributes and style blocks, unless the image was allowed and is https', () => {
    const raw = `<style>@import url(https://evil.test/x.css); .a{background:url(https://track.test/b.gif)} .b{background:url(http://x.test/b.gif)}</style><div style="background:url('https://track.test/c.gif');color:red" class="a">x</div><div style="width:expression(alert(1))">y</div>`
    const off = emailDoc(raw, false).srcdoc
    expect(off).not.toMatch(/@import/i)
    expect(off).not.toMatch(/track\.test|evil\.test|x\.test/)
    expect(off).not.toMatch(/expression\s*\(\s*alert/i)
    const on = emailDoc(raw, true).srcdoc
    expect(on).toContain('https://track.test/c.gif')
    expect(on).not.toContain('http://x.test')
    expect(on).not.toMatch(/@import/i)
  })

  it('writes a Content-Security-Policy first that refuses every request, with images only when allowed', () => {
    const off = emailDoc('<p>x</p>', false).srcdoc
    const on = emailDoc('<p>x</p>', true).srcdoc
    expect(off).toContain("default-src 'none'")
    expect(off).toContain("img-src data:;")
    expect(off).not.toMatch(/img-src[^;]*https:/)
    expect(on).toMatch(/img-src data: https:/)
    for (const s of [off, on]) {
      expect(s.indexOf('Content-Security-Policy')).toBeLessThan(s.indexOf('<body>'))
      expect(s).not.toMatch(/script-src|connect-src|frame-src|form-action \*/)
      expect(s).toContain('<base target="_blank">')
    }
  })

  it('a hostile email cannot close the body or the head and smuggle markup into the document around it', () => {
    const d = doc(`</body></html><script>alert(1)</script><meta http-equiv="Content-Security-Policy" content="default-src *"><style>`)
    expect(d.querySelectorAll('script')).toHaveLength(0)
    expect(d.querySelectorAll('meta[http-equiv]')).toHaveLength(1)
    expect(d.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("default-src 'none'")
  })

  it('keeps what makes an email readable: formatting, tables, colours and links', () => {
    const d = doc(`<table width="600" bgcolor="#eee"><tr><td align="center"><font color="red" face="Arial"><b>Bold</b> <i>it</i></font><br><a href="https://ok.test">link</a></td></tr></table><ul><li>one</li></ul><blockquote>q</blockquote>`)
    expect(d.querySelector('table')?.getAttribute('width')).toBe('600')
    expect(d.querySelector('font')?.getAttribute('color')).toBe('red')
    expect(d.querySelectorAll('li')).toHaveLength(1)
    expect(d.querySelector('b')?.textContent).toBe('Bold')
  })
})

describe('folding the quoted history of a reply', () => {
  const frame = (raw: string): Document => { const d = doc(raw); foldQuotes(d); return d }

  it('hides each top-level quote behind a button, and the button shows and hides it', () => {
    const d = frame(`<div>My reply</div><div class="gmail_quote">On Mon, Jo wrote:<blockquote class="gmail_quote">older <blockquote type="cite">oldest</blockquote></blockquote></div>`)
    const q = d.querySelector<HTMLElement>('div.gmail_quote')!
    const btn = d.querySelector<HTMLButtonElement>('.sos-trim')!
    expect(d.querySelectorAll('.sos-trim')).toHaveLength(1) // nested quotes do not get their own
    expect(q.style.display).toBe('none')
    btn.click()
    expect(q.style.display).toBe('')
    btn.click()
    expect(q.style.display).toBe('none')
  })

  it('leaves an email with no quote alone, and does not fold twice', () => {
    const d = frame('<p>Nothing quoted</p>')
    expect(d.querySelectorAll('.sos-trim')).toHaveLength(0)
    const e = frame('<blockquote type="cite">x</blockquote>')
    foldQuotes(e)
    expect(e.querySelectorAll('.sos-trim')).toHaveLength(1)
  })
})
