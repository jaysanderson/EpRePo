import { type FormEvent, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { getAuthSession } from '../api/auth.ts'
import type { TenantOutletContext } from './TenantLayout.tsx'

interface McpCredential {
  id: string
  label: string
  prefix: string
  createdAt: string
  revokedAt: string | null
}

interface IssuedCredential {
  key: string
  credential: McpCredential
}

async function credentialRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body &&
        typeof body.message === 'string'
      ? body.message
      : 'The MCP key request could not be completed.'
    throw new Error(message)
  }
  return body as T
}

export function mcpConfigSnippet(endpoint: string, slug: string, key = 'YOUR_KEY'): string {
  return JSON.stringify(
    {
      mcpServers: {
        [`${slug}-knowledge`]: {
          type: 'streamable-http',
          url: endpoint,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  )
}

function ConnectorIcon() {
  return (
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
        <rect x='4' y='4' width='6' height='6' rx='1' />
        <rect x='14' y='14' width='6' height='6' rx='1' />
        <path d='M10 7h4a3 3 0 013 3v4M7 10v4a3 3 0 003 3h4' />
      </svg>
    </span>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      globalThis.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type='button'
      className='rp-btn rp-btn-outline shrink-0'
      onClick={() => void copy()}
    >
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.7'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='h-4 w-4'
        aria-hidden='true'
      >
        {copied ? <path d='M5 12.5l4.5 4.5L19 7.5' /> : <path d='M9 9h10v10H9zM5 15H4V5h10v1' />}
      </svg>
      {copied ? 'Copied' : label}
    </button>
  )
}

function ConnectionValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-xs font-medium uppercase tracking-wide text-ink-3'>{label}</p>
      <div className='mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start'>
        <code className='min-w-0 flex-1 break-all rounded-[var(--rp-radius-input)] border border-line bg-[var(--rp-surface-2)] px-3 py-2 text-xs leading-relaxed text-ink [overflow-wrap:anywhere]'>
          {value}
        </code>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </div>
    </div>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function ToolsPage() {
  const { config } = useOutletContext<TenantOutletContext>()
  const slug = config.slug
  const endpointPath = `/api/t/${encodeURIComponent(slug)}/mcp`
  const endpoint = `${globalThis.location?.origin ?? ''}${endpointPath}`
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<IssuedCredential | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<
    { kind: 'error' | 'success'; text: string } | null
  >(null)

  const { data: auth, isLoading: authLoading } = useQuery({
    queryKey: ['auth-session'],
    queryFn: getAuthSession,
    staleTime: 60_000,
    retry: false,
  })
  const isAdmin = auth?.user?.isAdmin === true
  const keysPath = `/api/t/${encodeURIComponent(slug)}/mcp/keys`
  const {
    data: credentials = [],
    isLoading: keysLoading,
    isError: keysError,
    refetch: refetchCredentials,
  } = useQuery({
    queryKey: ['mcp-credentials', slug],
    queryFn: () => credentialRequest<McpCredential[]>(keysPath),
    enabled: isAdmin,
    retry: false,
  })

  async function createCredential(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setActionMessage(null)
    try {
      const result = await credentialRequest<IssuedCredential>(keysPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      setIssued(result)
      setLabel('')
      setActionMessage({ kind: 'success', text: 'MCP key created.' })
      await refetchCredentials()
    } catch (error) {
      setActionMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'The MCP key could not be created.',
      })
    } finally {
      setCreating(false)
    }
  }

  async function revokeCredential(credential: McpCredential) {
    const confirmed = globalThis.confirm(
      `Revoke “${credential.label}”? MCP clients using this key will stop working immediately.`,
    )
    if (!confirmed) return
    setRevoking(credential.id)
    setActionMessage(null)
    try {
      await credentialRequest(`${keysPath}/${encodeURIComponent(credential.id)}`, {
        method: 'DELETE',
      })
      if (issued?.credential.id === credential.id) setIssued(null)
      setActionMessage({ kind: 'success', text: 'MCP key revoked.' })
      await refetchCredentials()
    } catch (error) {
      setActionMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'The MCP key could not be revoked.',
      })
    } finally {
      setRevoking(null)
    }
  }

  const snippet = mcpConfigSnippet(endpoint, slug, issued?.key)

  return (
    <main className='rp-shell py-10 sm:py-14'>
      <header className='max-w-3xl'>
        <p className='rp-eyebrow text-ink-3'>Research workspace</p>
        <h1 className='rp-display mt-2 text-3xl text-ink sm:text-4xl'>Tools</h1>
        <p className='mt-3 text-sm leading-relaxed text-ink-2 sm:text-base'>
          Connect trusted research tools to this portal's knowledge, with access kept inside the
          portal boundary.
        </p>
      </header>

      <section className='mt-8' aria-labelledby='connector-heading'>
        <div className='rp-card overflow-hidden'>
          <div className='flex flex-col gap-5 border-b border-line p-6 sm:flex-row sm:p-8'>
            <ConnectorIcon />
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 id='connector-heading' className='rp-display text-2xl text-ink'>
                  Knowledge box MCP connector
                </h2>
                <span className='rp-chip cursor-default bg-[var(--rp-wash)] text-[var(--rp-ink)]'>
                  Read-only
                </span>
              </div>
              <p className='mt-2 max-w-3xl text-sm leading-relaxed text-ink-2 sm:text-base'>
                Give an MCP client permission to search, ask cited questions, fetch a document and
                browse this portal's catalogue. Each key is limited to this portal and can be
                revoked without changing the knowledge box connection.
              </p>
              <div className='mt-4 flex flex-wrap gap-2' aria-label='Available MCP tools'>
                {['Search corpus', 'Cited answers', 'Get document', 'Browse catalogue'].map(
                  (tool) => <span key={tool} className='rp-chip cursor-default'>{tool}</span>,
                )}
              </div>
            </div>
          </div>

          <div className='grid gap-8 p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:p-8 2xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.65fr)]'>
            <div className='min-w-0 space-y-7'>
              <section aria-labelledby='connection-heading'>
                <h3 id='connection-heading' className='rp-display text-xl text-ink'>
                  Connection details
                </h3>
                <p className='mt-1 text-sm leading-relaxed text-ink-2'>
                  Use Streamable HTTP and send the CorpusKit key as a bearer token on every request.
                </p>
                <div className='mt-5 space-y-5'>
                  <ConnectionValue label='Endpoint URL' value={endpoint} />
                  <ConnectionValue
                    label='Authorisation header'
                    value='Authorization: Bearer YOUR_KEY'
                  />
                </div>
              </section>

              <section aria-labelledby='config-heading'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <h3 id='config-heading' className='rp-display text-xl text-ink'>
                      Client configuration
                    </h3>
                    <p className='mt-1 text-sm text-ink-2'>
                      Paste this into a client that accepts JSON MCP server configuration.
                    </p>
                  </div>
                  <CopyButton value={snippet} label='Copy config' />
                </div>
                <pre className='mt-4 max-w-full whitespace-pre-wrap break-words rounded-[var(--rp-radius-input)] border border-line bg-[var(--rp-surface-2)] p-4 text-xs leading-relaxed text-ink [overflow-wrap:anywhere]'>
                  <code>{snippet}</code>
                </pre>
              </section>

              <div className='rounded-[var(--rp-radius)] border border-line bg-[var(--rp-surface-2)] p-4'>
                <p className='text-sm font-medium text-ink'>
                  The knowledge box credential stays private
                </p>
                <p className='mt-1 text-sm leading-relaxed text-ink-2'>
                  This connector issues a separate, revocable CorpusKit key. It never reveals the
                  service credential that CorpusKit uses to reach the knowledge box.
                </p>
              </div>
            </div>

            <aside
              className='min-w-0 border-t border-line pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0'
              aria-labelledby='keys-heading'
            >
              <h3 id='keys-heading' className='rp-display text-xl text-ink'>Access keys</h3>
              {authLoading
                ? <p className='mt-3 text-sm text-ink-3'>Checking your access…</p>
                : !isAdmin
                ? (
                  <div className='mt-4 rounded-[var(--rp-radius)] border border-line bg-[var(--rp-surface-2)] p-4'>
                    <p className='text-sm font-medium text-ink'>Administrator access required</p>
                    <p className='mt-1 text-sm leading-relaxed text-ink-2'>
                      The connector is available for this portal, but only a signed-in CorpusKit
                      administrator can create or revoke its credentials.
                    </p>
                  </div>
                )
                : (
                  <>
                    <p className='mt-1 text-sm leading-relaxed text-ink-2'>
                      Label keys by the client or workflow that will use them. A new key is shown
                      once only.
                    </p>

                    <form
                      className='mt-5 space-y-3'
                      onSubmit={(event) => void createCredential(event)}
                    >
                      <div>
                        <label
                          htmlFor='mcp-key-label'
                          className='mb-1.5 block text-sm font-medium text-ink'
                        >
                          Key label
                        </label>
                        <input
                          id='mcp-key-label'
                          className='rp-input'
                          value={label}
                          onChange={(event) => setLabel(event.target.value)}
                          placeholder='For example, analyst desktop'
                          maxLength={80}
                          required
                        />
                      </div>
                      <button
                        type='submit'
                        className='rp-btn rp-btn-primary w-full'
                        disabled={creating}
                      >
                        {creating ? 'Creating key…' : 'Create key'}
                      </button>
                    </form>

                    {issued
                      ? (
                        <div
                          className='mt-5 min-w-0 rounded-[var(--rp-radius)] border p-4'
                          style={{
                            borderColor: 'var(--rp-ok-line)',
                            background: 'var(--rp-ok-bg)',
                            color: 'var(--rp-ok-ink)',
                          }}
                          role='status'
                        >
                          <p className='text-sm font-semibold'>Copy this key now</p>
                          <p className='mt-1 text-sm leading-relaxed'>
                            It will not be shown again after you leave or refresh this page.
                          </p>
                          <code className='mt-3 block max-w-full break-all rounded-[var(--rp-radius-input)] border border-[var(--rp-ok-line)] bg-[var(--rp-surface)] p-3 text-xs leading-relaxed text-ink [overflow-wrap:anywhere]'>
                            {issued.key}
                          </code>
                          <div className='mt-3 flex flex-wrap gap-2'>
                            <CopyButton value={issued.key} label='Copy key' />
                            <CopyButton value={snippet} label='Copy config with key' />
                          </div>
                        </div>
                      )
                      : null}

                    {actionMessage
                      ? (
                        <p
                          className='mt-4 text-sm'
                          style={{
                            color: actionMessage.kind === 'error'
                              ? 'var(--rp-bad-ink)'
                              : 'var(--rp-ok-ink)',
                          }}
                          role={actionMessage.kind === 'error' ? 'alert' : 'status'}
                        >
                          {actionMessage.text}
                        </p>
                      )
                      : null}

                    <div className='mt-7 border-t border-line pt-6'>
                      <h4 className='text-sm font-semibold text-ink'>Existing keys</h4>
                      {keysLoading
                        ? <p className='mt-3 text-sm text-ink-3'>Loading keys…</p>
                        : keysError
                        ? (
                          <p className='mt-3 text-sm text-[var(--rp-bad-ink)]'>
                            Keys could not be loaded.
                          </p>
                        )
                        : credentials.length === 0
                        ? (
                          <p className='mt-3 text-sm text-ink-3'>
                            No keys have been created for this portal.
                          </p>
                        )
                        : (
                          <ul className='mt-3 divide-y divide-[var(--rp-line)]'>
                            {credentials.map((credential) => (
                              <li
                                key={credential.id}
                                className='flex min-w-0 flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between'
                              >
                                <div className='min-w-0'>
                                  <div className='flex flex-wrap items-center gap-2'>
                                    <p className='break-words text-sm font-medium text-ink'>
                                      {credential.label}
                                    </p>
                                    {credential.revokedAt
                                      ? <span className='rp-chip cursor-default'>Revoked</span>
                                      : null}
                                  </div>
                                  <p className='mt-1 break-all font-mono text-xs text-ink-3 [overflow-wrap:anywhere]'>
                                    {credential.prefix}…
                                  </p>
                                  <p className='mt-1 text-xs text-ink-3'>
                                    Created {formatDate(credential.createdAt)}
                                  </p>
                                </div>
                                {!credential.revokedAt
                                  ? (
                                    <button
                                      type='button'
                                      className='rp-btn rp-btn-danger self-start'
                                      disabled={revoking === credential.id}
                                      onClick={() => void revokeCredential(credential)}
                                    >
                                      {revoking === credential.id ? 'Revoking…' : 'Revoke'}
                                    </button>
                                  )
                                  : null}
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                  </>
                )}
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}
