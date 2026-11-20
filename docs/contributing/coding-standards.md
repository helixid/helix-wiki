---
id: coding-standards
title: Coding Standards & PR Process
sidebar_label: Coding Standards & PR Process
sidebar_position: 2
description: The conventions a HelixID pull request is held to, and where the authoritative rules live.
---

# Coding Standards & PR Process

The authoritative rules live in each repository's own `CONTRIBUTING.md` — start with [`helixid/helixid`](https://github.com/helixid/helixid/blob/main/CONTRIBUTING.md). This page is a summary so you know what to expect before you open a PR; where the two differ, the repository wins.

Two sets of rules matter most and are documented here in full: the [security axioms](../security/security-model.md#security-axioms), which are explicitly non-negotiable — a PR that violates one is rejected without exception — and the [audit log contract](../security/security-model.md#audit-log-contract). Architectural decisions are recorded in [`docs/decisions.md`](https://github.com/helixid/helixid/blob/main/docs/decisions.md), alongside per-topic decision and proposal documents in the same directory.

## Branches and commits

- **Branch names** follow a type prefix — `feat/`, `fix/`, `docs/`, `chore/`.
- **Conventional Commits are required.** `feat:`, `fix:`, `docs:`, `chore:`, and so on, with a scope where it helps. In `helix-sdk-py` the release tooling reads them to pick the next version, so the type matters.
- **Commits must be signed off under the DCO** — `git commit -s`.

## Pull requests

A PR description covers, at minimum:

- **What** the change does
- **Why** it is needed
- **How** it works, where that isn't obvious
- **Testing** — what you ran and what it proved
- **Risk & rollback**
- **Breaking changes**, called out explicitly

Before opening one: build, lint, and test locally — the exact commands differ per repository and are listed under [Running tests](./how-to-contribute.md#running-tests) — and keep the diff scoped to a single concern. In `helix-core` and `helix-sdk-js`, add a changeset (`pnpm changeset`) for any user-visible change.

## TypeScript and tooling

TypeScript throughout the Node repositories, with ESLint and Prettier configured at the repo root. Run `pnpm lint` and `pnpm format` before pushing rather than leaving them for review. `helix-console` has no lint script; `pnpm typecheck` is its static check.

## Cryptography and security-sensitive code

This is the area with the strictest rules, and the one most likely to get a PR sent back:

- **Never roll your own crypto.** The Node packages use the `@noble` libraries — `@noble/ed25519` and `@noble/hashes` in `@helixid/sdk-js`, plus `@noble/curves` in `@helixid/core` — and the Python SDK uses `pynacl` and `cryptography`. No other crypto dependency is accepted without a decision-log entry.
- **`helix-core` and the SDKs own crypto.** Adapters, middleware, and examples must not hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics. Two code paths that are supposed to agree and don't is a security bug, not a style issue.
- Changes to verification, delegation-chain walking, or revocation handling need tests that cover the **rejection** paths, not just the happy path.
- **Security tests may never be skipped.** Tests in the security suites (`tests/security` in `helix-core`, `pnpm test:security` there and in `@helixid/sdk-js`) cannot be marked skip, todo, or `xit`.
- **Every route needs an OpenAPI spec entry and a request schema.** The spec lives in `helix-core` at `src/core/openapi/openapi.yaml`, and no unvalidated input may reach a service layer.

## Testing

New behaviour needs tests. For anything touching the trust path, prove the negative case: that an invalid signature, an expired credential, an over-scoped delegation, or a revoked bit is actually refused.

The consent demo's own regression test is a good model — it asserts on consent-prompt **counts** rather than just "the booking worked", because the interesting failure mode still produces a successful booking.

## Documentation

Changes that alter a public surface should update:

- The relevant SDK, API, or CLI reference in the repository's `docs/`
- This wiki, if the change affects documented behaviour
- The [decision log](../architecture/design-decisions.md), for any new dependency, significant architectural decision, or deviation from the constitution

The decision log is **append-only**. Add entries; never edit or delete existing ones.

:::warning[Don't regress corrected claims]
Two claims in this project have already been through a correctness pass and must not be reverted to their earlier, looser forms:

- Verification is **not** "offline" unqualified. The claim is *no synchronous call to the issuer to authorize this specific request*. See [What "Offline Verification" Actually Means](../concepts/offline-verification.md).
- There are **two** issuer roles, not one. The platform issues the agent's ceiling; the service provider issues the user's consent grant. See [The Two-Issuer Model](../concepts/two-issuer-model.md).

Any copy that says "offline" without the qualifier, or that describes a single issuer, should be corrected on sight.
:::

## Review and merging

Expect review on correctness first, then on whether the change fits the existing architecture. A change that cuts across an entry in the decision log will be discussed as a decision, not just as code — which is why [opening an issue first](./how-to-contribute.md#before-you-start) saves time on anything non-trivial.

## Releases

Packages are versioned independently, each following semver, and they are not all pre-1.0:

| What | Current version | How it is released |
| --- | --- | --- |
| `@helixid/core` | 3.0.0 | [changesets](https://github.com/changesets/changesets) in `helix-core`. Merging the generated release PR publishes to npm |
| `@helixid/sdk-js` | 0.6.0 | changesets in `helix-sdk-js`, one version per package |
| `@helixid/mcp-middleware`, `@helixid/langchain` | 0.4.0 | same |
| `@helixid/cli`, `@helixid/widget` | 0.3.1 | same |
| `@helixid/mcp-server` | 0.2.2 | same |
| `@helixid/did-hedera` | 0.2.1 | same |
| `helixid-sdk-py` | 2.1.0 | [release-please](https://github.com/googleapis/release-please) in `helix-sdk-py`. It reads Conventional Commits, opens a release PR, and merging that PR publishes to PyPI |
| `helixid/console` image | — | Every push to `main` in `helix-console` publishes `:latest` and a `:<git-sha>` tag |
| `@helixid/api` (the `helixid` repository) | — | Private; not published to npm. You build and run it from source |

A major bump means a breaking change: `@helixid/core` and `helixid-sdk-py` have both had them. The JS packages still under `0.x` may include breaking changes in a minor release; these are called out in each package's `CHANGELOG.md`.

Versions in this table are as of this page's last update. Security patches are provided for the latest release of each package only — see the [Security Model](../security/security-model.md#supported-versions).
