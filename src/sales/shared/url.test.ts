import { describe, expect, it } from 'vitest'
import { cleanLinkPatch, isHttpUrl, normaliseUrl, urlOrEmpty } from './url'

describe('normaliseUrl', () => {
  it('allows empty and whitespace-only values and keeps them empty', () => {
    expect(normaliseUrl('')).toEqual({ ok: true, value: '' })
    expect(normaliseUrl('   ')).toEqual({ ok: true, value: '' })
    expect(normaliseUrl(undefined)).toEqual({ ok: true, value: '' })
    expect(normaliseUrl(null)).toEqual({ ok: true, value: '' })
  })

  it('trims and prefixes https:// when no scheme was typed', () => {
    expect(normaliseUrl('  company.com.au  ')).toEqual({ ok: true, value: 'https://company.com.au' })
    expect(normaliseUrl('linkedin.com/in/jane-doe')).toEqual({ ok: true, value: 'https://linkedin.com/in/jane-doe' })
    expect(normaliseUrl('www.example.com/a?b=1')).toEqual({ ok: true, value: 'https://www.example.com/a?b=1' })
    expect(normaliseUrl('//example.com')).toEqual({ ok: true, value: 'https://example.com' })
  })

  it('keeps an existing http or https scheme untouched, whatever the case', () => {
    expect(normaliseUrl('http://example.com')).toEqual({ ok: true, value: 'http://example.com' })
    expect(normaliseUrl('https://example.com/x')).toEqual({ ok: true, value: 'https://example.com/x' })
    expect(normaliseUrl('HTTPS://Example.com')).toEqual({ ok: true, value: 'HTTPS://Example.com' })
  })

  it('treats a host with a port as having no scheme', () => {
    expect(normaliseUrl('example.com:8080/path')).toEqual({ ok: true, value: 'https://example.com:8080/path' })
    expect(normaliseUrl('localhost:3000')).toEqual({ ok: true, value: 'https://localhost:3000' })
  })

  it.each(['javascript:alert(1)', 'ftp://example.com', 'mailto:a@b.com', 'data:text/html,hi', 'file:///etc/passwd'])(
    'rejects the non-http scheme in %s',
    input => {
      const r = normaliseUrl(input)
      expect(r.ok).toBe(false)
    },
  )

  it.each(['not a url', 'https://', 'http://exa mple.com', 'https://bad host.com'])('rejects %s', input => {
    expect(normaliseUrl(input).ok).toBe(false)
  })

  it('names what was being entered in the error', () => {
    const r = normaliseUrl('nope nope', 'LinkedIn URL')
    expect(r).toEqual({ ok: false, error: 'Enter a valid LinkedIn URL, for example https://company.com.au' })
  })

  it('only ever returns a value the server rule accepts', () => {
    for (const input of ['a.com', 'http://a.com', 'x.y/z', 'https://a.com:81']) {
      const r = normaliseUrl(input)
      expect(r.ok && isHttpUrl(r.value)).toBe(true)
    }
  })
})

describe('isHttpUrl', () => {
  it('accepts only URLs that parse with an http or https protocol', () => {
    expect(isHttpUrl('http://a.com')).toBe(true)
    expect(isHttpUrl('https://a.com')).toBe(true)
    expect(isHttpUrl('a.com')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
  })
})

describe('urlOrEmpty and cleanLinkPatch', () => {
  it('urlOrEmpty returns the normalised link or empty', () => {
    expect(urlOrEmpty('a.com')).toBe('https://a.com')
    expect(urlOrEmpty('javascript:alert(1)')).toBe('')
    expect(urlOrEmpty(undefined)).toBe('')
  })

  it('cleanLinkPatch normalises good links, drops unsendable ones and leaves other keys alone', () => {
    expect(cleanLinkPatch({ website: ' a.com ', linkedin: 'javascript:alert(1)', name: 'x' })).toEqual({ website: 'https://a.com', name: 'x' })
    expect(cleanLinkPatch({ website: '' })).toEqual({ website: '' })
    expect(cleanLinkPatch({ name: 'x', website: undefined })).toEqual({ name: 'x', website: undefined })
  })
})

describe('isHttpUrl matches the server rule', () => {
  it('rejects credentials, inner whitespace, backslashes and over-long links', () => {
    expect(isHttpUrl('https://user:pw@example.com')).toBe(false)
    expect(isHttpUrl('https://exa mple.com')).toBe(false)
    expect(isHttpUrl('https://example.com\\path')).toBe(false)
    expect(isHttpUrl('https://example.com/' + 'a'.repeat(2048))).toBe(false)
  })
  it('still accepts ordinary and uppercase-scheme links', () => {
    expect(isHttpUrl('https://example.com/a?b=1')).toBe(true)
    expect(isHttpUrl('HTTP://Example.com')).toBe(true)
  })
})
