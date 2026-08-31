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

The site URL is not hardcoded — `docusaurus.config.ts` reads a `CUSTOM_DOMAIN` environment variable, which the deploy workflow supplies from a repository variable. Switching domains needs **no code change**:

1. Add a DNS record at the provider for the domain:

   | Type | Name | Value |
   | --- | --- | --- |
   | `CNAME` | `wiki` | `helixid.github.io` |

   (`wiki` is the subdomain; `helixid.github.io` is the Pages host — note there is no repo name and no `https://`.)

2. In **Settings → Secrets and variables → Actions → Variables**, add a repository variable:

   | Name | Value |
   | --- | --- |
   | `CUSTOM_DOMAIN` | `wiki.helixid.dev` |

3. Re-run the deploy workflow. The build switches `baseUrl` to `/` and writes `build/CNAME` automatically.
4. Once DNS propagates, enable **Enforce HTTPS** in Settings → Pages.

Removing the variable reverts the site to the `github.io` URL on the next deploy.

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
