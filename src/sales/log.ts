/** Failures that are handled in the UI but must never vanish silently. */
export function logSales(scope: string, detail: unknown): void {
  console.warn(`[sales:${scope}]`, detail)
}
