# Contributing to the HelixID docs

Thanks for helping improve the documentation. This repository builds
[docs.helixid.dev](https://docs.helixid.dev).

Most contributions here are **Markdown edits**. You do not need to know React,
TypeScript, or Docusaurus to make one.

- Fixing a typo or a broken link? [Edit it on GitHub](#the-quickest-path) — no clone needed.
- Adding or restructuring a page? [Run it locally](#running-the-site-locally).
- Reporting something wrong without fixing it? [Open an issue](https://github.com/helixid/helix-wiki/issues).

Code changes to HelixID itself belong in [helixid/helixid](https://github.com/helixid/helixid).

---

## The quickest path

Every page has an **"Edit this page"** link at the bottom. It opens the right file
on GitHub, where you can edit in the browser and open a pull request without
cloning anything. For small corrections this is the whole workflow.

---

## Running the site locally

Needed for anything larger — new pages, sidebar changes, or anything you want to
see rendered before proposing.

```bash
git clone https://github.com/helixid/helix-wiki.git
cd helix-wiki
npm install
npm start
```

`npm start` opens `http://localhost:3000` with hot reload; saved edits appear
immediately.

Node 20 or newer. `.nvmrc` pins the version the project uses — `nvm use` picks it up.

Before opening a pull request:

```bash
npm run build
```

This is the check that matters. **Broken internal links and broken heading
anchors fail the build**, so a green build means every cross-reference you wrote
resolves. CI runs the same command on your pull request.

---

## Where things live

```
docs/                  All page content. One folder per sidebar group.
├── get-started/
├── concepts/
├── architecture/
├── sdk/               Package-by-package API reference
├── integrations/
├── examples/
├── self-hosting/
├── comparisons/
├── security/
├── contributing/
└── roadmap.md
sidebars.ts            Sidebar order and grouping
docusaurus.config.ts   Navbar, footer, theme options
src/css/custom.css     HelixID brand theme
src/components/        The few React components the docs use
static/img/            Logo, favicon, diagrams
```

Deployment is handled by the maintainers and needs nothing from you.

### Adding a page

1. Create the `.md` file in the right `docs/` folder.
2. Add front matter — copy the shape from a neighbouring page.
3. **Add its id to `sidebars.ts`.** A page missing from the sidebar is unreachable
   even though it builds.
4. Run `npm run build` to confirm links resolve.

---

## Writing conventions

### Documentation describes what ships

If a capability is documented without a status badge, it is available in the
current release. Anything unshipped belongs in `docs/roadmap.md`, unchecked,
with a `Planned` or `Parked` badge. Do not describe planned behaviour in the
present tense anywhere else.

### Two claims that must not regress

Both have already been corrected once from looser versions. Reverting either is
a documentation bug, not a simplification:

- **Verification is not "offline" unqualified.** The claim is *no synchronous call
  to the issuer to authorize this specific request*. DID resolution and revocation
  are still reads — static and cacheable, but reads. See
  `docs/concepts/offline-verification.md`.
- **There are two issuer roles, not one.** The platform issues the agent's authority
  ceiling; the service provider issues the user's consent grant, and they are never
  merged. See `docs/concepts/two-issuer-model.md`.

If you find copy that says "offline" without the qualifier, or that describes a
single issuer, correcting it is a welcome pull request on its own.

### Code samples must be real

Samples are copied from the repository's tested examples. If you change one,
make sure it still reflects what the shipped API does — a sample that no longer
runs is worse than no sample. Match the published package names exactly
(`@helixid/sdk-js`, not `@helixid/sdk`).

### Markdown and MDX gotchas

These fail in ways the build does not always explain clearly:

| Do | Don't | Why |
|---|---|---|
| `:::note[Title]` | `:::note Title` | The space form silently renders as literal text under MDX v3 |
| Let headings auto-generate ids | `## Heading {#custom-id}` | MDX parses the braces as JSX and the build fails |
| `<Figure src="img/x.svg" alt="…" />` | `<img src="/img/x.svg">` | A leading slash ignores `baseUrl` and 404s on some deployments |
| `[text](../concepts/delegation.md)` | `[text](/concepts/delegation)` | Relative file links are validated at build time |

For images, give the SVG an intrinsic `width`/`height` alongside its `viewBox`
and pass the same values to `<Figure>`, or a lazy-loaded image collapses to zero
height.

### Style

Write for engineers. Lead with the problem, be concrete, and prefer a short
correct sentence to a long impressive one. Tables work well for comparisons;
prose works better for reasoning. Avoid hype — the audience is people deciding
whether to trust a security primitive.

---

## Pull requests

- Branch names: `docs/`, `fix/`, `chore/`.
- [Conventional Commits](https://www.conventionalcommits.org/) — `docs:`, `fix:`, `chore:`.
- Sign off your commits under the DCO: `git commit -s`.
- Keep the diff to one concern. A typo fix and a restructure are two pull requests.
- Say what changed and why. If you changed a technical claim, say what you checked
  it against — the source file, the running code, or a specific package version.

Anything that reorganizes the sidebar or adds a top-level section is worth
[opening an issue](https://github.com/helixid/helix-wiki/issues) first, so the
structure can be agreed before you write.

---

## Reporting problems

- **Something wrong in the docs** — [open an issue here](https://github.com/helixid/helix-wiki/issues).
- **A bug in HelixID itself** — [helixid/helixid issues](https://github.com/helixid/helixid/issues).
- **A security vulnerability** — do not open an issue. See [SECURITY.md](SECURITY.md).
- **A question** — [GitHub Discussions](https://github.com/helixid/helixid/discussions).

---

## Code of conduct and licensing

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

Contributions are accepted under the [Apache License 2.0](LICENSE), the same
license as HelixID.
