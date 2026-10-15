/**
 * Plain-text email is usually wrapped by the sender's mail program at about 70-78 characters, so shown as it is each paragraph breaks mid-sentence.
 * This joins those lines back into paragraphs, and only when the text really is wrapped that way: several lines stop just short of one common
 * width. Blank lines, lists, quoted lines (>), indented lines, signatures and short lines keep their breaks. It changes only how the text is
 * shown, never what is stored.
 */
const NEW_BLOCK = /^(?:\s|[>*•\-–—+]|\d+[.)]\s|--\s*$|_{3,}|On .{0,200} wrote:|(?:From|Sent|To|Cc|Subject|Date):\s)/

export function reflowText(text: string): string {
  if (!text.includes('\n')) return text
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const lens = lines.map(l => l.length).filter(n => n > 0)
  if (lens.length < 3) return text
  const max = Math.max(...lens)
  // Hard-wrapped text has a ragged edge against one width: at least two lines end within a few characters of the longest.
  // Mail programs wrap at 60-78 characters: shorter text (a poem, a list of names) is short lines on purpose.
  if (max < 50 || max > 100 || lens.filter(n => n >= max - 6).length < 2) return text
  const out: string[] = []
  let cur: string | null = null
  let lastLen = 0 // the length of the last line joined into `cur` as it was written, not of the joined whole
  for (const line of lines) {
    if (cur === null) { cur = line; lastLen = line.length; continue }
    const join = cur.trim() !== '' && line.trim() !== '' && lastLen >= max - 12 && !cur.startsWith('>') && !NEW_BLOCK.test(line)
    if (join) {
      cur = cur.replace(/\s+$/, '') + ' ' + line.replace(/^\s+/, '')
      lastLen = line.length
    } else {
      out.push(cur)
      cur = line
      lastLen = line.length
    }
  }
  if (cur !== null) out.push(cur)
  return out.join('\n')
}
