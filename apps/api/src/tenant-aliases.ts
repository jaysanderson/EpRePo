const TENANT_SLUG_ALIASES: ReadonlyMap<string, string> = new Map([
  ['gdrc', 'grdc'],
])

const TENANT_ROUTE_ALIASES: ReadonlyMap<string, string> = new Map([
  ['assistant', 'ask'],
])

type TenantSlugAliasPolicy = (slug: string, canonicalSlug: string) => boolean

/**
 * Resolve the permanent redirect for a renamed public tenant URL.
 *
 * Cloudflare applies every configured slug alias at the edge. The API server
 * supplies a policy so a still-live legacy tenant remains authoritative until
 * it is retired.
 */
export function tenantAliasLocation(
  request: Pick<Request, 'method' | 'url'>,
  shouldRedirectSlug: TenantSlugAliasPolicy = () => true,
): string | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null

  const url = new URL(request.url)
  const slug = /^\/t\/([^/]+)(?:\/|$)/.exec(url.pathname)?.[1]
  const canonicalSlug = slug ? TENANT_SLUG_ALIASES.get(slug) : undefined

  let redirected = false
  if (slug && canonicalSlug && shouldRedirectSlug(slug, canonicalSlug)) {
    url.pathname = url.pathname.replace(/^\/t\/[^/]*/, `/t/${canonicalSlug}`)
    redirected = true
  }

  const route = /^\/t\/[^/]+\/([^/]+)(?:\/|$)/.exec(url.pathname)?.[1]
  const canonicalRoute = route ? TENANT_ROUTE_ALIASES.get(route) : undefined
  if (canonicalRoute) {
    url.pathname = url.pathname.replace(/^\/t\/([^/]+)\/[^/]+/, `/t/$1/${canonicalRoute}`)
    redirected = true
  }

  return redirected ? `${url.pathname}${url.search}` : null
}
