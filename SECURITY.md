# Security Policy

This repository contains the **source of the HelixID documentation site** ([docs.helixid.dev](https://docs.helixid.dev)). It ships no cryptographic code, no credential handling, and no runtime that processes user data — it builds to static HTML.

## Reporting a vulnerability in HelixID itself

Vulnerabilities in the SDK, API, packages, or protocol belong in the main repository, **not here**.

**Do not open a public issue.** Use either channel:

1. **Email** — `hello@dgverse.in`
2. **GitHub Security Advisory** — the "Report a vulnerability" button under the **Security** tab of [helixid/helixid](https://github.com/helixid/helixid/security/advisories)

Full policy, scope, response targets, and safe-harbor terms: [helixid/helixid SECURITY.md](https://github.com/helixid/helixid/blob/main/SECURITY.md).

## Reporting a problem with this site

For the documentation site specifically, in-scope issues include:

- A cross-site scripting vector introduced through custom React components or MDX
- A dependency vulnerability in the site's build chain
- A supply-chain concern in the deploy workflow or its permissions
- Anything that could let a third party alter what visitors are served

Use the same channels above. Please note that the site is a static build with no server-side execution, no forms, and no user accounts, so the realistic attack surface is small.

### Documentation errors are not vulnerabilities

A wrong code sample, a stale claim, or a broken link is a **bug**, not a security issue — open a normal issue or pull request.

One exception worth flagging privately: if documentation recommends something actively unsafe (say, a snippet that leaks a private key or disables a verification check), report it through the security channels above. Bad security guidance in docs gets copied into production.

## Supported versions

This site is continuously deployed from `main`. There are no released versions and no backports — the live site is the only supported state.
