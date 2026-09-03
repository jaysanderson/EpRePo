import { useEffect, useRef, useState } from 'react'
import type { Intent, ScoredResource } from '@research-portal/core'
import type { AskEvent } from '@research-portal/core'
import { streamAsk } from '../api/client.ts'
import { AnswerMarkdown } from './AnswerMarkdown.tsx'
import { intentSummary } from './RouteChip.tsx'

interface Column {
  intent: string
  text: string
  sources: ScoredResource[]
  pending: boolean
  error?: string
  seconds?: number
}

/**
 * The demo's hero screen: the same question through two stored search
 * configurations, side by side, each column showing the policy it ran under,
 * the streamed answer and the sources it grounded on.
 */
export function CompareConfigurations(
  { slug, question, intents, initial, onClose }: {
    slug: string
    question: string
    intents: Intent[]
    initial: [string, string]
    onClose: () => void
  },
) {
  const [columns, setColumns] = useState<Column[]>(
    initial.map((intent) => ({ intent, text: '', sources: [], pending: false })),
  )
  const controllers = useRef<(AbortController | null)[]>([null, null])

  function run(index: number, intentId: string) {
    controllers.current[index]?.abort()
    const controller = new AbortController()
    controllers.current[index] = controller
    const started = Date.now()
    setColumns((prev) =>
      prev.map((c, i) =>
        i === index ? { intent: intentId, text: '', sources: [], pending: true } : c
      )
    )
    const update = (mutate: (c: Column) => Column) =>
      setColumns((prev) => prev.map((c, i) => i === index ? mutate(c) : c))
    streamAsk(slug, { query: question, intent: intentId }, (event: AskEvent) => {
      if (event.type === 'sources') update((c) => ({ ...c, sources: event.resources }))
      else if (event.type === 'delta') update((c) => ({ ...c, text: c.text + event.text }))
      else if (event.type === 'error') {
        update((c) => ({ ...c, error: event.message, pending: false }))
      }
    }, controller.signal)
      .then(() => update((c) => ({ ...c, pending: false, seconds: (Date.now() - started) / 1000 })))
      .catch((err) => {
        if (controller.signal.aborted) return
        update((c) => ({
          ...c,
          pending: false,
          error: err instanceof Error ? err.message : 'failed',
        }))
      })
  }

  useEffect(() => {
    run(0, initial[0])
    run(1, initial[1])
    return () => controllers.current.forEach((c) => c?.abort())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question])

  return (
    <section
      className='rp-card mt-4 p-4'
      aria-label='Compare retrieval configurations'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 max-w-2xl'>
          <p className='rp-eyebrow text-ink-3'>Compare configurations</p>
          <p className='mt-1 text-sm text-ink-2'>
            The same question, two retrieval policies. Each column names the stored configuration it
            ran under.
          </p>
        </div>
        <button
          type='button'
          onClick={onClose}
          className='rp-btn rp-btn-ghost h-8 shrink-0 px-2 text-xs'
        >
          Close
        </button>
      </div>
      <div className='mt-4 grid gap-4 lg:grid-cols-2'>
        {columns.map((col, index) => {
          const intent = intents.find((i) => i.id === col.intent)
          return (
            <div
              key={index}
              className='min-w-0 rounded-[var(--rp-radius)] border border-line bg-surface-2 p-3'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <label className='flex items-center gap-2 text-xs text-ink-3'>
                  <span className='sr-only'>Intent for column {index + 1}</span>
                  <select
                    value={col.intent}
                    onChange={(e) => run(index, e.target.value)}
                    className='rp-input h-8 text-sm'
                  >
                    {intents.filter((i) => i.answer.surfaces.includes('ask')).map((i) => (
                      <option key={i.id} value={i.id}>{i.label}</option>
                    ))}
                  </select>
                </label>
                <span className='text-xs tabular-nums text-ink-3'>
                  {col.pending ? 'answering…' : col.seconds ? `${col.seconds.toFixed(1)} s` : ''}
                </span>
              </div>
              {intent
                ? (
                  <p className='mt-2 text-[11px] leading-relaxed text-ink-3'>
                    {intentSummary(intent)}
                  </p>
                )
                : null}
              <div className='mt-3 min-h-[6rem] text-sm'>
                {col.error
                  ? <p className='text-[var(--rp-bad-ink)]'>{col.error}</p>
                  : col.text
                  ? <AnswerMarkdown text={col.text} renderInline={(run) => run} />
                  : col.pending
                  ? (
                    <div
                      className='rp-shimmer h-16 rounded-[var(--rp-radius)] bg-surface-3'
                      aria-hidden='true'
                    />
                  )
                  : null}
              </div>
              {col.sources.length > 0
                ? (
                  <div className='mt-3 border-t border-line pt-2'>
                    <p className='rp-eyebrow text-ink-3'>{col.sources.length} sources</p>
                    <ol className='mt-1.5 space-y-1'>
                      {col.sources.slice(0, 8).map((s) => (
                        <li
                          key={s.id}
                          className='flex items-baseline justify-between gap-2 text-xs'
                        >
                          <span className='min-w-0 truncate text-ink-2'>{s.title}</span>
                          <span className='shrink-0 tabular-nums text-ink-3'>
                            {s.published ? `${s.published.slice(0, 4)} · ` : ''}
                            {Math.round(s.relevance * 100)}%
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )
                : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
