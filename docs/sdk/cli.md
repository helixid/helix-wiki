---
id: cli
title: "@helixid/cli"
sidebar_label: "@helixid/cli"
sidebar_position: 5
description: The helix CLI for operator workflows — DIDs, status lists, credential issuance, and revocation.
---

# `@helixid/cli`

Command-line interface for HelixID **operator** workflows. Useful for low-volume issuance where running the full API is more infrastructure than you need, and for issuer setup generally.

```bash
npm install -g @helixid/cli
```

Binary: `helix`.

## Commands

| Command | Purpose | Required options | Optional options |
| --- | --- | --- | --- |
| `helix did create` | Create a DID and encrypted wallet. For `--method web`, also creates the SP's initial status list by default. | `--method <web\|hedera\|key>`, `--wallet <path>` | `--domain <domain>`, `--network <testnet\|previewnet\|mainnet>`, `--no-status-list`, `--status-list-length <bits>`, `--status-list-output <path>`, `--status-list-base-url <url>` |
| `helix issuer init` | Validate issuer wallet readiness. | `--wallet <path>` | None |
| `helix status-list create` | Create a signed BitstringStatusList credential file. | `--length <bits>`, `--output <path>`, `--base-url <url>`, `--wallet <path>` | None |
| `helix vc issue` | Issue a `HelixAgentCredential` to an agent DID. | `--agent-did <did>`, `--scopes <csv>`, `--expires <duration>`, `--status-list <path>`, `--base-url <url>`, `--wallet <path>` | `--output <path>`, `--max-delegation-depth <depth>` |
| `helix vc self-issue` | Issue a self-signed dev credential to a wallet. | `--scopes <csv>`, `--expires <duration>`, `--wallet <path>` | None |
| `helix revoke` | Revoke a credential by flipping its status-list bit. | `--vc-id <vcId>`, `--status-list <path>`, `--wallet <path>` | None |
| `helix wallet inspect` | Inspect a wallet without printing the private key. | `--wallet <path>` | None |

## Typical operator setup

Create the issuer identity and its status list in one step:

```bash
helix did create --method web --domain issuer.example.com --wallet issuer.enc
```

Confirm the issuer wallet is ready to sign:

```bash
helix issuer init --wallet issuer.enc
```

Issue a scoped credential to an agent:

```bash
helix vc issue \
  --agent-did did:key:z6Mk... \
  --scopes read:orders,write:orders \
  --expires 30d \
  --max-delegation-depth 1 \
  --status-list ./public/status/1.json \
  --base-url https://issuer.example.com \
  --wallet issuer.enc
```

Revoke it later:

```bash
helix revoke --vc-id <vcId> --status-list ./public/status/1.json --wallet issuer.enc
```

:::caution[The issuer wallet is the trust anchor]
`--wallet issuer.enc` holds the key that every credential in your trust domain is signed with. Treat it accordingly — a KMS, an HSM, or at minimum encrypted-at-rest storage with IAM-scoped access. `helix wallet inspect` deliberately never prints the private key. See the [Security Model](../security/security-model.md).
:::

Set `--max-delegation-depth` explicitly on every credential you issue. See [Delegation](../concepts/delegation.md).
