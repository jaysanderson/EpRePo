# Deploying to fisheries-demo.noice.net.au — investigation and plan

Status: **investigation only, nothing executed**. No DNS, Cloudflare, or Fly changes were made
while preparing this document; no deploy was run. All commands below are recommendations for a
human (or a follow-up session with the right credentials) to run, in the order given.

## Recommendation, in one line

Keep the app on Fly (it already lives at `arag-research-portal.fly.dev`) and give it a second
hostname: add a Cloudflare DNS **CNAME** for `fisheries-demo` in the `noice.net.au` zone pointing
at `arag-research-portal.fly.dev`, **DNS-only (grey-clouded, not proxied)**, then run
`fly certs add fisheries-demo.noice.net.au` against the existing Fly app. No application code
changes are needed. A Cloudflare Workers/Pages port is **not viable as-is** and would be a
multi-week rewrite, not a deploy — see part 1.

---

## 1. Can this run on Cloudflare Workers/Pages as-is?

**No.** This is a stateful Deno/Node-style long-running server, not a request-scoped edge
function, and the incompatibilities are architectural, not cosmetic.

| Area | Evidence in this repo | Workers/Pages reality | Blocking? |
|---|---|---|---|
| Filesystem-backed persistence | `apps/api/src/persist.ts` (`writeFileSync`, `renameSync`, atomic rename-then-write); `apps/api/src/stores.ts` (`appendFileSync`, `readdirSync`, `rmSync`); same pattern in `bindings.ts`, `tenants.ts`, `kg.ts`, `enrichments.ts`. All state — tenant configs, KB bindings, sessions, watches, sources, insights, KG proposals, branding — is plain JSON/JSONL on the mounted Fly volume `/app/data` (`fly.toml` `[mounts]`). | Workers have **no filesystem at all**, ephemeral or otherwise. There is nothing to lift-and-shift here; every store needs a different storage primitive (D1, KV, R2, or Durable Object storage), a different consistency model (no atomic rename trick), and a different access pattern (no `readdirSync` directory listing, no JSONL append). | **Yes — hard blocker.** This is the core of the app's state layer, not an edge case. |
| `node:sqlite` | Not yet used anywhere (`grep -r "node:sqlite"` returns nothing), but `CLAUDE.md` and `docs/VISION.md`/`docs/ARCHITECTURE.md` record it as the *planned* next step for admin state ("SQLite... currently zero," "this supersedes the earlier no-SQLite rule"). | `node:sqlite` is a Node built-in; Workers' Node compat layer does not implement it, and Workers has no local disk to put a `.sqlite` file on regardless. Cloudflare's own answer is D1 (SQLite-compatible but a bound network service, not an embedded file) or Durable Objects' SQLite storage (a completely different API, scoped to one DO instance). | **Yes, for the planned migration** — the team's own roadmap assumes a capability (embedded SQLite file) that doesn't exist on Workers. Doesn't block *today's* code, but blocks the stated near-term plan. |
| Background scheduler | `apps/api/src/scheduler.ts`: `setTimeout` (90s after boot) + `setInterval` (24h) running inside the same long-lived process as the HTTP server, iterating every tenant to re-sync sources and re-run saved-search watches. `fly.toml` sets `min_machines_running = 1` specifically so "scheduled source syncs and saved-search checks run daily without waiting for a visitor." | Workers are request-scoped isolates; there is no always-on process and no supported `setInterval` outside a request's execution context. The Cloudflare equivalent is **Cron Triggers** (`wrangler.toml` `[triggers] crons = [...]`), which fire a fresh, time-boxed `scheduled()` invocation — a different execution model requiring the whole scheduler to be redesigned around one-shot invocations (and likely Durable Object alarms if any per-tenant staggering or long iteration is needed). | **Yes — architectural rewrite**, not a config change. |
| SSE streaming (`hono/streaming`'s `streamSSE`, used ~10x in `apps/api/src/app.ts` for ask/analyse/KG-implement/generate progress) | Confirmed via `hono/streaming` import and `streamSSE(c, async (stream) => ...)` call sites. | **Not a blocker.** Workers support standard `ReadableStream` response bodies and Hono itself runs natively on Workers; SSE works the same way. Called out explicitly because it's easy to assume otherwise — it isn't the problem here. | No. |
| `Deno.serve` entry point (`apps/api/src/server.ts`) | `Deno.serve({ port }, app.fetch)`, `hono/deno`'s `serveStatic`. | Mechanical, not hard: Workers wants `export default { fetch }`; Hono is runtime-portable and already exposes `app.fetch`. Swapping the entry point and static-asset serving (Workers Assets or a KV/R2-backed static handler instead of `hono/deno`'s `serveStatic`) is real work but not conceptually blocking on its own. | No, by itself. |
| Toolchain (deliberately no npm/package.json; Deno-native `deno.json` import map resolving JSR + esm.sh URLs; SPA built with standalone `esbuild`/`tailwindcss` binaries) | `README.md` "Why no npm"; `deno.json`; `Dockerfile`. | Wrangler's Workers build pipeline is npm/esbuild-oriented. Not impossible to keep Deno-style resolution, but it's a second, unproven toolchain to make work under `wrangler deploy`/`wrangler dev`, on top of everything else. | Adds cost, not a hard blocker by itself. |
| Product-decision conflict | `docs/ARCHITECTURE.md`: "SQLite and embedded databases are deliberately avoided (Jay's standing directive: keep SQLite use to the absolute minimum — currently zero)." | A Workers port *requires* adopting D1 (Cloudflare's managed SQLite) for anything that isn't tiny KV-shaped data, directly contradicting that standing product decision — this is a strategy conversation, not just an engineering one. | Not a code blocker, but a real blocker to doing this "as-is" in spirit. |

**Verdict: no**, not as-is, and not as a weekend port. The honest framing is: *rewriting the
persistence layer and scheduler for a different runtime*, not *deploying the existing app to a
different host*. Rough size estimate for a real port — rewriting `persist.ts`/`stores.ts`/
`bindings.ts`/`tenants.ts`/`kg.ts`/`enrichments.ts` against D1/KV/DO storage, redesigning
`scheduler.ts` around Cron Triggers (+ possibly Durable Object alarms for per-tenant fan-out),
swapping the server entry point and static asset serving, adapting or replacing the Deno-native
build/test toolchain, and re-running the full persona/e2e suite against the new storage — is a
**multi-week effort for one engineer** (low single digits of weeks), not a same-day migration.
Nothing here says never — it says this is a distinct project, and shouldn't be sold as "deploying
the app to Cloudflare."

---

## 2. The pragmatic path: keep it on Fly, point DNS at it

This is confirmed viable and is the recommended path.

### Why this works cleanly
- The app already runs on Fly (`app = "arag-research-portal"`, region `syd`, `fly.toml`) and is
  reachable at `arag-research-portal.fly.dev`.
- Fly supports attaching arbitrary additional hostnames ("custom domains") to an existing app and
  issuing a Let's Encrypt certificate for them, without a new app, a new region, or a code change.
- The server has **no host-based routing or origin allowlisting** that would reject a second
  hostname: `grep`ing `apps/api/src` turns up no `Host` header branching, and the one CORS rule in
  `app.ts` (`cors({ origin: (origin) => origin, ... })` for the reingest route) already echoes
  whatever origin calls it rather than allowlisting `arag-research-portal.fly.dev` specifically.
  The only `fly.dev` string literals in the codebase are `BASE_URL` defaults/examples in the
  smoke-test scripts (`apps/api/scripts/persona-smoke.ts`, `accuracy-eval.ts`), not app logic.
- `noice.net.au` is confirmed already on Cloudflare (see part 4) — no zone transfer or registrar
  work needed, only a new DNS record inside an existing zone.

### Rejected alternative: Cloudflare Workers/Pages
Rejected per part 1 — not viable without a ground-up rewrite of persistence and scheduling, and
in direct tension with the project's own "no SQLite/embedded DB" standing decision. Revisit only
if/when a genuine Workers port is commissioned as its own project.

### Rejected alternative: Cloudflare Tunnel to a self-hosted box
Seen used elsewhere in this Cloudflare account (e.g. `hermes.noice.net.au`,
`mmp-uat-public.noice.work` in `mmp/deploy/CLOUDFLARE-TUNNEL.md`) for exposing on-prem/LXC
services that have no public ingress of their own. Not applicable here: Fly already terminates
TLS and provides public HTTPS ingress for this app, so a Tunnel would be a redundant extra hop
solving a problem this app doesn't have.

### Rejected alternative: Cloudflare-proxied (orange-cloud) DNS record
Fly's own guidance (confirmed against current `fly.io` docs) is that proxying a custom domain
through Cloudflare complicates certificate issuance: Fly's automatic TLS-ALPN/HTTP-01 challenge
can't reach the origin directly, so it falls back to needing a `_fly-ownership` TXT record for
domain verification, and the Cloudflare zone's SSL/TLS mode must be "Full" or "Full (strict)"
(never "Flexible", which causes redirect loops). This is all avoidable by leaving the record
**DNS-only (grey cloud)**, which is the standard pattern for a Fly custom domain and needs none of
that extra ceremony. Recommend DNS-only for this record; proxying can be revisited later purely
as a CDN/WAF decision, not a deployment requirement.

### Exact ordered steps

1. **(Human, Fly access)** Confirm/establish `flyctl` auth on whichever machine will run the
   command: `flyctl auth login` (interactive browser OAuth — see part 3, this is one of the two
   steps that must be done by a person).
2. **(Human or CI, Fly access)** Attach the hostname to the existing app:
   ```
   fly certs add fisheries-demo.noice.net.au -a arag-research-portal
   ```
   This starts certificate issuance and prints the DNS target/instructions.
3. **(Human, Cloudflare access)** In the `noice.net.au` zone, create:
   ```
   Type:   CNAME
   Name:   fisheries-demo
   Target: arag-research-portal.fly.dev
   Proxy:  DNS only (grey cloud)
   TTL:    Auto
   ```
   This is the other step that must be done by a person (see part 3) — it needs Cloudflare
   dashboard/API access to the zone, which is separate from Fly access.
4. **(Either)** Poll certificate status until issued:
   ```
   fly certs check fisheries-demo.noice.net.au -a arag-research-portal
   ```
   or `fly certs show fisheries-demo.noice.net.au -a arag-research-portal` for full detail.
   Order matters here: the cert cannot issue until the CNAME in step 3 resolves and is reachable
   (DNS-only), so step 3 must land before step 4 will report anything but "awaiting
   configuration." DNS propagation is typically fast for a Cloudflare-hosted zone but allow a few
   minutes.
5. **(Either)** Once `fly certs check` reports the certificate issued, verify:
   ```
   curl -sI https://fisheries-demo.noice.net.au/api/health
   ```
   should return `200` the same way `https://arag-research-portal.fly.dev/api/health` does today.
   No app redeploy is required for this step — the existing running machine already answers to
   any Host header.
6. **(Optional, later)** If the team later wants Cloudflare-level features (WAF rules, cache,
   Access gating) on this hostname, that's a separate, deliberate decision to flip the DNS record
   to proxied and follow Fly's Cloudflare-specific guidance (Full-strict SSL mode, `_fly-ownership`
   TXT record) — not needed to make the demo reachable.

No changes to `fly.toml`, `Dockerfile`, `.github/workflows/deploy.yml`, or application code are
needed for any of the above. This is a pure infrastructure/DNS operation layered on top of the
existing, already-gated deploy pipeline — it does not touch the "local → repo → fly.io" code-deploy
rule in `CLAUDE.md`, which governs application changes, not hostname/cert administration. If the
team wants this to go through the same gated ceremony as code anyway (e.g. for audit-trail
reasons), `fly certs add` could instead be scripted into a manually-triggered
(`workflow_dispatch`) job in `.github/workflows/deploy.yml` using the existing `FLY_API_TOKEN`
secret — flagged as an open question below rather than assumed.

---

## 3. Credentials and permissions needed, step by step

| Step | Needs | Who / how | Human required? |
|---|---|---|---|
| `flyctl auth login` | Fly.io account with **write access to the `arag-research-portal` app** (or its org) | Interactive browser OAuth flow | **Yes — always interactive**, cannot be scripted or delegated to an agent. This is explicitly excluded from this investigation per the hard constraints, and would remain a human-only action even outside them. |
| `fly certs add` / `fly certs check` | An authenticated `flyctl` session (from the step above) with deploy/admin rights on the app | CLI, non-interactive once logged in | Not interactive itself, but gated on the login above having been done by a human first. |
| Creating the Cloudflare CNAME record | Cloudflare account access to the **`noice.net.au` zone** with DNS-edit permission (dashboard) or an API token scoped to `Zone:DNS:Edit` for that zone | Cloudflare dashboard, or `wrangler`/Cloudflare API with a suitably-scoped token | Practically yes for a one-off record — simplest done by hand in the dashboard by whoever administers the `noice.net.au` zone. Could be scripted with an API token but that's more ceremony than the task warrants for one record. |
| Verifying the deployed app answers on the new host | None beyond a plain HTTPS request (`curl`) | Anyone | No. |
| (If pursued) Scripting `fly certs add` into a GitHub Actions `workflow_dispatch` job | The existing `FLY_API_TOKEN` repository secret | GitHub Actions, using a secret already present in `jaysanderson/arag-research-portal` | No new credential, but see note below on who can manage it. |

Two things worth being explicit about because they came up while checking "what's already in
place" (part 4): the GitHub repo (`jaysanderson/arag-research-portal`) is owned by `jaysanderson`,
not by Jake's own GitHub account — `gh secret list` against it returned `403: You must have
repository read permissions or have the repository secrets fine-grained permission`, i.e. Jake's
current `gh` auth cannot read or manage that repo's `FLY_API_TOKEN` secret. Whoever does administer
that repo would need to be the one to add a new workflow job if the team goes that route. Separately,
the local Cloudflare (`wrangler`) OAuth token on this machine is scoped very broadly — it includes
`zone:read`, `ssl_certs:write`, `workers:write`, `pages:write`, `d1:write`, `connectivity:admin`,
and more (full list in part 4) — capable of both reading zone config *and* writing DNS/certs/Workers
for whatever account it belongs to. That capability exists on this machine already; this
investigation did not exercise any of the write scopes, per the hard constraints.

---

## 4. What's already in place (read-only findings, nothing changed)

- **`noice.net.au` is on Cloudflare.** Confirmed two ways: `dig NS noice.net.au` returns
  `dell.ns.cloudflare.com.` / `karl.ns.cloudflare.com.`, and `whois noice.net.au` shows the same
  two nameservers with registrar Instra/Domain Directors. No zone transfer or registrar change is
  needed.
- **`fisheries-demo.noice.net.au` does not currently resolve** — no NS delegation, no A/CNAME
  record found (`dig NS` and plain `dig` both empty). It's a clean subdomain to create.
- **Local `wrangler` state exists and is authenticated.** `~/.config/.wrangler/config/default.toml`
  holds a live OAuth token (value not printed). `wrangler whoami` (read-only) confirms it's logged
  in as `jake.tracey@noice.net.au`, account "Jake.tracey@noice.work's Account"
  (`459714503d7cbe9d0b7875e62526628b`), with scopes including `zone:read`, `ssl_certs:write`,
  `workers:write`, `workers_kv:write`, `pages:write`, `d1:write`, `connectivity:admin`,
  `email_routing:write`, and more — i.e. this token could both read the `noice.net.au` zone and
  write DNS/certs/Workers if used. No wrangler command that reads or writes zone/DNS state beyond
  `whoami` was run.
- **Local `flyctl` is installed but not authenticated** for interactive use: `flyctl auth whoami`
  returns `Error: no access token available. Please login with 'flyctl auth login'`, despite
  `~/.fly/config.yml` containing an `access_token` entry (likely stale/expired — this discrepancy
  wasn't investigated further, since diagnosing or refreshing it means logging in, which is
  explicitly out of scope here). `flyctl apps list` fails the same way. No `FLY_API_TOKEN`
  environment variable is set in this shell. **A human will need to run `flyctl auth login`
  interactively before any `fly certs` command will work.**
- **No sibling repo already deploys a Fly app under a `*.noice.net.au` custom domain** — this
  would have been the ideal pattern to copy, and it doesn't exist. What does exist:
  - `arag-demo-factory/portal/fly.toml` and `ncsr/arag-poc/portal/fly.toml` are the same "ARAG
    demo portal on Fly" shape as this app, but their own deploy runbook
    (`.github/agents/deploy-engineer.agent.md`, `.github/prompts/deploy-demo.prompt.md`) stops at
    `<slug>.fly.dev` — no custom domain step exists there either.
  - `hermes-fleet/dashboard` is a genuine **Cloudflare Pages** project (static + Pages Functions +
    D1) with a real custom-domain-on-`noice.net.au` precedent: its README documents "Add
    `fleet.noice.net.au` as a custom domain on the project (we own the zone)" plus a Cloudflare
    Access application. This is the right reference if a future app is Workers/Pages-native, but
    it's not this app, and its persistence model (D1 from day one) is exactly the rewrite this app
    would need to make the Workers route viable.
  - `mmp/deploy/CLOUDFLARE-TUNNEL.md` and `hermes-fleet/SEO-NOICE-DEPLOY.md` document a **Cloudflare
    Tunnel** pattern (`hermes.noice.net.au`, `mmp-uat-*.noice.work`) for exposing self-hosted
    boxes that have no public ingress of their own — not applicable here since Fly already
    provides public HTTPS ingress.
  - A broader scan of `*.noice.net.au` hostnames referenced anywhere under `/Users/jake/Projects`
    turned up `fleet`, `dashboard`, `hermes`, `portal`, `www`, `demo`, `pagekit`,
    `whitelabel`, `sgtm`, several `*-hermes` subdomains, and others — a live, actively-used zone
    with many existing records, but none of them is a Fly custom domain to copy verbatim.
- **GitHub**: `origin` is `github.com/jaysanderson/arag-research-portal` (public repo, branch
  `scaffold` up to date with `origin/scaffold`). `gh auth status` shows Jake logged in as
  `jaketracey` with `repo`/`workflow` scopes, but that identity does **not** have secrets-admin
  rights on this particular repo (`gh secret list` → 403). Working tree currently has unstaged
  changes unrelated to this investigation — left untouched.

---

## 5. Open questions

1. **Who administers the `noice.net.au` Cloudflare zone and the `arag-research-portal` Fly app/org
   day-to-day?** Confirm before handing off step 1/3 above — the local `wrangler` token on this
   machine already has the necessary Cloudflare scopes, but the discrepancy in local `flyctl` auth
   (config file has a token entry, but `flyctl auth whoami` reports none usable) means the Fly side
   needs a fresh interactive login from whoever has the right Fly org membership.
2. **Should `fly certs add` be run ad hoc by a human, or scripted into a `workflow_dispatch` job**
   using the existing `FLY_API_TOKEN` secret, for consistency with the "local → repo → fly.io"
   discipline the team holds for code deploys? Either works; this doc defaults to "ad hoc by a
   human" as the simpler, lower-ceremony choice for a one-off hostname, but it's worth Jay/the repo
   owner confirming that's acceptable given how strict `CLAUDE.md` is about not running things from
   a developer machine.
3. **Does the Fly app currently have a dedicated IPv4/IPv6, or only the shared anycast address?**
   Not checked (requires authenticated `flyctl ips list`, which needs the login in step 1). Doesn't
   change the recommended approach (CNAME to `.fly.dev` works either way and is what Fly recommends
   for subdomains), but worth confirming once someone is logged in.
4. **Any intent to gate this demo** (Cloudflare Access, a passcode, `robots.txt`/noindex) given it's
   a public subdomain of `noice.net.au` serving a named client's (FRDC) demo content? Not raised by
   the brief, not investigated, flagged only because `hermes-fleet`'s otherwise-similar
   `fleet.noice.net.au` deliberately sits behind Cloudflare Access and this one currently would not.
