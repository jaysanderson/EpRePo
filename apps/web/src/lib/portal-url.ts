const PLATFORM_DOMAIN = 'corpuskit.org'

function isPlatformHostname(hostname: string): boolean {
  return hostname === PLATFORM_DOMAIN || hostname === `www.${PLATFORM_DOMAIN}` ||
    hostname.endsWith(`.${PLATFORM_DOMAIN}`)
}

/**
 * Production portal navigation crosses origins so each portal keeps its own
 * memorable hostname. Local and preview environments retain the existing
 * relative tenant routes, which keeps development and browser tests portable.
 */
export function portalHref(
  slug: string,
  suffix = '',
  hostname = globalThis.location?.hostname ?? '',
): string {
  const route = `/t/${encodeURIComponent(slug)}${suffix}`
  return isPlatformHostname(hostname.toLowerCase())
    ? `https://${slug}.${PLATFORM_DOMAIN}${route}`
    : route
}
