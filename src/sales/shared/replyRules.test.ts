import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, KINDS, ruleFor } from './replyRules'

describe('reply rules on the web', () => {
  it('a sequence\'s rule wins over the business\'s, which wins over the default', () => {
    expect(ruleFor('interested').then).toBe('task')
    expect(ruleFor('interested', undefined, { interested: { then: 'nothing' } }).then).toBe('nothing')
    expect(ruleFor('interested', { interested: { then: 'restart' } }, { interested: { then: 'nothing' } }).then).toBe('restart')
  })

  it('has a row for every kind with a default', () => {
    expect(KINDS.map(k => k.kind).sort()).toEqual(Object.keys(DEFAULT_RULES).sort())
  })

  // The server applies the rules; the web only shows them. They must agree.
  const apiDir = process.env.ARDORIO_API_DIR
  it.runIf(!!apiDir)('matches the API\'s defaults exactly', () => {
    const src = readFileSync(join(apiDir!, 'src/services/sales/engine/replyRules.ts'), 'utf8')
    const block = src.slice(src.indexOf('export const DEFAULT_RULES'), src.indexOf('\n}\n', src.indexOf('export const DEFAULT_RULES')) + 2)
    const web = readFileSync(join(__dirname, 'replyRules.ts'), 'utf8')
    const mine = web.slice(web.indexOf('export const DEFAULT_RULES'), web.indexOf('\n}\n', web.indexOf('export const DEFAULT_RULES')) + 2)
    expect(mine).toBe(block)
  })
})
