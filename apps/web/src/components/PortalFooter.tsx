interface FooterContent {
  columns: { heading: string; links: { label: string; href: string }[] }[]
  legal: { label: string; href: string }[]
  socials: { label: string; href: string; path: string }[]
  acknowledgement: string
  copyright: string
  subscribe: { heading: string; blurb: string; label: string; href: string }
  subscribeImageUrl?: string
}

const FRDC = 'https://www.frdc.com.au'
const GRDC = 'https://grdc.com.au'

const FRDC_COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
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

const FRDC_LEGAL: { label: string; href: string }[] = [
  { label: 'Accessibility', href: `${FRDC}/accessibility` },
  { label: 'Copyright', href: `${FRDC}/copyright` },
  { label: 'Disclaimer', href: `${FRDC}/legal` },
  { label: 'Privacy', href: `${FRDC}/frdc-privacy-policy` },
  { label: 'Websites', href: `${FRDC}/useful-links/FRDC-website-products` },
  { label: 'Contact Us', href: `${FRDC}/contact-us` },
  { label: 'Legal', href: `${FRDC}/legal` },
]

const FRDC_SOCIALS: { label: string; href: string; path: string }[] = [
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
const FRDC_ACK =
  'FRDC acknowledges Aboriginal and Torres Strait Islander Peoples as the Traditional ' +
  'Custodians of land, sea and sky, recognising their deep, enduring connection to these ' +
  'places. We pay our respects to Elders past and present who hold the knowledge, culture ' +
  'and spiritual connections to land, sky and waters and whose guidance continues to shape ' +
  'their sustainable, ethical and responsible care.'

const GRDC_ACK =
  'In the spirit of reconciliation GRDC acknowledges the Traditional Custodians of Country ' +
  'throughout Australia and their connections to land, waters and community. We pay our ' +
  'respects to their Elders past, present and extend that respect to all Aboriginal and ' +
  'Torres Strait Islander peoples today.'

/** Social marks reuse one icon set; only the destinations differ per portal. */
const NETWORKS = ['Facebook', 'Instagram', 'LinkedIn', 'YouTube'] as const

const socialFor = (
  handles: Partial<Record<typeof NETWORKS[number], string>>,
  org: string,
): { label: string; href: string; path: string }[] =>
  NETWORKS.flatMap((network) => {
    const href = handles[network]
    const mark = FRDC_SOCIALS.find((m) => m.label.includes(network))
    return href && mark ? [{ label: `${org} on ${network}`, href, path: mark.path }] : []
  })

/**
 * Footer content per portal. Each carries its own organisation's links, legal
 * pages and Acknowledgement of Country - none of it is interchangeable, so it
 * is written out rather than templated.
 */
const FOOTERS: Record<string, FooterContent> = {
  frdc: {
    columns: FRDC_COLUMNS,
    legal: FRDC_LEGAL,
    socials: FRDC_SOCIALS,
    acknowledgement: FRDC_ACK,
    copyright: '\u00a9 Fisheries Research and Development Corporation',
    subscribe: {
      heading: 'Stay up to date',
      blurb: 'Subscribe to our newsletter and updates',
      label: 'Subscribe',
      href: `${FRDC}/stay-up-to-date`,
    },
    subscribeImageUrl: '/brand/hero/frdc-subscribe.jpg',
  },
  grdc: {
    columns: [
      {
        heading: 'Stay updated',
        links: [
          { label: 'My newsletters', href: `${GRDC}/grdc-subscriptions` },
          { label: 'News and media', href: `${GRDC}/news-and-media` },
        ],
      },
      {
        heading: 'Research',
        links: [
          { label: 'RD&E', href: `${GRDC}/research-and-development` },
          { label: 'Resources and publications', href: `${GRDC}/resources-and-publications` },
        ],
      },
      {
        heading: 'Contact GRDC',
        links: [
          { label: 'Tel: (02) 6166 4500', href: 'tel:0261664500' },
          { label: 'grdc@grdc.com.au', href: 'mailto:grdc@grdc.com.au' },
          { label: 'Contact us', href: `${GRDC}/about/contact-us` },
        ],
      },
    ],
    legal: [
      { label: 'Privacy', href: `${GRDC}/policies/privacy` },
      { label: 'Terms of use and Disclaimer', href: `${GRDC}/policies/disclaimer` },
      { label: 'Copyright', href: `${GRDC}/policies/copyright` },
      {
        label: 'Public interest disclosure',
        href: `${GRDC}/policies/public-interest-disclosure`,
      },
    ],
    socials: socialFor({
      Facebook: 'https://www.facebook.com/theGRDC',
      Instagram: 'https://www.instagram.com/thegrdc/',
      LinkedIn: 'https://www.linkedin.com/company/thegrdc/',
      YouTube: 'https://www.youtube.com/c/theGRDC/',
    }, 'GRDC'),
    acknowledgement: GRDC_ACK,
    copyright: '\u00a9 Grains Research and Development Corporation',
    subscribe: {
      heading: 'Stay updated',
      blurb: 'Get GRDC research, news and events in your inbox',
      label: 'Subscribe',
      href: `${GRDC}/grdc-subscriptions`,
    },
  },
}

export function PortalFooter({ slug }: { slug: string }) {
  const content = FOOTERS[slug]
  // A portal with no footer content of its own gets none - inventing an
  // organisation's links or Acknowledgement of Country would be worse.
  if (!content) return null
  const subscribeImageUrl = content.subscribeImageUrl
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
          <h2 className='rp-display text-2xl text-[var(--rp-on-primary)] sm:text-3xl'>
            Stay up to date
          </h2>
          <p className='mt-3 text-base text-[var(--rp-on-primary)]/80'>{content.subscribe.blurb}</p>
          <a
            href={content.subscribe.href}
            target='_blank'
            rel='noreferrer noopener'
            className='rp-focus-inverse mt-7 inline-flex items-center bg-[var(--rp-on-primary)] px-7 py-3 text-sm font-semibold transition-colors duration-150 hover:bg-[var(--rp-on-primary)]/90'
            style={{ color: 'var(--rp-primary)' }}
          >
            {content.subscribe.label}
          </a>
        </div>
      </div>

      {/* Link columns */}
      <div className='rp-shell py-10'>
        <div className='grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5'>
          {content.columns.map((column) => (
            <div key={column.heading} className='min-w-0'>
              <h3 className='border-b border-[var(--rp-on-primary)]/25 pb-3 text-sm font-semibold text-[var(--rp-on-primary)]'>
                {column.heading}
              </h3>
              <ul className='mt-3.5 space-y-2.5'>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target='_blank'
                      rel='noreferrer noopener'
                      className='rp-focus-inverse text-sm leading-snug text-[var(--rp-on-primary)]/75 transition-colors duration-150 hover:text-[var(--rp-on-primary)]'
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
        <div className='mt-10 flex justify-center gap-6 border-t border-[var(--rp-on-primary)]/20 pt-8'>
          {content.socials.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target='_blank'
              rel='noreferrer noopener'
              aria-label={social.label}
              className='rp-focus-inverse text-[var(--rp-on-primary)]/85 transition-colors duration-150 hover:text-[var(--rp-on-primary)]'
            >
              <svg viewBox='0 0 24 24' fill='currentColor' className='h-6 w-6' aria-hidden='true'>
                <path d={social.path} />
              </svg>
            </a>
          ))}
        </div>

        {/* Acknowledgement of Country */}
        <div className='mx-auto mt-8 max-w-3xl border border-[var(--rp-on-primary)]/35 px-6 py-5'>
          <p className='text-center text-xs leading-relaxed text-[var(--rp-on-primary)]/85'>
            {content.acknowledgement}
          </p>
        </div>

        {/* Copyright and legal */}
        <div className='mt-8 flex flex-col items-center justify-between gap-3 text-xs text-[var(--rp-on-primary)]/70 sm:flex-row'>
          <p>{content.copyright}</p>
          <ul className='flex flex-wrap justify-center gap-x-4 gap-y-1.5'>
            {content.legal.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  target='_blank'
                  rel='noreferrer noopener'
                  className='rp-focus-inverse transition-colors duration-150 hover:text-[var(--rp-on-primary)]'
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
