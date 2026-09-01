# fisheries-demo.noice.net.au - how the demo domain is served

Status: **live on Cloudflare**. The demo domain is a Workers custom domain on the production
`corpuskit` Worker - the same Worker that serves `corpuskit.noice.net.au` (see `wrangler.jsonc`
`routes`). One deploy serves both hostnames; there is no per-domain configuration in the app.

## How it works

- Production is the Cloudflare Worker deployed by `.github/workflows/deploy.yml` on every push
  to `main` (gate first, then a pinned Wrangler deploy). Nothing else deploys.
- `fisheries-demo.noice.net.au` and `corpuskit.noice.net.au` are both declared as
  `custom_domain` routes in `wrangler.jsonc`. Cloudflare owns the DNS records for a custom
  domain; do not hand-edit them in the zone.
- The scheduled live acceptance sweep (`.github/workflows/acceptance.yml`) targets
  `corpuskit.noice.net.au` - the canonical hostname - so monitoring survives any future change
  to the demo alias.

## History

The portal originally ran on Fly.io (`arag-research-portal.fly.dev`) with the demo domain
CNAMEd to it. The Cloudflare migration (PR #66, with fixes in #68/#69) moved production to a
Worker + Durable Object, and the demo domain was cut over to the Worker afterwards
(2026-09-01). The Fly app was left in place, undeployed, as a short-term fallback; `fly.toml`
was removed from the repo when the CI deploy path stopped referencing Fly. An earlier version
of this document was the pre-migration investigation into whether a Workers port was viable -
see git history if that analysis is ever needed again.
