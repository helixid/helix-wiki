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

Some early decisions have since been replaced. They stay on this page, marked **Superseded** with the date and what replaced them, because the reasoning is still part of the record. The log itself was last extended in September 2026; the later changes noted here are recorded in the [`@helixid/core` changelog](https://github.com/helixid/helix-core/blob/main/CHANGELOG.md) and in the proposal documents beside the log.

## Trust and cryptography

### Bitstring Status List for revocation

Revocation uses W3C StatusList2021 — a gzip-compressed, base64url-encoded bitstring.

**Why:** privacy-preserving (verifiers cannot tell which VC is being checked from the index alone), cacheable (verifiers can hold the list and check without a per-credential call), and standard.

**Rejected:** a simple revocation registry listing revoked `vcId`s — it leaks which VCs have been revoked and requires a per-VC network call to check. See [Revocation](../concepts/revocation.md).

### Only `@noble/curves` and `@noble/hashes` for cryptography

These are the only libraries permitted for cryptographic operations in the JS/TS packages.

**Why:** audited, maintained, no native dependencies, tree-shakeable.

**Rejected:** Node's `node:crypto` built-ins — insufficient for Ed25519 VP signing in a browser-compatible SDK. `tweetnacl` — unmaintained.

:::note[As it stands today]
The rule still holds for signatures and hashing: the packages use the `@noble` family (`@noble/ed25519` and `@noble/hashes` in `@helixid/sdk-js`; those plus `@noble/curves` in `@helixid/core`). The one addition is server-side key custody in `@helixid/core`, which encrypts stored keys with AES-256-GCM from Node's built-in `crypto`. That code only ever runs on the server.
:::

### Agent wallet uses AES-256-GCM with PBKDF2

:::note[Superseded — September 2026]
Agent self-custody was retired in `@helixid/core` 2.0.0 (10 September 2026). Agents no longer hold a key or a wallet file, and `AgentWallet` is gone from the SDKs. See [Server-side key custody](#server-side-key-custody) below for what replaced it. The original record follows.
:::

`AgentWallet` encrypts the private key at rest with AES-256-GCM, keyed via PBKDF2 (100,000 iterations, SHA-256, 32-byte output, 16-byte random salt), using Node's built-in `crypto`.

**Why:** no additional dependency; 100k PBKDF2 iterations adequately protect a local wallet file against offline brute force; AES-256-GCM is authenticated, so tampering with the file is detectable.

**Rejected:** argon2 — a stronger KDF, but requires a native addon, breaking the SDK's browser-compatibility goal. libsodium — an extra dependency for the same algorithm class.

### Server-side key custody

Recorded September 2026 (`@helixid/core` 2.0.0); extended to services in October 2026 (3.0.0).

The server generates each agent's Ed25519 key pair at onboarding and each service's at enrollment, and stores the private key encrypted with AES-256-GCM under a single master key, `HOSTED_KEY_ENCRYPTION_KEY`. Onboarding returns only `{ agentDid, vcId }`; no key material ever leaves the server. Signing a presentation, delegating, and issuing a consent grant are API calls.

**What it changes:** there is no wallet file to provision, store, or protect on the agent side, and every signature an agent makes is a server operation that is gated by the server's authorization rule and written to the audit log. The changelog records the change as "server-side keygen, DB-held keys, no wallet file"; this page does not have a fuller recorded rationale to quote.

**Consequences:** the server is now a custodian, and the admin key can sign for any agent on a self-hosted instance — a deliberate narrowing compared with self-custody, where only the agent's own key could sign for it. The master key is a critical secret: if it is unset, the server uses a random one per process and stored keys do not survive a restart. See [Environment & Configuration](../self-hosting/configuration.md#key-custody).

**Replaces:** the agent wallet decision above.

### Delegation is agent-signed (Option A)

:::note[Superseded in part — September 2026]
The statement "there is no API delegation endpoint" stopped being true when custodial delegation landed (8 September 2026, released in `@helixid/core` 2.0.0). Delegation is now `POST /v1/agents/:did/delegate`. What survives: the delegated credential is still signed with the *delegating agent's* key, not the platform issuer's, and verifiers still enforce chain integrity, scope subsetting, and maximum depth from the chain embedded in the credential. What changed is where that key lives — in server custody — so the signature is made by an API call. The original record follows.
:::

Agent A signs a child VC locally; verifiers enforce chain integrity, scope subsetting, and max depth from the chain itself. There is no API delegation endpoint.

**Why:** requiring an issuer round trip to delegate would put the issuer on the hot path of every agent-to-agent hand-off — the coupling HelixID exists to remove. See [Delegation](../concepts/delegation.md).

**As it stands today:** the delegatee must be an agent the same server onboarded and that still holds an active credential. Each delegated credential gets its own status-list entry, so one delegation can be revoked without touching the credential it came from. Delegation still involves no call to the *verifier* or to any third party at use time.

### Two issuer roles, not one

The platform issues `HelixAgentCredential`; the service provider issues `DelegationGrantCredential` after user consent. Corrected in August 2026 from an earlier single-issuer description. See [The Two-Issuer Model](../concepts/two-issuer-model.md).

**Updated October 2026 (`@helixid/core` 3.0.0):** the two roles remain, but a service is now a custodial identity too. A service is enrolled with `POST /v1/services`; its backend calls `POST /v1/service-delegation-grants` after the user consents, and the server signs the grant with the service's key, which it holds. The earlier prepare/finalize flow, which existed so a service could sign with a key it kept itself, was removed. A grant signed outside the server can still be registered with `POST /v1/vcs/register`. A grant must be issued by the service the presentation targets, and may only carry scopes the agent holds on its own credential.

### Presentations are not single-use

Recorded November 2026, describing `@helixid/core` 3.0.0.

Neither `POST /v1/vp/verify` nor the middleware tracks consumed `vpId`s. A presentation is bounded two ways instead: it expires five minutes after signing, and it names one target service. Replay protection inside that window belongs to the verifier.

**Why this is stated as a decision:** earlier pages described the API as handling `vpId` replay tracking. It does not, and a verifier that assumes it does has a gap. Single-use enforcement in the API is planned.

### The verification claim, stated precisely

The property is "no synchronous call to the *issuer* asking it to vouch for this specific request." Verification does use the network. Corrected in August 2026 after a looser claim was found to be trivially falsifiable for `did:web`.

**Updated November 2026:** with the current SDKs, `verifyVP()` is itself an HTTP call to a HelixID API (`POST /v1/vp/verify`) that the verifier chooses and trusts. The SDK has no local verification path. See [what verification does and does not depend on](../concepts/offline-verification.md).

## Platform and tooling

### Monorepo with pnpm workspaces + Turborepo

:::note[Superseded]
The monorepo has since been split into per-component repositories — see [Project Structure](../get-started/project-structure.md). The reasoning below is why it started as one, and the pnpm/Turborepo tooling still applies inside `helix-sdk-js`.
:::

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

`@helixid/mcp-middleware` declares `@modelcontextprotocol/sdk` and `@helixid/langchain` declares `@langchain/core` as **optional peers**. (The decision was recorded against `@helixid/mcp`, which has since been split into `@helixid/mcp-middleware` and `@helixid/mcp-server`.)

**Why:** the adapters are intentionally thin and structural. They should not force every HelixID install to pull MCP or LangChain dependencies, while applications using those frameworks still get explicit compatibility metadata.

**Rejected:** hard dependencies — bloats installs and couples unrelated packages. No dependency metadata at all — consumers need a compatibility signal.

## Storage

### SQLite by default, Postgres and Redis parked

:::note[Superseded — October 2026]
Both halves are no longer true in `@helixid/core` 3.0.0. Postgres is a shipped storage adapter and is the **default** when `HELIX_STORAGE_ADAPTER` is unset (changed 16 October 2026). A Redis-backed L2 cache is shipped behind `HELIX_CACHE_ADAPTER=redis`. See the next record. The original text follows.
:::

SQLite is the current default storage path, with in-memory L1 caching. Postgres storage and a Redis-backed L2 cache are **parked for future releases** and are not required for current runs.

Note that the decision log contains an earlier entry favouring a server-grade database on concurrency grounds — concurrent write safety matters for `vpId` consumption and enrollment-token burning, which are security operations needing ACID guarantees. That reasoning still stands for high-concurrency multi-request deployments; SQLite is the default because it makes self-hosting a single process with no external infrastructure. Size your storage choice to your write concurrency. See the [Roadmap](../roadmap.md).

### Postgres as the default adapter, behind storage drivers

Drafted September 2026 in [`decision-storage-driver-pattern.md`](https://github.com/helixid/helixid/blob/main/docs/decision-storage-driver-pattern.md).

`HELIX_STORAGE_ADAPTER` accepts `sqlite` or `postgres` and defaults to `postgres`; the default changed in `@helixid/core` on 16 October 2026. Each repository delegates to a per-backend storage driver, so the repository classes carry no backend branching.

**Why:** with SQLite as the silent default, a deployment or CI job that set a Postgres `DATABASE_URL` but forgot the adapter variable ran on SQLite without anyone noticing. Defaulting to Postgres makes that case fail at startup, asking for `DATABASE_URL`, instead of quietly running on the wrong backend. The driver pattern makes adding a backend a matter of one new driver per repository rather than a new branch in every method.

**Consequences:** SQLite remains fully supported and is still the simplest way to self-host — one process, no external infrastructure — but you must now ask for it with `HELIX_STORAGE_ADAPTER=sqlite`. Enrollment-token burning is the write that most needs real transactional guarantees; size your storage choice to your write concurrency.

**Caching:** in-process L1 is the default. `HELIX_CACHE_ADAPTER=redis` adds a shared L2 for DID records and the hosted status list. See [Performance & Caching](./performance-and-caching.md).

:::note[Server repo]
The open-source [`helixid`](https://github.com/helixid/helixid) server still pins `@helixid/core` `^2.0.1` on `main`, and its `.env.example` still describes SQLite-only storage and memory-only caching. See [Environment & Configuration](../self-hosting/configuration.md#differences-from-the-server-repos-envexample).
:::

## Related analyses

The code repository and the product architecture notes also carry supporting technical analyses — a DLT latency analysis, a "VCs vs. simple signing" comparison, and ADR-0001 on keeping the core DLT-agnostic. The last of these is why `did:key` and `did:web` are the zero-dependency defaults and `did:hedera` is an optional plugin: the core never requires a ledger. `DID_METHOD=hedera` is accepted by the server when [`@helixid/did-hedera`](../sdk/did-hedera.md) is installed alongside it.
