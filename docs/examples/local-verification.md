---
id: local-verification
title: Local Verification Scripts
sidebar_label: Local Verification
sidebar_position: 5
description: Standalone scripts for VP verification, scope checks, self-verification, revocation, and the session bridge.
---

# Local Verification Scripts

Small, self-contained scripts in [`examples/`](https://github.com/helixid/helixid/tree/main/examples) that exercise one behaviour each. They mint fresh credentials and sign fresh VPs automatically — no fixture file needed.

Start the API first:

```bash
set -a; source .env; set +a
pnpm --filter @helixid/api start
```

## The scripts

| Command | What it does |
| --- | --- |
| `pnpm example:verify-vp` | Creates a fresh VP and verifies it via `POST /v1/vp/verify` |
| `pnpm example:verify-vp:sdk` | Creates a fresh VP and verifies it **locally** — no `/v1/vp/verify` call |
| `pnpm example:verify-vp:session-bridge` | Creates a fresh VP, calls `/v1/vp/verify` with `session: true`, and verifies the returned JWT using `/v1/sessions/public-key` |
| `pnpm example:scope-check` | The authorization-only subset — scope and target-service checks on an already-verified, active payload |
| `pnpm example:self-verify` | Verifies a presentation from first principles, without the SDK's verifier |
| `pnpm example:revocation-check` | Onboards a fresh credential, revokes it, verifies the status bit flipped, then onboards a replacement |

`verify-vp:sdk` performs local verification and still fetches the DID and status resources the credential references, as needed — the [two static reads](../concepts/offline-verification.md). `verify-vp-session-bridge` uses `HELIX_API_URL` (or `API_BASE_URL`) as-is for API calls.

The pair worth running back to back is `verify-vp` and `verify-vp:sdk`: same credential, same result, one going through the API and one computing everything in-process. That contrast is the offline-verification claim in executable form.

## Verifying a presentation by hand

`self-verify` follows the procedure below, which is worth knowing because it is what makes the credential format checkable by anyone.

### 1. DID resolution

For `did:hedera:testnet:<topicId>:<sequenceNumber>`, fetch:

```
https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages/{sequenceNumber}
```

Decode the message payload and parse the DID document JSON.

### 2. Public key extraction

Locate a `verificationMethod` entry of type `Ed25519VerificationKey2020`. Read `publicKeyMultibase` and decode from base58btc — stripping the leading `z` — to raw bytes.

### 3. Signature verification

1. Remove `proof` from the VP payload.
2. Canonicalize the JSON with recursively sorted keys.
3. SHA-256 the canonical JSON bytes.
4. Decode `proof.proofValue` from base58btc.
5. Verify the Ed25519 signature with the extracted public key.

### 4. Status list check

Fetch the VC status list URL from `vc.credentialStatus.statusListCredential`. Decode `encodedList` — base64url decode, then gzip decompress — and read the bit at `statusListIndex`. `0` means active; `1` means revoked.

### 5. Expiry

Reject if `signedVP.expirationDate` is not in the future. Reject if the embedded `vc.expirationDate` is not in the future.

:::warning[Replay prevention is your obligation when you self-verify]
If you self-verify rather than calling HelixID's verify endpoint, you must store every `signedVP.id` you have successfully verified and reject any subsequent request presenting the same `id`. HelixID's verify endpoint handles this automatically. Self-verifying without this tracking leaves you vulnerable to replay attacks.
:::

## Test vector

For checking an implementation against a known-good value:

- **Unsigned VP**

  ```json
  {"@context":["https://www.w3.org/2018/credentials/v1"],"type":["VerifiablePresentation"],"id":"vp:helix:test-vector-1","holder":"did:hedera:testnet:agent1","verifiableCredential":[{"id":"vc:test:1"}],"nonce":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","expirationDate":"2030-01-01T00:00:00.000Z","delegatedBy":"did:hedera:testnet:user1","targetService":"amazon"}
  ```

- **Canonical JSON** — the same as above (already sorted)
- **SHA-256** — `7f9517e90b32ac882d9f615f0eea9d53d72abf4cc78f6dfb30ccf90f84687c5a`
- **Test private key** — `4f3edf983ac636a65a842ce7c78d9aa706d3b113bce036f3f6fdc57d4fcbfe2e`

This key is a published test vector. It is worthless outside this exercise — never use it for anything real.

## Verifier fast-path cycles

Two further scripts demonstrate the repeat-call patterns from [Hybrid 3-Layer Design](../architecture/hybrid-layers.md):

```bash
# Path A — verifier-issued JWT session
JWT_SECRET=replace-with-a-strong-secret \
pnpm --filter @helixid/api exec tsx ../examples/verifier-session-cycle.ts

# Path B — VP-result caching, no JWT
pnpm --filter @helixid/api exec tsx ../examples/verifier-vp-cache-cycle.ts
```

In both, the verifier owns the policy and infrastructure decisions: scope checks, the replay/cache store, TTLs, headers, and secrets.
