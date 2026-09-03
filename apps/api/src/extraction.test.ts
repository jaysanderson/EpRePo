import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  chooseMethod,
  classify,
  dictionaryHitRate,
  profileFromText,
  tableRowCount,
} from './extraction.ts'

const prose =
  'The propensity for seizures to follow circadian and multiday rhythms has been documented for centuries. '
const garbled = 'DEEAimOiNT C? FISIESISS AI PAUK xkqzv bbbb ptkr mnfjkl '

describe('profiling', () => {
  it('judges plausible words and table rows', () => {
    expect(dictionaryHitRate(prose.repeat(3))).toBeGreaterThan(0.9)
    expect(dictionaryHitRate(garbled.repeat(3))).toBeLessThan(0.6)
    expect(tableRowCount('| a | b |\n|---|---|\n| 1 | 2 |\nHR 0.54  0.31  0.92\nplain text')).toBe(
      3,
    )
  })

  it('classifies by thresholds', () => {
    const base = {
      pages: 10,
      imageOnlyPages: 0,
      tableRowsPerPage: 1,
      dictionaryHitRate: 0.95,
      charsPerPage: 3000,
    }
    expect(classify(base)).toBe('prose')
    expect(classify({ ...base, tableRowsPerPage: 12 })).toBe('tables')
    expect(classify({ ...base, dictionaryHitRate: 0.4 })).toBe('garbled-text')
    expect(classify({ ...base, charsPerPage: 40 })).toBe('image-only')
    expect(classify({ ...base, charsPerPage: 40, pages: 125 })).toBe('long-scan')
  })

  it('profiles page-broken text', () => {
    const p = profileFromText({
      text: `${prose.repeat(20)}\f${prose.repeat(20)}\f  `,
      bytes: 1000,
      source: 'poppler',
    })
    expect(p.pages).toBe(3)
    expect(p.imageOnlyPages).toBe(1)
    expect(p.class).toBe('prose')
  })

  it('routes by class, honouring the visual page cap', () => {
    const methods = [
      { id: 'default', name: 'Default', kind: 'default' as const },
      { id: 'v1', name: 'visual', kind: 'visual' as const },
      { id: 't1', name: 'tables', kind: 'tables' as const },
    ]
    const rules = {
      default: 'default',
      rules: [{ when: 'image-only' as const, method: 'v1' }, {
        when: 'tables' as const,
        method: 't1',
      }],
      visualPageCap: 60,
    }
    const p = profileFromText({ text: 'x', pages: 5, bytes: 1, source: 'platform' })
    expect(chooseMethod(rules, { ...p, class: 'image-only' }, methods)).toBe('v1')
    expect(chooseMethod(rules, { ...p, class: 'image-only', pages: 120 }, methods)).toBe('default')
    expect(chooseMethod(rules, { ...p, class: 'tables' }, methods)).toBe('t1')
    expect(chooseMethod(undefined, p, methods)).toBe('default')
  })
})
