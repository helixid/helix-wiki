---
id: mcp
title: MCP (Model Context Protocol)
sidebar_label: MCP
sidebar_position: 2
description: Put any MCP server behind HelixID — accept HelixID agents and standard OAuth clients, enforce scopes per tool, and audit every call.
---

# MCP (Model Context Protocol)

MCP is where agent identity gets concrete: a tool call either runs or it doesn't. [`@helixid/mcp-middleware`](../sdk/mcp.md)
puts one decision in front of every tool: who is calling, are they allowed to call **this** tool, and a record of the
answer.

It has two doors, so existing clients keep working:

- **HelixID agents** present a signed Verifiable Presentation, verified by the HelixID API (signature, delegation chain,
  expiry, target service, revocation).
- **Standard MCP OAuth 2.1 clients** send a bearer access token, validated against your authorization server.

Either way the caller ends up with a set of scopes, checked against the scopes you require for the tool being called.

```bash
npm install @helixid/mcp-middleware @helixid/sdk-js @modelcontextprotocol/sdk
```

:::note
OAuth bearer tokens, per-tool scopes, RFC 9728 metadata and audit events are in `@helixid/mcp-middleware` 0.4.0 and
later. To see them running before you wire anything, follow the [MCP Quickstart](../get-started/mcp-quickstart.md).
:::

## How a tool call is decided

1. **Find the credential.** HTTP: `Authorization: HelixVP <vp>`, the older `X-Helix-VP: <vp>` header, or
   `Authorization: Bearer <token>`. Any transport, including stdio: the request's `params._meta["x-helix-vp"]`. The VP is
   base64url-encoded JSON. Tool arguments are never read for credentials.
2. **Refuse ambiguity.** Two different VPs, two `Authorization` headers, or a VP together with a bearer token is rejected
   (`CREDENTIAL_CONFLICT`) rather than resolved by picking one. The same VP repeated in several places is fine.
3. **Authenticate.** A VP is verified by the HelixID API; its *effective scopes* (the agent's authority, narrowed by any
   consent grant in the VP) become the caller's scopes. A bearer token is validated against the authorization server
   that issued it: a JWT against that server's JWKS (issuer, audience, expiry, signature), an opaque token by RFC 7662
   introspection. Its `scope` (or `scp`) claim becomes the caller's scopes. A callback of your own covers credentials no
   standard describes.
4. **Authorize the tool.** With `toolScopes`, a tool not listed is **denied by default**, and a listed tool needs every
   scope in its list. Without `toolScopes`, the global `requiredScopes` applies to every tool.
5. **Audit.** The decision — allowed or denied, which tool, which scope was missing, who asked — goes to your audit sink
   before the tool runs.
6. **Run the tool**, or throw. Nothing about identity reaches your tool code.

## Protecting a server

```typescript
import { HelixClient } from '@helixid/sdk-js';
import { createHelixAuditSink, helixidMCPMiddleware } from '@helixid/mcp-middleware';

const resource = 'https://mcp.example.com/mcp'; // this server's MCP endpoint

const requireHelix = helixidMCPMiddleware({
  // HelixID door: verifies VPs through the HelixID API.
  client: new HelixClient(process.env.HELIX_API_URL!, { apiKey: process.env.HELIX_API_KEY! }),
  expectedTargetService: 'did:web:mcp.example.com', // reject VPs signed for another service

  // OAuth door: access tokens whose audience is this server. The issuer URL is
  // enough: its keys are read from its metadata.
  oauth: { issuer: 'https://as.example.com', audience: resource },

  toolScopes: {
    lookup_order: ['orders:read'],
    refund_order: ['orders:admin'],
  },

  auditSink: createHelixAuditSink({
    baseUrl: process.env.HELIX_API_URL!,
    apiKey: process.env.HELIX_API_KEY!,
    serviceDid: 'did:web:mcp.example.com',
  }),
  onAuditError: (error) => console.error('audit write failed', error),
});

// Per tool call: resolves to the call, or throws.
await requireHelix({ name, input: args, _meta: request.params._meta, headers: req.headers });
```

Use one door or both. `client` is only needed to accept HelixID agents; `oauth` (or `validateOAuthToken`) only to accept
OAuth clients. A bearer token sent to a server with no OAuth configured is rejected.

### Trusting authorization servers

`oauth` takes one authorization server or an array of them, so agents from different identity providers can share one
MCP server:

```typescript
import { auth0, entra, keycloak, okta } from '@helixid/mcp-middleware';

oauth: [
  entra({ tenantId: '<directory id>', audience: '<API application id>' }),
  auth0({ domain: 'tenant.us.auth0.com', audience: resource }),
  okta({ domain: 'dev-1.okta.com', audience: resource, introspection: { clientId: '...', clientSecret: '...' } }),
  keycloak({ baseUrl: 'https://id.example.com', realm: 'shop', audience: resource }),
  { issuer: 'https://as.example.com', audience: resource },
],
```

- **Any standards-based server needs only `{ issuer, audience }`.** The `jwks_uri` (and, with `introspection`, the
  `introspection_endpoint`) are read from the issuer's metadata on first use. Give `jwksUri` or `introspection.endpoint`
  yourself to skip discovery.
- **Presets name your tenant, not a provider.** `entra`, `auth0`, `okta` and `keycloak` turn a tenant ID or domain into
  that provider's exact issuer string and endpoints. There is no "trust Auth0": every customer of those providers has
  their own authorization server, and the one you trust has to be yours.
- **JWTs are routed by `iss`.** A token goes to the issuer it names, which then verifies it; an issuer not in the list is
  refused before any request is sent to an authorization server.
- **Opaque tokens are introspected.** Add `introspection: { clientId, clientSecret }`, this server's own client at the
  authorization server, to one issuer. Only one issuer may use introspection, because an opaque token does not say who
  issued it. Set `introspectJwts: true` on that issuer to also introspect its JWTs, so a revoked token is refused before
  it expires.
- **Scopes can come from other claims.** `scopeClaims` names the claims to read; the default is `scope` and `scp`, and
  the `entra` preset reads `scp` and `roles`.

`validateOAuthToken: async (token) => ({ sub, scopes })` remains for credentials no standard describes, such as your own
API keys presented as bearers. Use it or `oauth`, not both. The option tables are in the
[package reference](../sdk/mcp.md#oauthissueroptions).

### Over HTTP: return real 401s

An MCP OAuth client starts discovery when an HTTP request comes back **401** with a `WWW-Authenticate` header. A tool
result marked as an error does not do that. So over Streamable HTTP, run the middleware in front of the MCP transport for
`tools/call` requests, and turn its errors into HTTP responses:

```typescript
import {
  buildProtectedResourceMetadata,
  protectedResourceMetadataUrl,
  toHttpErrorResponse,
} from '@helixid/mcp-middleware';

const resourceMetadataUrl = protectedResourceMetadataUrl(resource);
// → https://mcp.example.com/.well-known/oauth-protected-resource/mcp  (serve the metadata here)
const metadata = buildProtectedResourceMetadata({
  resource,
  authorizationServers: ['https://as.example.com'],
  scopesSupported: ['orders:read', 'orders:admin'],
});

try {
  await requireHelix({ name, input: args, _meta, headers: req.headers });
} catch (error) {
  const denial = toHttpErrorResponse(error, { resourceMetadataUrl });
  if (!denial) throw error; // not the caller's fault: a 500, never a 401
  res.writeHead(denial.status, {
    'content-type': 'application/json',
    'www-authenticate': denial.headers['WWW-Authenticate'],
  });
  res.end(JSON.stringify(denial.body));
}
```

| Situation | Status | Challenge |
| --- | --- | --- |
| No credential | 401 | `Bearer` and `HelixVP`, each with `resource_metadata` |
| Invalid or expired token, VP that fails verification | 401 | `error="invalid_token"` |
| Conflicting credentials | 400 | `error="invalid_request"` |
| Missing scope | 403 | `error="insufficient_scope"`, `scope="…"` listing the scopes the tool requires |
| A tool not in `toolScopes` | 403 | `error="insufficient_scope"` |

The `scope` attribute on a 403 lets an OAuth client request the missing scopes from its authorization server and retry.

`toHttpErrorResponse` returns `undefined` for anything that is not about the caller's credentials — for example the
server's own HelixID API key being rejected — so a misconfigured server never tells a caller to re-authenticate. The same
goes for `AuthorizationServerUnavailableError`, thrown when the authorization server's metadata, keys or introspection
endpoint cannot be reached: the caller's token was not shown to be bad, so answer 5xx, never 401.

Gate only `tools/call`. Leaving `initialize` and `tools/list` open keeps HelixID clients that carry their VP in `_meta`
(rather than a header) working, and means a presentation is verified once per tool call. The
[order-management sample](../get-started/mcp-quickstart.md) is a complete server wired this way, about 170 lines with no
web framework.

## Calling a protected tool (HelixID agent)

The agent's credentials are held by HelixID, so signing a presentation is an API call. `attachHelixVP` signs one for the
target service and puts it in the call's `_meta`:

```typescript
import { HelixClient } from '@helixid/sdk-js';
import { attachHelixVP } from '@helixid/mcp-middleware';

const client = new HelixClient(process.env.HELIX_API_URL!, { apiKey: process.env.HELIX_API_KEY! });

const call = await attachHelixVP(
  { name: 'lookup_order', input: { orderId: 'ORD-1001' } },
  { client, agentDid: process.env.AGENT_DID!, targetService: 'did:web:mcp.example.com' },
);
await mcpClient.callTool({ name: call.name!, arguments: call.input, _meta: call._meta });
```

To send the presentation as a header instead, sign with `client.signVP()` and send
`Authorization: HelixVP ${encodeHelixVP(vp)}` (`encodeHelixVP` is exported by `@helixid/sdk-js`).

OAuth clients need nothing from HelixID: they follow the server's `WWW-Authenticate` challenge and the RFC 9728 metadata
to the authorization server, exactly as with any protected MCP server.

## The audit trail

With an audit sink, every decision about an **identified** caller is recorded before the tool runs:

- `AUTHZ_GRANTED` when the call may run, `AUTHZ_DENIED` when it may not, with the tool name, the scope that was missing,
  the caller's effective scopes and a reason.
- A HelixID caller is recorded by agent DID. An OAuth caller has no agent DID, so it is recorded by the token's subject
  (`oauthSubject`) together with the server's DID — set `serviceDid` (or `expectedTargetService`) for OAuth callers.

`createHelixAuditSink` posts these to `POST /v1/audit-log/events` on a hosted HelixID API, where they appear in the
console under **Audit** as *Access Granted* and *Access Denied*. The server's account and the agent's owner both see the
row; only the server's side sees an OAuth subject. Any function `(event) => void | Promise<void>` works as a sink if you
keep your own log.

Two things are deliberate. Callers that never identified themselves (no credential, an unreadable token) are not logged,
so an unauthenticated flood cannot fill the audit log; failed presentations are still recorded by the HelixID API itself
when it verifies them. And auditing is best effort: if the sink throws, `onAuditError` is called and the tool call goes
ahead.

## Known limitation: presentation replay (pending)

:::warning[Pending follow-up]
A presentation is **not single-use**. Neither `@helixid/mcp-middleware` nor the HelixID API's `POST /v1/vp/verify`
records which presentations it has already accepted, so the same VP is accepted again if it is presented again before it
expires. A local end-to-end run on 2026-11-09 confirmed this: one VP, sent twice to the same server, was allowed both
times.
:::

What still limits a replayed presentation today:

- **It works against one service only.** A VP is bound to its target service. With `expectedTargetService` set, a VP
  signed for any other service is rejected (`VP_VERIFICATION_FAILED`, "VP targetService does not match expected target
  service"). Always set it.
- **It expires quickly.** A VP is valid for five minutes after signing.
- **It can be cut off.** Revoking the agent's credential makes every presentation built on it fail verification.
- **It is visible.** Each replayed call is still authorized against the tool's scopes and recorded as `AUTHZ_GRANTED`
  under the same `vpId`, so repeated use of one presentation shows up in the audit log.

Single-use enforcement (remembering accepted VP ids until they expire, on the server or in the middleware) is planned as
a follow-up in Phase 2 of the MCP middleware rollout. Until then, treat a presentation like a short-lived bearer
credential: send it only over TLS, and don't log it.

## Why MCP is a good fit

An MCP server frequently sits at an organizational boundary — the tools belong to one party, the agent to another. That
is where a bearer token alone is weakest: it proves possession of a secret and nothing about who authorized this agent to
do this thing, and revoking it breaks every other caller holding the same key.

A presentation carries its own proof of delegated authority, is bound to one target service, expires in minutes, and can
be revoked individually. Accepting OAuth on the same server means you can adopt this without turning existing clients
away. See [Comparisons](../comparisons/why-not-just-use.md).

## Scope discovery for consent

The scopes you put in `toolScopes` are a natural source for the scope list a user sees on a consent page. Building that
list is the service's job: pass it to [`@helixid/widget`](../sdk/widget.md)'s `resolveConsentScopes()` as
`serviceScopes`, with a label for each scope. The widget no longer reads an MCP server's `tools/list` itself.

`resolveConsentScopes({ serviceDid, agentDid, serviceScopes, client })` then narrows the list to the scopes the agent
itself holds, read from the HelixID API, and appends `accept-terms`. A consent screen therefore never offers a scope the
agent's own credential lacks, which grant issuance would refuse anyway. If the agent holds none of the service's scopes,
or its scopes cannot be read, resolution throws rather than falling back to the full list.
