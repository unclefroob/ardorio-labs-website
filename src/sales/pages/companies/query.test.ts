import { describe, expect, it } from 'vitest'
import { safeHref } from './query'

describe('safeHref', () => {
  it('passes http and https links through unchanged', () => {
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeHref('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM')
  })

  it.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd',
    'ftp://example.com', 'mailto:a@b.com', '//example.com', 'example.com', ' https://example.com', '',
  ])('refuses %j', input => {
    expect(safeHref(input)).toBeUndefined()
  })

  it('refuses missing values', () => {
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref(null)).toBeUndefined()
  })
})
