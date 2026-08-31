---
id: how-to-contribute
title: How to Contribute
sidebar_label: How to Contribute
sidebar_position: 1
description: Where help is most useful, how to set up the development environment, and how to run the tests.
---

# How to Contribute

Contributions are welcome. This page is the orientation; the [`CONTRIBUTING.md`](https://github.com/helixid/helixid/blob/main/CONTRIBUTING.md) in the code repository is the authoritative and complete version, and is the one to follow when actually opening a PR.

## Where help is most useful

- **DID method implementations** — additional DID method resolvers
- **Framework integrations** — middleware for additional AI agent frameworks
- **Documentation** — tutorials, guides, and examples

Beyond those, bug reports with a minimal reproduction, and improvements to the example apps, are always useful.

:::note[Security issues do not go through this process]
Do not open a public issue or PR for a vulnerability. See [Reporting a Vulnerability](../security/reporting-a-vulnerability.md).
:::

## Before you start

For anything beyond a small fix, open an issue or a [GitHub Discussion](https://github.com/helixid/helixid/discussions) first. HelixID has a written constitution and an append-only [decision log](../architecture/design-decisions.md), and a change that cuts across an existing decision is much easier to agree on before the code is written than after.

## Development setup

Prerequisites and bootstrap:

```bash
pnpm install
pnpm build
```

This is a pnpm workspace — `pnpm`, not `npm`. Internal dependencies are linked with `workspace:*`, and phantom dependencies are deliberately impossible. See [Design Decisions](../architecture/design-decisions.md).

Configure `.env` from `.env.example` before running anything that needs the API. The default runtime is SQLite plus an in-memory cache plus `did:web`, with no external infrastructure. Full variable list: [Environment & Configuration](../self-hosting/configuration.md).

```bash
set -a; source .env; set +a
pnpm --filter @helixid/api dev
```

## Running tests

```bash
pnpm test
```

End-to-end tests live in the `e2e/` package. Hedera testnet writes are gated behind `HEDERA_E2E_TESTNET`, which must stay `false` in standard CI.

The demo apps have their own test suites — for instance, the consent demo's regression test asserts on consent-prompt **counts**:

```bash
pnpm --filter @helixid/example-e2e-consent-demo test
```

## Repository layout

See [Project Structure](../get-started/project-structure.md) for the full tree and which workspace owns what.

The rule that matters most for contributors: **`helix-core` owns everything cryptographic.** Adapters and integrations must not hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics.

## Licensing of contributions

HelixID is [Apache License 2.0](https://github.com/helixid/helixid/blob/main/LICENSE) — chosen for enterprise compatibility, explicit patent protection, and no copyleft friction for proprietary AI agent integrations. Contributions are accepted under the same license, and commits must be signed off under the DCO.

## Community

- [GitHub Discussions](https://github.com/helixid/helixid/discussions) — questions, ideas, and show-and-tell
- [GitHub Issues](https://github.com/helixid/helixid/issues) — bug reports and feature requests

A Code of Conduct applies to all project spaces; it is in the repository as [`CODE_OF_CONDUCT.md`](https://github.com/helixid/helixid/blob/main/CODE_OF_CONDUCT.md).

## Next

[Coding Standards & PR Process](./coding-standards.md)
