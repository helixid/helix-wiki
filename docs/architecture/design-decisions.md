---
id: design-decisions
title: Design Decisions (ADRs)
sidebar_label: Design Decisions
sidebar_position: 4
description: The architectural decisions behind HelixID and the reasoning recorded for each.
---

# Design Decisions

HelixID keeps an append-only decision log in the code repository at [`docs/decisions.md`](https://github.com/helixid/helixid/blob/main/docs/decisions.md). Every new dependency, significant architectural decision, and deviation from the project constitution is recorded there. Entries are never deleted or modified.

This page summarizes the decisions that shape what you see in the API. For the full reasoning and the alternatives that were rejected, read the log.

## Trust and cryptography

### Bitstring Status List for revocation

Revocation uses W3C StatusList2021 — a gzip-compressed, base64url-encoded bitstring.

**Why:** privacy-preserving (verifiers cannot tell which VC is being checked from the index alone), cacheable (verifiers can hold the list and check without a per-credential call), and standard.

**Rejected:** a simple revocation registry listing revoked `vcId`s — it leaks which VCs have been revoked and requires a per-VC network call to check. See [Revocation](../concepts/revocation.md).

### Only `@noble/curves` and `@noble/hashes` for cryptography

These are the only libraries permitted for cryptographic operations in the JS/TS packages.

**Why:** audited, maintained, no native dependencies, tree-shakeable.

**Rejected:** Node's `node:crypto` built-ins — insufficient for Ed25519 VP signing in a browser-compatible SDK. `tweetnacl` — unmaintained.

### Agent wallet uses AES-256-GCM with PBKDF2

`AgentWallet` encrypts the private key at rest with AES-256-GCM, keyed via PBKDF2 (100,000 iterations, SHA-256, 32-byte output, 16-byte random salt), using Node's built-in `crypto`.

**Why:** no additional dependency; 100k PBKDF2 iterations adequately protect a local wallet file against offline brute force; AES-256-GCM is authenticated, so tampering with the file is detectable.

**Rejected:** argon2 — a stronger KDF, but requires a native addon, breaking the SDK's browser-compatibility goal. libsodium — an extra dependency for the same algorithm class.

### Delegation is agent-signed (Option A)

Agent A signs a child VC locally; verifiers enforce chain integrity, scope subsetting, and max depth from the chain itself. There is no API delegation endpoint.

**Why:** requiring an issuer round trip to delegate would put the issuer on the hot path of every agent-to-agent hand-off — the coupling HelixID exists to remove. See [Delegation](../concepts/delegation.md).

### Two issuer roles, not one

The platform issues `HelixAgentCredential`; the service provider issues `DelegationGrantCredential` after user consent. Corrected in August 2026 from an earlier single-issuer description. See [The Two-Issuer Model](../concepts/two-issuer-model.md).

### The offline-verification claim, stated precisely

The property is "no synchronous call to the issuer asking it to vouch for this specific request" — not "no network." Corrected in August 2026 after the loose claim was found to be trivially falsifiable for `did:web`. See [What "Offline Verification" Actually Means](../concepts/offline-verification.md).

## Platform and tooling

### Monorepo with pnpm workspaces + Turborepo

**Why:** shared `helix-core` primitives are needed by both the API and the SDK. Turborepo ensures correct build order (`helix-core` before `helix-api` and `helix-sdk-js`) and enables remote caching for CI speed.

**Rejected:** separate repos with local `npm link` — too much synchronization overhead.

### Migration from npm to pnpm

**Why:** pnpm strictly bans phantom dependencies through its symlinked virtual store. In a repository designed around zero-trust and explicit boundaries, letting a workspace implicitly import a dependency it never requested is an architectural violation.

**Consequences:** workspace linking via `pnpm-workspace.yaml`, internal dependencies declared as `workspace:*`, and `pnpm-lock.yaml` in place of `package-lock.json`.

### Fastify as the HTTP framework

**Why:** schema-first, native TypeScript, JSON Schema on every route.

**Rejected:** Express — no built-in schema validation. Hono — less mature ecosystem for this use case.

### Prisma as the ORM

**Why:** type-safe queries, migration management, schema as code.

**Rejected:** Drizzle — considered, but Prisma's migration tooling is more mature. Raw `pg` — no type safety.

### Optional peer dependencies for framework adapters

`@helixid/mcp` declares `@modelcontextprotocol/sdk` and `@helixid/langchain` declares `@langchain/core` as **optional peers**.

**Why:** the adapters are intentionally thin and structural. They should not force every HelixID install to pull MCP or LangChain dependencies, while applications using those frameworks still get explicit compatibility metadata.

**Rejected:** hard dependencies — bloats installs and couples unrelated packages. No dependency metadata at all — consumers need a compatibility signal.

## Storage

SQLite is the current default storage path, with in-memory L1 caching. Postgres storage and a Redis-backed L2 cache are **parked for future releases** and are not required for current runs.

Note that the decision log contains an earlier entry favouring a server-grade database on concurrency grounds — concurrent write safety matters for `vpId` consumption and enrollment-token burning, which are security operations needing ACID guarantees. That reasoning still stands for high-concurrency multi-request deployments; SQLite is the default because it makes self-hosting a single process with no external infrastructure. Size your storage choice to your write concurrency. See the [Roadmap](../roadmap.md).

## Related analyses

The code repository and the product architecture notes also carry supporting technical analyses — a DLT latency analysis, a "VCs vs. simple signing" comparison, and ADR-0001 on keeping the core DLT-agnostic. The last of these is why `did:key` and `did:web` are the zero-dependency defaults and `did:hedera` is an optional plugin: the core never requires a ledger.
