// Lists SalesOS stubs that have not been replaced by a ported module. Exits 1 while any remain.
// Not part of `npm run build`: the build must pass while the port is in progress.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../src/sales', import.meta.url).pathname
const MARKER = 'SALESOS-STUB'
const found = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(name) && readFileSync(p, 'utf8').includes(MARKER)) found.push(relative(ROOT, p))
  }
}

walk(ROOT)
if (found.length) {
  console.error(`${found.length} SalesOS stub(s) remain:\n  ${found.sort().join('\n  ')}`)
  process.exit(1)
}
console.log('No SalesOS stubs remain.')
