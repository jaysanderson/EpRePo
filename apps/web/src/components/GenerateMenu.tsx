import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/** The artefact kinds Generate can produce, mirroring GeneratePage's KINDS. */
export const GENERATE_KINDS: { id: string; label: string }[] = [
  { id: 'briefing', label: 'Briefing' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'proscons', label: 'Pros and cons' },
  { id: 'faq', label: 'FAQ' },
  { id: 'assessment', label: 'Assessment' },
]

/** The workspaces that used to sit in the top level of the nav. */
export const GENERATE_WORKSPACES: { to: string; label: string }[] = [
  { to: 'investigations', label: 'Investigations' },
  { to: 'assessment', label: 'Self assessment' },
]

/** FRDC's own Knowledge Hub mark, taken from their theme assets. */
function FishMark() {
  return (
    <img
      src='/brand/knowledge-hub-fish.svg'
      alt=''
      aria-hidden='true'
      className='h-24 w-auto'
    />
  )
}

/**
 * The Generate mega-menu: one nav entry that opens a panel carrying the
 * artefact kinds and the two workspaces (Investigations, Self assessment) that
 * used to take their own top-level slots.
 */
export function GenerateMenu({ slug, active }: { slug: string; active: boolean }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
    }
  }

  const item = (to: string, label: string) => (
    <li key={to}>
      <Link
        to={`/t/${slug}/${to}`}
        onClick={() => setOpen(false)}
        className='rp-focus-inverse group flex items-start gap-3 py-2 text-sm text-white/85 transition-colors duration-150 hover:text-white'
      >
        <span
          aria-hidden='true'
          className='mt-0.5 transition-transform duration-200 group-hover:translate-x-1'
        >
          &rarr;
        </span>
        <span>{label}</span>
      </Link>
    </li>
  )

  return (
    <div ref={wrapRef} className='contents'>
      <button
        ref={triggerRef}
        type='button'
        aria-expanded={open}
        aria-haspopup='true'
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onTriggerKey}
        className={`rp-navlink ${active ? 'rp-navlink-active' : ''}`}
      >
        Generate
        <svg
          viewBox='0 0 20 20'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          strokeLinecap='round'
          strokeLinejoin='round'
          aria-hidden='true'
          className={`ml-1.5 h-3.5 w-3.5 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          <path d='M5 7.5 10 12.5 15 7.5' />
        </svg>
      </button>

      {open
        ? (
          <div
            className='rp-anim-fade absolute inset-x-0 top-full z-40 border-t border-white/15'
            style={{ backgroundColor: 'var(--rp-primary)' }}
          >
            <div className='rp-shell flex flex-col gap-10 py-10 md:flex-row lg:gap-16'>
              <div className='w-full shrink-0 md:w-80'>
                <FishMark />
                <h2 className='rp-display mt-4 text-xl text-white'>Generate from the corpus</h2>
                <p className='mt-2 text-sm leading-relaxed text-white/70'>
                  Turn what the portal holds into a briefing, a comparison or a timeline - every
                  artefact cited back to its sources.
                </p>
                <Link
                  to={`/t/${slug}/generate`}
                  onClick={() => setOpen(false)}
                  aria-label='Open Generate'
                  className='rp-focus-inverse mt-4 inline-flex text-2xl text-white/85 transition-colors duration-150 hover:text-white'
                >
                  &rarr;
                </Link>
              </div>

              <div className='grid min-w-0 flex-1 gap-8 sm:grid-cols-2'>
                <div>
                  <h3 className='border-b border-white/25 pb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-white/60'>
                    Artefacts
                  </h3>
                  <ul className='mt-2'>
                    {GENERATE_KINDS.map((kind) => item(`generate?kind=${kind.id}`, kind.label))}
                  </ul>
                </div>
                <div>
                  <h3 className='border-b border-white/25 pb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-white/60'>
                    Workspaces
                  </h3>
                  <ul className='mt-2'>
                    {GENERATE_WORKSPACES.map((w) => item(w.to, w.label))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )
        : null}
    </div>
  )
}
