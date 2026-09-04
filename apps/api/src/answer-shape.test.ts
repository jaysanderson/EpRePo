import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  corpusDecline,
  forwardableSlice,
  looksLikeProviderDecline,
  referenceBlockStart,
  rewriteSentinels,
  SentinelStream,
  stripModelReferences,
} from './answer-shape.ts'

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

  it('strips a trailing bracketed reference list that has no heading', () => {
    const text = 'ATL gave 30% seizure freedom at 25 years [1].\n\n' +
      '[1] Extended follow-up after anterior temporal lobectomy.\n' +
      '[2] Stereo-electroencephalography-guided thermocoagulation: a review.'
    expect(stripModelReferences(text)).toBe('ATL gave 30% seizure freedom at 25 years [1].')
    // Streaming: the first bracketed line holds the stream at the paragraph end.
    const partial = 'ATL gave 30% seizure freedom at 25 years [1].\n\n[1] Extended follow-up'
    expect(forwardableSlice(0, partial)).toEqual({
      text: 'ATL gave 30% seizure freedom at 25 years [1].',
      stop: true,
    })
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

describe('rewriteSentinels', () => {
  it('turns "the context" into "the cited sources" with plural agreement', () => {
    expect(rewriteSentinels('The context does not provide a rate.')).toBe(
      'The cited sources do not provide a rate.',
    )
    expect(rewriteSentinels('The provided context indicates a 5% rate.')).toBe(
      'The cited sources indicate a 5% rate.',
    )
    expect(rewriteSentinels('This is an inference rather than a claim from the context [3].'))
      .toBe('This is an inference rather than a claim from the cited sources [3].')
    expect(rewriteSentinels('The context is limited.')).toBe('The cited sources are limited.')
  })

  it('drops the guardrail sentence and the prompt coverage line, keeping the answer', () => {
    expect(
      rewriteSentinels(
        'Seizure freedom was 76% at 12 months [1].\n\nNot enough data to answer this fully.',
      ),
    ).toBe('Seizure freedom was 76% at 12 months [1].')
    expect(
      rewriteSentinels(
        "The paper reports a mean of 12.0 months. If you need more information, the portal's sources do not cover it.",
      ),
    ).toBe('The paper reports a mean of 12.0 months.')
    expect(rewriteSentinels('Therefore, "Not enough data to answer this."')).toBe('Therefore,')
  })

  it('is empty when the text was nothing but the template', () => {
    expect(rewriteSentinels('Not enough data to answer this.')).toBe('')
  })

  it('normalises the bracketed inference marker to the styled hedge', () => {
    expect(rewriteSentinels('Likely benign [inference].')).toBe('Likely benign (inference).')
  })

  it('leaves ordinary uses of the word alone', () => {
    const text = 'In the clinical context of Dravet syndrome, avoid sodium channel blockers.'
    expect(rewriteSentinels(text)).toBe(text)
  })
})

describe('SentinelStream', () => {
  it('rewrites a phrase split across chunks and releases the rest at flush', () => {
    const stream = new SentinelStream()
    const out = [
      stream.push('Rates were 5%. The con'),
      stream.push('text does not report driving. Not enough data'),
      stream.push(' to answer this.'),
      stream.flush(),
    ].join('')
    expect(out.trim()).toBe('Rates were 5%. The cited sources do not report driving.')
  })

  it('streams whole sentences as soon as the next one has started', () => {
    const stream = new SentinelStream()
    expect(stream.push('First sentence. Second')).toBe('First sentence. ')
    expect(stream.push(' sentence.')).toBe('')
    expect(stream.flush()).toBe('Second sentence.')
  })
})

describe('decline copy', () => {
  it('names the nearest matches and the match strength', () => {
    const text = corpusDecline(['A first paper', 'A second paper'], 21)
    expect(text).toContain('best match 21%')
    expect(text).toContain('*A first paper* and *A second paper* - listed below but not used')
    expect(corpusDecline([])).not.toContain('closest matches')
  })

  it('recognises the provider decline strings so the handler can hold them', () => {
    expect(
      looksLikeProviderDecline("This portal's content does not hold enough relevant material"),
    ).toBe(true)
    expect(looksLikeProviderDecline('Seizure freedom was 76%.')).toBe(false)
  })
})
