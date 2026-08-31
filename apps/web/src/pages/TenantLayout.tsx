import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { TenantConfig } from '@research-portal/core'
import { ApiError, getKnowledgeBoxStatus, getTenantConfig } from '../api/client.ts'
import { tenantThemeVars, useBodyTheme, useTenantFonts, useTextScale } from '../lib/theme.ts'
import { CommandPalette } from '../components/CommandPalette.tsx'
import { KbSwitcher } from '../components/KbSwitcher.tsx'
import { PortalFooter } from '../components/PortalFooter.tsx'
import { SignInDialog } from '../components/SignInDialog.tsx'
import { GENERATE_KINDS, GENERATE_WORKSPACES, GenerateMenu } from '../components/GenerateMenu.tsx'

export type TenantOutletContext = {
  config: TenantConfig
}

function FullPageSpinner() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-app' role='status'>
      <div
        className='h-9 w-9 animate-spin rounded-full border-2 border-line'
        style={{ borderTopColor: 'var(--rp-ink)' }}
        aria-hidden='true'
      />
      <span className='sr-only'>Loading portal</span>
    </div>
  )
}

// Explore is reached by the logo, Help by its own icon, and Investigations and
// Self assessment live under the Generate menu.
const NAV_ITEMS: { path: string; label: string; end: boolean }[] = [
  { path: '/search', label: 'Library', end: false },
  { path: '/assistant', label: 'Assistant', end: false },
  // Generate is rendered as a menu, not a plain link - it carries the artefact
  // kinds plus the Investigations and Self assessment workspaces.
  { path: '/graph', label: 'Graph', end: false },
]

export function TenantLayout() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const [headerQuery, setHeaderQuery] = useState('')
  const [signInOpen, setSignInOpen] = useState(false)
  const headerRef = useRef<HTMLElement | null>(null)

  // Cmd/Ctrl+K opens the search-or-ask palette from anywhere in the portal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [])

  // The mobile nav sheet closes on navigation, on Escape, and locks page
  // scroll behind it while open.
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    globalThis.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname, location.search])

  // The palette closes itself once it navigates - this only catches a route
  // change from elsewhere (e.g. browser back) while it happens to be open.
  useEffect(() => {
    setPaletteOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!navOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])

  useEffect(() => {
    if (!navOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [navOpen])
  const {
    data: config,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['tenant-config', slug],
    queryFn: () => getTenantConfig(slug ?? ''),
    enabled: Boolean(slug),
  })

  // Routes whose page owns the full viewport height.
  const isViewportHeightRoute = /\/(assistant|graph)(\/|$)/.test(location.pathname)

  const { data: kbStatus } = useQuery({
    queryKey: ['kb-status', slug],
    queryFn: () => getKnowledgeBoxStatus(slug ?? ''),
    enabled: Boolean(slug),
  })

  // The header is two-tier and its height changes with the breakpoint, so full
  // -height pages read it from a custom property instead of guessing.
  useEffect(() => {
    const element = headerRef.current
    if (!element) return
    const apply = () => {
      document.documentElement.style.setProperty(
        '--rp-header-h',
        `${Math.round(element.getBoundingClientRect().height)}px`,
      )
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(element)
    return () => observer.disconnect()
    // Keyed on config: the header does not exist on the first render (the
    // layout shows a spinner while the tenant loads), so a mount-only effect
    // would attach to nothing and never set the property.
  }, [config])

  useEffect(() => {
    if (config) {
      document.title = config.branding.productName
    }
    return () => {
      document.title = 'Research Portal'
    }
  }, [config])

  // Load the faces for the tenant's typography choice, apply its text scale,
  // and mirror the theme onto <body> so portaled overlays follow it too (all
  // no-ops until the config loads).
  useTenantFonts(config?.branding)
  useTextScale(config?.branding)
  useBodyTheme(config?.branding)

  if (isLoading) {
    return <FullPageSpinner />
  }

  if (isError || !config) {
    const notFound = error instanceof ApiError && error.status === 404

    return (
      <main className='flex min-h-screen flex-col items-center justify-center bg-app px-6 text-center'>
        <h1 className='rp-display text-3xl text-ink'>
          {notFound ? 'This portal does not exist' : 'Something went wrong'}
        </h1>
        <p className='mt-3 max-w-sm text-sm leading-relaxed text-ink-2'>
          {notFound
            ? 'Check the address, or head back and choose a portal from the list.'
            : error instanceof Error
            ? error.message
            : 'We could not load this portal right now.'}
        </p>
        <Link to='/' className='rp-btn rp-btn-primary mt-6'>
          Back to portals
        </Link>
      </main>
    )
  }

  // Links sit on the solid brand band, so the active state is white type over
  // an accent underline (see .rp-navlink in styles.css) rather than the accent
  // wash the old light-background header used.
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rp-navlink${isActive ? ' rp-navlink-active' : ''}`

  return (
    <div
      className='rp-tenant min-h-screen bg-app'
      style={tenantThemeVars(config.branding)}
    >
      {
        /* Two-tier header, after frdc.com.au: a white strip carrying the logo,
        * over a solid brand-colour band carrying the navigation. */
      }
      <header ref={headerRef} className='sticky top-0 z-40'>
        <div className='border-b border-line bg-surface'>
          <div className='rp-shell flex items-center justify-between gap-4 py-3'>
            <div className='flex min-w-0 items-center gap-2'>
              <Link
                to={`/t/${config.slug}`}
                className='rp-focus flex min-w-0 items-center gap-3 rounded-none'
              >
                {config.branding.logoUrl && !logoFailed
                  ? (
                    <img
                      src={config.branding.logoUrl}
                      alt={config.branding.organisation}
                      onError={() => setLogoFailed(true)}
                      className='h-14 w-auto max-w-[20rem] object-contain sm:h-16'
                    />
                  )
                  : (
                    <span className='rp-display truncate text-lg text-ink sm:text-xl'>
                      {config.branding.productName}
                    </span>
                  )}
              </Link>
              {
                /* Portal switcher, beside the logo - each portal is its own
                * knowledge box, content and branding. */
              }
              <KbSwitcher config={config} />
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              {/* Header search, as on frdc.com.au - submits into the Library. */}
              <form
                role='search'
                onSubmit={(event) => {
                  event.preventDefault()
                  const trimmed = headerQuery.trim()
                  if (!trimmed) return
                  navigate(`/t/${config.slug}/search?q=${encodeURIComponent(trimmed)}`)
                  setHeaderQuery('')
                }}
                className='hidden items-center lg:mr-3 lg:flex'
              >
                <label htmlFor='header-search' className='sr-only'>
                  Search {config.branding.productName}
                </label>
                <input
                  id='header-search'
                  type='search'
                  value={headerQuery}
                  onChange={(event) => setHeaderQuery(event.target.value)}
                  placeholder='Search'
                  className='rp-input rp-input-flush-end h-10 w-56 xl:w-72'
                />
                <button
                  type='submit'
                  aria-label='Search'
                  className='rp-focus flex h-10 w-11 shrink-0 items-center justify-center rounded-e-[var(--rp-radius-input)] border border-l-0 transition-colors duration-150'
                  style={{
                    borderColor: 'var(--rp-line)',
                    color: 'var(--rp-primary)',
                  }}
                >
                  <svg
                    viewBox='0 0 20 20'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    className='h-4 w-4'
                    aria-hidden='true'
                  >
                    <circle cx='9' cy='9' r='5.5' />
                    <path d='M13.2 13.2 17 17' />
                  </svg>
                </button>
              </form>
              {kbStatus?.status === 'none' && (
                <span className='hidden shrink-0 lg:block'>
                  <Link to='/admin' className='rp-badge rp-badge-quiet rp-focus'>
                    Not connected
                  </Link>
                </span>
              )}
              <Link
                to={`/t/${config.slug}/help`}
                aria-label='Help'
                title='Help'
                className='rp-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors duration-150'
                style={{
                  borderColor: 'color-mix(in srgb, var(--rp-primary) 25%, transparent)',
                  color: 'var(--rp-primary)',
                }}
              >
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.6'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='h-6 w-6'
                  aria-hidden='true'
                >
                  <circle cx='12' cy='12' r='9' />
                  <path d='M9.4 9.2a2.7 2.7 0 015.2.9c0 1.8-2.6 2.4-2.6 4' />
                  <path d='M12 17.4h.01' />
                </svg>
              </Link>
              <button
                type='button'
                onClick={() => setSignInOpen(true)}
                aria-label='My account'
                title='My account'
                aria-haspopup='dialog'
                className='rp-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors duration-150'
                style={{
                  borderColor: 'color-mix(in srgb, var(--rp-primary) 25%, transparent)',
                  color: 'var(--rp-primary)',
                }}
              >
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.6'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='h-6 w-6'
                  aria-hidden='true'
                >
                  <circle cx='12' cy='8.5' r='3.75' />
                  <path d='M4.5 20a7.5 7.5 0 0115 0' />
                </svg>
              </button>
              {
                /* Wrapped, because .rp-btn sets its own display and would beat a
                * `md:hidden` utility on the button itself - which is why this
                * control used to show next to the full desktop nav. */
              }
              <span className='md:hidden'>
                <button
                  type='button'
                  onClick={() => setNavOpen(true)}
                  aria-label='Open menu'
                  aria-haspopup='dialog'
                  aria-expanded={navOpen}
                  className='rp-btn rp-btn-ghost h-9 w-9 shrink-0 !px-0'
                >
                  <svg
                    viewBox='0 0 20 20'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.7'
                    strokeLinecap='round'
                    className='h-4 w-4'
                    aria-hidden='true'
                  >
                    <path d='M3 5.5h14M3 10h14M3 14.5h14' />
                  </svg>
                </button>
              </span>
            </div>
          </div>
        </div>

        <div className='rp-navband relative hidden md:block'>
          <div className='rp-shell'>
            <nav
              aria-label='Primary'
              className='rp-no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap'
            >
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.label}
                  to={`/t/${config.slug}${item.path}`}
                  end={item.end}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
              <GenerateMenu
                slug={config.slug}
                active={/\/(generate|investigations|assessment)/.test(location.pathname)}
              />
            </nav>
          </div>
        </div>
      </header>

      {navOpen && (
        <div
          role='dialog'
          aria-modal='true'
          aria-label='Menu'
          className='rp-anim-fade fixed inset-0 z-50 flex flex-col md:hidden'
          style={{ backgroundColor: 'var(--rp-primary)' }}
        >
          <div className='flex shrink-0 items-center justify-between gap-4 border-b border-white/20 px-4 py-3'>
            {config.branding.logoUrl && !logoFailed
              ? (
                <img
                  src={config.branding.logoUrl}
                  alt={config.branding.organisation}
                  className='h-10 w-auto max-w-[13rem] object-contain brightness-0 invert'
                />
              )
              : (
                <span className='rp-display text-base text-white'>
                  {config.branding.productName}
                </span>
              )}
            <button
              type='button'
              onClick={() => setNavOpen(false)}
              aria-label='Close menu'
              className='rp-focus-inverse flex h-11 w-11 shrink-0 items-center justify-center text-white'
            >
              <svg viewBox='0 0 20 20' fill='currentColor' aria-hidden='true' className='h-5 w-5'>
                <path d='M5.3 4.3l4.7 4.7 4.7-4.7 1 1L11 10l4.7 4.7-1 1L10 11l-4.7 4.7-1-1L9 10 4.3 5.3z' />
              </svg>
            </button>
          </div>

          <nav aria-label='Primary' className='flex-1 overflow-y-auto px-4 py-6'>
            <ul>
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <NavLink
                    to={`/t/${config.slug}${item.path}`}
                    end={item.end}
                    className='rp-focus-inverse group flex items-center gap-3 border-b border-white/15 py-4 text-lg font-light text-white'
                  >
                    <span
                      aria-hidden='true'
                      className='transition-transform duration-200 group-hover:translate-x-1'
                    >
                      &rarr;
                    </span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            {/* Generate, carrying the same sections as the desktop mega-menu. */}
            <div className='mt-8 flex items-start gap-4'>
              <img
                src='/brand/knowledge-hub-fish.svg'
                alt=''
                aria-hidden='true'
                className='h-16 w-auto shrink-0'
              />
              <div className='min-w-0'>
                <h2 className='rp-display text-lg text-white'>Generate from the corpus</h2>
                <NavLink
                  to={`/t/${config.slug}/generate`}
                  className='rp-focus-inverse mt-1 inline-flex text-sm text-white/75'
                >
                  All artefacts &rarr;
                </NavLink>
              </div>
            </div>

            <p className='rp-eyebrow mt-6 text-white/55'>Artefacts</p>
            <ul className='mt-1'>
              {GENERATE_KINDS.map((kind) => (
                <li key={kind.id}>
                  <NavLink
                    to={`/t/${config.slug}/generate?kind=${kind.id}`}
                    className='rp-focus-inverse group flex items-center gap-3 border-b border-white/15 py-3.5 text-base font-light text-white/85'
                  >
                    <span
                      aria-hidden='true'
                      className='transition-transform duration-200 group-hover:translate-x-1'
                    >
                      &rarr;
                    </span>
                    {kind.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            <p className='rp-eyebrow mt-6 text-white/55'>Workspaces</p>
            <ul className='mt-1'>
              {GENERATE_WORKSPACES.map((workspace) => (
                <li key={workspace.to}>
                  <NavLink
                    to={`/t/${config.slug}/${workspace.to}`}
                    className='rp-focus-inverse group flex items-center gap-3 border-b border-white/15 py-3.5 text-base font-light text-white/85'
                  >
                    <span
                      aria-hidden='true'
                      className='transition-transform duration-200 group-hover:translate-x-1'
                    >
                      &rarr;
                    </span>
                    {workspace.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            <div className='mt-8 flex flex-wrap gap-3'>
              <NavLink
                to={`/t/${config.slug}/help`}
                className='rp-focus-inverse border border-white/30 px-4 py-2.5 text-sm text-white'
              >
                Help
              </NavLink>
              <button
                type='button'
                onClick={() => {
                  setNavOpen(false)
                  setSignInOpen(true)
                }}
                className='rp-focus-inverse border border-white/30 px-4 py-2.5 text-sm text-white'
              >
                Sign in
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Keyed on the path so each route change replays the entrance. */}
      <div key={location.pathname} className='rp-page-enter'>
        <Outlet context={{ config } satisfies TenantOutletContext} />
      </div>

      {
        /* Assistant and Graph size themselves to the viewport and scroll
        * internally, so there is no room beneath them for a footer. On iOS the
        * dynamic viewport grows as the URL bar collapses, the panel grows with
        * it, and it overruns anything stacked below - which is exactly the
        * overlap this avoids. */
      }
      {isViewportHeightRoute ? null : <PortalFooter slug={config.slug} />}

      {signInOpen ? <SignInDialog onClose={() => setSignInOpen(false)} /> : null}

      {paletteOpen
        ? (
          <CommandPalette
            slug={config.slug}
            suggestedQuestions={config.suggestedQuestions}
            onClose={() => setPaletteOpen(false)}
          />
        )
        : null}
    </div>
  )
}
