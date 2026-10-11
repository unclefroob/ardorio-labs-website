/**
 * Invoicing moved into SalesOS. /admin/invoices, /admin/invoices/new and /admin/invoices/:id keep working
 * for bookmarks by mapping onto the SalesOS pages. Only the three old shapes are mapped; anything else
 * under /admin/invoices/ is sent to the list rather than guessed at.
 */
export function salesInvoicePath(pathname: string, search = '', hash = ''): string {
  const m = /^\/admin\/invoices(?:\/([^/]+))?\/?$/.exec(pathname)
  const tail = m?.[1] ? `/${m[1]}` : ''
  return `/sales/invoices${tail}${search}${hash}`
}
