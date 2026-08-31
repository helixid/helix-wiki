---
id: did-hedera
title: "@helixid/did-hedera"
sidebar_label: "@helixid/did-hedera"
sidebar_position: 6
description: Optional Hedera DID method resolver — read DID documents from a public mirror node.
---

# `@helixid/did-hedera`

<span className="helix-badge helix-badge--shipped">Resolver shipped</span> <span className="helix-badge helix-badge--planned">Issuer-side planned</span>

Optional Hedera DID method support. Install it when you want `did:hedera` resolution; leave it out and `did:key` and `did:web` work with no ledger dependency at all.

```bash
npm install @helixid/did-hedera
```

`helix-core` loads this package **dynamically**. Installing it is the whole integration — there is no registration step.

## Why anchor a DID

With `did:web`, verification reads the issuer's own domain for its public key. With `did:hedera`, it reads a public Hedera mirror node instead, so **the issuer's own domain is never contacted**.

That is the strongest form of the [offline-verification claim](../concepts/offline-verification.md): the issuer can be entirely absent and verification still works. It is also a second argument for the optional Hedera anchor beyond tamper-evident audit.

## Resolution

A `did:hedera` identifier encodes a topic and a sequence number:

```
did:hedera:testnet:<topicId>:<sequenceNumber>
```

Resolving it means fetching the message and parsing the DID document from its payload:

```
GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages/{sequenceNumber}
```

Then locate a `verificationMethod` entry of type `Ed25519VerificationKey2020`, read `publicKeyMultibase`, and decode from base58btc — stripping the leading `z` — to raw bytes.

Resolved documents are cached in-process for **15 minutes**, automatically.

:::caution[Issuance on Hedera is not available yet]
`helix-api` accepts `DID_METHOD=web` or `key`; `.env.example` notes that hedera support "will be added in future releases." What ships today is **resolution and verification** of `did:hedera` identifiers, not issuing them from the API. See the [Roadmap](../roadmap.md).
:::

Hedera testnet writes in the end-to-end test suite are gated behind `HEDERA_E2E_TESTNET=false` and must never be enabled in standard CI.
