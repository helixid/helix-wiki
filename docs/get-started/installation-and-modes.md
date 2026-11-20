---
id: installation-and-modes
title: Installation & Modes
sidebar_label: Installation & Modes
sidebar_position: 3
description: Install the SDK, choose a DID method, run the issuer API, and enroll an agent.
---

# Installation & Modes

## Install

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```bash
npm install @helixid/sdk-js
```

Framework adapters and operator tooling are separate packages:

```bash
npm install @helixid/mcp-middleware  # protect an MCP server's tools
npm install @helixid/langchain       # LangChain / LangGraph tool wrapper
npm install @helixid/widget          # consent-page building blocks for a service
npm install -g @helixid/cli          # operator CLI (`helix`)
npm install -g @helixid/mcp-server   # operator tools over MCP (`helix-mcp-server`)
npm install @helixid/did-hedera      # optional Hedera DID support
```

`@helixid/mcp` is the old combined package and is no longer updated; use `@helixid/mcp-middleware`.

The SDK and its adapters live in [`helix-sdk-js`](https://github.com/helixid/helix-sdk-js), a pnpm workspace. To build from source:

```bash
pnpm install
pnpm build
```

</TabItem>
<TabItem value="py" label="Python">

```bash
pip install helixid-sdk-py
```

Framework adapters are extras on the same package, not separate installs:

```bash
pip install "helixid-sdk-py[langchain]"       # LangChain integration
pip install "helixid-sdk-py[crewai]"          # CrewAI integration
pip install "helixid-sdk-py[mcp-middleware]"  # MCP auth middleware
pip install "helixid-sdk-py[all]"             # everything above
```

The core package needs Python 3.9 or later; the framework extras need 3.10 or later. There is no Python CLI — the `helix` CLI is deliberately not duplicated per language. The full reference is [Python SDK](../sdk/sdk-py.md).

The SDK lives in [`helix-sdk-py`](https://github.com/helixid/helix-sdk-py). To build from source:

```bash
pip install -e ".[dev,all]"
```

</TabItem>
</Tabs>

## Choosing a mode

HelixID's trust properties are the same in every mode. What changes is **where verification gets the issuer's public key from**, and therefore who has to be reachable at verification time. The mode is the server's `DID_METHOD`.

| Mode | DID method | Key comes from | Issuer's domain reachable to verify? | Use for |
| --- | --- | --- | --- | --- |
| **Local** | `did:key` | The identifier itself | No | Local development and single-server setups |
| **Web** (default) | `did:web` | `GET https://<issuer-domain>/.well-known/did.json` and per-agent documents under the same domain | Yes, for static documents only | Production, cross-org trust |
| **Anchored** | `did:hedera` | A public Hedera mirror node | No — the issuer's own domain is never contacted | Ledger-anchored identity |

In all three, verification never calls the issuer to authorize a specific request. In all three the agent still needs its own HelixID server to sign a presentation, and the service calls the HelixID API it verifies with. See [What "Offline Verification" Actually Means](../concepts/offline-verification.md) and [DIDs & Identity](../concepts/dids-and-identity.md).

### Local mode (`did:key`)

The lowest-friction path — the one the [Fastest path quick start](./quick-start.md#fastest-path-one-running-api) uses. `did:key` carries its public key inside the identifier, so there is nothing to resolve and nothing to host.

`did:key` is development-oriented and cannot express key rotation or service endpoints. Use `did:web` or `did:hedera` for production cross-org trust.

### Web mode (`did:web`, default)

The issuer serves its own DID document at `/.well-known/did.json`, and verification resolves it over HTTPS. This is the default. Set `DID_METHOD=web` and `DID_DOMAIN` to the domain the API is served from.

### Anchored mode (`did:hedera`)

The optional [`@helixid/did-hedera`](../sdk/did-hedera.md) package anchors DID documents on Hedera and resolves them from a public mirror node, so verification never contacts the issuer's own domain. Resolution works once the package is installed. Issuing with `DID_METHOD=hedera` currently covers agent onboarding only — see [`@helixid/did-hedera`](../sdk/did-hedera.md) for the setup and its limits.

## Running the issuer API

The quickest way to a running server is the Docker path in [Quick Start](./quick-start.md#step-0--get-a-running-helix-api). To run from source, the smallest setup needs **no external infrastructure** beyond the API process itself: SQLite storage, in-memory cache, and `did:web`.

Create or update `.env`:

```bash
NODE_ENV=development
API_BASE_URL=http://localhost:3000

HELIX_STORAGE_ADAPTER=sqlite
HELIX_SQLITE_PATH=./data/helixid.sqlite
HELIX_CACHE_ADAPTER=memory

DID_METHOD=web
DID_DOMAIN=localhost:3000

HELIX_ADMIN_API_KEY=dev-admin-key-change-in-production   # at least 16 characters
HELIX_SIGNING_KEY=<32-byte-ed25519-private-key-hex>
HOSTED_KEY_ENCRYPTION_KEY=<master key for agent and service keys held in custody>
```

Start the API:

```bash
set -a; source .env; set +a
pnpm dev
```

Set `HOSTED_KEY_ENCRYPTION_KEY` for anything you intend to restart: without it the server uses a random key for the life of the process and stored agent keys become unreadable afterwards. The full variable list, including Postgres and Redis, is in [Environment & Configuration](../self-hosting/configuration.md).

SQLite mode does not require running database migrations.

### Troubleshooting (SQLite users)

If startup fails with `SyntaxError: The requested module '@prisma/client' does not provide an export named 'PrismaClient'`, it is usually an install/generation/runtime issue — not a SQLite requirement issue.

Regenerate the Prisma client:

```bash
pnpm install
pnpm db:generate
pnpm dev
```

If needed, force a clean reinstall:

```bash
rm -rf node_modules
pnpm install --force
pnpm db:generate
pnpm dev
```

## Enrolling an agent

Onboarding is a single SDK round trip using a one-time **enrollment token** (single-use) delivered out-of-band — an env var, a secret manager, or a CI variable.

Agent self-custody has been retired: the server generates and holds the agent's private key. There is no wallet file — onboarding returns just a DID and a VC id.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient } from '@helixid/sdk-js'

const client = new HelixClient(process.env.HELIX_API_URL!)

const { agentDid, vcId } = await client.onboardAgent(process.env.HELIX_BOOTSTRAP_TOKEN!)

console.log(agentDid, vcId)
```

</TabItem>
<TabItem value="py" label="Python">

```python
import os
from helix_sdk import HelixClient

client = HelixClient(os.environ["HELIX_API_URL"])

result = client.onboard_agent(os.environ["HELIX_BOOTSTRAP_TOKEN"])

print(result["agentDid"], result["vcId"])
```

</TabItem>
</Tabs>

An enrollment token is **not** an identity credential. It is a one-time permission slip that says: "whoever presents this may enroll one new agent with these scopes/delegation limits/domains."

Creating that token is a privileged **operator policy action** (not an agent action), because it decides authority:

1. Operator decides policy (`requestedScopes`, `maxDelegationDepth`, `requestedDomains`)
2. Operator mints token via `POST /v1/enrollment-tokens`, optionally with an `expiry` in days — a token without one does not expire until it is used
3. Operator delivers token out-of-band (env var, Kubernetes Secret, CI variable, etc.)
4. Agent SDK presents token via `onboardAgent()` / `onboard_agent()` and receives its DID + VC id

:::info[Why this boundary exists]
If agents could decide their own scopes, identity and authorization would collapse into self-granted authority. The operator owns issuance policy; the token carries exactly one decision to exactly one new agent.
:::

:::caution[Protect the token endpoint]
`POST /v1/enrollment-tokens` does not check the admin key in the open-source server. Whoever can reach it can mint an agent with any scopes. Keep the API on a private network or behind your own gateway, and expose only the routes a caller needs.
:::

## Present and verify a VP

A server-custody agent has no wallet to load — it presents by asking the API to sign on its behalf, using the `agentDid` returned from onboarding.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient, verifyVP } from '@helixid/sdk-js';

const client = new HelixClient(process.env.HELIX_API_URL!, {
  adminApiKey: process.env.HELIX_ADMIN_API_KEY!,
});

const serviceDid = 'did:web:orders.example.com'; // the DID of the service being called
const signedVP = await client.signVP(agentDid, serviceDid);

const result = await verifyVP(signedVP, client, {
  expectedTargetService: serviceDid,
});

console.log(result.valid, result.agentDid, result.effectiveScopes);
```

</TabItem>
<TabItem value="py" label="Python">

```python
import os
from helix_sdk import HelixClient, verify_vp

client = HelixClient(
    os.environ["HELIX_API_URL"],
    admin_api_key=os.environ["HELIX_ADMIN_API_KEY"],
)

service_did = "did:web:orders.example.com"  # the DID of the service being called
signed_vp = client.sign_vp(agent_did, service_did)

result = verify_vp(signed_vp, client, expected_target_service=service_did)

print(result["valid"], result["agentDid"], result["effectiveScopes"])
```

</TabItem>
</Tabs>

Both calls hit the HelixID API. `signVP()`/`sign_vp()` calls `POST /v1/agents/:did/vp` (the server holds the only copy of the key) and requires the admin key on a self-hosted server. `verifyVP()`/`verify_vp()` calls `POST /v1/vp/verify` — signature check, delegation-chain walk, expiry, target-service check, consent rules and revocation all happen server-side, with `VP_VERIFIED`/`VP_REJECTED` audit logging handled there too.

`targetService` must be the service's DID. Pass `{ userDid }` (`user_did=`) when the agent is acting for a user; signing then requires a consent grant from that service — see [The Two-Issuer Model](../concepts/two-issuer-model.md).

`vpId` is returned for caller-managed replay protection: a presentation is not single-use, and nothing on the server rejects a repeat. If you need a session JWT bridge, call `POST /v1/vp/verify` directly with `session: true` in the body — the SDK's `verifyVP()`/`verify_vp()` wrapper doesn't expose that flag.

## Delegate authority

Delegation is also an API call — the server signs the child credential with the delegating agent's key, the same way it signs VPs. The delegatee must itself be an agent onboarded on the same server.

<Tabs groupId="sdk-language">
<TabItem value="ts" label="TypeScript">

```typescript
import { HelixClient } from '@helixid/sdk-js';

const client = new HelixClient(process.env.HELIX_API_URL!, {
  adminApiKey: process.env.HELIX_ADMIN_API_KEY!,
});

const delegatedCredential = await client.delegateAuthority(
  agentDid,
  delegateeAgentDid,
  ['read:analytics'],
  3600,
);

console.log(
  delegatedCredential.id,
  delegatedCredential.credentialSubject.privilegeScopes,
  delegatedCredential.credentialSubject.delegationDepth,
);
```

</TabItem>
<TabItem value="py" label="Python">

```python
import os
from helix_sdk import HelixClient

client = HelixClient(
    os.environ["HELIX_API_URL"],
    admin_api_key=os.environ["HELIX_ADMIN_API_KEY"],
)

delegated_credential = client.delegate_authority(
    agent_did, delegatee_agent_did, ["read:analytics"], 3600
)

print(
    delegated_credential["id"],
    delegated_credential["credentialSubject"]["privilegeScopes"],
    delegated_credential["credentialSubject"]["delegationDepth"],
)
```

</TabItem>
</Tabs>

Verification enforces chain integrity, scope subsetting, and max depth from the credential chain itself. The root credential must be issuer-backed, and its `maxDelegationDepth` — `0` by default — must allow the hop. See [Delegation & Sub-Delegation](../concepts/delegation.md).
