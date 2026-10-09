import { now as clockNow } from './clock'

const p2 = (n: number): string => String(n).padStart(2, '0')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function d(s: string | Date): Date
function d(s: string | Date | null | undefined): Date | null
function d(s: string | Date | null | undefined): Date | null {
  if (!s) return null
  if (s instanceof Date) return s
  const [a, b] = s.split('T')
  const [y, m, day] = a.split('-').map(Number)
  const [h, mi] = (b || '00:00').split(':').map(Number)
  return new Date(y, m - 1, day, h || 0, mi || 0)
}

function iso(date: Date): string {
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}T${p2(date.getHours())}:${p2(date.getMinutes())}`
}

function nowDate(): Date {
  return new Date(clockNow())
}

function nowIso(): string {
  return iso(nowDate())
}

function addDays(s: string, n: number): string {
  const x = d(s)
  x.setDate(x.getDate() + n)
  return iso(x)
}

function addHours(s: string, n: number): string {
  const x = d(s)
  x.setTime(x.getTime() + n * 36e5)
  return iso(x)
}

function days(a: string, b: string): number {
  return Math.round((d(b).getTime() - d(a).getTime()) / 864e5)
}

function time(s: string): string {
  const x = d(s)
  let h = x.getHours()
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${p2(x.getMinutes())} ${ap}`
}

function date(s: string | null | undefined): string {
  if (!s) return '—'
  const x = d(s)
  return `${x.getDate()} ${MONTHS[x.getMonth()]}${x.getFullYear() !== nowDate().getFullYear() ? ' ' + x.getFullYear() : ''}`
}

function rel(s: string | null | undefined): string {
  if (!s) return '—'
  const n = nowDate()
  const x = d(s)
  const sd = (v: Date) => new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime()
  const dd = Math.round((sd(x) - sd(n)) / 864e5)
  if (dd === 0) {
    const m = Math.round((x.getTime() - n.getTime()) / 6e4)
    if (Math.abs(m) < 60) return m >= 0 ? `in ${m}m` : `${Math.abs(m)}m ago`
    return `Today ${time(s)}`
  }
  if (dd === -1) return 'Yesterday'
  if (dd === 1) return 'Tomorrow'
  return dd < 0 ? `${-dd}d ago` : `in ${dd}d`
}

function money(n: number | null | undefined, compact?: boolean | number): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (compact) {
    const a = Math.abs(n)
    if (a >= 1e6) return 'A$' + (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'
    if (a >= 1e3) return 'A$' + (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k'
  }
  return 'A$' + Math.round(n).toLocaleString('en-AU')
}

function esc(s: unknown): string {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

const SAFE_TAGS = new Set(['br', 'p', 'div', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'span'])

/**
 * Message bodies are rendered as HTML. Inbound email is untrusted, so only a fixed set of
 * attribute-less formatting tags survives; everything else is escaped to visible text.
 */
function body(s: string | null | undefined): string {
  const v = s || ''
  if (!/<\w/.test(v)) return esc(v).replace(/\n/g, '<br>')
  return v.replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)\b[^>]*>|[&<>"]/g, (m, slash: string | undefined, tag: string | undefined) => {
    if (tag !== undefined) {
      const t = tag.toLowerCase()
      return SAFE_TAGS.has(t) ? `<${slash ?? ''}${t}>` : esc(m)
    }
    return m === '&' ? m : esc(m)
  })
}

function plain(s: unknown): string {
  return String(s || '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|div|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export const F = {
  d,
  iso,
  now: nowDate,
  nowIso,
  today: (): string => nowIso().slice(0, 10),
  addDays,
  addHours,
  days,
  M: MONTHS,
  W: WEEKDAYS,
  date,
  time,
  dt: (s: string | null | undefined): string => (s ? `${date(s)}, ${time(s)}` : '—'),
  long(s: string): string {
    const x = d(s)
    return `${WEEKDAYS[x.getDay()]}day, ${x.getDate()} ${MONTHS_LONG[x.getMonth()]} ${x.getFullYear()}`
  },
  rel,
  money,
  num: (n: number | null | undefined): string => (n == null ? '—' : Math.round(n).toLocaleString('en-AU')),
  pct: (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? '—' : Math.round(n * 100) + '%'),
  ini: (n: string | null | undefined): string =>
    (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase(),
  weekStart(s?: string): string {
    const x = d(s || nowIso())
    const w = (x.getDay() + 6) % 7
    x.setDate(x.getDate() - w)
    x.setHours(0, 0, 0, 0)
    return iso(x)
  },
  esc,
  body,
  plain,
}
