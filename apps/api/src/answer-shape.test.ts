import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { forwardableSlice, referenceBlockStart, stripModelReferences } from './answer-shape.ts'

describe('stripModelReferences', () => {
  it('removes a trailing model-authored reference list and the rule above it', () => {
    const text =
      'ATL is effective [1].\n\n---\n\n**References:**\n1. Study on LITT efficacy at 12 months.\n2. Study on ATL long-term efficacy.'
    expect(stripModelReferences(text)).toBe('ATL is effective [1].')
  })

  it('handles a markdown heading and bracketed entries', () => {
    const text = 'Body.\n\n### Sources\n[1] ViEEG paper\n[2] Network models'
    expect(stripModelReferences(text)).toBe('Body.')
  })

  it('leaves prose that merely mentions sources alone', () => {
    const text = 'The sources: three cohorts and one trial, all cited above.'
    expect(referenceBlockStart(text)).toBe(-1)
    expect(stripModelReferences(text)).toBe(text)
  })

  it('leaves a heading followed by prose alone', () => {
    const text = 'Body.\n\n## References\nThese come from the corpus and are listed in the panel.'
    expect(stripModelReferences(text)).toBe(text)
  })

  it('forwards a stream up to the heading, then stops', () => {
    const full = 'Answer text.\n\n**References:**\n1. one'
    const first = forwardableSlice(0, 'Answer text.')
    expect(first).toEqual({ text: 'Answer text.', stop: false })
    const second = forwardableSlice('Answer text.'.length, full)
    expect(second.stop).toBe(true)
    expect(second.text).toBe('')
    const third = forwardableSlice(0, full)
    expect(third).toEqual({ text: 'Answer text.', stop: true })
  })
})
