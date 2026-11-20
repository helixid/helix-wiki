---
id: mcp-server
title: MCP Operator Server
sidebar_label: MCP Operator Server
sidebar_position: 4
description: Reference for @helixid/mcp-server — a stdio MCP server that exposes the HelixID operator workflows (issuer DID, status list, credential issuance, revocation) as tools.
---

# `@helixid/mcp-server`

A standalone **MCP server** that exposes HelixID operator workflows as tools: creating an issuer DID and wallet, creating a status list, issuing a credential, revoking one, and inspecting a wallet. It is the MCP counterpart of [`@helixid/cli`](./cli.md): the same operations and the same wallet and signing code, reached through MCP tool calls instead of a shell.

```bash
npm install -g @helixid/mcp-server
```

Binary: `helix-mcp-server`. This page describes `@helixid/mcp-server` 0.2.2.

:::note[Not the middleware]
[`@helixid/mcp-middleware`](./mcp.md) is a library that *your* MCP server imports to authenticate callers. This package *is* an MCP server. Together they replace the earlier `@helixid/mcp` package.
:::

## Running it

The server speaks MCP over **stdio**. Start it directly:

```bash
export HELIX_WALLET_PASSPHRASE='your-passphrase'
helix-mcp-server
```

Or let an MCP client launch it, for example from an `.mcp.json` or a desktop client's server configuration:

```json
{
  "mcpServers": {
    "helix": {
      "command": "npx",
      "args": ["-y", "@helixid/mcp-server"],
      "env": { "HELIX_WALLET_PASSPHRASE": "your-passphrase" }
    }
  }
}
```

Wallet, status list and credential paths are read and written on the machine that runs the server. Run it where those files should live, as you would the CLI.

## Environment variables

| Variable | Needed by | Purpose |
| --- | --- | --- |
| `HELIX_WALLET_PASSPHRASE` | Every tool | Wallet encryption passphrase. It is read from the server's environment and is never a tool argument. |
| `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` | `did_create` with `method: "hedera"` | The Hedera account that pays for anchoring the DID. This method also needs [`@helixid/did-hedera`](./did-hedera.md), an optional dependency of this package. |

## Tools

| Tool | CLI equivalent | What it does |
| --- | --- | --- |
| `did_create` | `helix did create` | Create a DID (`did:web` or `did:hedera`) and its encrypted wallet file. `did:web` also creates the initial status list unless `statusList` is `false`. |
| `issuer_init` | `helix issuer init` | Load an issuer wallet and report its DID, public key and verification method. |
| `status_list_create` | `helix status-list create` | Create a signed BitstringStatusList credential file. |
| `vc_issue` | `helix vc issue` | Sign a `HelixAgentCredential` for an agent DID and assign it an index in the status list file. |
| `revoke` | `helix revoke` | Revoke a credential by flipping its bit in the status list file. |
| `wallet_inspect` | `helix wallet inspect` | Report a wallet's DID, public key and stored credentials. Never returns the private key. |

A successful call returns one text content item holding the result as JSON. A failed call returns the error message with `isError: true`; the server keeps running and answers the next call.

### `did_create`

| Argument | Required | Meaning |
| --- | --- | --- |
| `method` | Yes | `web` or `hedera`. |
| `wallet` | Yes | Path to write the new encrypted wallet file. The call fails if the file already exists. |
| `domain` | For `web` | The domain of the `did:web` DID. |
| `network` | No | `testnet` (default), `previewnet` or `mainnet`. `hedera` only. |
| `statusList` | No | `did:web` only. Set `false` to skip creating the initial status list. |
| `statusListLength` | No | Status list capacity in bits. Default 131,072. |
| `statusListOutput` | No | Status list file path. Default: `status-list.json` next to the wallet file. |
| `statusListBaseUrl` | No | Public URL the status list will be served at. Default: `https://<domain>/.well-known/helix-status-list.json`. |

For `web`, the result holds `did`, `walletPath`, `didDocument`, `didDocumentUrl` (`https://<domain>/.well-known/did.json`, where you host the document) and, unless skipped, `statusList` (`output`, `baseUrl`, `length`). For `hedera`, it holds `did`, `walletPath` and `hedera` (`transactionId`, `topicId`).

### `issuer_init`

| Argument | Required | Meaning |
| --- | --- | --- |
| `wallet` | Yes | Path to the issuer wallet file. |

Returns `did`, `publicKeyHex` and `verificationMethod`.

### `status_list_create`

| Argument | Required | Meaning |
| --- | --- | --- |
| `length` | Yes | Status list capacity in bits. |
| `output` | Yes | Output file path. |
| `baseUrl` | Yes | Public URL the status list will be served at. |
| `wallet` | Yes | Path to the issuer wallet file. |

Returns `output`, `baseUrl` and `length`.

### `vc_issue`

| Argument | Required | Meaning |
| --- | --- | --- |
| `agentDid` | Yes | The agent's DID. |
| `scopes` | Yes | Comma-separated privilege scopes. At least one. |
| `expires` | Yes | Validity as a number with an `s`, `m`, `h` or `d` suffix, for example `90d` or `24h`. |
| `statusList` | Yes | Path to the status list JSON file. Updated in place. |
| `baseUrl` | Yes | The public status list URL. |
| `wallet` | Yes | Path to the issuer wallet file. |
| `output` | No | Path to also write the credential to. |
| `maxDelegationDepth` | No | Default `1`. |

Returns `vc` (the signed credential), `vcId`, `scopes`, `expiresAt`, `statusIndex` and, when `output` was given, `outputPath`.

### `revoke`

| Argument | Required | Meaning |
| --- | --- | --- |
| `vcId` | Yes | The credential to revoke. |
| `statusList` | Yes | Path to the status list JSON file. Updated in place. |
| `wallet` | Yes | Path to the issuer wallet file. |

Returns `vcId`, `index` and `previousBit`. Publish the updated status list file afterwards; verifiers see the revocation the next time they fetch it.

### `wallet_inspect`

| Argument | Required | Meaning |
| --- | --- | --- |
| `wallet` | Yes | Path to the wallet file. |

Returns `did`, `publicKey` and `credentials` (`id`, `scopes`, `expires` for each).

## What it does not do

These tools work on local files with an issuer wallet's own key. They do not call a HelixID API, so they do not onboard agents, sign presentations, delegate, or issue consent grants. Those are API calls: see [`HelixClient`](./sdk-js.md) and, for onboarding from a shell, [`helix agent onboard`](./cli.md#onboarding-an-agent). There is no MCP tool for agent onboarding.

:::caution[An MCP client that can call these tools can sign as your issuer]
Whoever drives this server can issue and revoke credentials with the wallet it is pointed at. Run it only for MCP clients you would hand the CLI and the passphrase to, and keep the wallet file where the [Security Model](../security/security-model.md) says a trust anchor belongs.
:::
