---
id: project-structure
title: Project Structure
sidebar_label: Project Structure
sidebar_position: 4
description: How the HelixID monorepo is laid out and what each workspace is responsible for.
---

# Project Structure

HelixID is a pnpm workspace. `helix-core` holds the cryptographic primitives that everything else builds on; the API and SDK both depend on it, which is why builds are orchestrated with Turborepo.

```
helixid/
├── helix-core/           # Core crypto, schemas, resolver, VP/delegation/self-signed primitives
├── helix-api/            # Fastify API: enrollment, VC lifecycle, status list, did:web, session bridge
├── helix-sdk-js/         # SDK: AgentWallet, VPBuilder, verifyVP, delegate, HelixClient (enrollment/API ops)
├── console/              # Operator web console — agents, enrollment, and the audit trail
├── packages/
│   ├── mcp/              # MCP middleware
│   ├── langchain/        # LangChain/LangGraph integration
│   ├── cli/              # CLI workflows
│   ├── did-hedera/       # Hedera DID method resolver
│   └── widget/           # Embeddable user-consent widget
├── examples/
│   ├── e2e-consent-demo/       # User consent across two independent SPs (Demo A)
│   ├── e2e-travel-concierge/   # LLM agent + protected MCP tool (Demo B)
│   ├── framework-middleware/   # Live LangChain and MCP middleware examples
│   ├── verify-vp.ts
│   ├── scope-check.ts
│   ├── self-verify.ts
│   └── revocation-check.ts
├── e2e/                  # End-to-end test package
├── docs/                 # Architecture flows, decisions, public surfaces, testing guides
├── scripts/              # Setup and helper scripts
└── docker-compose.yml    # Local API stack (sqlite+memory+did:web default)
```

## Published packages

| Package | What it is | Reference |
| --- | --- | --- |
| `@helixid/sdk-js` | The SDK you install in an agent or a verifier | [SDK](../sdk/sdk-js.md) |
| `@helixid/core` | Cryptographic primitives — DID resolution, Ed25519, VP verification | [Core](../sdk/core.md) |
| `@helixid/mcp` | MCP client helper and server middleware | [MCP](../sdk/mcp.md) |
| `@helixid/langchain` | LangChain / LangGraph middleware and tool wrappers | [LangChain](../sdk/langchain.md) |
| `@helixid/cli` | Operator CLI (`helix`) for DIDs, VCs, status lists, revocation | [CLI](../sdk/cli.md) |
| `@helixid/did-hedera` | Optional Hedera DID method resolver | [did-hedera](../sdk/did-hedera.md) |
| `@helixid/widget` | SP-side consent scope resolution and a headless consent controller | [Widget](../sdk/widget.md) |

`@helixid/api` and `@helixid/console` are workspace services rather than published libraries — you run them, you don't install them into an agent. See [Self-Hosted vs Cloud](../self-hosting/self-hosted-vs-cloud.md).

## Which workspace owns what

- **`helix-core`** owns anything cryptographic: DID resolution and caching, Ed25519 signing and verification, VP verification, canonical JSON. Nothing above it re-implements crypto — that rule is enforced in review (see [Coding Standards](../contributing/coding-standards.md)).
- **`helix-api`** owns issuance policy and lifecycle: enrollment tokens, onboarding challenges, VC issue/revoke/renew, status-list hosting, `did:web` document hosting, and the optional session bridge. It is the trust anchor for a deployment.
- **`helix-sdk-js`** owns the agent and verifier surface: the encrypted wallet, VP building, local verification, delegation, and the API client.
- **`packages/*`** are deliberately thin adapters. They wire HelixID into a framework; they never re-derive VP canonicalization, encoding, signing, or verification semantics.
