---
id: dids-and-identity
title: DIDs & Identity
sidebar_label: DIDs & Identity
sidebar_position: 2
description: The three DID methods HelixID supports, how resolution and caching work, and the DID lifecycle.
---

# DIDs & Identity

A **Decentralized Identifier (DID)** is an identifier that resolves to a document containing public keys and service endpoints, without a central registrar holding the mapping. HelixID uses [W3C DID Core 1.0](https://www.w3.org/TR/did-core/).

For HelixID the important property is this: a verifier that has never met an agent can obtain that agent's public key and check its signature, without a shared secret and without a bilateral integration.

Every agent DID is bound to an Ed25519 keypair generated inside the agent process. The private key is encrypted at rest in the agent's [wallet](../sdk/sdk-js.md#agentwallet) and never leaves it — not to the issuer, not to the verifier.

## The three methods

| Method | Status | Where the key comes from | Issuer reachable at verify time? |
| --- | --- | --- | --- |
| `did:key` | Local / development | Encoded inside the identifier itself | Not applicable — nothing to resolve |
| `did:web` | Default | `GET https://<domain>/.well-known/did.json` | The domain, yes; its authorization logic, never |
| `did:hedera` | Optional | A public Hedera mirror node | No — the issuer's domain is never contacted |

### `did:key`

The public key is encoded directly in the identifier, so resolution is a pure decode with no network access at all. `AgentWallet.create()` produces a `did:key` wallet with no API call.

`did:key` cannot express key rotation, service endpoints, or deactivation — the identifier *is* the key, so changing the key changes the identity. That makes it excellent for local development, MCP tool authentication, and internal agent-to-tool calls, and unsuitable as the basis for long-lived production cross-org trust.

### `did:web` (default)

The issuer publishes a DID document at `/.well-known/did.json` on a domain it controls, and `helix-api` serves this route directly. Trust is anchored in the domain, which means it inherits both the convenience and the limits of the web PKI.

Verifiers resolve the document over HTTPS and cache it in-process for **5 minutes**, automatically, with no configuration. The document is the same on every fetch until the key rotates, so this is a static-document read rather than a question about any particular request.

Configure with:

```bash
DID_METHOD=web
DID_DOMAIN=localhost:3000
```

### `did:hedera`

<span className="helix-badge helix-badge--shipped">Resolver shipped</span> <span className="helix-badge helix-badge--planned">Issuer-side planned</span>

`did:hedera` reads the DID document from a public Hedera mirror node, so the issuer's own domain is never contacted at verification time. This is the strongest form of the [offline-verification claim](./offline-verification.md), and it is a second argument for the optional Hedera anchor beyond tamper-evident audit.

Resolution is provided by the optional [`@helixid/did-hedera`](../sdk/did-hedera.md) package, which `helix-core` loads dynamically when it is installed. Resolved documents are cached in-process for **15 minutes**.

:::caution[Issuing on Hedera is not yet available]
`.env.example` accepts `DID_METHOD=web` or `key` and notes that hedera "will be added in future releases." The shipped Hedera capability today is **resolution and verification**, not issuance from `helix-api`.
:::

Resolving a `did:hedera` identifier by hand is straightforward, and documented as a self-verification path:

```
did:hedera:testnet:<topicId>:<sequenceNumber>
  → GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages/{sequenceNumber}
  → decode the message payload → parse the DID document JSON
```

Then locate a `verificationMethod` entry of type `Ed25519VerificationKey2020`, read `publicKeyMultibase`, and decode from base58btc (stripping the leading `z`) to raw bytes.

## Resolution and caching

| DID method | Cache TTL | Configurable? |
| --- | --- | --- |
| `did:web` | 5 minutes, in-process | Automatic, no configuration needed |
| `did:hedera` | 15 minutes, in-process | Automatic, no configuration needed |
| `did:key` | Not applicable | — |

These are the shipped defaults in `helix-core`'s DID resolver. `DID_CACHE_L1_TTL_SECONDS` (default `300`) governs the API-side cache.

The cache TTL is a security parameter as much as a performance one: it bounds how long a verifier can keep using a rotated key. Do not raise it casually.

## DID lifecycle

Beyond creation, a `did:web` DID supports a full lifecycle through the API and SDK:

| Step | API | SDK |
| --- | --- | --- |
| Create DID | `POST /v1/dids` | `HelixClient.createDID()`, `AgentWallet.createDID()`, `helix did create` |
| Resolve DID | `GET /v1/dids/:did` | `HelixClient.resolveDID()`, `HelixDidResolver.resolve()` |
| Add service endpoint | `POST /v1/dids/:did/services` | `HelixClient.addServiceEndpoint()`, `AgentWallet.addService()` |
| Remove service endpoint | `DELETE /v1/dids/:did/services/:endpointId` | `HelixClient.removeServiceEndpoint()`, `AgentWallet.removeService()` |
| Deactivate DID | `POST /v1/dids/:did/deactivate` | `HelixClient.deactivateDID()`, `AgentWallet.deactivate()` |

Deactivation is permanent. `GET /v1/dids/:did` returns `410` for a deactivated DID, and service endpoints must use HTTPS.

## Identity is not authority

A DID proves *who signed*. It says nothing about what that signer may do — that is [Verifiable Credentials](./verifiable-credentials.md). Conflating the two is the mistake that makes raw Ed25519 signing look like a sufficient substitute for HelixID; see [Why not just use raw Ed25519?](../comparisons/why-not-just-use.md#ed25519-signing-is-simpler).
