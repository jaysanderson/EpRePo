export function ToolsPage() {
  return (
    <main className='rp-shell py-10 sm:py-14'>
      <header className='max-w-2xl'>
        <p className='rp-eyebrow text-ink-3'>Research workspace</p>
        <h1 className='rp-display mt-2 text-3xl text-ink sm:text-4xl'>Tools</h1>
        <p className='mt-3 text-sm leading-relaxed text-ink-2 sm:text-base'>
          A home for focused ways to work with this portal's research.
        </p>
      </header>

      <section className='mt-8' aria-labelledby='tools-list-heading'>
        <h2 id='tools-list-heading' className='sr-only'>Available tools</h2>
        <ul>
          <li className='rp-card flex min-h-48 flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:gap-5 sm:p-8'>
            <span
              aria-hidden='true'
              className='flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--rp-radius)] bg-[var(--rp-wash)] text-[var(--rp-brand-fg)]'
            >
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.6'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='h-6 w-6'
              >
                <path d='M8 7h12M8 12h12M8 17h7' />
                <circle cx='4' cy='7' r='1' />
                <circle cx='4' cy='12' r='1' />
                <circle cx='4' cy='17' r='1' />
              </svg>
            </span>
            <div className='min-w-0'>
              <h3 className='rp-display text-xl text-ink'>No tools available yet</h3>
              <p className='mt-1 max-w-xl text-sm leading-relaxed text-ink-2'>
                Tools for working with this portal's research will be listed here as they become
                available.
              </p>
            </div>
          </li>
        </ul>
      </section>
    </main>
  )
}
