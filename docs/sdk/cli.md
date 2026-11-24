---
id: cli
title: "@helixid/cli"
sidebar_label: "@helixid/cli"
sidebar_position: 5
description: The helix CLI for operator workflows — DIDs, status lists, credential issuance, and revocation.
---

# `@helixid/cli`

Command-line interface for HelixID **operator** workflows: creating an issuer identity, publishing its status list, issuing and revoking credentials from files, and onboarding an agent against a running HelixID API.

```bash
npm install -g @helixid/cli
```

Binary: `helix`. This page describes `@helixid/cli` 0.3.1.

## Commands

| Command | Purpose | Required options | Optional options |
| --- | --- | --- | --- |
| `helix did create` | Create an issuer DID and its encrypted wallet file. For `--method web`, also creates the issuer's initial status list by default. | `--method <web\|hedera>`, `--wallet <path>` | `--domain <domain>` (required for `web`), `--network <testnet\|previewnet\|mainnet>` (default `testnet`), `--no-status-list`, `--status-list-length <bits>`, `--status-list-output <path>`, `--status-list-base-url <url>` |
| `helix issuer init` | Check that an issuer wallet loads, and print its DID, public key and verification method. | `--wallet <path>` | None |
| `helix status-list create` | Create a signed BitstringStatusList credential file. | `--length <bits>`, `--output <path>`, `--base-url <url>`, `--wallet <path>` | None |
| `helix vc issue` | Sign a `HelixAgentCredential` for an agent DID with the issuer wallet, and assign it an index in the status list file. | `--agent-did <did>`, `--scopes <csv>`, `--expires <duration>`, `--status-list <path>`, `--base-url <url>`, `--wallet <path>` | `--output <path>` (stdout if omitted), `--max-delegation-depth <depth>` (default `1`) |
| `helix revoke` | Revoke a credential by flipping its bit in the status list file. | `--vc-id <vcId>`, `--status-list <path>`, `--wallet <path>` | None |
| `helix agent onboard` | Onboard an agent with an enrollment token. The server generates and keeps the agent's key; no wallet file is written. | `--token <token>` | `--api-url <url>`, `--domains <csv>` |
| `helix wallet inspect` | Print a wallet's DID, public key and stored credentials. Never prints the private key. | `--wallet <path>` | None |

`--method` accepts `web` or `hedera`. `--expires` takes a number with an `s`, `m`, `h` or `d` suffix, for example `90d` or `24h`.

:::note[Removed commands and options]
`helix vc self-issue` and `--method key` are gone. Agents no longer create their own DID or wallet: they are onboarded through the API, with `helix agent onboard` or [`HelixClient.onboardAgent()`](./sdk-js.md).
:::

## Environment variables

| Variable | Needed by | Purpose |
| --- | --- | --- |
| `HELIX_WALLET_PASSPHRASE` | Every command that reads or writes a wallet: all except `helix agent onboard` | Wallet encryption passphrase. There is no command-line flag for it, so it never lands in shell history. |
| `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` | `helix did create --method hedera` | The Hedera account that pays for anchoring the DID. This method also needs [`@helixid/did-hedera`](./did-hedera.md) installed. |
| `HELIX_API_URL` (or `API_BASE_URL`) | `helix agent onboard` | Default for `--api-url`. If neither is set, the default is `http://localhost:3000`. |

## Onboarding an agent

Mint an enrollment token first, in the console or with `POST /v1/enrollment-tokens`. The token is the operator's proof that this agent may onboard with the scopes and domains it was granted; the CLI does not mint one.

```bash
helix agent onboard \
  --token <enrollment-token> \
  --api-url http://localhost:3000 \
  --domains orders.example.com,billing.example.com
```

The command calls `POST /v1/onboard` and prints the agent's DID and the id of its credential. Nothing else comes back: the private key stays on the server. To act as the agent afterwards, ask the API for a signed presentation with [`client.signVP(agentDid, serviceDid)`](./sdk-js.md).

## Typical issuer setup

Create the issuer identity and its status list in one step:

```bash
export HELIX_WALLET_PASSPHRASE='your-secret'

helix did create --method web --domain issuer.example.com --wallet ./issuer.enc
```

For `did:web`, this writes two things that you host on your domain:

1. the DID document, printed to the terminal, at `https://issuer.example.com/.well-known/did.json`;
2. the status list, written to `status-list.json` next to the wallet file, at `https://issuer.example.com/.well-known/helix-status-list.json`.

The status list defaults to 131,072 bits. Change the path, the public URL or the size with the `--status-list-*` options, or skip it with `--no-status-list`. The command refuses to overwrite an existing wallet file.

Confirm the issuer wallet is ready to sign:

```bash
helix issuer init --wallet ./issuer.enc
```

Issue a scoped credential to an agent DID:

```bash
helix vc issue \
  --agent-did <agent-did> \
  --scopes read:orders,write:orders \
  --expires 30d \
  --max-delegation-depth 1 \
  --status-list ./status-list.json \
  --base-url https://issuer.example.com/.well-known/helix-status-list.json \
  --wallet ./issuer.enc \
  --output ./vc-agent.json
```

The command updates the status list file in place, so publish the new file afterwards. Revoke the credential later the same way:

```bash
helix revoke --vc-id <vcId> --status-list ./status-list.json --wallet ./issuer.enc
```

Verifiers see the revocation the next time they fetch the status list from your server.

:::note[File-based issuance and a running HelixID API]
`helix vc issue` and `helix revoke` work on local files with the issuer wallet's own key; they do not call a HelixID API. An agent onboarded through the API gets its `HelixAgentCredential` from the platform issuer at onboarding, and that credential is revoked through the API (`POST /v1/vcs/:vcId/revoke`), not with this command.
:::

:::caution[The issuer wallet is the trust anchor]
`--wallet issuer.enc` holds the key that every credential in your trust domain is signed with. Treat it accordingly — a KMS, an HSM, or at minimum encrypted-at-rest storage with IAM-scoped access. `helix wallet inspect` deliberately never prints the private key. See the [Security Model](../security/security-model.md).
:::

Set `--max-delegation-depth` explicitly on every credential you issue. See [Delegation](../concepts/delegation.md).
