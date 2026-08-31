---
id: coding-standards
title: Coding Standards & PR Process
sidebar_label: Coding Standards & PR Process
sidebar_position: 2
description: The conventions a HelixID pull request is held to, and where the authoritative rules live.
---

# Coding Standards & PR Process

The complete and authoritative rules live in [`CONTRIBUTING.md`](https://github.com/helixid/helixid/blob/main/CONTRIBUTING.md) and [`constitution.md`](https://github.com/helixid/helixid/blob/main/constitution.md) in the code repository. This page is a summary so you know what to expect before you open a PR — it is not a substitute for reading the real thing, and where the two differ, the repository wins.

The constitution is the stricter of the two. It covers monorepo structure, the technology stack, [security axioms](../security/security-model.md#security-axioms), API contract rules, the `helix-core` communication model, error handling, environment variables, the [audit log contract](../security/security-model.md#audit-log-contract), dependency policy, testing constraints, and the project's definition of done. Its security axioms are explicitly non-negotiable — a PR that violates one is rejected without exception.

## Branches and commits

- **Branch names** follow a type prefix — `feat/`, `fix/`, `docs/`, `chore/`.
- **Conventional Commits are required.** `feat:`, `fix:`, `docs:`, `chore:`, and so on, with a scope where it helps.
- **Commits must be signed off under the DCO** — `git commit -s`.

## Pull requests

A PR description covers, at minimum:

- **What** the change does
- **Why** it is needed
- **How** it works, where that isn't obvious
- **Testing** — what you ran and what it proved
- **Risk & rollback**
- **Breaking changes**, called out explicitly

Before opening one: build, lint, and test locally, and keep the diff scoped to a single concern.

## TypeScript and tooling

TypeScript throughout, with ESLint and Prettier configured at the repo root. Run the lint and format tasks before pushing rather than leaving them for review.

## Cryptography and security-sensitive code

This is the area with the strictest rules, and the one most likely to get a PR sent back:

- **Only `@noble/curves` and `@noble/hashes`** for cryptographic operations. No other crypto dependency is accepted without a decision-log entry.
- **`helix-core` owns crypto.** Adapters, middleware, and examples must not hand-roll VP canonicalization, base58/base64url encoding, Ed25519 signing, or verification semantics. Two code paths that are supposed to agree and don't is a security bug, not a style issue.
- Changes to verification, delegation-chain walking, or revocation handling need tests that cover the **rejection** paths, not just the happy path.
- **Security tests may never be skipped.** Tests in the security suite cannot be marked skip, todo, or `xit`. CI greps for it, and a skipped security test fails the build.
- **Every route needs an OpenAPI spec entry and a Fastify JSON Schema.** A route handler with no spec definition is a build failure, and no unvalidated input may reach a service layer.

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

HelixID is pre-1.0 and packages are versioned independently under `0.x`. Security patches are provided for the latest minor release only — see the [Security Model](../security/security-model.md#supported-versions).
