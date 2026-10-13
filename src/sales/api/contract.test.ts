/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The web contract mirrors the API's. This reads the source text of the external-invoice / recorded-won block.
const HEAD = '// ---- Recorded won deals and external invoices ----'
const TAIL = "// SalesErrorCode gains: 'DUPLICATE_EXTERNAL_REFERENCE'"

/** The block from its heading to its last line, inclusive. */
function block(src: string): string {
  const lines = src.split('\n')
  const s = lines.indexOf(HEAD)
  const e = lines.findIndex((l, i) => i > s && l.startsWith(TAIL))
  if (s < 0 || e < 0) throw new Error('block not found')
  return lines.slice(s, e + 1).join('\n')
}

const web = readFileSync(join(process.cwd(), 'src/sales/api/contract.ts'), 'utf8')
// Set ARDORIO_API_DIR to an API checkout to compare against it; without it, only the web text is checked.
const apiDir = process.env.ARDORIO_API_DIR
const apiFile = apiDir ? join(apiDir, 'src/services/sales/contract.ts') : ''

describe('Contract: recorded won deals and external invoices', () => {
  it('carries the API rules the web now follows', () => {
    const b = block(web)
    expect(b).toContain('paidAmountCents may be\n// omitted (it is then subtotal + GST) and, when given, must equal subtotalCents + gstCents, else 400 VALIDATION on\n// paidAmountCents.')
    expect(b).toContain("{ field: 'companyId', clientSlugs, needsBillingLink: true }: link the right one first.")
    expect(b).toContain('Restoring a deleted deal (resurrect) keeps its stored stamps')
  })

  it.skipIf(!apiFile || !existsSync(apiFile))('is identical to the API block', () => {
    expect(block(web)).toBe(block(readFileSync(apiFile, 'utf8')))
  })
})

// The revenue report block: from its heading to the goal metrics line.
function revenueBlock(src: string): string {
  const lines = src.split('\n')
  const s = lines.indexOf('// ---- Ardorio revenue report ----')
  const e = lines.findIndex((l, i) => i > s && l.startsWith('// Goal metrics gain:'))
  if (s < 0 || e < 0) throw new Error('revenue block not found')
  return lines.slice(s, e + 1).join('\n')
}

describe('Contract: Ardorio revenue report', () => {
  it('carries the agreed route and rules', () => {
    const b = revenueBlock(web)
    expect(b).toContain('// GET /sales/reports/revenue?business=ard&from=YYYY-MM-DD&to=YYYY-MM-DD&source=all|salesos|external -> RevenueReport (ard admins or super only).')
    expect(b).toContain("export type RevenueSourceFilter = 'all' | 'salesos' | 'external'")
    expect(b).toContain("'won_value' (dollars: per deal won in the period, the contract baseline frozen at won, else deal.value), 'invoiced_cents', 'collected_cents'")
  })

  it.skipIf(!apiFile || !existsSync(apiFile))('is identical to the API block', () => {
    expect(revenueBlock(web)).toBe(revenueBlock(readFileSync(apiFile, 'utf8')))
  })
})
