const FRDC = 'https://www.frdc.com.au'

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Research & Funding',
    links: [
      { label: 'Applying for funding', href: `${FRDC}/applying-investment-opportunities` },
      { label: 'FRDC FishNet', href: `${FRDC}/frdc-fishnet` },
    ],
  },
  {
    heading: 'Partners',
    links: [
      { label: 'About our partners', href: `${FRDC}/partners` },
      { label: 'Coordination programs', href: `${FRDC}/coordination-programs-and-services` },
    ],
  },
  {
    heading: 'Knowledge Hub',
    links: [{ label: 'Project & Final Report Search', href: `${FRDC}/project-search` }],
  },
  {
    heading: 'News & Events',
    links: [{ label: 'FRDC News', href: `${FRDC}/news` }],
  },
  {
    heading: 'About FRDC',
    links: [
      { label: 'Governance documents', href: `${FRDC}/governance-documents` },
      {
        label: 'Strategic planning and priorities',
        href: `${FRDC}/strategic-planning-and-priorities`,
      },
    ],
  },
]

const LEGAL: { label: string; href: string }[] = [
  { label: 'Accessibility', href: `${FRDC}/accessibility` },
  { label: 'Copyright', href: `${FRDC}/copyright` },
  { label: 'Disclaimer', href: `${FRDC}/legal` },
  { label: 'Privacy', href: `${FRDC}/frdc-privacy-policy` },
  { label: 'Websites', href: `${FRDC}/useful-links/FRDC-website-products` },
  { label: 'Contact Us', href: `${FRDC}/contact-us` },
  { label: 'Legal', href: `${FRDC}/legal` },
]

const SOCIALS: { label: string; href: string; path: string }[] = [
  {
    label: 'FRDC on Facebook',
    href: 'https://www.facebook.com/FRDCAustralia',
    path:
      'M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z',
  },
  {
    label: 'FRDC on Instagram',
    href: 'https://www.instagram.com/frdc.au',
    path:
      'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1018.6 12 6.6 6.6 0 0012 5.4zm0 10.9A4.3 4.3 0 1116.3 12 4.3 4.3 0 0112 16.3zm8.4-11.2a1.5 1.5 0 11-1.5-1.5 1.5 1.5 0 011.5 1.5z',
  },
  {
    label: 'FRDC on LinkedIn',
    href: 'https://au.linkedin.com/company/fisheries-research-and-development-corporation',
    path:
      'M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 21h4V9H3v12zm7 0h3.8v-6.3c0-1.7.3-3.3 2.4-3.3s2.1 1.9 2.1 3.4V21H22v-6.9c0-3.6-.8-6.4-5-6.4a4.4 4.4 0 00-3.9 2.2h-.1V9H10v12z',
  },
  {
    label: 'FRDC on YouTube',
    href: 'https://www.youtube.com/user/FisheriesResearchAU',
    path:
      'M23 12s0-3.2-.4-4.7a2.5 2.5 0 00-1.7-1.8C19.3 5 12 5 12 5s-7.3 0-8.9.5a2.5 2.5 0 00-1.7 1.8C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 001.7 1.8C4.7 19 12 19 12 19s7.3 0 8.9-.5a2.5 2.5 0 001.7-1.8C23 15.2 23 12 23 12zM9.8 15.3V8.7l6 3.3-6 3.3z',
  },
]

/**
 * The portal footer, carrying FRDC's own structure and acknowledgement. Every
 * link points at frdc.com.au - this portal does not reproduce their newsletter
 * or legal pages, it sends people to the real ones.
 */
export function PortalFooter(
  { subscribeImageUrl = '/brand/hero/frdc-subscribe.jpg' }: { subscribeImageUrl?: string },
) {
  return (
    <footer style={{ backgroundColor: 'var(--rp-primary)' }}>
      {/* Subscribe band */}
      <div className='relative overflow-hidden'>
        {subscribeImageUrl
          ? (
            <img
              src={subscribeImageUrl}
              alt=''
              aria-hidden='true'
              className='absolute inset-0 h-full w-full object-cover'
            />
          )
          : null}
        <div
          className='absolute inset-0'
          aria-hidden='true'
          style={{
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--rp-primary) 92%, transparent), color-mix(in srgb, var(--rp-primary) 55%, transparent))',
          }}
        />
        <div className='rp-shell relative py-16 sm:py-20'>
          <h2 className='rp-display text-2xl text-white sm:text-3xl'>Stay up to date</h2>
          <p className='mt-3 text-base text-white/80'>Subscribe to our newsletter and updates</p>
          <a
            href={`${FRDC}/stay-up-to-date`}
            target='_blank'
            rel='noreferrer noopener'
            className='rp-focus-inverse mt-7 inline-flex items-center bg-white px-7 py-3 text-sm font-semibold transition-colors duration-150 hover:bg-white/90'
            style={{ color: 'var(--rp-primary)' }}
          >
            Subscribe
          </a>
        </div>
      </div>

      {/* Link columns */}
      <div className='rp-shell py-10'>
        <div className='grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5'>
          {COLUMNS.map((column) => (
            <div key={column.heading} className='min-w-0'>
              <h3 className='border-b border-white/25 pb-3 text-sm font-semibold text-white'>
                {column.heading}
              </h3>
              <ul className='mt-3.5 space-y-2.5'>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target='_blank'
                      rel='noreferrer noopener'
                      className='rp-focus-inverse text-sm leading-snug text-white/75 transition-colors duration-150 hover:text-white'
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Social */}
        <div className='mt-10 flex justify-center gap-6 border-t border-white/20 pt-8'>
          {SOCIALS.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target='_blank'
              rel='noreferrer noopener'
              aria-label={social.label}
              className='rp-focus-inverse text-white/85 transition-colors duration-150 hover:text-white'
            >
              <svg viewBox='0 0 24 24' fill='currentColor' className='h-6 w-6' aria-hidden='true'>
                <path d={social.path} />
              </svg>
            </a>
          ))}
        </div>

        {/* Acknowledgement of Country */}
        <div className='mx-auto mt-8 max-w-3xl border border-white/35 px-6 py-5'>
          <p className='text-center text-xs leading-relaxed text-white/85'>
            FRDC acknowledges Aboriginal and Torres Strait Islander Peoples as the Traditional
            Custodians of land, sea and sky, recognising their deep, enduring connection to these
            places. We pay our respects to Elders past and present who hold the knowledge, culture
            and spiritual connections to land, sky and waters and whose guidance continues to shape
            their sustainable, ethical and responsible care.
          </p>
        </div>

        {/* Copyright and legal */}
        <div className='mt-8 flex flex-col items-center justify-between gap-3 text-xs text-white/70 sm:flex-row'>
          <p>&copy; Fisheries Research and Development Corporation</p>
          <ul className='flex flex-wrap justify-center gap-x-4 gap-y-1.5'>
            {LEGAL.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  target='_blank'
                  rel='noreferrer noopener'
                  className='rp-focus-inverse transition-colors duration-150 hover:text-white'
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
