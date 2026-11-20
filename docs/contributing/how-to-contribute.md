---
id: how-to-contribute
title: How to Contribute
sidebar_label: How to Contribute
sidebar_position: 1
description: Where help is most useful, how to set up the development environment, and how to run the tests.
---

# How to Contribute

Contributions are welcome. This page is the orientation; each repository's own `CONTRIBUTING.md` is the authoritative process for that repository, and is the one to follow when actually opening a PR — start with [`helixid/helixid`](https://github.com/helixid/helixid/blob/main/CONTRIBUTING.md).

## Where help is most useful

- **DID method implementations** — additional DID method resolvers
- **Framework integrations** — middleware for additional AI agent frameworks
- **Documentation** — tutorials, guides, and examples

Beyond those, bug reports with a minimal reproduction, and improvements to the example apps, are always useful.

## Improving these docs

This site is open source too, in its own repository: [helixid/helix-wiki](https://github.com/helixid/helix-wiki).

**Every page has an "Edit this page" link at the bottom.** It opens the source file on GitHub, where you can edit in the browser and open a pull request — no clone, no local setup. For a typo, a broken link, or a sentence that is wrong, that is the entire workflow.

For anything larger — a new page, or restructuring a section:

```bash
git clone https://github.com/helixid/helix-wiki.git
cd helix-wiki
npm install
npm start
```

Pages are Markdown; you do not need to know React or Docusaurus to write one. `npm run build` is the check to run before opening a pull request — broken internal links fail the build, so a green build means every cross-reference resolves.

If you spot something wrong but would rather not fix it yourself, [open an issue](https://github.com/helixid/helix-wiki/issues) — that is genuinely useful on its own. Details and conventions are in the repository's [CONTRIBUTING.md](https://github.com/helixid/helix-wiki/blob/main/CONTRIBUTING.md).

:::note[Security issues do not go through this process]
Do not open a public issue or PR for a vulnerability. See [Reporting a Vulnerability](../security/reporting-a-vulnerability.md).
:::

## Before you start

For anything beyond a small fix, open an issue or a [GitHub Discussion](https://github.com/helixid/helixid/discussions) first. HelixID has a written constitution and an append-only [decision log](../architecture/design-decisions.md), and a change that cuts across an existing decision is much easier to agree on before the code is written than after.

## Development setup

Which repository to clone depends on what you are changing — see [Project Structure](../get-started/project-structure.md#which-repository-does-my-change-belong-in).

The Node repositories need Node `^20.19.0 || >=22.12.0` (20.0–20.18 will not work) and pnpm 9 or later; `corepack enable` picks up the pinned `pnpm@9.15.2`. Each has an `.nvmrc`. Bootstrap is the same in all of them:

```bash
pnpm install
pnpm build
```

Use `pnpm`, not `npm`. In `helix-sdk-js` the packages depend on each other through the workspace (`workspace:^`). `helixid` is different: it consumes `@helixid/core` and `@helixid/sdk-js` as published npm packages, so a change in `helix-core` reaches the server only through a release.

For the server, configure `.env` from `.env.example` before running anything that needs the API. `.env.example` sets up SQLite, an in-memory cache and `did:web`, with no external infrastructure. Full variable list: [Environment & Configuration](../self-hosting/configuration.md).

```bash
set -a; source .env; set +a
pnpm dev
```

`helix-sdk-py` is a plain Python project:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,all]"
```

## Running tests

The script names differ per repository. These are the ones that exist in each `package.json`:

| Repository | Before opening a PR | Also available |
| --- | --- | --- |
| `helixid` | `pnpm test:non-live` | `pnpm test:all`, `pnpm test:live` (needs a configured `.env`), `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck` |
| `helix-core` | `pnpm test` (live tests excluded, with coverage thresholds) | `pnpm test:non-live`, `pnpm test:unit`, `pnpm test:security`, `pnpm test:live`, `pnpm lint`, `pnpm typecheck` |
| `helix-sdk-js` | `pnpm test` (all packages, through Turborepo) | `pnpm test:unit`, `pnpm test:non-live`, `pnpm lint`, `pnpm typecheck`; `pnpm --filter @helixid/sdk-js test:security` |
| `helix-console` | `pnpm test` (with coverage) | `pnpm test:non-live`, `pnpm typecheck`, `pnpm build` |
| `helix-sdk-py` | `pytest` | `pytest -v` (what CI runs), `pytest tests/<file>` |

:::note[`helixid` has no `pnpm test`]
The server repository has no bare `test` script, and no `lint:fix`. Its `CONTRIBUTING.md` still lists both in its checklist and quick-reference table; use `pnpm test:non-live` and `pnpm format`. CI there runs the workspace variants, `pnpm workspace:test:non-live` and `pnpm workspace:typecheck`, which also cover `examples/` and `e2e/`.
:::

In `helixid`, end-to-end tests live in the `e2e/` package. Hedera testnet writes are gated behind `HEDERA_E2E_TESTNET`, which must stay `false` in standard CI.

The demo apps have their own test suites — for instance, the consent demo's regression test asserts on consent-prompt **counts**:

```bash
pnpm --filter @helixid/example-e2e-consent-demo test
```

In `helix-core`, run `pnpm test:security` before opening any PR that touches verification, keys, or anything else crypto-adjacent.

## Changesets

`helix-core` and `helix-sdk-js` version their packages with [changesets](https://github.com/changesets/changesets). If your change there is user-visible, add one with `pnpm changeset` and commit the generated file. `helixid` and `helix-console` are not published to npm and have no changeset step. `helix-sdk-py` uses release-please, which reads Conventional Commit messages, so there is nothing to add by hand. See [Releases](./coding-standards.md#releases).

## Repository layout

See [Project Structure](../get-started/project-structure.md) for the full tree and which workspace owns what.

The rule that matters most for contributors: **`helix-core` and the SDKs own everything cryptographic.** Adapters, integrations and examples must not hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics.

## Licensing of contributions

HelixID is [Apache License 2.0](https://github.com/helixid/helixid/blob/main/LICENSE) — chosen for enterprise compatibility, explicit patent protection, and no copyleft friction for proprietary AI agent integrations. Contributions are accepted under the same license, and commits must be signed off under the DCO.

## Community

- [GitHub Discussions](https://github.com/helixid/helixid/discussions) — questions, ideas, and show-and-tell
- [GitHub Issues](https://github.com/helixid/helixid/issues) — bug reports and feature requests

A Code of Conduct applies to all project spaces; it is in the repository as [`CODE_OF_CONDUCT.md`](https://github.com/helixid/helixid/blob/main/CODE_OF_CONDUCT.md).

## Next

[Coding Standards & PR Process](./coding-standards.md)
