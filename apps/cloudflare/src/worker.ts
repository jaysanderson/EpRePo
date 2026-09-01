/// <reference path="./runtime.d.ts" />
/// <reference path="../../../worker-configuration.d.ts" />

import { DurableObject } from 'cloudflare:workers'
import { buildApp } from '../../api/src/app.ts'
import { runAutoEnrichments, runAutoSyncs, runWatches } from '../../api/src/scheduler.ts'
import { AragProvider } from '@research-portal/retrieval'
import { type AuthConfig, authConfigured, authUser, handleAuthRequest } from './auth.ts'
import { DurableState, type DurableStores, durableStores, stringEnv } from './state.ts'

const PORTAL_OBJECT_NAME = 'production'
const SECURITY_HEADERS: Record<string, string> = {
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

/**
 * CorpusKit's Hono application currently depends on synchronous stores. A
 * single SQLite-backed Durable Object preserves those contracts and serialises
 * writes without smuggling filesystem assumptions into the Worker runtime.
 */
export class PortalDurableObject extends DurableObject<Env> {
  private readonly app: ReturnType<typeof buildApp>
  private readonly provider: AragProvider
  private readonly stores: DurableStores

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const state = new DurableState(ctx.storage.sql)
    state.migrate()
    const bindings = stringEnv(env)
    this.stores = durableStores(state, bindings)
    this.provider = new AragProvider({
      resolveBinding: (slug) => this.stores.bindings.get(slug),
    })
    this.app = buildApp({
      provider: this.provider,
      management: this.provider,
      bindings: this.stores.bindings,
      tenants: this.stores.tenants,
      insights: this.stores.insights,
      sessions: this.stores.sessions,
      watches: this.stores.watches,
      sources: this.stores.sources,
      investigations: this.stores.investigations,
      suggestions: this.stores.suggestions,
      enrichments: this.stores.enrichments,
      kgProposals: this.stores.kgProposals,
      branding: this.stores.branding,
      zone: bindings.ARAG_ZONE,
      adminPasscode: bindings.ADMIN_PASSCODE,
      trustedAdmin: (request) => request.headers.get('x-corpuskit-sso-admin') === '1',
      invalidate: (slug) => this.provider.invalidate(slug),
      webAvailable: true,
      buildSha: env.CF_VERSION_METADATA?.id ?? 'cloudflare',
      rateLimitAskPerMin: numberBinding(bindings.RATE_LIMIT_ASK_PER_MIN, 20),
      rateLimitEstatePerMin: numberBinding(bindings.RATE_LIMIT_ESTATE_PER_MIN, 6),
    })
  }

  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/__corpuskit/maintenance') {
      await this.maintenance()
      return new Response(null, { status: 204 })
    }
    return await this.app.fetch(request)
  }

  async maintenance(): Promise<void> {
    await runAutoSyncs(this.provider, this.stores.tenants, this.stores.sources)
    await runWatches(this.provider, this.stores.tenants, this.stores.watches)
    await runAutoEnrichments(this.provider, this.stores.tenants, this.stores.enrichments)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const auth = authConfig(env)

    if (url.pathname.startsWith('/auth/')) {
      if (!authConfigured(auth)) {
        return json({ error: 'microsoft_sign_in_not_configured' }, 503)
      }
      return (await handleAuthRequest(request, auth)) ?? json({ error: 'not_found' }, 404)
    }

    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers(request.headers)
      // This marker is trusted only when the outer Worker adds it after
      // validating an encrypted session. Never forward a caller-supplied copy.
      headers.delete('x-corpuskit-sso-admin')
      if (authConfigured(auth)) {
        const user = await authUser(request, auth)
        if (user?.isAdmin) headers.set('x-corpuskit-sso-admin', '1')
      }
      const forwarded = new Request(request, { headers })
      return env.PORTAL.getByName(PORTAL_OBJECT_NAME, { locationHint: 'oc' }).fetch(forwarded)
    }

    return secureAssetResponse(await env.ASSETS.fetch(request))
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      env.PORTAL.getByName(PORTAL_OBJECT_NAME, { locationHint: 'oc' })
        .fetch(new Request('https://corpuskit.internal/__corpuskit/maintenance'))
        .then((response) => {
          if (!response.ok) throw new Error(`Maintenance HTTP ${response.status}`)
        })
        .catch((error: unknown) =>
          console.error(JSON.stringify({ message: 'maintenance failed', error: String(error) }))
        ),
    )
  },
} satisfies ExportedHandler<Env>

function authConfig(env: Env): Partial<AuthConfig> {
  const values = stringEnv(env)
  return {
    clientId: values.ENTRA_CLIENT_ID,
    clientSecret: values.ENTRA_CLIENT_SECRET,
    tenantId: values.ENTRA_TENANT_ID,
    sessionSecret: values.SESSION_SECRET,
    redirectUri: values.ENTRA_REDIRECT_URI,
    adminEmails: values.ENTRA_ADMIN_EMAILS,
  }
}

function numberBinding(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function secureAssetResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
  const type = headers.get('content-type') ?? ''
  headers.set('cache-control', type.includes('text/html') ? 'no-store' : 'public, max-age=300')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
