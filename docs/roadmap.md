---
id: roadmap
title: Roadmap
sidebar_label: Roadmap
sidebar_position: 99
description: What has shipped, what is planned, and what is deliberately parked.
---

# Roadmap

<span className="helix-badge helix-badge--shipped">Shipped</span> is available in the current release. <span className="helix-badge helix-badge--progress">In progress</span> is being built but is not released. <span className="helix-badge helix-badge--planned">Planned</span> is intended but not started. <span className="helix-badge helix-badge--parked">Parked</span> is valid scope that has been deliberately deferred, with a recorded reason.

:::warning[Nothing on this page that is unchecked is available]
Unchecked items are not partially available, not behind a flag, and not in a preview. If a page in these docs describes a capability, it ships; if it appears here unchecked, it does not.
:::

HelixID is **pre-1.0**. Package versions are independent `0.x` releases, and security patches are provided for the latest minor only.

## Phase 1 — Foundation

- [x] Architecture decisions — DLT-agnostic core, VCs vs. simple signing, latency analysis
- [x] `@helixid/sdk-js` — wallet, VP build/verify, delegation, API client
- [x] `@helixid/core` — DID resolution, Ed25519, VP verification, canonical JSON
- [x] `@helixid/mcp` — MCP client helper and server middleware
- [x] `@helixid/langchain` — LangChain / LangGraph middleware
- [x] `@helixid/cli` — operator CLI
- [x] `@helixid/widget` — SP-side consent scope resolution and headless controller
- [x] `did:key` local mode
- [x] `did:web` hosted mode (default)
- [x] Bitstring Status List (StatusList2021) revocation
- [x] Session token bridge — VC → ephemeral JWT
- [x] Operator Console — agents, enrollment, audit trail
- [x] Two-issuer consent model — platform ceiling + SP-issued grant
- [x] Agent-to-agent sub-delegation with chain verification

### `did:hedera` anchored mode

- [x] `@helixid/did-hedera` resolver — read DID documents from a public mirror node
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> Issuer-side `DID_METHOD=hedera` — `.env.example` currently accepts `web` and `key` only

### Policy engine

- [ ] <span className="helix-badge helix-badge--parked">Parked</span> OPA integration and a base Rego policy library

Parked because the core trust path is already enforced in code — VP signature, VC signature, expiry, revocation, `vpId` replay protection, and delegation constraints. OPA is a business-policy layer, not a crypto/trust layer, so it can wait for clearer service-owner policy requirements rather than bringing sidecar operations, policy authoring, and failure-mode design forward before they are needed. Constraints already agreed for when it lands are in [Authorization & Scopes](./concepts/authorization-and-scopes.md#policy-engines).

### JSON-LD context hosting

- [ ] <span className="helix-badge helix-badge--parked">Parked</span> Host the HelixID JSON-LD context and define its Helix-specific terms

Issued VCs reference a HelixID-specific context that is not yet hosted. Verification uses local canonical JSON signing and does not fetch it, so local and self-hosted flows work — but this must be resolved before HelixID can claim full public JSON-LD/VC ecosystem interoperability. See [Verifiable Credentials](./concepts/verifiable-credentials.md#json-ld-context).

## Phase 2 — Framework Integrations & Scale

- [x] **Repository split** — the SDKs and the console now live in `helix-sdk-js`, `helix-sdk-py` and `helix-console`. See [Project Structure](./get-started/project-structure.md).
- [ ] <span className="helix-badge helix-badge--progress">In progress</span> **Consolidate the API into `helixid/helixid`** — the server currently lives in `helix-server` and is being folded back into the flagship repository, which becomes the server repo. Only the repository URL changes; the layout stays as it is.
- [ ] <span className="helix-badge helix-badge--progress">In progress</span> **Republish the packages after the split** — fold `@helixid/core` into `@helixid/sdk-js`, split `@helixid/mcp` into `@helixid/mcp-middleware` and `@helixid/mcp-server`, and publish `@helixid/widget`. Until this lands, `@helixid/core` and `@helixid/mcp` remain the installable packages.

- [ ] <span className="helix-badge helix-badge--progress">In progress</span> Python SDK — lives in [`helix-sdk-py`](https://github.com/helixid/helix-sdk-py) as `helixid-sdk-py`, mirroring the JS/TS surface. Shared golden-vector fixtures prove Python-generated VPs verify through the same path as JS-generated ones. Not yet on PyPI.
- [ ] <span className="helix-badge helix-badge--progress">In progress</span> CrewAI integration — `helix_crewai`, shipped inside `helix-sdk-py`. Publishes with it.
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> `@helixid/n8n` — n8n node
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> Trust registry v1 — shared issuer vetting, so accepting a new organization's credentials is an O(1) lookup rather than a per-org allowlist entry

### Storage and caching

- [ ] <span className="helix-badge helix-badge--parked">Parked</span> Postgres storage adapter — SQLite remains the default path
- [ ] <span className="helix-badge helix-badge--parked">Parked</span> Redis / L2 shared cache — the L1 in-process memory cache is enabled by default and is not a blocker for current runs

Both are parked pending clearer storage/migration and shared-cache requirements. See [Performance & Caching](./architecture/performance-and-caching.md).

## Phase 3 — Enterprise & Advanced

- [ ] <span className="helix-badge helix-badge--planned">Planned</span> ZKP selective disclosure (ZK-SD-VCs) — prove a credential attribute without revealing every field. The architecture is designed to accommodate this; the implementation is a later phase.
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> ABAC policy engine
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> Credential monetization primitives
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> Kubernetes admission controller
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> HelixID Cloud — managed service, including the hosted trust registry

Nothing in the self-hosted stack depends on HelixID Cloud. The open-source path is not a limited edition of a paid product — see [Self-Hosted vs Cloud](./self-hosting/self-hosted-vs-cloud.md).

## How this list is maintained

Architectural decisions, including the reasoning behind parking an item, are recorded in the code repository's append-only [decision log](./architecture/design-decisions.md). Parked items keep their acceptance criteria written down so that picking one up later does not mean re-deriving the constraints.

Requests and discussion: [GitHub Discussions](https://github.com/helixid/helixid/discussions).
