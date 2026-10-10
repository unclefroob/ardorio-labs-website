import { act } from 'react'

/** Set an input's value the way a person typing would, so React's onChange runs. */
export async function type(el: Element | null, value: string): Promise<void> {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) throw new Error('not a field')
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype
  const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  await act(async () => {
    set?.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

export async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click')
  await act(async () => { (el as HTMLElement).click() })
}

export const button = (root: ParentNode, text: string | RegExp): HTMLButtonElement | undefined =>
  [...root.querySelectorAll('button')].find(b => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? '')))

/** The control a label points at. */
export function field(root: ParentNode, label: string): HTMLInputElement | HTMLSelectElement | null {
  const l = [...root.querySelectorAll('label')].find(x => x.textContent?.replace(/\s*\*$/, '').trim() === label)
  const id = l?.getAttribute('for')
  return id ? root.querySelector<HTMLInputElement | HTMLSelectElement>(`[id="${id}"]`) : null
}

/** Let pending promises and effects settle. */
export async function settle(n = 3): Promise<void> {
  for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve() })
}
