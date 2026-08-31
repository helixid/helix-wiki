<p align="center">
  <img src="static/img/logo.png" alt="HelixID" width="88">
</p>

<h1 align="center">HelixID Documentation</h1>

<p align="center">
  The source of <a href="https://docs.helixid.dev"><strong>docs.helixid.dev</strong></a> —
  the documentation site for
  <a href="https://github.com/helixid/helixid">HelixID</a>,
  cryptographic identity and authorization for AI agents.
</p>

<p align="center">
  <a href="https://docs.helixid.dev"><img src="https://img.shields.io/badge/docs-docs.helixid.dev-ff6a00.svg" alt="Docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://github.com/helixid/helixid"><img src="https://img.shields.io/badge/main%20repo-helixid%2Fhelixid-181717.svg" alt="Main repo"></a>
</p>

---

## Contributing an edit

**Most changes here are plain Markdown.** You don't need React, TypeScript, or any
Docusaurus knowledge to make one.

### Fixing a typo, a link, or a wrong sentence

Every page on the site has an **"Edit this page"** link at the bottom. It opens the
right file on GitHub, where you can edit in the browser and open a pull request.
No clone, no install. That's the whole workflow.

### Anything larger

```bash
git clone https://github.com/helixid/helix-wiki.git
cd helix-wiki
npm install
npm start
```

`npm start` serves the site at `http://localhost:3000` and reloads as you save.

Before opening a pull request:

```bash
npm run build
```

**Broken internal links and broken heading anchors fail the build**, so a green
build means every cross-reference resolves. CI runs the same command.

Node 20+. `.nvmrc` pins the version the project uses — run `nvm use` to match it.

---

## Where things live

```
docs/                  All page content. One folder per sidebar group.
├── get-started/       Introduction, quick start, installation
├── concepts/          DIDs, credentials, delegation, revocation
├── architecture/      System design, layers, performance, ADRs
├── sdk/               Package-by-package API reference
├── integrations/      LangChain, MCP
├── examples/          The runnable demos
├── self-hosting/      Running the issuer yourself
├── comparisons/       Why not OAuth / API keys / raw Ed25519
├── security/          Security model, reporting, safe harbor
├── contributing/      Contributor-facing docs (the published ones)
└── roadmap.md         Shipped vs. planned vs. parked

sidebars.ts            Sidebar order and grouping
docusaurus.config.ts   Navbar, footer, theme options
src/css/custom.css     HelixID brand theme
src/components/        The few React components the docs use
static/img/            Logo, favicon, diagrams
```

### Adding a page

1. Create the `.md` file in the right `docs/` folder.
2. Add front matter — copy the shape from a neighbouring page.
3. **Add its id to `sidebars.ts`.** A page missing from the sidebar builds fine but
   is unreachable.
4. Run `npm run build`.

---

## Conventions worth knowing

Full detail is in [CONTRIBUTING.md](CONTRIBUTING.md). The three that catch people out:

**Documentation describes what ships.** If something is documented without a status
badge, it's available in the current release. Anything unshipped belongs in
`docs/roadmap.md`, unchecked, with a `Planned` or `Parked` badge.

**Two claims must not regress.** Both were corrected once from looser versions:

- Verification is **not** "offline" unqualified — the claim is *no synchronous call
  to the issuer to authorize this specific request*.
- There are **two** issuer roles, not one — the platform issues the agent's ceiling,
  the service provider issues the user's consent grant, and they are never merged.

**MDX has sharp edges.** These fail confusingly:

| Do | Don't |
|---|---|
| `:::note[Title]` | `:::note Title` |
| Auto-generated heading ids | `## Heading {#custom-id}` |
| `<Figure src="img/x.svg" alt="…" />` | `<img src="/img/x.svg">` |
| `[text](../concepts/delegation.md)` | `[text](/concepts/delegation)` |

---

## Reporting instead of fixing

| | |
|---|---|
| Something wrong in the docs | [Open an issue here](https://github.com/helixid/helix-wiki/issues) |
| A bug in HelixID itself | [helixid/helixid issues](https://github.com/helixid/helixid/issues) |
| A security vulnerability | Don't open an issue — see [SECURITY.md](SECURITY.md) |
| A question | [GitHub Discussions](https://github.com/helixid/helixid/discussions) |

---

## Deployment

Pushing to `main` publishes the site. Hosting and domain configuration are managed
by the maintainers — contributors don't need to set anything up, and a pull request
never needs deployment steps.

Pull requests run a build-only check that does not deploy.

---

## Code of conduct and license

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

Documentation content is published under the [Apache License 2.0](LICENSE), the same
license as HelixID.

Built by [DgVerse](https://www.dgverse.in).
