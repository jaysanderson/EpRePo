/**
 * The per-answer audit as the page shows it: a badge that says what was
 * checked, and the inline marks on figures the cited passages do not carry.
 * The server does the checking (apps/api/src/answer-audit.ts); this only
 * turns its `audit` event into copy and a matcher for the answer text.
 */

export interface AnswerAudit {
  figuresChecked: number
  figuresUnsupported: string[]
  yearsUnsupported: string[]
  contraindicationsUnsupported: string[]
}

export type AuditTone = 'ok' | 'warn'

/** The badge copy for an audit, or null when there was nothing to check. */
export function auditBadge(audit: AnswerAudit | undefined): {
  label: string
  tone: AuditTone
  title: string
} | null {
  if (!audit) return null
  const unsupported = audit.figuresUnsupported.length + audit.yearsUnsupported.length
  const stripped = audit.contraindicationsUnsupported.length
  if (audit.figuresChecked === 0 && unsupported === 0 && stripped === 0) return null
  const checked = audit.figuresChecked === 1
    ? '1 figure checked'
    : `${audit.figuresChecked} figures checked`
  if (unsupported === 0 && stripped === 0) {
    return {
      label: checked,
      tone: 'ok',
      title: 'Every figure in this answer was found beside its claim in a cited passage.',
    }
  }
  const parts: string[] = []
  if (unsupported > 0) {
    parts.push(
      `${unsupported} of ${audit.figuresChecked + audit.yearsUnsupported.length} unverified`,
    )
  }
  if (stripped > 0) {
    parts.push(
      stripped === 1
        ? '1 unsupported contraindication removed'
        : `${stripped} unsupported contraindications removed`,
    )
  }
  const detail: string[] = []
  if (audit.figuresUnsupported.length > 0) {
    detail.push(`Figures not found beside their claim: ${audit.figuresUnsupported.join(', ')}.`)
  }
  if (audit.yearsUnsupported.length > 0) {
    detail.push(`Years the cited resources do not carry: ${audit.yearsUnsupported.join(', ')}.`)
  }
  if (stripped > 0) {
    detail.push(
      `Contraindication claims no cited passage states: ${
        audit.contraindicationsUnsupported.join(', ')
      }.`,
    )
  }
  return { label: parts.join(' · '), tone: 'warn', title: detail.join(' ') }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A matcher for the unsupported figures and years as they appear in the
 * answer text: "1400mg" matches "1,400 mg" and "1400 mg/day", "45%"
 * matches "45 %", "2025" matches only the bare year. Null when nothing is
 * unsupported. Used with `String.split` so the match is captured.
 */
export function unsupportedFigurePattern(audit: AnswerAudit | undefined): RegExp | null {
  if (!audit) return null
  const alternatives: string[] = []
  for (const figure of audit.figuresUnsupported) {
    const m = /^(\d+(?:\.\d+)?)(%|mg(?:\/kg)?(?:\/day)?)?$/.exec(figure)
    if (!m) continue
    const [, value, unit] = m
    const digits = value!.includes('.')
      ? escapeRegExp(value!)
      : value!.split('').join(',?').replace(/^(\d),\?/, '$1,?')
    const unitPattern = unit === '%' ? '\\s?%' : unit ? `\\s?${escapeRegExp(unit)}` : ''
    alternatives.push(`(?<![\\d.])${digits}${unitPattern}(?![\\d])`)
  }
  for (const year of audit.yearsUnsupported) {
    if (/^\d{4}$/.test(year)) alternatives.push(`(?<![\\d.\\-/])${year}(?![\\d.\\-/%])`)
  }
  if (alternatives.length === 0) return null
  return new RegExp(`(${alternatives.join('|')})`, 'g')
}

/** Whether a split segment is one of the unsupported figures (the pattern is global; test a fresh copy). */
export function isUnsupportedFigure(segment: string, pattern: RegExp | null): boolean {
  if (!pattern) return false
  return new RegExp(`^${pattern.source}$`).test(segment)
}
