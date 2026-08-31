---
id: hybrid-layers
title: Hybrid 3-Layer Design
sidebar_label: Hybrid 3-Layer Design
sidebar_position: 2
description: VC-based identity, ephemeral JWT sessions, and direct Ed25519 signing — when to use each.
---

# Hybrid 3-Layer Design

HelixID uses a hybrid 3-layer architecture that delivers the trust properties of verifiable credentials with the performance of JWTs.

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR AI AGENT                            │
│                                                                │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐   │
│  │  Layer 3    │   │   Layer 2    │   │    Layer 1      │   │
│  │  Ed25519    │   │  Ephemeral   │   │   VC-Based       │   │
│  │  Direct     │   │    JWT       │   │   Identity       │   │
│  │  Signing    │   │  Sessions    │   │                  │   │
│  │             │   │              │   │                  │   │
│  │ • did:key   │   │ • Verify VC  │   │ • DID creation   │   │
│  │ • Local dev │   │   once       │   │ • Delegated VCs  │   │
│  │ • MCP tool  │   │ • Issue JWT  │   │ • StatusList     │   │
│  │   auth      │   │   (5-15 min) │   │   revocation     │   │
│  │             │   │ • Hot path   │   │ • Cross-org      │   │
│  │  ~0.1ms     │   │  ~0.1ms/req  │   │   trust          │   │
│  └─────────────┘   └──────────────┘   └─────────────────┘   │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │    API audit log (adapter store + stdout/file)        │    │
│  │   Issuance · revocation · session-bridge verification │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Why three layers?** Different trust contexts need different trade-offs:

- **Layer 1 (VCs)** — Use when agents cross organizational boundaries, when delegation chains matter, when you need revocation and audit. This is the foundation.
- **Layer 2 (JWT sessions)** — Verify the VC once, issue a short-lived JWT for subsequent calls. Best for high-frequency internal calls where you've already established trust.
- **Layer 3 (Ed25519 direct)** — For local development, MCP tool authentication, and internal agent-to-tool calls where both parties share a trust context.

## Choosing a layer

| You are... | Use | Why |
| --- | --- | --- |
| Calling across an org boundary | Layer 1 | Only VCs carry portable, verifiable authority |
| Delegating between agents | Layer 1 | The chain is the credential |
| Making 1000+ RPS internal calls after trust is established | Layer 2 | Amortize one ~5 ms verification over many ~0.1 ms calls |
| Developing locally, or authenticating an MCP tool inside one trust context | Layer 3 | No issuer, no infrastructure |

Layer 2 is an optimization over Layer 1, not a replacement for it. The credential still has to be verified once, and the session's short TTL is what bounds your exposure if the underlying credential is revoked mid-session.

## Layer 2 in practice: three paths

Once a VP verifies, the verifier picks how to handle repeat calls. All three are supported, and **none is required** — re-verifying the VP on every call is a legitimate choice.

### Path A — verifier-issued JWT (SDK `SessionManager`, HS256)

The SDK's `SessionManager` signs and verifies JWTs with an HMAC symmetric secret.

```typescript
const session = new SessionManager({ secret: process.env.JWT_SECRET!, ttl: 600 })
const token = await session.issue({ agentDid: result.agentDid, scopes: result.effectiveScopes })
```

The constructor requires a secret of at least 16 characters and throws `SessionManager secret must be at least 16 characters` otherwise.

Use this mode **only when you control all verifiers** and can securely store and rotate the secret. Do not reuse one symmetric secret across untrusted services — anyone who can verify a token can also mint one.

### Path B — API-issued EdDSA tokens (recommended for cross-service)

`helix-api` issues Ed25519-signed JWTs. Verifiers fetch the public key from `GET /v1/sessions/public-key` and verify with `verifyJWT(token, publicKeyHex)`. No shared symmetric secret is required.

```bash
POST /v1/vp/verify   { "signedVP": ..., "session": true }
```

This is the preferred approach when tokens cross service or organizational boundaries: the verifier needs only a public key, so it cannot forge tokens.

:::note[Session keys are ephemeral]
Session JWTs are signed with an **API startup-ephemeral** keypair, and the public key is served at `/v1/sessions/public-key`. Restarting the API rotates it, invalidating outstanding session tokens. Agents fall back to presenting a fresh VP.
:::

### Path C — VP result caching (no JWT at all)

If you would rather not manage a JWT secret, cache the verification result by `vpId`:

```typescript
// first call — verify and cache
const result = await verifyVP(incomingVP, { expectedTargetService: 'orders-service' })
await cache.set(`vp:${result.vpId}`, result, { ttl: result.expiresInSeconds })

// subsequent calls — cache hit, no re-verification
const cached = await cache.get(`vp:${incomingVP.id}`)
if (cached) return handleRequest(cached)
```

The VP's own `validUntil` naturally bounds the cache TTL, and there is no secret to manage. Use this for single-verifier deployments where the cache is local to the service.

## Choosing between the session paths

| | Path A (HS256) | Path B (EdDSA) | Path C (VP cache) |
| --- | --- | --- | --- |
| Secret to manage | Shared symmetric | None — public key only | None |
| Safe across untrusted verifiers | No | Yes | Yes |
| Needs the API at verify time | No | Only to fetch the public key (cacheable, 1 hour) | No |
| Survives an API restart | Yes | No — keys rotate | Yes |

Recommendations: prefer **Path B** for production and cross-service deployments. For local development, a demo `JWT_SECRET` in `.env` is fine; for production, generate a strong secret and store it in a secret manager:

```bash
openssl rand -hex 32
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

A missing `JWT_SECRET` has no effect on verifying API-issued EdDSA session tokens — those rely on the API public key — but it **will** prevent constructing a `SessionManager` for HS256 tokens in the SDK.

## Audit across all three layers

Whichever layer handles the hot path, issuance, revocation, and session-bridge verification are recorded through the API's audit log — an adapter-based store plus structured stdout or file output. A Layer 2 session does not make its calls invisible; it makes them cheap.
