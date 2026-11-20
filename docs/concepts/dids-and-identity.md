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

Every agent DID is bound to an Ed25519 keypair. HelixID generates that keypair when the agent is onboarded and holds the private key encrypted in custody; the agent never handles key material, and signs by asking HelixID to sign on its behalf. In the product's shorthand, the DID is the agent's **passport**: it says who the agent is and which domain vouches for it. See [Security Model](../security/security-model.md#key-custody) for the custody trade-off.

## The three methods

| Method | Status | Where the key comes from | Issuer reachable at verify time? |
| --- | --- | --- | --- |
| `did:key` | Local / development | Encoded inside the identifier itself | Not applicable — nothing to resolve |
| `did:web` | Default | `GET https://<domain>/.well-known/did.json` | The domain, yes; its authorization logic, never |
| `did:hedera` | Optional | A public Hedera mirror node | No — the issuer's domain is never contacted |

The method is chosen per deployment with `DID_METHOD`. Agents and services onboarded by that deployment get DIDs of the same method.

### `did:key`

The public key is encoded directly in the identifier, so resolution is a pure decode with nothing to fetch. Run the server with `DID_METHOD=key` and it needs no DNS-reachable domain, which is why the local quick start uses it.

`did:key` cannot express key rotation, service endpoints, or deactivation — the identifier *is* the key, so changing the key changes the identity. That makes it excellent for local development, MCP tool authentication, and internal agent-to-tool calls, and unsuitable as the basis for long-lived production cross-org trust.

### `did:web` (default)

The issuer publishes a DID document at `/.well-known/did.json` on a domain it controls, and the HelixID server serves this route directly. Trust is anchored in the domain, which means it inherits both the convenience and the limits of the web PKI.

Agents and services onboarded on that server get their own DIDs under the same domain, each with its own document:

| Identity | DID | Document |
| --- | --- | --- |
| Issuer | `did:web:<domain>` | `/.well-known/did.json` |
| Agent | `did:web:<domain>:agents:<slug>` | `/agents/<slug>/did.json` |
| Service | `did:web:<domain>:services:<slug>` | `/services/<slug>/did.json` |

A verifier that meets one of these agents for the first time learns from the DID alone which domain to ask for the public key. No account, shared secret or prior exchange with that domain is needed.

The verifying HelixID API resolves the document over HTTPS and caches it in-process for **5 minutes**, automatically, with no configuration. The document is the same on every fetch until the key rotates, so this is a static-document read rather than a question about any particular request.

Configure with:

```bash
DID_METHOD=web
DID_DOMAIN=localhost:3000
```

### `did:hedera`

`did:hedera` reads the DID document from a public Hedera mirror node, so the issuer's own domain is never contacted at verification time. This is the strongest form of the [no-issuer-call claim](./offline-verification.md), and it is a second argument for the optional Hedera anchor beyond tamper-evident audit.

Resolution is provided by the optional [`@helixid/did-hedera`](../sdk/did-hedera.md) package, which `helix-core` loads dynamically when it is installed. Resolved documents are cached in-process for **15 minutes**.

Issuing on Hedera is opt-in and partial: with `@helixid/did-hedera` installed, `DID_METHOD=hedera` and a funded Hedera operator account, `@helixid/core` anchors the DIDs of newly onboarded **agents**. Service enrollment and direct DID creation are not supported under this method yet. Details and caveats are in [`@helixid/did-hedera`](../sdk/did-hedera.md).

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

These are the shipped defaults in `@helixid/core`'s DID resolver. The API-side cache settings are in [Performance & Caching](../architecture/performance-and-caching.md).

The cache TTL is a security parameter as much as a performance one: it bounds how long a verifier can keep using a rotated key. Do not raise it casually.

## DID lifecycle

Agent and service DIDs are created for you at onboarding and enrollment. The DID routes below manage DIDs directly:

| Step | API | SDK / CLI |
| --- | --- | --- |
| Create DID | `POST /v1/dids` | `HelixClient.createDID()`, `helix did create` |
| Resolve DID | `GET /v1/dids/:did` | `HelixClient.resolveDID()` |
| Add service endpoint | `POST /v1/dids/:did/services` | `HelixClient.addServiceEndpoint()` |
| Remove service endpoint | `DELETE /v1/dids/:did/services/:endpointId` | `HelixClient.removeServiceEndpoint()` |
| Deactivate DID | `POST /v1/dids/:did/deactivate` | `HelixClient.deactivateDID()` |

Every write must be authorized by the server, and a server that configures no authorization for these routes refuses all of them. How each server gates them is described in the [HTTP API reference](../sdk/http-api.md). Deactivation is permanent — a deactivated DID resolves with `410`. Service endpoints must use HTTPS. Full request shapes are in the [HTTP API reference](../sdk/http-api.md).

## Identity is not authority

A DID proves *who signed*. It says nothing about what that signer may do — that is [Verifiable Credentials](./verifiable-credentials.md). Conflating the two is the mistake that makes raw Ed25519 signing look like a sufficient substitute for HelixID; see [Why not just use raw Ed25519?](../comparisons/why-not-just-use.md#ed25519-signing-is-simpler).
