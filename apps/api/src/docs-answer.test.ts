import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { DocsSentinelStream, rewriteDocsSentinels } from './docs-answer.ts'

// The Help answer Professor D'Souza saw in loop 2 (D2-18), verbatim.
const LEAKED = 'Not enough data to answer this. \n\nThe provided context mentions exporting ' +
  'sessions and synthesis as Word-compatible documents, but does not specify exporting ' +
  'answers as PDFs. You might want to check the "Export" section in the portal for more options.'

describe('rewriteDocsSentinels', () => {
  it('drops the guardrail sentence and names the documentation, not a context', () => {
    expect(rewriteDocsSentinels(LEAKED)).toBe(
      'The documentation mentions exporting sessions and synthesis as Word-compatible ' +
        'documents, but does not specify exporting answers as PDFs. You might want to check ' +
        'the "Export" section in the portal for more options.',
    )
  })

  it('rewrites every form of the noun, keeping singular verbs', () => {
    expect(rewriteDocsSentinels('The context does not describe watches.')).toBe(
      'The documentation does not describe watches.',
    )
    expect(rewriteDocsSentinels('Based on the given context, Export is on the session.')).toBe(
      'Based on the documentation, Export is on the session.',
    )
    expect(rewriteDocsSentinels('This is in the help documentation provided.')).toBe(
      'This is in the documentation.',
    )
  })

  it('leaves an answer that names the documentation untouched', () => {
    const clean = 'Open Generate and choose Export to PDF; the documentation describes it.[1]'
    expect(rewriteDocsSentinels(clean)).toBe(clean)
  })

  it('returns an empty string when the text was only the template', () => {
    expect(rewriteDocsSentinels('Not enough data to answer this.')).toBe('')
  })
})

describe('DocsSentinelStream', () => {
  it('scrubs a template sentence split across chunks and releases the rest', () => {
    const stream = new DocsSentinelStream()
    const out: string[] = []
    for (
      const chunk of [
        'Not enough data',
        ' to answer this. \n\nThe provided',
        ' context',
        ' mentions exporting.',
        ' Word only.',
      ]
    ) {
      const text = stream.push(chunk)
      if (text) out.push(text)
    }
    const tail = stream.flush()
    if (tail) out.push(tail)
    expect(out.join('').trim()).toBe('The documentation mentions exporting. Word only.')
    expect(out.join('')).not.toContain('Not enough data')
    expect(out.join('')).not.toContain('provided context')
  })
})
