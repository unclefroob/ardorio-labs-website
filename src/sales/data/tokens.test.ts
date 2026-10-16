import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTokens, renderTokens, suggestToken, TOKEN_DEFS, tokenise, unknownTokens } from './tokens'

// The variable list and its rules are the API's (engine/tokens.ts); this copy must say exactly the same.
const apiDir = process.env.ARDORIO_API_DIR
const apiFile = apiDir ? join(apiDir, 'src/services/sales/engine/tokens.ts') : ''
const defsBlock = (src: string): string => {
  const s = src.indexOf('export const TOKEN_DEFS = [')
  return src.slice(s, src.indexOf('] as const', s) + '] as const'.length)
}

describe('the variable list', () => {
  it.skipIf(!apiFile || !existsSync(apiFile))('is identical to the API\'s, so the picker never offers what the server cannot fill', () => {
    const here = readFileSync(join(process.cwd(), 'src/sales/data/tokens.ts'), 'utf8')
    expect(defsBlock(here)).toBe(defsBlock(readFileSync(apiFile, 'utf8')))
    expect(TOKEN_DEFS.length).toBe(8)
  })
})

describe('reading and filling variables', () => {
  it('reads {{key}} and {{key|fallback}}, spaces allowed', () => {
    expect(parseTokens('Hi {{ first_name | there }} at {{company_name}}{{job_title|}}')).toEqual([
      { key: 'first_name', fallback: 'there', source: '{{ first_name | there }}' },
      { key: 'company_name', source: '{{company_name}}' },
      { key: 'job_title', fallback: '', source: '{{job_title|}}' },
    ])
  })

  it('fills values, uses a fallback when empty, leaves missing ones and reports unknown ones (as the server does)', () => {
    const r = renderTokens('Hi {{first_name|there}}, {{job_title}} at {{company_name}} {{firstname}}', { first_name: '', company_name: 'Acme' })
    expect(r.text).toBe('Hi there, {{job_title}} at Acme {{firstname}}')
    expect(r.missing).toEqual(['job_title', 'firstname'])
    expect(r.unknown).toEqual(['firstname'])
  })

  it('spots misspelt variables and suggests what was meant', () => {
    expect(unknownTokens('{{first_name}} {{firstname}} {{comapny_name|x}}')).toEqual(['firstname', 'comapny_name'])
    expect(suggestToken('firstname')?.key).toBe('first_name')
    expect(suggestToken('comapny_name')?.key).toBe('company_name')
    expect(suggestToken('zzzzzz')).toBeUndefined()
  })
})

describe('turning a draft back into a template', () => {
  const pairs: Array<[string | undefined, string]> = [['Sam', 'first_name'], ['Samsung', 'company_name'], ['Sam Lee', 'sender_name']]
  it('replaces whole words only, longest first, and never inside an existing variable', () => {
    expect(tokenise('Hi Sam, Samsung is great. Thanks, Sam Lee', pairs)).toBe('Hi {{first_name}}, {{company_name}} is great. Thanks, {{sender_name}}')
    expect(tokenise('Samantha {{first_name}}', pairs)).toBe('Samantha {{first_name}}')
  })
  it('leaves one-letter values alone', () => {
    expect(tokenise('A note from A', [['A', 'first_name']])).toBe('A note from A')
  })
})
