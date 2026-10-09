/** Route and saved-view queries are untyped JSON; read one value as a string, or '' when absent or the wrong type. */
export function qStr(q: Record<string, unknown> | undefined, key: string): string {
  const v = q?.[key]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

/** Only http(s) links from record data are rendered as anchors. */
export function safeHref(u: string | null | undefined): string | undefined {
  return u && /^https?:\/\//i.test(u) ? u : undefined
}
