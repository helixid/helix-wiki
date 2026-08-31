# helix-wiki

Public documentation site for **[HelixID](https://github.com/helixid/helixid)** — cryptographic identity and authorization for AI agents.

Built with [Docusaurus 3](https://docusaurus.io/), deployed to GitHub Pages at **https://helixid.github.io/helix-wiki/**.

## Local development

```bash
npm install
npm start
```

Opens http://localhost:3000 with hot reload.

## Build

```bash
npm run build
```

Outputs a static site to `build/`. Preview it with `npm run serve`.

Broken internal links and broken heading anchors **fail the build** (`onBrokenLinks` and `onBrokenAnchors` are both set to `throw`). That is deliberate — the build is the link check.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and publishes it to GitHub Pages. Pull requests run `.github/workflows/test-build.yml`, which builds without deploying.

### One-time setup

1. **The repository must be public.** GitHub Pages on a private repository requires GitHub Enterprise Cloud; the `helixid` org is on the free plan.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.

That's it. The site publishes to `https://helixid.github.io/helix-wiki/`.

### Moving to a custom domain later

`helixid.dev` is already registered and its DNS is hosted on **Cloudflare**, so a docs
subdomain needs no purchase — just one record. `docs.helixid.dev` and
`wiki.helixid.dev` are both currently unused.

The site URL is not hardcoded: `docusaurus.config.ts` reads a `CUSTOM_DOMAIN`
environment variable that the deploy workflow supplies from a repository variable.
Switching domains needs **no code change**.

#### 1. Add the DNS record (Cloudflare)

In the Cloudflare dashboard for `helixid.dev`, go to **DNS → Records → Add record**:

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `docs` |
| Target | `helixid.github.io` |
| Proxy status | **DNS only** (grey cloud) |
| TTL | Auto |

The target is the Pages host — the org name plus `.github.io`. It is **not** the repo
URL: no `/helix-wiki` path, no `https://`, no trailing slash.

> **The proxy must be off.** Cloudflare's orange-cloud proxy in front of GitHub Pages
> causes redirect loops and TLS errors, because both sides try to terminate HTTPS and
> issue certificates. This is the most common way this setup fails. Set the record to
> **DNS only**. If you later want Cloudflare's CDN in front of it, that needs a
> different configuration (Full/Strict SSL) and should be changed deliberately, not by
> flipping the cloud icon.

#### 2. Add the repository variable

**Settings → Secrets and variables → Actions → Variables → New repository variable:**

| Name | Value |
| --- | --- |
| `CUSTOM_DOMAIN` | `docs.helixid.dev` |

A bare hostname — no scheme, no trailing slash. Whatever you put here is what the site
builds for, so this same flow works for any subdomain.

> **Set the domain here, not only in the Pages UI.** Because this repo deploys through
> GitHub Actions rather than from a branch, the published site is whatever the workflow
> uploads. Typing a domain into **Settings → Pages** without setting this variable means
> the next deploy uploads an artifact with no `CNAME` file and clears the setting again.
> The workflow writes `build/CNAME` from this variable, which makes the domain survive
> every redeploy.

#### 3. Re-run the deploy

Re-run the latest **Deploy to GitHub Pages** run from the Actions tab, or push any
commit to `main`. The build switches `baseUrl` from `/helix-wiki/` to `/` and writes the
`CNAME` file.

#### 4. Enable HTTPS

Once DNS propagates, **Settings → Pages** will show the custom domain and provision a
certificate. Tick **Enforce HTTPS** when it becomes available — it is greyed out until
the certificate is issued, which usually takes a few minutes but can take up to an hour.

#### Afterwards

- Point the **Docs** link on `helixid.dev` at the new URL.
- Consider verifying the domain at **org Settings → Pages → Verified domains**, which
  stops anyone else's GitHub account from claiming a `helixid.dev` subdomain for Pages.
- Removing the `CUSTOM_DOMAIN` variable reverts the site to the `github.io` URL on the
  next deploy. Nothing else needs to change.

## Structure

```
docs/                 # All documentation content, one directory per sidebar group
├── get-started/
├── concepts/
├── architecture/
├── sdk/              # Package-by-package API reference
├── integrations/
├── examples/
├── self-hosting/
├── comparisons/
├── security/
├── contributing/
└── roadmap.md
sidebars.ts           # Sidebar structure — pages must be listed here to appear
docusaurus.config.ts  # Site config, navbar, footer, theme options
src/css/custom.css    # HelixID brand theme (Infima variable overrides)
static/img/           # Logo, favicon, social card, flow diagram
```

## Writing conventions

- **Docs are the source of truth for what ships.** If a capability is described in `docs/` without a status badge, it is available in the current release. Anything unshipped belongs in `docs/roadmap.md`, unchecked, with a `Planned` or `Parked` badge.
- **Status badges** are plain spans: `<span className="helix-badge helix-badge--planned">Planned</span>`. Variants: `--shipped`, `--planned`, `--parked`.
- **Admonition titles use bracket syntax** — `:::note[Title]`, not `:::note Title`. The space-separated form silently fails to parse under MDX v3.
- **Avoid explicit heading IDs** (`{#custom-id}`). MDX v3 parses the braces as a JSX expression and the build fails. Rely on auto-generated slugs.
- **Link between pages with relative markdown paths** (`../concepts/delegation.md`) so the build validates them.
- **Never use a raw `<img src="/img/...">`.** A leading-slash path ignores `baseUrl` and 404s whenever the site is served from a subpath — which is the default GitHub Pages URL. Use the globally-registered `<Figure src="img/foo.svg" alt="..." />` component (`src/components/Figure.tsx`), which resolves paths through `useBaseUrl`. Docusaurus does not catch this at build time; it only shows up as a missing image in the browser.
- **Give SVGs an intrinsic `width`/`height`** on the root element alongside `viewBox`, and pass the same values to `<Figure>`. Without them a lazy-loaded SVG collapses to zero height.

### Two claims that must not regress

Both have already been through a correctness pass. Reverting either to its earlier, looser form is a documentation bug:

- Verification is **not** "offline" unqualified. The claim is *no synchronous call to the issuer to authorize this specific request*. DID resolution and revocation are still reads — static and cacheable, but reads. See `docs/concepts/offline-verification.md`.
- There are **two** issuer roles, not one. The platform issues the agent's authority ceiling; the service provider issues the user's consent grant. They are never merged. See `docs/concepts/two-issuer-model.md`.

## License

Documentation content is published under the same [Apache License 2.0](https://github.com/helixid/helixid/blob/main/LICENSE) as HelixID itself.
