---
id: key-compromise-and-safe-harbor
title: Key Compromise & Safe Harbor
sidebar_label: Key Compromise & Safe Harbor
sidebar_position: 3
description: How to report a suspected key compromise, and the authorization terms for good-faith security research.
---

# Key Compromise & Safe Harbor

## Key compromise

If you suspect that a HelixID release signing key, a maintainer's signing key, or a published DID's keypair under DgVerse's control is compromised, treat it as a **critical-severity report**.

Flag it in the subject line as:

```
[KEY COMPROMISE]
```

These are prioritized above all other reports. Send to `hello@dgverse.in` — see [Reporting a Vulnerability](./reporting-a-vulnerability.md) for channels.

### Why this is the top-priority category

A compromised issuer key is not one bad credential — it is the ability to mint valid credentials for an entire trust domain, indistinguishable from legitimate ones. Every verifier that trusts that issuer accepts them, and rotating the key invalidates every credential the issuer has ever signed.

### If your own issuer key is compromised

This is your deployment's incident, not a HelixID vulnerability, but the mechanics are worth knowing in advance:

1. **Rotate the issuer key** and republish the DID document. Verifiers pick up the new key as their DID cache expires — 5 minutes for `did:web`, 15 for `did:hedera`.
2. **Revoke affected credentials** by flipping their status-list bits. Revoking an issuer-backed root also invalidates every [delegated child](../concepts/delegation.md) derived from it.
3. **Expect a staleness window.** Verifiers caching the old DID document or status list will keep accepting the compromised key until their TTLs expire. This is the trade-off documented in [Performance & Caching](../architecture/performance-and-caching.md) — cache TTLs are the dial that bounds it.
4. **Check the audit log.** `GET /v1/audit-log` reconstructs what was presented and accepted during the exposure window, including refusals.

Keeping the issuer key in a KMS or HSM is what makes step 1 survivable. See the [Security Model](./security-model.md#key-custody).

## Safe harbor

Security research and vulnerability disclosure conducted consistent with the [security policy](./reporting-a-vulnerability.md) is considered **authorized conduct**. DgVerse will not initiate or cooperate with legal action against researchers for good-faith security research that accidentally violates that policy, including:

- Accessing data that is not your own — only to the minimum extent necessary to demonstrate the vulnerability, and not copying, exfiltrating, or retaining it beyond what the report requires
- Temporarily disrupting a **test** deployment, provided production systems and other users are not affected
- Reverse engineering, probing, or scanning HelixID binaries, packages, and source code

### Not covered by safe harbor

These remain prohibited:

- Attacking production infrastructure operated by DgVerse **or by third parties running HelixID**
- Accessing, modifying, or destroying data belonging to other users
- Publicly disclosing vulnerabilities before coordinated disclosure
- Social engineering, phishing, or physical attacks against DgVerse personnel or partners
- Violating any applicable law

:::tip[When in doubt, ask first]
If you are uncertain whether a specific test activity is authorized, email `hello@dgverse.in` before you run it and you'll get a clarification in writing. That is always cheaper than finding out afterwards.
:::
