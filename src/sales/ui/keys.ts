import { UI } from './store'

// Single-key shortcuts (no Ctrl/Cmd/Alt). They never fire while someone is typing, or over a dialog or the command palette, so a
// letter in a reply or a search box is only ever a letter.

/** Someone is typing here: a text field, a select, or an editable area (the email editors). */
export function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true' || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''))
}

/** Whether a keydown is a free single-key shortcut press: no modifiers, not typing, nothing on top, not a held-down repeat. */
export function plainKey(e: KeyboardEvent): boolean {
  const ui = UI.get()
  return !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e.target) && !ui.modals.length && !ui.palette
}

/** The app's single-key shortcuts, in one place, so the keys shown on buttons and the keys listened for cannot drift apart. */
export const KEYS = {
  sidebar: '[',
  needsReply: 'd',
} as const
