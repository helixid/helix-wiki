---
id: mcp
title: "@helixid/mcp-middleware"
sidebar_label: "@helixid/mcp-middleware"
sidebar_position: 3
description: Reference for @helixid/mcp-middleware — the MCP auth gate, OAuth validation, RFC 9728 helpers, audit sink and client helper.
---

# `@helixid/mcp-middleware`

Server-side auth gate for **Model Context Protocol** servers — HelixID presentations and OAuth 2.1 bearer tokens,
per-tool scopes, audit — and a client-side helper that attaches a presentation to an outbound tool call. For how the
pieces fit together, see [MCP Integration](../integrations/mcp.md).

```bash
npm install @helixid/mcp-middleware @helixid/sdk-js
```

`@modelcontextprotocol/sdk` is an **optional peer dependency**: the middleware works on plain tool-call objects and never
imports it. Everything below except `helixidMCPMiddleware`'s `requiredScopes`/`allowSelfSigned`/`expectedTargetService`
and `attachHelixVP` is new in 0.4.0.

## Exports

| Export | Purpose |
| --- | --- |
| `helixidMCPMiddleware(options)` | Returns `(toolCall) => Promise<toolCall>`: authenticates the caller, authorizes the tool, audits, and resolves — or throws. |
| `attachHelixVP(toolCall, options)` | Client side: signs a VP through the HelixID API and returns the call with it in `_meta["x-helix-vp"]`. |
| `createJwtValidator(options)` | The default OAuth validator: JWT access tokens checked against a JWKS. Used by the `oauth` option. |
| `createHelixAuditSink(options)` | An audit sink that posts decisions to `POST /v1/audit-log/events`. |
| `protectedResourceMetadataUrl(resource)` | The RFC 9728 metadata URL for a resource: `https://host/.well-known/oauth-protected-resource/<path>`. |
| `buildProtectedResourceMetadata(input)` | The RFC 9728 metadata document to serve at that URL. |
| `toHttpErrorResponse(error, { resourceMetadataUrl })` | Maps a middleware error to `{ status, headers: { 'WWW-Authenticate' }, body }`, or `undefined` if the error is not about the caller's credentials. |
| `MCPAuthError` | Error class for `CREDENTIAL_CONFLICT`, `OAUTH_TOKEN_INVALID`, `TOOL_NOT_PERMITTED`. |

Types: `MCPMiddlewareOptions`, `MCPToolCall`, `AttachHelixVPOptions`, `AuthResult`, `OAuthJwtOptions`, `AuditSink`,
`ToolAuditEvent`, `HelixAuditSinkOptions`, `ProtectedResourceMetadata`, `ProtectedResourceMetadataInput`,
`HttpErrorOptions`, `HttpErrorResponse`, `MCPAuthErrorCode`.

## `MCPToolCall`

What the middleware inspects. Pass the request's parts; the call is returned unchanged.

| Field | Purpose |
| --- | --- |
| `name` | The tool being called. Required for `toolScopes` (a call without one is denied). |
| `input` | The tool arguments. Never read for credentials. |
| `_meta` | The MCP request's `params._meta`. Carries a VP as `_meta["x-helix-vp"]` (any transport, including stdio). |
| `headers` | HTTP request headers (a Node headers object or a `Headers` instance), when serving over HTTP. |

Credential locations, checked together: `Authorization: HelixVP <vp>`, `X-Helix-VP: <vp>`, `_meta["x-helix-vp"]` (a
VP, base64url-encoded JSON), and `Authorization: Bearer <token>` (OAuth). The scheme name is case-insensitive.

## `MCPMiddlewareOptions`

| Option | Purpose |
| --- | --- |
| `client` | `HelixClient` used to verify VPs through the HelixID API. Needed only to accept HelixID agents. |
| `toolScopes` | `Record<toolName, scopes[]>`. Deny by default: an unlisted tool is rejected; a listed tool needs every scope in its list (`[]` = any authenticated caller). Takes precedence over `requiredScopes`. |
| `requiredScopes` | Scopes required for every tool. Used only when `toolScopes` is not set. |
| `expectedTargetService` | This server's DID. A VP signed for any other service is rejected, so it cannot be replayed here. |
| `allowSelfSigned` | Accept self-issued credentials. Defaults to `false`. Development only. |
| `oauth` | Accept bearer JWTs, validated with `createJwtValidator` (see `OAuthJwtOptions`). |
| `validateOAuthToken` | `(token) => Promise<AuthResult>`: your own bearer validation (opaque tokens, introspection). Resolve to accept, throw to reject. Use this **or** `oauth`, not both. |
| `auditSink` | `(event: ToolAuditEvent) => void \| Promise<void>`, awaited before the tool runs. |
| `onAuditError` | Called when the sink throws. The tool call still proceeds. |
| `serviceDid` | Recorded on audit events. Defaults to `expectedTargetService`. |

## `AuthResult`

What an OAuth validator resolves to.

| Field | Purpose |
| --- | --- |
| `sub` | The token's subject. Required; recorded as `oauthSubject` in audit events. |
| `scopes` | Granted scopes, compared with the tool's required scopes. |
| `clientId` | The OAuth client, if known. |
| `claims` | The full claim set, if you want it. |

## `OAuthJwtOptions`

| Option | Default | Purpose |
| --- | --- | --- |
| `issuer` | required | Expected `iss`. |
| `audience` | required | Expected `aud` (string or list): this server's resource URL. |
| `jwksUri` | required | The authorization server's JWKS. Must be `https`, except on `localhost`. |
| `algorithms` | RS/PS/ES 256–512, EdDSA | Allowed signing algorithms. `none` and `HS*` are never accepted. |
| `clockToleranceSeconds` | `30` | Allowed skew for `exp` and `nbf`. |
| `jwksCacheTtlMs` | 10 minutes | How long fetched keys are trusted. |
| `jwksRefetchCooldownMs` | 30 seconds | Minimum gap between refetches triggered by an unknown `kid` (key rotation). |

Validation checks the signature, `iss`, `aud`, `exp` (required), `nbf` (if present) and `sub` (required). Scopes come from
the `scope` claim (space-separated) or `scp`; the client from `client_id` or `azp`. Tokens with a `crit` header are
rejected.

## Errors

| `code` | Thrown when | `toHttpErrorResponse` |
| --- | --- | --- |
| `VP_MISSING` | No credential anywhere. | 401, challenges without an error code |
| `VP_INVALID_STRUCTURE` | A VP that is not base64url JSON, or a non-string `_meta` value. | 401 `invalid_token` |
| `VP_VERIFICATION_FAILED` | The HelixID API did not verify the VP (signature, chain, expiry, target service, revocation). | 401 `invalid_token` |
| `OAUTH_TOKEN_INVALID` | A bearer token failed validation, or bearer tokens are not configured. | 401 `invalid_token` |
| `CREDENTIAL_CONFLICT` | Different VPs in different places, two `Authorization` headers, or a VP plus a bearer token. | 400 `invalid_request` |
| `INSUFFICIENT_SCOPE` | The caller lacks a required scope. | 403 `insufficient_scope` |
| `TOOL_NOT_PERMITTED` | `toolScopes` is set and the tool is not in it. | 403 `insufficient_scope` |

Every mapped response carries two challenges in one `WWW-Authenticate` header, `Bearer …` and `HelixVP …`, each with
`resource_metadata`. Other errors map to `undefined`: handle them as server errors.

## `ToolAuditEvent`

| Field | Value |
| --- | --- |
| `event` / `result` | `AUTHZ_GRANTED` / `allowed`, or `AUTHZ_DENIED` / `denied` |
| `timestamp`, `authMethod` | ISO time; `helixvp` or `oauth` |
| `agentDid`, `vpId` | HelixID callers |
| `oauthSubject` | OAuth callers |
| `toolName`, `requiredScope` | The tool; on a denial, the scope that was missing |
| `effectiveScopes`, `reason` | The caller's scopes; why it was denied |
| `serviceDid` | This server |

Only identified callers produce events. `createHelixAuditSink({ baseUrl, apiKey, serviceDid?, timeoutMs? })` posts them
with `Authorization: Bearer <apiKey>` and `source: "mcp-middleware"`; an OAuth event needs a `serviceDid`.

## `AttachHelixVPOptions`

| Option | Required | Purpose |
| --- | --- | --- |
| `client` | Yes | `HelixClient`; the VP is signed by the HelixID API, which holds the agent's keys. |
| `agentDid` | Yes | The agent presenting. |
| `targetService` | Yes | Binds the VP to one verifier — the service's DID when it checks `expectedTargetService`. |
| `userDid` | No | The user on whose behalf the agent is acting. |

```typescript
const call = await attachHelixVP(
  { name: 'lookup_order', input: { orderId: 'ORD-1001' } },
  { client, agentDid, targetService: 'did:web:mcp.example.com' },
);
await mcpClient.callTool({ name: call.name!, arguments: call.input, _meta: call._meta });
```

The input is left untouched; only `_meta` changes.
