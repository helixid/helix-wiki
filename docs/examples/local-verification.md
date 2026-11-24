---
id: local-verification
title: Verifier Scripts
sidebar_label: Verifier Scripts
sidebar_position: 5
description: Standalone scripts for VP verification through the API, scope checks, self-verification, revocation, and the session bridge.
---

# Verifier Scripts

Small, self-contained scripts in [`examples/`](https://github.com/helixid/helixid/tree/main/examples) that exercise one behaviour each. They run against an API you start yourself.

Start the API first, with `HELIX_ADMIN_API_KEY` set in `.env`:

```bash
set -a; source .env; set +a
pnpm dev
```

Run the scripts from the repository root in another terminal. Each loads the root `.env` itself and reads the API address from `API_BASE_URL` (default `http://localhost:3000`).

## How the scripts get a presentation

No fixture file is involved, and neither is a wallet. The shared helper `createFreshSignedVP()` in `verifier-example-utils.ts`:

1. requests an enrollment token from `POST /v1/enrollment-tokens`,
2. onboards a new agent with `client.onboardAgent()`, which returns `{ agentDid, vcId }` — the server generates and holds the agent's key,
3. reads the credential back with `client.getVC(vcId)`,
4. asks the API to sign a presentation with `client.signVP(agentDid, targetService, { userDid, vcId })`.

Step 4 is `POST /v1/agents/:did/vp`, which is admin-key gated in the open-source server. The helper throws if `HELIX_ADMIN_API_KEY` is not set.

## The scripts

| Command | What it does |
| --- | --- |
| `pnpm example:verify-vp` | Gets a fresh VP and posts it to `POST /v1/vp/verify` with a plain `fetch` |
| `pnpm example:verify-vp:sdk` | Gets a fresh VP and verifies it with the SDK's `verifyVP(vp, client, options)`, then issues and checks a local HS256 session token with `SessionManager` |
| `pnpm example:verify-vp:session-bridge` | Gets a fresh VP, calls `/v1/vp/verify` with `session: true`, and verifies the returned EdDSA session JWT with `verifyJWT()` and the key from `/v1/sessions/public-key` |
| `pnpm example:scope-check` | Runs five fixed scenarios through a scope and target-service check on an already-verified payload. It makes no API call |
| `pnpm example:self-verify` | Gets a fresh VP and checks it step by step without calling `/v1/vp/verify` |
| `pnpm example:revocation-check` | Meant to onboard a credential, revoke it, watch the status bit flip, and onboard a replacement. Currently fails — see [Known issues](#known-issues) |
| `pnpm example:verifier:vp-cache` | Meant to verify once and serve repeats of the same `vpId` from a cache. Currently fails — see [Known issues](#known-issues) |

:::note[`verify-vp:sdk` calls the API]
`verifyVP()` in `@helixid/sdk-js` is itself an HTTP call to `POST /v1/vp/verify` on the HelixID API the verifier chose and trusts. The SDK has no local verification path. Signature, validity window, status-list and delegation-chain checks all run on that API.

So `verify-vp` and `verify-vp:sdk` reach the same endpoint: one with `fetch`, one through the SDK. What neither involves is a synchronous call to the *issuer* asking it to vouch for this specific request. See [What "Offline Verification" Actually Means](../concepts/offline-verification.md).
:::

`verify-vp:session-bridge` also reads `HELIX_MODE` (`dev` or `prod`) and rewrites the API URL scheme to `http` or `https` to match. If the API refuses the session request, it falls back to `verifyVP()` plus a local `SessionManager` token signed with `JWT_SECRET`.

### Replay is the verifier's job

A VP is not single-use. Neither the API nor the SDK tracks consumed `vpId`s: a VP is valid for five minutes and bound to one target service, and anything stricter is up to the verifier. A comment in `verify-vp-sdk.ts` says the API enforces single-use VPs; that is not the case. If you need single use, record each `vpId` you accept until its `expirationDate` and reject repeats.

## Known issues

Found by reading the scripts against the package versions the repository pins (`@helixid/core` `^2.0.1`, `@helixid/sdk-js` `^0.4.0`), not by running them:

- **`example:revocation-check`** onboards its agents by posting to `POST /v1/enroll` with a locally generated keypair. That route no longer exists — onboarding is `POST /v1/onboard` — so the script stops at its first step.
- **`example:verifier:vp-cache`** calls `verifyVP(vp, options)` without the `client` argument. `verifyVP` requires a `HelixClient` as its second argument, so the call fails.
- **`examples/README.md`** lists a "Path A" command for `examples/verifier-session-cycle.ts`. That file is not in the repository; `example:verify-vp:session-bridge` is the session example that exists.

To see revocation working end to end today, use [use case 3 of the Travel Concierge demo](./travel-concierge.md).

## Verifying a presentation by hand

`self-verify` shows what a verifier takes on when it does not call `/v1/vp/verify`: every check below, plus replay storage. Missing one is a security gap. The steps, as the script performs them:

### 1. VP expiry

Reject if `signedVP.expirationDate` is not in the future.

### 2. Resolve the holder's key

For `did:key`, the key is in the identifier: strip `did:key:` and decode the multibase value. For `did:web`, fetch the DID document directly — `/.well-known/did.json` for a bare host, `/<path>/did.json` otherwise, over `https` (or `http` for a loopback host) — check that its `id` matches the DID, and read the Ed25519 `verificationMethod` (`publicKeyMultibase`, or `publicKeyHex`). The script supports only these two methods.

### 3. VP signature

1. Remove `proof` from the VP.
2. Hash the canonical JSON of the rest (`hashCanonicalPayload()`).
3. Decode `proof.proofValue` from base58btc, stripping the leading `z`.
4. Verify the Ed25519 signature against the holder's key (`verifySignature()`).

### 4. VC signature

Resolve the issuer's key the same way from `vc.issuer`, or take it from `HELIX_ISSUER_PUBLIC_KEY` if set, and verify the credential's proof as in step 3.

### 5. VC expiry

Reject if `vc.validUntil` is not in the future.

### 6. `delegatedBy`

`signedVP.delegatedBy` is the DID of the user the agent acts for. The script only prints it; a real verifier checks it against its own user or session records.

### 7. Status list

Fetch `vc.credentialStatus.statusListCredential`, and read the bit at `statusListIndex` from `credentialSubject.encodedList` with `getBit()`. The list is base64url-encoded and gzip-compressed. `0` means active; `1` means revoked. This fetch is a network dependency you cannot skip: a well-formed VP from a revoked credential is still invalid.

### 8. Replay

Record `signedVP.id` and reject it if it is presented again. The script prints this as a required check rather than implementing a store.

The script checks one agent credential. It does not walk a delegation chain or evaluate consent grants; `POST /v1/vp/verify` does both.

:::warning[Use the SDK's helpers for the cryptography]
The script imports `hashCanonicalPayload`, `verifySignature`, `base58btcDecode`, `multibaseToPublicKeyHex` and `getBit` from `@helixid/sdk-js`. Do the same rather than re-implementing canonicalization or encoding.
:::

## Verifier fast-path cycles

Two scripts demonstrate the repeat-call patterns from [Hybrid 3-Layer Design](../architecture/hybrid-layers.md):

```bash
# Path A — session JWT after one verification
pnpm example:verify-vp:session-bridge

# Path B — VP-result caching, no JWT
pnpm example:verifier:vp-cache
```

In both, the verifier owns the policy and infrastructure decisions: scope checks, the replay/cache store, TTLs, headers, and secrets. Path B is the script listed under [Known issues](#known-issues).
