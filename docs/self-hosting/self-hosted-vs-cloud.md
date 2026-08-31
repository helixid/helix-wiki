---
id: self-hosted-vs-cloud
title: Self-Hosted vs Cloud
sidebar_label: Self-Hosted vs Cloud
sidebar_position: 1
description: What the open-source stack covers today, and what a managed offering would add.
---

# Self-Hosted vs Cloud

**HelixID is fully self-hostable today.** There is no hosted tier you have to sign up for, and no functionality gated behind one.

## What the open-source stack covers

- **DID methods** — `did:web` (default), `did:key` (local), and `did:hedera` (optional, via [`@helixid/did-hedera`](../sdk/did-hedera.md))
- **API-backed enrollment** with local SDK key ownership — the agent generates and keeps its own keys
- **SDK-local VP build and verify**, and SDK-local delegation
- **VC issuance and revocation**, with Bitstring Status List hosting
- **Optional JWT session bridge** via the API (`POST /v1/vp/verify` with `session: true`)
- **LangChain/LangGraph and MCP middleware**
- **Operator Console** — agents, enrollment, and the audit trail

## What running it yourself involves

The default runtime needs **no external infrastructure** beyond the API process: SQLite storage, an in-process memory cache, and `did:web`.

```bash
docker compose up
```

or

```bash
set -a; source .env; set +a
pnpm --filter @helixid/api dev
```

You are responsible for:

| Concern | Why it's yours |
| --- | --- |
| **The issuer signing key** | It is the trust anchor for every credential in your domain. Use a KMS, an HSM, or at minimum encrypted-at-rest storage with IAM-scoped access. |
| **Serving `/.well-known/did.json`** | With `did:web`, your domain *is* the trust root. Its TLS and DNS are part of your security model. |
| **Hosting the status list** | Verifiers read it to check revocation. If it is unreachable, revocation checks fail. |
| **Cache TTLs** | They bound how long a revoked credential keeps working. See [Performance & Caching](../architecture/performance-and-caching.md). |
| **Storage sizing** | SQLite is the default and fits a single-process deployment. High write concurrency wants a server-grade database — see [Design Decisions](../architecture/design-decisions.md). |
| **Audit retention** | Treat audit logs as append-only evidence, and do not rely on a single datastore as the sole trail. |

## The trust-model question a hosted service would answer

Self-hosting solves your own infrastructure. It does not, by itself, solve **which other organizations' credentials you accept**.

HelixID removes the need for *bilateral federation agreements* — metadata exchange, certificate swapping — but it does not remove the trust decision itself. It converts it into a policy question: "should I accept credentials from Org A?"

| Model | Trust decision | Setup | Scaling |
| --- | --- | --- | --- |
| **Open** | Accept any issuer | Zero | O(1), high risk |
| **Decentralized** | Each org maintains its own allowlist | Medium | O(N) per org's list |
| **Centralized registry** | Query a shared trust registry | Low | O(1) |

Today, self-hosted deployments use the first two. Each verifier decides which issuer DIDs it trusts.

## HelixID Cloud

<span className="helix-badge helix-badge--planned">Planned</span>

A managed service — including a shared trust registry that outsources issuer vetting — is on the [roadmap](../roadmap.md) and is not available. Nothing in the self-hosted stack depends on it, and the open-source path is not a limited edition of a paid product.

## Next

- [Environment & Configuration](./configuration.md) — every variable
- [Security Model](../security/security-model.md) — what to get right in production
