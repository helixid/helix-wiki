---
id: mcp-quickstart
title: MCP Quickstart
sidebar_label: MCP Quickstart
sidebar_position: 3
description: Put an MCP server behind HelixID in five minutes, with the order-management sample — per-tool scopes, 401 discovery and a denied refund.
---

# MCP Quickstart

In five minutes you will run an MCP server whose tools are protected by [`@helixid/mcp-middleware`](../sdk/mcp.md), and
watch it refuse a tool call that lacks the right scope. Nothing to sign up for and no authorization server: the sample's
demo mode accepts two fixed tokens on your own machine.

The sample is an order-management server with two tools:

| Tool | Scope it needs | What it does |
| --- | --- | --- |
| `lookup_order` | `orders:read` | Returns an order by id |
| `refund_order` | `orders:admin` | Refunds an order in full |

## 1. Run the sample

You need Node `^20.19.0 || >=22.12.0` and pnpm 9. The sample lives in the `helix-sdk-js` repository, at
`mcp-middleware/examples/order-management`.

```bash
git clone https://github.com/helixid/helix-sdk-js.git
cd helix-sdk-js
pnpm install
pnpm --filter @helixid/example-mcp-order-management... build
pnpm --filter @helixid/example-mcp-order-management demo
```

The server prints what it accepts:

```text
order-management MCP server on http://localhost:3700/mcp
  HelixID VPs: off (set HELIX_API_URL)
  OAuth:       DEMO tokens demo-reader, demo-admin
  Audit:       off (set HELIX_API_URL + HELIX_API_KEY)
```

`demo-reader` holds `orders:read`; `demo-admin` holds `orders:read` and `orders:admin`. Demo mode only starts on a
loopback address.

## 2. Call a tool with no credentials

In a second terminal:

```bash
MCP=http://localhost:3700/mcp
H=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')

curl -i "${H[@]}" $MCP -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{"name":"lookup_order","arguments":{"orderId":"ORD-1001"}}}'
```

```text
HTTP/1.1 401 Unauthorized
www-authenticate: Bearer resource_metadata="http://localhost:3700/.well-known/oauth-protected-resource/mcp", HelixVP resource_metadata="http://localhost:3700/.well-known/oauth-protected-resource/mcp"
```

The tool never ran. The `WWW-Authenticate` header names both ways in — an OAuth bearer token or a HelixID presentation
— and points at the server's [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) metadata, which is how a standard MCP
OAuth client discovers where to get a token:

```bash
curl -s http://localhost:3700/.well-known/oauth-protected-resource/mcp
```

## 3. Read with the reader's token

```bash
curl "${H[@]}" -H 'authorization: Bearer demo-reader' $MCP -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
  "params":{"name":"lookup_order","arguments":{"orderId":"ORD-1001"}}}'
```

The order comes back, `"status": "shipped"`.

## 4. Try to refund with the same token

```bash
curl -i "${H[@]}" -H 'authorization: Bearer demo-reader' $MCP -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"refund_order","arguments":{"orderId":"ORD-1001","reason":"damaged"}}}'
```

```text
HTTP/1.1 403 Forbidden
www-authenticate: Bearer error="insufficient_scope", error_description="Required scope: orders:admin", ...
```

The reader is authenticated but lacks `orders:admin`, so the refund is refused before the tool runs. A tool that is not
in the server's scope map at all — say `delete_order` — is refused the same way: the map is deny-by-default.

## 5. Refund as the admin

```bash
curl "${H[@]}" -H 'authorization: Bearer demo-admin' $MCP -d '{"jsonrpc":"2.0","id":4,"method":"tools/call",
  "params":{"name":"refund_order","arguments":{"orderId":"ORD-1001","reason":"damaged"}}}'
```

The order comes back `"status": "refunded"`. Run it again and the tool itself answers that the order was already
refunded: that is business logic, not authorization. Orders live in memory and reset when the server restarts.

## Next steps

- **HelixID agents and the audit log.** Restart the sample with `HELIX_API_URL` and `HELIX_API_KEY` pointing at a HelixID
  API you run locally, and `SERVICE_DID` set to the server's DID. Agent presentations are then verified by that API, and
  every decision appears under **Audit** in the console as *Access Granted* or *Access Denied*. The sample's README
  lists every variable.
- **A real authorization server.** Drop demo mode and set `OAUTH_ISSUER` and `OAUTH_JWKS_URI`; access tokens must be JWTs
  whose audience is the server's MCP URL.
- **Your own server.** [MCP Integration](../integrations/mcp.md) explains how the sample is wired and how to do the same.
