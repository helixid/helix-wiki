---
id: did-hedera
title: "@helixid/did-hedera"
sidebar_label: "@helixid/did-hedera"
sidebar_position: 6
description: Optional Hedera DID method support — anchor DIDs on Hedera Consensus Service and resolve them from a public mirror node.
---

# `@helixid/did-hedera`

<span className="helix-badge helix-badge--shipped">Resolver shipped</span> <span className="helix-badge helix-badge--shipped">Agent DID anchoring shipped</span>

Optional `did:hedera` method support: anchoring a DID on Hedera Consensus Service (HCS), resolving one back from a mirror node, and publishing a signed status list credential to HCS as an extra audit trail. The current version is **0.2.1**.

Leave it out and `did:key` and `did:web` work with no ledger dependency at all.

```bash
npm install @helixid/did-hedera
```

:::caution[Anchoring costs money]
Every anchor and every publish submits a paid Hedera transaction and debits the configured operator account's HBAR balance. Resolution is a read against public mirror data and costs nothing. Install the package only where Hedera support is actually needed.
:::

## Using it with a HelixID server

`@helixid/did-hedera` is not a dependency of [`@helixid/core`](./core.md), not even an optional one. Install it next to the server yourself. Core loads it **dynamically**, in two places:

- **Resolution.** When the verifier meets a `did:hedera` identifier, core's DID resolver looks for the package and calls its resolver. No configuration is needed beyond installing it.
- **Creation.** With `DID_METHOD=hedera`, core constructs the package's `HieroHederaClient` at startup and uses it to anchor new agent DIDs.

If the package is missing, both fail with an error that names it, rather than a module-not-found stack trace.

To mint `did:hedera` identities, set:

```bash
DID_METHOD=hedera
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=<operator private key>
HELIX_ISSUER_DID=did:hedera:testnet:<...>
```

These are validated at startup: with `DID_METHOD=hedera`, a missing operator id, operator key, or issuer DID stops the server. `HEDERA_NETWORK=mainnet` is refused unless `NODE_ENV=production`. See [Environment & Configuration](../self-hosting/configuration.md#hedera).

### What happens at onboarding

With `DID_METHOD=hedera`, `POST /v1/onboard` does the following in one call:

1. The server generates the agent's key pair.
2. It asks the Hiero DID registrar for a DID-creation request for that public key.
3. It signs the request's payload with the agent's key, which it holds in custody.
4. It submits the signed request and waits for the new DID to become visible (up to three minutes).
5. It issues the agent's `HelixAgentCredential` to the new `did:hedera` identifier.

The caller sees the same response as with any other method: `{ agentDid, vcId }`.

:::caution[Agent onboarding only, in this release]
The registrar flow above is the only creation path the Hedera client implements. `POST /v1/services` and `POST /v1/dids` create DIDs without a signed creation request, and the client in 0.2.1 rejects that path. With `DID_METHOD=hedera`, plan on anchoring agent DIDs only.

The open-source [`helixid`](https://github.com/helixid/helixid) server still pins `@helixid/did-hedera` `^0.1.2` and `@helixid/core` `^2.0.1` on `main`, and its `.env.example` still says Hedera is not supported. This page describes 0.2.1 with core 3.0.0.
:::

## Why anchor a DID

With `did:web`, the verifier reads the DID subject's own domain for its public key. With `did:hedera`, it reads a public Hedera mirror node instead, so **the domain that issued the DID is never contacted** to resolve it.

Be precise about what that buys. Verification is still a call to a HelixID API (`POST /v1/vp/verify`) that the verifier chooses and trusts, and that API still makes network requests: to the mirror node for the DID document, and to the status list URL for revocation. What is removed is the dependency on the issuer's web host being up and honest about its key. See [what verification does and does not depend on](../concepts/offline-verification.md).

## Resolution

A `did:hedera` identifier names a network and ends in an HCS topic id:

```
did:hedera:<testnet|previewnet|mainnet>:<identifier ending in a topic id such as 0.0.12345>
```

To resolve it, the package reads the most recent message on that topic from the network's public mirror node:

```
GET https://<network>.mirrornode.hedera.com/api/v1/topics/{topicId}/messages?order=desc&limit=1
```

It base64-decodes the message, parses it as a DID document, and checks that the document's `id` equals the DID and that it has at least one verification method. A failed request or an empty topic raises `HEDERA_RESOLUTION_FAILED`.

Inside a HelixID server, resolved `did:hedera` documents are cached in process memory for **15 minutes**. That window is fixed.

## API

```ts
import {
  anchorDidHedera,
  resolveDidHedera,
  publishStatusListToHCS,
  HieroHederaClient,
} from '@helixid/did-hedera';
```

| Export | What it does |
| --- | --- |
| `resolveDidHedera(did)` | Resolves a `did:hedera` identifier to its DID document from the mirror node. No operator credentials. Also exported as `resolveDid`. |
| `anchorDidHedera(options)` | Registers a new `did:hedera` identity through the Hiero DID registrar. Returns `{ did, topicId, transactionId, didDocument }`. Paid. |
| `publishStatusListToHCS(statusListVC, options)` | Publishes an already-signed status list credential to an HCS topic. Paid. |
| `HieroHederaClient` | The client `@helixid/core` constructs when `DID_METHOD=hedera`. |

`anchorDidHedera` takes:

```ts
interface HederaAnchorOptions {
  privateKeyHex: string; // Ed25519 private key hex used to create the DID
  operatorId: string;
  operatorKey: string;
  network: 'testnet' | 'previewnet' | 'mainnet';
  topicId?: string;
}
```

`publishStatusListToHCS` takes the same options with `topicId` required. The HTTPS-served status list remains the authoritative source for revocation checks; the HCS copy is a supplementary audit trail, not a replacement.

Both paid functions log a `console.warn` naming the network before they submit anything.

## Other packages that use it

[`@helixid/cli`](./cli.md) and [`@helixid/mcp-server`](./mcp-server.md) declare it as an **optional** dependency. Their Hedera commands fail with a clear error if it is not installed.

## Testing

Hedera testnet writes in the end-to-end test suite are gated behind `HEDERA_E2E_TESTNET=false` and must never be enabled in standard CI. The package's own unit tests mock the Hiero SDK modules and the mirror node, so they make no live network calls.
