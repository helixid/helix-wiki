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

Packages are versioned independently. Security patches are provided for the latest release of each.

| Package | Current release |
| --- | --- |
| `@helixid/core` (npm) | 3.0.0 |
| `@helixid/sdk-js` (npm) | 0.6.0 |
| `@helixid/mcp-middleware` (npm) | 0.4.0 |
| `@helixid/mcp-server` (npm) | 0.2.2 |
| `@helixid/langchain` (npm) | 0.4.0 |
| `@helixid/widget` (npm) | 0.3.1 |
| `@helixid/cli` (npm) | 0.3.1 |
| `@helixid/did-hedera` (npm) | 0.2.1 |
| `helixid-sdk-py` (PyPI) | 2.1.0 |

*Versions as of November 2026. The registries are authoritative.*

## Phase 1 — Foundation

- [x] Architecture decisions — DLT-agnostic core, VCs vs. simple signing, latency analysis
- [x] `@helixid/core` — the API layer: issuance, verification, revocation, key custody, audit
- [x] `@helixid/sdk-js` — API client, verification helpers, scope checks, session tokens
- [x] `@helixid/langchain` — LangChain / LangGraph tool wrapper
- [x] `@helixid/cli` — operator CLI
- [x] `@helixid/widget` — consent scope resolution and a headless consent controller
- [x] `did:key` local mode
- [x] `did:web` mode (default), with per-agent and per-service DID documents
- [x] W3C Bitstring Status List revocation
- [x] Session token bridge — VC → ephemeral JWT
- [x] Operator Console — agents, onboarding, audit trail
- [x] Two-issuer consent model — platform ceiling + service-issued grant
- [x] Agent-to-agent sub-delegation with chain verification
- [x] **Server-side key custody** — agents and services hold no keys; onboarding is one call (September 2026)

### `did:hedera` anchored mode

- [x] `@helixid/did-hedera` resolver — read DID documents from a public mirror node
- [ ] <span className="helix-badge helix-badge--progress">In progress</span> Issuer-side `DID_METHOD=hedera` — agent onboarding anchors on Hedera in `@helixid/core` 3.0.0; service enrollment and direct DID creation do not yet. See [`@helixid/did-hedera`](./sdk/did-hedera.md).

### Policy engine

- [ ] <span className="helix-badge helix-badge--parked">Parked</span> OPA integration and a base Rego policy library

Parked because the core trust path is already enforced in code — VP signature, VC signature, expiry, revocation, target-service binding, and delegation and consent constraints. OPA is a business-policy layer, not a crypto/trust layer, so it can wait for clearer service-owner policy requirements rather than bringing sidecar operations, policy authoring, and failure-mode design forward before they are needed. Constraints already agreed for when it lands are in [Authorization & Scopes](./concepts/authorization-and-scopes.md#policy-engines).

### JSON-LD context hosting

- [ ] <span className="helix-badge helix-badge--parked">Parked</span> Host the HelixID JSON-LD context and define its Helix-specific terms

Issued VCs reference a HelixID-specific context that is not yet hosted. Verification uses local canonical JSON signing and does not fetch it, so local and self-hosted flows work — but this must be resolved before HelixID can claim full public JSON-LD/VC ecosystem interoperability. See [Verifiable Credentials](./concepts/verifiable-credentials.md#json-ld-context).

## Phase 2 — Framework Integrations & Scale

- [x] **Repository split** — the SDKs and the console live in `helix-sdk-js`, `helix-sdk-py` and `helix-console`; the API layer lives in `helix-core`. See [Project Structure](./get-started/project-structure.md).
- [x] **Server consolidated into `helixid/helixid`** — the self-hosted server you run, with `@helixid/core` as a dependency.
- [x] **Demo applications migrated** — the consent and travel-concierge demos and the verifier scripts are in [`helixid/examples`](./examples/overview.md).
- [x] **Packages republished after the split** — `@helixid/mcp` became `@helixid/mcp-middleware` and `@helixid/mcp-server`; `@helixid/widget` and `@helixid/core` are on npm.
- [x] **Python SDK** — [`helixid-sdk-py`](./sdk/sdk-py.md) on PyPI, mirroring the JS/TS surface. Shared golden-vector fixtures keep the two SDKs' behaviour identical.
- [x] **CrewAI integration** — [`helix_crewai`](./integrations/crewai.md), shipped inside `helixid-sdk-py`.
- [x] **Custodial services and server-issued consent grants** — a service is enrolled like an agent, and issuing a grant is one API call (`@helixid/core` 3.0.0).
- [x] **MCP middleware, phase 1** — HelixID presentations and OAuth 2.1 bearer tokens on one server, per-tool scopes, RFC 9728 protected-resource metadata, audit of every decision (`@helixid/mcp-middleware` 0.4.0). See [MCP](./integrations/mcp.md).
- [x] **Postgres storage and Redis second-level cache** in `@helixid/core`, alongside SQLite and the in-process cache.
- [ ] <span className="helix-badge helix-badge--progress">In progress</span> **Move the open-source server and its examples to `@helixid/core` 3.x** — `helixid/helixid` and the demos still pin the 2.x line and older SDK releases. See [Examples](./examples/overview.md).
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> **MCP middleware, phase 2** — single-use presentations (replay rejection on the server or in the middleware). Today a presentation can be re-presented until it expires; see [the limitation](./integrations/mcp.md#known-limitation-presentation-replay-pending).
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> `@helixid/n8n` — n8n node
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> Trust registry v1 — shared issuer vetting, so accepting a new organization's credentials is an O(1) lookup rather than a per-org allowlist entry

## Phase 3 — Enterprise & Advanced

- [ ] <span className="helix-badge helix-badge--progress">In progress</span> HelixID Cloud — a managed issuer, verifier and audit log. Not generally available.
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> Hosted trust registry, on top of HelixID Cloud
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> ZKP selective disclosure (ZK-SD-VCs) — prove a credential attribute without revealing every field. The architecture is designed to accommodate this; the implementation is a later phase.
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> ABAC policy engine
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> Credential monetization primitives
- [ ] <span className="helix-badge helix-badge--planned">Planned</span> Kubernetes admission controller

Nothing in the self-hosted stack depends on HelixID Cloud. The open-source path is not a limited edition of a paid product — see [Self-Hosted vs Cloud](./self-hosting/self-hosted-vs-cloud.md).

## How this list is maintained

Parked items keep their reasoning and acceptance criteria written down, so that picking one up later does not mean re-deriving the constraints. Architectural decisions are summarised in [Design Decisions](./architecture/design-decisions.md); each package's `CHANGELOG.md` records what shipped in which release.

Requests and discussion: [GitHub Discussions](https://github.com/helixid/helixid/discussions).
