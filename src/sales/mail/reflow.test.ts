import { describe, expect, it } from 'vitest'
import { reflowText } from './reflow'

// The wrapped text of a real reply, as Gmail hands it over (wrapped near 66 characters).
const WRAPPED = [
  'Hi Ryan,',
  'Hope you are well.',
  '',
  'I am trying to manually add the staff timesheets for this week; I',
  'am having an issue with the staff doing double shift in different',
  'areas.',
  '',
  'Anmol has work as Cantina chef on the 29th in the morning and',
  'later as Boardwalk chef with 30min break. I need to add the 2',
  'shifts as separate ones, but I can\'t do it.',
  '',
  'Can you please verify this for me?',
  'Thank you',
  '',
  'Kind Regards,',
  'Alice B.',
  'Operations Manager',
].join('\n')

describe('putting hard-wrapped plain text back into paragraphs', () => {
  it('joins wrapped lines into paragraphs and keeps greetings, short lines and the signature as they are', () => {
    expect(reflowText(WRAPPED)).toBe([
      'Hi Ryan,',
      'Hope you are well.',
      '',
      'I am trying to manually add the staff timesheets for this week; I am having an issue with the staff doing double shift in different areas.',
      '',
      'Anmol has work as Cantina chef on the 29th in the morning and later as Boardwalk chef with 30min break. I need to add the 2 shifts as separate ones, but I can\'t do it.',
      '',
      'Can you please verify this for me?',
      'Thank you',
      '',
      'Kind Regards,',
      'Alice B.',
      'Operations Manager',
    ].join('\n'))
  })

  it('does not swallow a signature that directly follows a paragraph\'s short last line', () => {
    const t = ['This is a long line of text that was wrapped by the sending mail program, so it', 'ends here.', 'Thanks,', 'Alice', 'a long enough line to be at the wrapping width, so a next line might be joined x', 'y'].join('\n')
    expect(reflowText(t).split('\n').slice(0, 3)).toEqual([
      'This is a long line of text that was wrapped by the sending mail program, so it ends here.', 'Thanks,', 'Alice',
    ])
  })

  it('leaves quoted lines, lists, indented lines and attribution lines alone', () => {
    const t = [
      'This is a long line of text that was wrapped by the sending mail program, so it',
      'continues here and ends.',
      '',
      'On Mon, 5 Oct 2026 at 9:00 am, Jo Park <jo@acme.test> wrote:',
      '> This is a long line of text that was wrapped by the sending mail program, so it',
      '> continues here and ends.',
      '',
      '- first item that is long enough to look like it was wrapped by a mail program ok',
      '- second item',
      '    indented code that is long enough to look like it was wrapped by a mail prog',
      '    next indented line',
    ].join('\n')
    const out = reflowText(t).split('\n')
    expect(out[0]).toBe('This is a long line of text that was wrapped by the sending mail program, so it continues here and ends.')
    expect(out).toContain('> This is a long line of text that was wrapped by the sending mail program, so it')
    expect(out).toContain('> continues here and ends.')
    expect(out).toContain('- second item')
    expect(out).toContain('    next indented line')
  })

  it('leaves text that is not hard-wrapped untouched: short lines, one long line, or lines of very different lengths', () => {
    const poem = 'Roses are red\nViolets are blue\nSugar is sweet\nAnd so are you'
    expect(reflowText(poem)).toBe(poem)
    const one = 'A single long paragraph with no line breaks at all, however long it is, stays exactly as it is.'
    expect(reflowText(one)).toBe(one)
    const ragged = ['Short', 'A much longer line than the others in this text, going on and on and on and on', 'Mid length line here', 'Tiny'].join('\n')
    expect(reflowText(ragged)).toBe(ragged)
  })

  it('does not reflow very long lines (already flowing text), and handles CRLF and empty input', () => {
    const flowing = ['x'.repeat(150), 'y'.repeat(149), 'z'.repeat(150)].join('\n')
    expect(reflowText(flowing)).toBe(flowing)
    expect(reflowText('')).toBe('')
    expect(reflowText(WRAPPED.replace(/\n/g, '\r\n'))).toBe(reflowText(WRAPPED))
  })
})
